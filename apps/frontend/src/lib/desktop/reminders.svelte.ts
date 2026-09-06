import { invoke } from "@tauri-apps/api/core";
import { preferences } from "$lib/account/preferences.svelte";
import { accountEmailOf } from "$lib/calendar/calendar-data.svelte";
import { eventCategory } from "$lib/calendar/event-category";
import { asGoogleAccount, hasAddress, meetingOf } from "$lib/calendar/meeting";
import { REMINDER_KINDS, reminderDueAt } from "$lib/calendar/reminders";
import type { CalendarEvent } from "$lib/calendar/types";
import { arrivalFor, getTravelTimes, type TravelLeg } from "$lib/travel/legs";
import { travelOrigin } from "$lib/travel/origin.svelte";
import { restColor } from "$lib/ui/colors";
import { DEFAULT_ICON } from "$lib/ui/icons/index";
import { desktopAgenda } from "./agenda.svelte";
import { isDesktop } from "./platform";
import { encodeReminder, type ReminderCard, type ReminderKind } from "./reminder";
import { report } from "./report";

/**
 * The reminders themselves: what is about to start, and when to set off for it.
 *
 * macOS notifications can't carry a button, and a reminder about a meeting is mostly buttons —
 * join it, open the agenda, see the route. So a reminder shows the app's own card (see
 * `src-tauri/src/reminder.rs`), and the system notification is only there to make a sound and
 * leave a trace in Notification Center.
 *
 * Nothing is scheduled ahead: every tick asks "did anything become due since the last one",
 * which is the same answer without a table of timers to keep in step with a calendar that moves.
 */

/** A reminder for something that came due while the Mac was asleep is noise, not a reminder. */
const LATE_MS = 3 * 60_000;
/** How far ahead a journey is worth asking about. Traffic an hour out isn't today's traffic. */
const TRAVEL_HORIZON_MS = 45 * 60_000;

const FIRED_KEY = "balance.reminders-fired";

class DesktopReminders {
  #stop: (() => void) | null = null;
  /** `${eventId}|${kind}` for everything already shown, so a tick never repeats one. */
  #fired = new Map<string, number>();
  /** The journey to an event, once asked about. */
  #travel = new Map<string, TravelLeg[]>();
  #asking = new Set<string>();

  /** Idempotent, and a no-op anywhere but the desktop build. */
  start() {
    if (!isDesktop || this.#stop) return;

    desktopAgenda.start();
    this.#fired = read();

    const dispose = $effect.root(() => {
      // Reading the agenda's clock is what makes this run every tick; reading its events is what
      // makes it run again when the calendar changes under it.
      $effect(() => {
        const now = desktopAgenda.now.getTime();
        const events = desktopAgenda.upcoming;
        void this.#sweep(events, now);
      });
    });

    this.#stop = dispose;
  }

  stop() {
    this.#stop?.();
    this.#stop = null;
  }

  async #sweep(events: CalendarEvent[], now: number) {
    prune(this.#fired, now);
    for (const event of events) {
      const start = new Date(event.start).getTime();
      if (start <= now) continue;

      // Asked for a little before it's needed, so the card doesn't open on an empty route.
      if (start - now < TRAVEL_HORIZON_MS) void this.#askTravel(event);

      for (const kind of REMINDER_KINDS) {
        const due = this.#dueAt(event, kind, start);
        if (due === null) continue;
        const key = `${event.id}|${kind}`;
        if (due > now || now - due > LATE_MS || this.#fired.has(key)) continue;

        this.#fired.set(key, start);
        write(this.#fired);
        await this.#show(event, kind);
      }
    }
  }

  /** Where the shared arithmetic gets what it can't know: the journey this app has looked up. */
  #dueAt(event: CalendarEvent, kind: ReminderKind, start: number) {
    return reminderDueAt(event, kind, {
      start,
      reminders: preferences.reminders,
      travel: preferences.travel,
      hasJoinLink: meetingOf(event).join !== null,
      journey: this.#travel.get(event.id)?.[0] ?? null,
    });
  }

  /** One question per event: a journey doesn't change enough between two ticks to re-ask. */
  async #askTravel(event: CalendarEvent) {
    const modes = preferences.travel.modes;
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
    } catch (e) {
      // A route that can't be worked out costs the leave-in-time card, not the reminder itself.
      report("Couldn't work out how long it takes to get there", e);
      this.#travel.set(event.id, []);
    } finally {
      this.#asking.delete(event.id);
    }
  }

  async #show(event: CalendarEvent, kind: ReminderKind) {
    const meeting = meetingOf(event);
    const category = eventCategory(event, desktopAgenda.categories);
    const card: ReminderCard = {
      id: event.id,
      kind,
      title: event.title.trim() || "Untitled",
      start: event.start,
      end: event.end,
      color: category?.color ?? restColor,
      icon: category?.icon ?? DEFAULT_ICON,
      location: meeting.location,
      join: meeting.join
        ? { url: asGoogleAccount(meeting.join.url, accountEmailOf(event.calendarId)), label: meeting.join.label }
        : null,
      links: meeting.links.slice(0, 4),
      travel: this.#travel.get(event.id) ?? [],
    };

    try {
      await invoke("show_reminder", { payload: encodeReminder(card) });
    } catch (e) {
      report("The reminder card wouldn't open", e);
    }

    if (!preferences.reminders.sound) return;
    try {
      // Only for the sound and the entry in Notification Center — everything you can act on is
      // on the card, because a macOS notification can't hold a button.
      const { sendNotification } = await import("@tauri-apps/plugin-notification");
      sendNotification({ title: card.title, body: bodyOf(card), sound: "Ping" });
    } catch (e) {
      report("The notification didn't go out", e);
    }
  }
}

export const desktopReminders = new DesktopReminders();

function bodyOf(card: ReminderCard) {
  const at = new Date(card.start).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return card.kind === "leave" ? `Time to leave for ${at}` : `Starts at ${at}`;
}

/**
 * What's already been shown, kept on the device: reopening the app an hour later must not replay
 * the morning. Keyed by reminder, holding the event's start so the entry can be dropped once the
 * event is behind us.
 */
function read(): Map<string, number> {
  try {
    const stored = JSON.parse(localStorage.getItem(FIRED_KEY) ?? "{}") as Record<string, number>;
    return new Map(Object.entries(stored));
  } catch {
    return new Map();
  }
}

function write(fired: Map<string, number>) {
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify(Object.fromEntries(fired)));
  } catch {
    // Storage full or blocked: the worst case is a reminder shown twice.
  }
}

function prune(fired: Map<string, number>, now: number) {
  for (const [key, start] of fired) {
    if (start < now - 24 * 60 * 60_000) fired.delete(key);
  }
}
