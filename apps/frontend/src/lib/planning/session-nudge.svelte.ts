import { clock } from "$lib/clock.svelte";
import { preferences } from "$lib/preferences.svelte";
import { planMode } from "./plan-mode.svelte";
import { sessionData } from "./session-data.svelte";
import { minutesOf, slotNow } from "./zone";

/**
 * Whether the app is owing you a sitting right now.
 *
 * The session used to be a tab, which meant a permanent invitation to do something that is only
 * worth doing twice a day — and the rest of the time a third of the bar spent saying nothing. This
 * is the same thing said only while it is true: a mark that appears when the slot has come round
 * and the day it is about hasn't been drawn yet, and goes away the moment it has.
 *
 * The answer comes from the same summary the session screen reads, so tapping the nudge opens a
 * screen that is already loaded rather than one that starts with a skeleton.
 */

/** How long after a dismissal to leave it alone. Dismissing means "not now", not "never". */
const SNOOZE_MS = 2 * 60 * 60_000;

class SessionNudge {
  #dismissedAt = $state(0);
  #started = false;
  #asked = "";

  /** Which sitting it is, by the clock — the same question the session screen asks. */
  readonly slot = $derived(slotNow(clock.now, preferences.sessions.eveningTime));

  /**
   * The minute today's slot falls at, as minutes into the day, from the account's own preferences.
   * Before it there is nothing to ask for: the evening's summary describes a day still happening.
   */
  readonly #dueMinutes = $derived(
    minutesOf(this.slot === "morning" ? preferences.sessions.morningTime : preferences.sessions.eveningTime),
  );

  /**
   * Whether a sitting is owed at all, dismissed or not. The toast reads `pending`; the inbox and
   * the dot on the avatar read this, because "not now" only moves the ask, it doesn't settle it.
   */
  readonly owed = $derived.by(() => {
    if (!preferences.sessions.enabled) return false;
    // Planning is already open on the day this would be about.
    if (planMode.active) return false;

    const now = clock.now;
    if (now.getHours() * 60 + now.getMinutes() < this.#dueMinutes) return false;

    const summary = sessionData.summary;
    if (!summary) return false;
    // The Sunday sitting answers as `weekly` where the clock only knows about evenings.
    const matches = summary.slot === this.slot || (this.slot === "evening" && summary.slot === "weekly");
    // A day whose morning is gone pays nothing, and the server says so by paying nothing: the
    // planning window runs from the evening before to midday, and outside it nobody is asked.
    return matches && !summary.target.planned && this.stars > 0;
  });

  readonly #snoozed = $derived(clock.now.getTime() - this.#dismissedAt < SNOOZE_MS);

  /** Owed and not yet waved away: what the toast shows. */
  readonly pending = $derived(this.owed && !this.#snoozed);

  /** Owed and waved away: what the avatar's dot and the inbox say instead. */
  readonly dismissed = $derived(this.owed && this.#snoozed);

  /** What the nudge pays, so it can say so — the same arithmetic the session screen shows. */
  readonly stars = $derived.by(() => {
    const summary = sessionData.summary;
    if (!summary) return 0;
    return summary.award.reduce((sum, award) => sum + award.delta, 0) + summary.weeklyAward;
  });

  /** "tomorrow" for the evening sitting, "today" for the morning one. */
  readonly subject = $derived(this.slot === "morning" ? "today" : "tomorrow");

  /**
   * Asks for the current slot's summary, once per slot per app session.
   *
   * Called from the shell rather than from a screen: the whole point is to be told about a sitting
   * on whatever screen you happen to have open. Failures are the loader's own business — a summary
   * that didn't arrive is a nudge that doesn't appear, which is the same as not owing one.
   */
  start() {
    this.#started = true;
    void this.check();
  }

  stop() {
    this.#started = false;
  }

  /** Re-asks when the slot has moved on since the last question. Cheap when it hasn't. */
  async check() {
    if (!this.#started) return;
    const slot = this.slot;
    const key = `${slot}|${new Date().toDateString()}`;
    if (this.#asked === key) return;
    this.#asked = key;
    // A summary for the right slot but the wrong day — the app was left open overnight — is still
    // the wrong answer, so the day is part of the key and a match here is re-asked rather than kept.
    if (sessionData.summary?.slot === slot) await sessionData.refresh();
    else await sessionData.enter(slot);
  }

  dismiss() {
    this.#dismissedAt = Date.now();
  }
}

export const sessionNudge = new SessionNudge();
