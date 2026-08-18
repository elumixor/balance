import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { goto } from "$app/navigation";
import { calendarData } from "$lib/calendar/calendar-data.svelte";
import { eventCategory } from "$lib/calendar/event-category";
import { restColor } from "$lib/colors";
import { addDays, startOfDay, startOfWeek } from "$lib/dates";
import { formatClock, formatDayDate, formatHoursAndMinutes } from "$lib/format";
import { DEFAULT_ICON } from "$lib/icons";
import { meetingOf } from "$lib/meeting";
import type { CalendarEvent } from "$lib/types";
import { desktopAgenda } from "./agenda.svelte";
import { isDesktop } from "./platform";
import { report } from "./report";
import { type RasterIcon, trayIcons } from "./tray-icons.svelte";

/** A macOS menu that runs past the bottom of the screen scrolls, which nobody wants. */
const MAX_ROWS = 16;
/** The menu bar is shared with every other app's icons; a long title pushes them off it. */
const MAX_TITLE_CHARS = 26;

/** The shape `update_tray` in `src-tauri/src/tray.rs` deserializes. */
interface TrayState {
  title: string;
  /** The headline event's category, rasterized. Absent means nothing is happening. */
  icon: RasterIcon | null;
  tooltip: string | null;
  /** The call you're about to be late for, as a row that opens it. */
  join: { label: string; url: string } | null;
  sections: { heading: string; rows: { id: string; label: string; icon: RasterIcon }[] }[];
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
  #stop: (() => void) | null = null;

  /** Idempotent, and a no-op anywhere but the desktop build. */
  start() {
    if (!isDesktop || this.#stop) return;

    desktopAgenda.start();
    const unlisten = [
      listen<string>("tray://open-event", (event) => this.#open(event.payload)),
      listen("tray://refresh", () => desktopAgenda.refresh()),
    ];

    const dispose = $effect.root(() => {
      // Reading `state` is what subscribes this to the weeks, the categories and the tick, so the
      // menu bar follows a write on the calendar screen without anything telling it to.
      // A rejection here is silent by nature — the menu bar just stops changing, on a screen
      // nobody is looking at — so it gets said out loud once rather than swallowed.
      $effect(() => {
        void invoke("update_tray", { state: this.#state }).catch((e) => report("The menu bar rejected an update", e));
      });
    });

    this.#stop = () => {
      for (const pending of unlisten) void pending.then((off) => off());
      dispose();
    };
  }

  stop() {
    this.#stop?.();
    this.#stop = null;
  }

  get #state(): TrayState {
    const now = desktopAgenda.now;
    const categories = desktopAgenda.categories;
    const upcoming = desktopAgenda.upcoming;
    const color = (event: CalendarEvent) => eventCategory(event, categories)?.color ?? restColor;
    const icon = (event: CalendarEvent) =>
      trayIcons.get(eventCategory(event, categories)?.icon ?? DEFAULT_ICON, color(event));

    // A timed block wins over an all-day one: "Sprint Start, 40m left" is the more useful of the
    // two things true at 16:20 on a day that also happens to be somebody's birthday.
    const running = upcoming.filter((event) => new Date(event.start).getTime() <= now.getTime());
    const current = running.find((event) => !event.allDay) ?? running[0] ?? null;
    const next = upcoming.find((event) => event !== current && !event.allDay) ?? null;

    const sections: TrayState["sections"] = [];
    let budget = MAX_ROWS;
    const push = (heading: string, events: CalendarEvent[]) => {
      const rows = events.slice(0, budget).map((event) => ({
        id: event.id,
        label: `${event.allDay ? "All-day" : formatClock(new Date(event.start))} · ${label(event)}`,
        icon: icon(event),
      }));
      if (rows.length === 0) return;
      budget -= rows.length;
      sections.push({ heading, rows });
    };

    if (current) push(`Ending in ${remaining(current, now)}`, [current]);
    for (const [day, events] of byDay(upcoming.filter((event) => event !== current))) {
      if (budget <= 0) break;
      push(dayHeading(day, now), events);
    }

    const headline = current ?? next;
    return {
      title: headline ? `${clip(label(headline))} · ${when(headline, current === headline, now)}` : "",
      icon: headline ? icon(headline) : null,
      tooltip: headline ? `${label(headline)} — ${when(headline, current === headline, now)}` : "Balance",
      join: join(current ?? null) ?? join(next),
      sections,
    };
  }

  /** A row in the menu, chosen: put that day on screen. */
  async #open(eventId: string) {
    const event = desktopAgenda.upcoming.find((candidate) => candidate.id === eventId);
    await goto("/calendar");
    if (event) {
      calendarData.anchor = startOfWeek(new Date(event.start));
      void calendarData.ensureWeeks();
    }
  }
}

export const desktopTray = new DesktopTray();

/**
 * The call to walk into, if there is one. Offered for whatever is running, and otherwise for
 * what's next — a Join that appears a few minutes early is the point of it.
 */
function join(event: CalendarEvent | null) {
  if (!event) return null;
  const meeting = meetingOf(event);
  return meeting.join ? { label: `Join ${meeting.join.label}`, url: meeting.join.url } : null;
}

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
