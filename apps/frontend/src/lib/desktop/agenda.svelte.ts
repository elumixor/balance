import { listen } from "@tauri-apps/api/event";
import { agenda } from "$lib/calendar/agenda.svelte";
import type { CalendarEvent } from "$lib/calendar/types";
import type { Category } from "$lib/core/records";
import { isDesktop } from "./platform";

/**
 * The Mac's clock for the shared agenda (`$lib/agenda.svelte.ts`), and nothing else.
 *
 * The tick comes from Rust (`spawn_agenda_ticks` in `src-tauri/src/lib.rs`), not a `setInterval`
 * here — WebKit throttles a hidden window's own timers, and this app spends most of its life as
 * exactly that. Matches `AGENDA_TICK`/`AGENDA_REFRESH` on that side.
 */
class DesktopAgenda {
  #stop: (() => void) | null = null;
  #started = false;

  /** Idempotent, and a no-op anywhere but the desktop build. */
  start() {
    if (!isDesktop || this.#started) return;
    this.#started = true;

    agenda.start();

    const unlisten = [listen("agenda://tick", () => agenda.tick()), listen("agenda://refresh", () => agenda.refresh())];

    this.#stop = () => {
      for (const pending of unlisten) void pending.then((off) => off());
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
    agenda.refresh();
  }

  get now(): Date {
    return agenda.now;
  }

  get upcoming(): CalendarEvent[] {
    return agenda.upcoming;
  }

  get known(): CalendarEvent[] {
    return agenda.known;
  }

  get categories(): Map<string, Category> {
    return agenda.categories;
  }
}

export const desktopAgenda = new DesktopAgenda();
