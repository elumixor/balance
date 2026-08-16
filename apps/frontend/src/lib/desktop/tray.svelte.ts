import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { goto } from "$app/navigation";
import { calendarData } from "$lib/calendar/calendar-data.svelte";
import { eventCategory } from "$lib/calendar/event-category";
import { restColor } from "$lib/colors";
import { addDays, DAYS_PER_WEEK, startOfDay, startOfWeek, weekKey } from "$lib/dates";
import { formatClock, formatDayDate, formatHoursAndMinutes } from "$lib/format";
import { calendarWeek, invalidate, store } from "$lib/store.svelte";
import type { CalendarEvent, Category } from "$lib/types";
import { isDesktop } from "./platform";

/** How often the menu bar recomputes. A countdown that only ticks once a minute reads as stuck. */
const TICK_MS = 30_000;
/** How often the two weeks behind it are checked against the calendar. */
const REFRESH_MS = 5 * 60_000;

/** Past this, the next thing on the calendar is tomorrow's problem, not the menu bar's. */
const HORIZON_MS = 14 * 24 * 60 * 60_000;
/** A macOS menu that runs past the bottom of the screen scrolls, which nobody wants. */
const MAX_ROWS = 16;
/** The menu bar is shared with every other app's icons; a long title pushes them off it. */
const MAX_TITLE_CHARS = 26;

/** The shape `update_tray` in `src-tauri/src/tray.rs` deserializes. */
interface TrayState {
  title: string;
  color: string | null;
  tooltip: string | null;
  sections: { heading: string; rows: { id: string; label: string; color: string }[] }[];
}

/**
 * Balance in the macOS menu bar: what you're in the middle of, or what's next, and the days ahead
 * behind it.
 *
 * The desktop shell can't ask the calendar anything itself — the Clerk session and every mapping
 * of an event to what it counts as live in this webview — so the shell renders and this pushes.
 * One `update_tray` carries the whole state, which keeps the menu from ever being half-updated.
 */
class DesktopTray {
  #now = $state(new Date());
  #stop: (() => void) | null = null;

  /** Idempotent, and a no-op anywhere but the desktop build. */
  start() {
    if (!isDesktop || this.#stop) return;

    const tick = setInterval(() => (this.#now = new Date()), TICK_MS);
    const refresh = setInterval(() => this.refresh(), REFRESH_MS);
    const unlisten = [
      listen<string>("tray://open-event", (event) => this.#open(event.payload)),
      listen("tray://refresh", () => this.refresh()),
    ];

    const dispose = $effect.root(() => {
      // Reading `state` is what subscribes this to the weeks, the categories and the tick, so the
      // menu bar follows a write on the calendar screen without anything telling it to.
      // A rejection here is silent by nature — the menu bar just stops changing, on a screen
      // nobody is looking at — so it gets said out loud once rather than swallowed.
      $effect(() => {
        void invoke("update_tray", { state: this.#state }).catch((e) => {
          console.error("The menu bar rejected an update", e);
        });
      });
    });

    this.#stop = () => {
      clearInterval(tick);
      clearInterval(refresh);
      for (const pending of unlisten) void pending.then((off) => off());
      dispose();
    };
  }

  stop() {
    this.#stop?.();
    this.#stop = null;
  }

  /** Both weeks the menu bar reads from, checked against the calendar. */
  refresh() {
    if (!isDesktop) return;
    invalidate.calendar();
    for (const week of this.#weeks) void week.ensure();
  }

  /** This week and next: "what's next" on a Sunday evening is in a week the app isn't showing. */
  get #weeks() {
    const monday = startOfWeek(this.#now);
    return [monday, addDays(monday, DAYS_PER_WEEK)].map((start) => calendarWeek(weekKey(start)));
  }

  /**
   * Everything still to come, in order — including whatever is running right now. Declined events
   * are somebody else's plan for the hour, so they stay out of it.
   */
  get #upcoming(): CalendarEvent[] {
    const now = this.#now.getTime();
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

  get #categories(): Map<string, Category> {
    return new Map((store.categories.value ?? []).map((category) => [category.id, category]));
  }

  get #state(): TrayState {
    const now = this.#now.getTime();
    const categories = this.#categories;
    const upcoming = this.#upcoming;
    const color = (event: CalendarEvent) => eventCategory(event, categories)?.color ?? restColor;

    // A timed block wins over an all-day one: "Sprint Start, 40m left" is the more useful of the
    // two things true at 16:20 on a day that also happens to be somebody's birthday.
    const running = upcoming.filter((event) => new Date(event.start).getTime() <= now);
    const current = running.find((event) => !event.allDay) ?? running[0] ?? null;
    const next = upcoming.find((event) => event !== current && !event.allDay) ?? null;

    const sections: TrayState["sections"] = [];
    let budget = MAX_ROWS;
    const push = (heading: string, events: CalendarEvent[]) => {
      const rows = events.slice(0, budget).map((event) => ({
        id: event.id,
        label: `${event.allDay ? "All-day" : formatClock(new Date(event.start))} · ${label(event)}`,
        color: color(event),
      }));
      if (rows.length === 0) return;
      budget -= rows.length;
      sections.push({ heading, rows });
    };

    if (current) push(`Ending in ${remaining(current, this.#now)}`, [current]);
    for (const [day, events] of byDay(upcoming.filter((event) => event !== current))) {
      if (budget <= 0) break;
      push(dayHeading(day, this.#now), events);
    }

    const headline = current ?? next;
    return {
      title: headline ? `${clip(label(headline))} · ${when(headline, current === headline, this.#now)}` : "",
      color: headline ? color(headline) : null,
      tooltip: headline ? `${label(headline)} — ${when(headline, current === headline, this.#now)}` : "Balance",
      sections,
    };
  }

  /** A row in the menu, chosen: put that day on screen. */
  async #open(eventId: string) {
    const event = this.#upcoming.find((candidate) => candidate.id === eventId);
    await goto("/calendar");
    if (event) {
      calendarData.anchor = startOfWeek(new Date(event.start));
      void calendarData.ensureWeeks();
    }
  }
}

export const desktopTray = new DesktopTray();

/** An event named after it was drawn still has to say something. */
function label(event: CalendarEvent) {
  return event.title.trim() || "Untitled";
}

function clip(title: string) {
  return title.length <= MAX_TITLE_CHARS ? title : `${title.slice(0, MAX_TITLE_CHARS - 1).trimEnd()}…`;
}

function remaining(event: CalendarEvent, now: Date) {
  return formatHoursAndMinutes((new Date(event.end).getTime() - now.getTime()) / 3_600_000);
}

/**
 * The half of the title after the name. What's running says how much of it is left; what's next
 * says how soon, until "soon" stops meaning anything and a clock time says it better.
 */
function when(event: CalendarEvent, isCurrent: boolean, now: Date) {
  if (event.allDay) return "All-day";
  if (isCurrent) return `${remaining(event, now)} left`;
  const untilMinutes = (new Date(event.start).getTime() - now.getTime()) / 60_000;
  if (untilMinutes > 60) return formatClock(new Date(event.start));
  return `in ${formatHoursAndMinutes(untilMinutes / 60)}`;
}

/** Events grouped under the local day they start on, in order. */
function byDay(events: CalendarEvent[]) {
  const days = new Map<number, CalendarEvent[]>();
  for (const event of events) {
    const day = startOfDay(new Date(event.start)).getTime();
    const bucket = days.get(day);
    if (bucket) bucket.push(event);
    else days.set(day, [event]);
  }
  return days;
}

function dayHeading(day: number, now: Date) {
  const today = startOfDay(now).getTime();
  if (day <= today) return "Today";
  if (day === addDays(startOfDay(now), 1).getTime()) return "Tomorrow";
  return formatDayDate(new Date(day));
}
