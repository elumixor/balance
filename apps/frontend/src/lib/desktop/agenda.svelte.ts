import type { Cached } from "$lib/cache.svelte";
import { addDays, DAYS_PER_WEEK, startOfWeek, weekKey } from "$lib/dates";
import { calendarWeek, invalidate, store } from "$lib/store.svelte";
import type { CalendarEvent, CalendarWeek, Category } from "$lib/types";
import { isDesktop } from "./platform";

/**
 * What's still coming, for the parts of the desktop app that outlive every screen.
 *
 * The menu bar and the reminders are two views of the same question — "what is next, and what
 * does it count as" — asked once a minute whether or not a window is open. Sharing one answer
 * keeps them from disagreeing, and keeps one clock instead of two.
 */

/** How often the answer is recomputed. A countdown that ticks once a minute reads as stuck. */
const TICK_MS = 30_000;
/** How often the weeks behind it are checked against the calendar. */
const REFRESH_MS = 5 * 60_000;
/** Past this, the next thing on the calendar is tomorrow's problem. */
const HORIZON_MS = 14 * 24 * 60 * 60_000;

class DesktopAgenda {
  now = $state(new Date());

  /**
   * This week's cache and next week's, resolved by hand rather than read out of a `$derived`.
   * `calendarWeek` writes the week map, and a write inside a reaction is either a re-run or, in a
   * derived, an error — see `store.svelte.ts`.
   */
  #weeks = $state<Cached<CalendarWeek>[]>([]);
  #stop: (() => void) | null = null;
  #started = false;

  /** Idempotent, and a no-op anywhere but the desktop build. */
  start() {
    if (!isDesktop || this.#started) return;
    this.#started = true;

    this.#sync();
    void this.#ensure();

    const tick = setInterval(() => {
      this.now = new Date();
      this.#sync();
      void this.#ensure();
    }, TICK_MS);
    const refresh = setInterval(() => this.refresh(), REFRESH_MS);

    this.#stop = () => {
      clearInterval(tick);
      clearInterval(refresh);
    };
  }

  stop() {
    this.#stop?.();
    this.#stop = null;
    this.#started = false;
  }

  /** Both weeks, checked against the calendar rather than trusted. */
  refresh() {
    if (!isDesktop) return;
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
    return new Map((store.categories.value ?? []).map((category) => [category.id, category]));
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
    return Promise.all([store.categories.ensure(), ...this.#weeks.map((week) => week.ensure())]);
  }
}

export const desktopAgenda = new DesktopAgenda();
