import type { Cached } from "$lib/cache.svelte";
import { addDays, DAYS_PER_WEEK, startOfWeek, weekKey } from "$lib/dates";
import { calendarWeek, invalidate } from "$lib/store.svelte";
import { categories, synced } from "$lib/synced.svelte";
import type { CalendarEvent, CalendarWeek, Category } from "$lib/types";

/**
 * What's still coming, for the parts of the app that outlive every screen.
 *
 * The menu bar, the reminders on the Mac and the reminders on the phone are all views of the same
 * question — "what is next, and what does it count as". Sharing one answer keeps them from
 * disagreeing, and keeps one clock instead of three.
 *
 * The tick comes from outside, because each shell has its own idea of when time passes: Rust
 * sends one every minute on the Mac (`spawn_agenda_ticks`), and the phone follows `clock`, which
 * re-reads the wall clock the moment the app is unlocked. Either way it lands on `tick()`.
 */

/** Past this, the next thing on the calendar is tomorrow's problem. */
const HORIZON_MS = 14 * 24 * 60 * 60_000;

export class Agenda {
  now = $state(new Date());

  /**
   * This week's cache and next week's, resolved by hand rather than read out of a `$derived`.
   * `calendarWeek` writes the week map, and a write inside a reaction is either a re-run or, in a
   * derived, an error — see `store.svelte.ts`.
   */
  #weeks = $state<Cached<CalendarWeek>[]>([]);
  #started = false;

  /** Idempotent: every shell that wants an agenda asks for one, and there is only one. */
  start() {
    if (this.#started) return;
    this.#started = true;
    this.#sync();
    void this.#ensure();
  }

  /** A minute has passed somewhere, or a screen came back after an hour asleep. */
  tick() {
    this.now = new Date();
    this.#sync();
    void this.#ensure();
  }

  /** Both weeks, checked against the calendar rather than trusted. */
  refresh() {
    invalidate.calendar();
    this.#sync();
    void this.#ensure();
  }

  /**
   * Everything still to come, in order — including whatever is running right now. Declined events
   * are somebody else's plan for the hour, so they stay out of it.
   */
  get upcoming(): CalendarEvent[] {
    const now = this.now.getTime();
    const horizon = now + HORIZON_MS;
    const seen = new Set<string>();
    return this.#weeks
      .flatMap((week) => week.value?.events ?? [])
      .filter((event) => {
        if (event.declined || seen.has(event.id)) return false;
        const start = new Date(event.start).getTime();
        if (start > horizon || new Date(event.end).getTime() <= now) return false;
        seen.add(event.id);
        return true;
      })
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }

  get categories(): Map<string, Category> {
    return new Map(categories.all.map((category) => [category.id, category]));
  }

  /**
   * This week and next: "what's next" on a Sunday evening is in a week no screen is showing.
   * The array is only replaced when it actually changed, so a tick costs nothing downstream —
   * and it is replaced when the calendar screen's paging drops one of these weeks from the map.
   */
  #sync() {
    const monday = startOfWeek(this.now);
    const next = [monday, addDays(monday, DAYS_PER_WEEK)].map((start) => calendarWeek(weekKey(start)));
    if (next.length !== this.#weeks.length || next.some((week, i) => week !== this.#weeks[i])) this.#weeks = next;
  }

  /** Fetches only what's missing or stale — which on a cold start is both weeks. */
  #ensure() {
    return Promise.all([synced.ensure(), ...this.#weeks.map((week) => week.ensure())]);
  }
}

export const agenda = new Agenda();
