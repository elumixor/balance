import { goto } from "$app/navigation";
import { NAV_TABS } from "$lib/nav";
import { peopleDirectory } from "$lib/people/directory.svelte";
import { diagnostics } from "$lib/platform/diagnostics.svelte";
import { projectsData } from "$lib/projects/projects-data.svelte";
import { PANES, settings } from "$lib/settings";
import { formatClock, formatDayDate } from "$lib/ui/format";
import { rankItems, type SearchItem } from "./items";
import { type EventHit, searchCalendar } from "./queries";

/** A keystroke is not a search; a pause after one is. */
const DEBOUNCE_MS = 220;
/** One letter matches half the calendar. */
const MIN_EVENT_QUERY = 2;

/**
 * ⌘K: one box that finds anything — a screen, a settings section, a project, a task, a person,
 * an event — and goes there. Everything but the events is already on the device and answers each
 * keystroke; the calendar is asked once the typing pauses, and its rows join the list when they
 * arrive, under the ones that were there already.
 */
class Palette {
  open = $state(false);
  query = $state("");
  #hits = $state<EventHit[]>([]);
  #searching = $state(false);
  #timer: ReturnType<typeof setTimeout> | null = null;
  /** Which search the hits on screen belong to, so a slow answer to an old query is dropped. */
  #asked = "";

  get searching() {
    return this.#searching;
  }

  show() {
    this.query = "";
    this.#hits = [];
    this.open = true;
  }

  hide() {
    this.open = false;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
  }

  toggle() {
    if (this.open) this.hide();
    else this.show();
  }

  /** Runs one row and closes; the row itself knows where to go. */
  choose(item: SearchItem) {
    this.hide();
    item.run();
  }

  /** Typing asks the calendar after a pause; the rest of the list answers on the spot. */
  typed(query: string) {
    this.query = query;
    if (this.#timer) clearTimeout(this.#timer);
    const text = query.trim();
    if (text.length < MIN_EVENT_QUERY) {
      this.#hits = [];
      this.#asked = "";
      return;
    }
    this.#timer = setTimeout(() => void this.#search(text), DEBOUNCE_MS);
  }

  async #search(text: string) {
    this.#asked = text;
    this.#searching = true;
    try {
      const hits = await searchCalendar(text);
      if (this.#asked === text) this.#hits = hits;
    } catch (error) {
      diagnostics.report("Search", error, { title: "Couldn't search your calendar" });
    } finally {
      if (this.#asked === text) this.#searching = false;
    }
  }

  readonly #local = $derived.by((): SearchItem[] => {
    const screens = NAV_TABS.map(
      (tab): SearchItem => ({
        id: `screen:${tab.href}`,
        kind: "screen",
        label: tab.label,
        run: () => void goto(tab.href),
      }),
    );
    const panes = PANES.map(
      (pane): SearchItem => ({
        id: `setting:${pane.value}`,
        kind: "setting",
        label: pane.label,
        keywords: pane.keywords,
        run: () => settings.show(pane.value),
      }),
    );
    const projects = projectsData.live.map(
      (project): SearchItem => ({
        id: `project:${project.id}`,
        kind: "project",
        label: project.name || "Untitled project",
        hint:
          projectsData
            .pathOf(project.id)
            .slice(0, -1)
            .map((one) => one.name)
            .join(" / ") || projectsData.categoryById.get(project.categoryId)?.name,
        run: () => void goto(`/projects/${project.id}`),
      }),
    );
    const tasks = projectsData.live.flatMap((project) =>
      projectsData.tasksOf(project.id).map(
        (task): SearchItem => ({
          id: `task:${task.id}`,
          kind: "task",
          label: task.title || "Untitled task",
          hint: project.name,
          run: () => void goto(`/projects/${project.id}?task=${task.id}`),
        }),
      ),
    );
    const people = peopleDirectory.all.map(
      (person): SearchItem => ({
        id: `person:${person.id}`,
        kind: "person",
        label: person.name,
        hint: person.email ?? undefined,
        run: () => settings.show("people"),
      }),
    );
    return [...screens, ...panes, ...projects, ...tasks, ...people];
  });

  readonly #events = $derived(
    this.#hits.map((hit): SearchItem => {
      const start = new Date(hit.start);
      return {
        id: `event:${hit.calendarId}:${hit.id}`,
        kind: "event",
        label: hit.title || "(No title)",
        hint: hit.allDay ? formatDayDate(start) : `${formatDayDate(start)} ${formatClock(start)}`,
        run: () => void goto(`/calendar?event=${encodeURIComponent(hit.id)}&at=${encodeURIComponent(hit.start)}`),
      };
    }),
  );

  /** The rows for what has been typed, best first. */
  readonly items = $derived(rankItems([...this.#local, ...this.#events], this.query));
}

export const palette = new Palette();
