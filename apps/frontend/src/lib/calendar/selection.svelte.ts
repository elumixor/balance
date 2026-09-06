import { SvelteSet } from "svelte/reactivity";
import type { CalendarEvent } from "./types";

/**
 * Which blocks the person has their hands on: the one open in the editor, the one a right-click
 * landed on, and the ones gathered for a write that applies to all of them.
 *
 * All of it is by id rather than by value: a write replaces every event object, and the editor
 * has to show what the week now holds — a category set from inside it lands on the row that set
 * it, not one refetch later.
 */
export class CalendarSelection {
  /** The open event's id — see `CalendarData.selected` for the event itself. */
  selectedId = $state<string | null>(null);
  /** Where the tapped block is on screen, so its editor can open beside it rather than over it. */
  selectedRect = $state<DOMRect | null>(null);
  /** The block made a moment ago and still unnamed: its editor opens with the cursor in the name. */
  unnamedId = $state<string | null>(null);
  /** The block a right-click landed on, and where — null when no context menu is open. */
  contextMenuEvent = $state<CalendarEvent | null>(null);
  contextMenuRect = $state<DOMRect | null>(null);
  /**
   * The blocks gathered for a write that applies to all of them — by dragging a box over empty
   * grid, or by ⌘-clicking them one at a time. Ids rather than events: a refetch replaces every
   * event object, and a selection has to survive that.
   */
  readonly picked = new SvelteSet<string>();

  select(event: CalendarEvent, rect: DOMRect | null) {
    // Opening any other block ends the naming of the one made a moment ago.
    if (this.unnamedId !== event.id) this.unnamedId = null;
    this.selectedId = event.id;
    this.selectedRect = rect;
  }

  /**
   * A block's own click. ⌘-click adds the block to the gathered ones instead of opening it: a
   * batch is built by clicking, so a click can't also be what takes the batch apart.
   */
  tap(event: CalendarEvent, rect: DOMRect, additive = false) {
    if (additive) return this.togglePicked(event);
    // Tapping a block that's part of an already-gathered batch opens it for editing without
    // scattering the rest — a category chosen there is meant to land on the whole batch.
    if (!this.picked.has(event.id)) this.clearPicked();
    this.select(event, rect);
  }

  deselect() {
    this.selectedId = null;
    this.selectedRect = null;
    this.unnamedId = null;
  }

  /**
   * A right-click on a block. Left over the gathered blocks it opens for the batch; otherwise it
   * opens for that block alone, and doesn't disturb whatever's already gathered or selected.
   */
  openContextMenu(event: CalendarEvent, at: { clientX: number; clientY: number }) {
    this.contextMenuEvent = event;
    this.contextMenuRect = new DOMRect(at.clientX, at.clientY, 0, 0);
  }

  closeContextMenu() {
    this.contextMenuEvent = null;
    this.contextMenuRect = null;
  }

  /**
   * ⌘-click on a block. An open editor is a selection of one, so the block it was showing joins
   * the batch rather than being dropped — ⌘-clicking a second block gathers both.
   */
  togglePicked(event: CalendarEvent) {
    const open = this.selectedId;
    this.deselect();
    if (open && open !== event.id) this.picked.add(open);
    if (!this.picked.delete(event.id)) this.picked.add(event.id);
  }

  clearPicked() {
    this.picked.clear();
  }
}
