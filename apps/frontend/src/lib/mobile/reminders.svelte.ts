import { Browser } from "@capacitor/browser";
import { type LocalNotificationSchema, LocalNotifications } from "@capacitor/local-notifications";
import { goto } from "$app/navigation";
import { preferences } from "$lib/account/preferences.svelte";
import { agenda } from "$lib/calendar/agenda.svelte";
import { eventCategory } from "$lib/calendar/event-category";
import { hasAddress, meetingOf } from "$lib/calendar/meeting";
import { REMINDER_KINDS, reminderDueAt } from "$lib/calendar/reminders";
import type { CalendarEvent } from "$lib/calendar/types";
import type { ReminderKind } from "$lib/desktop/reminder";
import { clock } from "$lib/platform/clock.svelte";
import { arrivalFor, getTravelTimes, type TravelLeg } from "$lib/travel/legs";
import { travelOrigin } from "$lib/travel/origin.svelte";
import { restColor } from "$lib/ui/colors";
import { DEFAULT_ICON } from "$lib/ui/icons";
import { isIOSApp } from "./platform";

/**
 * The same reminders the Mac shows, on the phone and on the wrist.
 *
 * The difference that decides the whole shape of this file is that a phone is asleep. The Mac can
 * tick once a minute and ask "did anything become due", because it is running; iOS suspends this
 * webview seconds after the screen goes off and will not wake it for a calendar. So nothing is
 * decided at the moment a reminder is due — the whole list is worked out ahead and handed to
 * `UNUserNotificationCenter`, which fires it whether or not this app ever runs again.
 *
 * The wrist comes free with that: a local notification on a locked iPhone is mirrored to the
 * paired watch, and the watch app renders it with its own scene (`EventNotificationView.swift`).
 * What the watch schedules for itself is only the case this can't cover — see `EventAlarm.swift`.
 *
 * Handing the list over again is cheap and idempotent, so it is redone on every tick and every
 * change to the calendar or the preferences rather than diffed: what iOS holds is always exactly
 * the plan, and a cancelled meeting stops reminding as soon as the app next sees it go.
 */

/** How far ahead to hand reminders over. iOS keeps 64 pending per app; two days is well inside it. */
const SCHEDULE_HORIZON_MS = 48 * 60 * 60_000;
/** Below what iOS would drop anyway — a notification scheduled for a second ago never arrives. */
const MIN_LEAD_MS = 5_000;
/** How far ahead a journey is worth asking about. Traffic an hour out isn't today's traffic. */
const TRAVEL_HORIZON_MS = 45 * 60_000;
/** Leaves room under the system's 64 for whatever the tracking screen schedules alongside these. */
const MAX_PENDING = 48;

/**
 * The categories a reminder is filed under. Both are drawn by the watch's own notification scene
 * (`EventNotificationView.swift`); the second one is the one iOS puts a Join button on, which is
 * why it is a category of its own rather than a button every reminder carries.
 */
const ACTION_TYPE = "balance.event";
const JOIN_ACTION_TYPE = "balance.event.join";

/** Everything this module has handed to iOS, so the next pass can take it back. */
const SCHEDULED_KEY = "balance.reminders-scheduled";

class MobileReminders {
  #stop: (() => void) | null = null;
  #unlisten: (() => void) | null = null;
  /** The journey to an event, once asked about. */
  #travel = new Map<string, TravelLeg[]>();
  #asking = new Set<string>();
  /** One pass at a time: two overlapping passes would cancel each other's notifications. */
  #passing = false;
  #again = false;

  /** Idempotent, and a no-op anywhere but the iOS build. */
  start() {
    if (!isIOSApp || this.#stop) return;

    agenda.start();
    void this.#prepare();

    const dispose = $effect.root(() => {
      // The phone's clock, which re-reads itself the moment the app is unlocked — so a plan made
      // yesterday evening is redone before the first frame of this morning is drawn.
      $effect(() => {
        void clock.now;
        agenda.tick();
      });

      // Reading the events is what makes this run again when the calendar changes underneath it;
      // reading the preferences is what makes turning reminders off take effect now, not tomorrow.
      $effect(() => {
        const events = agenda.upcoming;
        const now = agenda.now.getTime();
        void preferences.reminders;
        void preferences.travel;
        void this.#pass(events, now);
      });
    });

    this.#stop = dispose;
  }

  stop() {
    this.#stop?.();
    this.#stop = null;
    this.#unlisten?.();
    this.#unlisten = null;
  }

  /**
   * Asking for permission and saying what a reminder can be tapped on. Permission is asked for at
   * sign-in rather than at the first reminder: the reminder is scheduled while the phone is in a
   * pocket, and a prompt nobody is looking at is a permission nobody grants.
   */
  async #prepare() {
    try {
      await LocalNotifications.registerActionTypes({
        types: [
          { id: ACTION_TYPE, actions: [] },
          { id: JOIN_ACTION_TYPE, actions: [{ id: "join", title: "Join" }] },
        ],
      });
      const status = await LocalNotifications.checkPermissions();
      if (status.display === "prompt" || status.display === "prompt-with-rationale") {
        await LocalNotifications.requestPermissions();
      }
    } catch (e) {
      // A phone that won't have notifications still shows the calendar; nothing else depends on this.
      console.warn("[reminders] couldn't set notifications up", e);
    }

    const tapped = LocalNotifications.addListener("localNotificationActionPerformed", (action) => {
      const extra = (action.notification.extra ?? {}) as { joinUrl?: string };
      if (action.actionId === "join" && extra.joinUrl) return void Browser.open({ url: extra.joinUrl });
      void goto("/calendar");
    });

    this.#unlisten = () => void tapped.then((handle) => handle.remove());
  }

  /**
   * One pass: ask about the journeys that are close enough to matter, work out the plan, and make
   * what iOS holds equal to it. A pass asked for while one is running is folded into a single
   * repeat afterwards, because only the last plan is worth having.
   */
  async #pass(events: CalendarEvent[], now: number) {
    if (this.#passing) {
      this.#again = true;
      return;
    }
    this.#passing = true;
    try {
      for (const event of events) {
        const start = new Date(event.start).getTime();
        if (start > now && start - now < TRAVEL_HORIZON_MS) await this.#askTravel(event);
      }
      await this.#hand(this.#plan(events, now));
    } catch (e) {
      console.warn("[reminders] couldn't schedule", e);
    } finally {
      this.#passing = false;
      if (this.#again) {
        this.#again = false;
        void this.#pass(agenda.upcoming, agenda.now.getTime());
      }
    }
  }

  /** Every reminder that falls between now and the horizon, soonest first. */
  #plan(events: CalendarEvent[], now: number): LocalNotificationSchema[] {
    const planned: { at: number; notification: LocalNotificationSchema }[] = [];

    for (const event of events) {
      const start = new Date(event.start).getTime();
      if (start <= now || start - now > SCHEDULE_HORIZON_MS) continue;
      const meeting = meetingOf(event);
      // What the reminder wears on the wrist: a watch drawing a forwarded notification has no
      // session to look a category up with, so the colour and the glyph travel with it.
      const category = eventCategory(event, agenda.categories);

      for (const kind of REMINDER_KINDS) {
        const due = reminderDueAt(event, kind, {
          start,
          reminders: preferences.reminders,
          travel: preferences.travel,
          hasJoinLink: meeting.join !== null,
          journey: this.#travel.get(event.id)?.[0] ?? null,
        });
        if (due === null || due - now < MIN_LEAD_MS) continue;

        planned.push({
          at: due,
          notification: {
            id: idOf(event.id, kind),
            title: event.title.trim() || "Untitled",
            body: bodyOf(kind, start),
            schedule: { at: new Date(due), allowWhileIdle: true },
            actionTypeId: meeting.join ? JOIN_ACTION_TYPE : ACTION_TYPE,
            // A missing file resolves to the system sound, which is the one this wants; the
            // preference is the choice between that and arriving silently.
            sound: preferences.reminders.sound ? "default.caf" : undefined,
            extra: {
              eventId: event.id,
              kind,
              joinUrl: meeting.join?.url ?? null,
              color: category?.color ?? restColor,
              icon: category?.icon ?? DEFAULT_ICON,
            },
          },
        });
      }
    }

    return planned
      .sort((a, b) => a.at - b.at)
      .slice(0, MAX_PENDING)
      .map((entry) => entry.notification);
  }

  /** What iOS holds, made equal to the plan: last pass's reminders out, this pass's in. */
  async #hand(notifications: LocalNotificationSchema[]) {
    const previous = readScheduled();
    const wanted = new Set(notifications.map((notification) => notification.id));
    const stale = previous.filter((id) => !wanted.has(id));
    if (stale.length > 0) {
      await LocalNotifications.cancel({ notifications: stale.map((id) => ({ id })) });
    }
    // Rescheduling an id that is already pending replaces it, which is what a moved event needs.
    if (notifications.length > 0) await LocalNotifications.schedule({ notifications });
    writeScheduled([...wanted]);
  }

  /** One question per event: a journey doesn't change enough between two ticks to re-ask. */
  async #askTravel(event: CalendarEvent) {
    const modes = preferences.travel.modes;
    if (!preferences.reminders.leaveInTime) return;
    if (modes.length === 0 || this.#travel.has(event.id) || this.#asking.has(event.id)) return;
    const meeting = meetingOf(event);
    if (!meeting.location || !hasAddress(event)) return;

    this.#asking.add(event.id);
    try {
      // Where this event is left from: the place chosen for it, the usual one, or — failing both
      // — wherever this device is standing. Nothing to go on means no journey and no card.
      const origin = await travelOrigin.resolveFor(event.id);
      if (!origin) {
        this.#travel.set(event.id, []);
        return;
      }
      const answer = await getTravelTimes({
        origin,
        destination: meeting.location,
        modes,
        arriveBy: arrivalFor(event.start),
      });
      this.#travel.set(event.id, answer.legs);
    } catch {
      // A route that can't be worked out costs the leave-in-time reminder, not the reminder itself.
      this.#travel.set(event.id, []);
    } finally {
      this.#asking.delete(event.id);
    }
  }
}

export const mobileReminders = new MobileReminders();

function bodyOf(kind: ReminderKind, start: number) {
  const at = new Date(start).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (kind === "leave") return `Time to leave for ${at}`;
  if (kind === "join") return `Starting now — ${at}`;
  return `Starts at ${at}`;
}

/**
 * A notification id is a 32-bit integer, and the thing being identified is a string. The same
 * event and kind has to land on the same number every pass, or a moved event would be reminded
 * about twice — so it is hashed rather than counted.
 */
function idOf(eventId: string, kind: ReminderKind) {
  const key = `${eventId}|${kind}`;
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  // Positive and inside 31 bits: iOS takes an Int32, and a negative id is not one it will keep.
  return (hash >>> 1) % 2147483647;
}

/**
 * The ids handed over last time, kept on the device: what iOS is holding outlives this process,
 * so a cold start has to know what to take back before it hands over anything new.
 */
function readScheduled(): number[] {
  try {
    const stored = JSON.parse(localStorage.getItem(SCHEDULED_KEY) ?? "[]") as unknown;
    return Array.isArray(stored) ? stored.filter((id): id is number => typeof id === "number") : [];
  } catch {
    return [];
  }
}

function writeScheduled(ids: number[]) {
  try {
    localStorage.setItem(SCHEDULED_KEY, JSON.stringify(ids));
  } catch {
    // Storage full or blocked: the worst case is a reminder for an event that has since moved.
  }
}
