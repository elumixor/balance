import { type LocalNotificationSchema, LocalNotifications } from "@capacitor/local-notifications";
import { goto } from "$app/navigation";
import { preferences } from "$lib/account/preferences.svelte";
import { getSessionNotifications } from "$lib/core/queries";
import { deviceTimeZone } from "$lib/planning/zone";
import { clock } from "$lib/platform/clock.svelte";
import { isIOSApp } from "./platform";

/**
 * The two reminders that ask you to look back and to plan.
 *
 * Same shape as the event reminders next door and for the same reason: the phone is asleep at six
 * in the evening, so nothing about the banner can be decided then. The server writes the words —
 * it is the only side that can see the day's hours — and hands them over with the times; this
 * schedules them and replaces the whole set on every pass, so a preference changed on the Mac
 * takes effect on the phone's next unlock.
 *
 * Tapping one opens its session rather than the calendar. The slot travels in the payload because
 * a notification tapped at midnight is still the evening's notification.
 */

const ACTION_TYPE = "balance.session";
/** The glyph the watch shows on a sitting's card — the same one the nudge wears in the app. */
const SESSION_ICON = "sunrise";
const SCHEDULED_KEY = "balance.session-reminders-scheduled";
/** Below what iOS would drop anyway. */
const MIN_LEAD_MS = 5_000;
/** How often to re-ask while the app is open. The list only moves when the day or a setting does. */
const REFRESH_MS = 30 * 60_000;

class SessionReminders {
  #stop: (() => void) | null = null;
  #unlisten: (() => void) | null = null;
  #passing = false;
  #lastPass = 0;

  /** Idempotent, and a no-op anywhere but the iOS build. */
  start() {
    if (!isIOSApp || this.#stop) return;

    void this.#prepare();

    const dispose = $effect.root(() => {
      $effect(() => {
        // The clock is what makes this run again after a day boundary or a long sleep; the
        // preference is what makes turning the sessions off take effect now rather than tomorrow.
        void clock.now;
        void preferences.sessions;
        void this.#pass();
      });
    });

    this.#stop = () => {
      dispose();
      this.#unlisten?.();
      this.#unlisten = null;
    };
  }

  stop() {
    this.#stop?.();
    this.#stop = null;
  }

  /** Asked for again the moment the app is opened, whatever the tick says. */
  refresh() {
    this.#lastPass = 0;
    void this.#pass();
  }

  async #prepare() {
    try {
      await LocalNotifications.registerActionTypes({ types: [{ id: ACTION_TYPE, actions: [] }] });
    } catch (e) {
      console.warn("[sessions] couldn't set notifications up", e);
    }

    const tapped = LocalNotifications.addListener("localNotificationActionPerformed", (action) => {
      const extra = (action.notification.extra ?? {}) as { sessionSlot?: string };
      if (!extra.sessionSlot) return;
      void goto(`/session?slot=${extra.sessionSlot}`);
    });

    this.#unlisten = () => void tapped.then((handle) => handle.remove());
  }

  async #pass() {
    if (this.#passing) return;
    const now = Date.now();
    if (now - this.#lastPass < REFRESH_MS) return;

    this.#passing = true;
    this.#lastPass = now;
    try {
      const { enabled, slots } = await getSessionNotifications(deviceTimeZone());
      const notifications: LocalNotificationSchema[] = enabled
        ? slots
            .filter((slot) => Date.parse(slot.at) - now > MIN_LEAD_MS)
            .map((slot) => ({
              id: idOf(slot.slot, slot.day),
              title: slot.title,
              body: slot.body,
              schedule: { at: new Date(slot.at), allowWhileIdle: true },
              actionTypeId: ACTION_TYPE,
              sound: preferences.reminders.sound ? "default.caf" : undefined,
              // The watch draws the card off these — a sunrise, in no sphere's colour, because a
              // sitting is about the whole day rather than one of its blocks.
              extra: { sessionSlot: slot.slot, day: slot.day, icon: SESSION_ICON, color: "" },
            }))
        : [];

      await this.#hand(notifications);
    } catch (e) {
      // A session reminder that couldn't be worked out is a session reminder that doesn't arrive;
      // it is not a reason for the screen the user is looking at to fail.
      console.warn("[sessions] couldn't schedule", e);
      this.#lastPass = 0;
    } finally {
      this.#passing = false;
    }
  }

  /** What iOS holds for the sessions, made equal to the plan — the event reminders are untouched. */
  async #hand(notifications: LocalNotificationSchema[]) {
    const previous = readScheduled();
    const wanted = new Set(notifications.map((notification) => notification.id));
    const stale = previous.filter((id) => !wanted.has(id));
    if (stale.length > 0) await LocalNotifications.cancel({ notifications: stale.map((id) => ({ id })) });
    if (notifications.length > 0) await LocalNotifications.schedule({ notifications });
    writeScheduled([...wanted]);
  }
}

export const sessionReminders = new SessionReminders();

/**
 * A notification id is a 32-bit integer and a slot is a pair of strings, so the same slot on the
 * same day has to hash to the same number every pass — otherwise a re-scheduled reminder is a
 * second reminder. The high bit is kept clear: iOS takes an Int32 and won't hold a negative id.
 */
function idOf(slot: string, day: string) {
  const key = `session|${slot}|${day}`;
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 1) % 2147483647;
}

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
    // A device with no room for the list still gets its reminders; the next pass just can't take
    // back what this one handed over, and rescheduling the same id replaces it anyway.
  }
}
