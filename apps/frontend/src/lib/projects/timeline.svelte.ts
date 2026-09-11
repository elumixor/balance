import { readSetting, writeSetting } from "$lib/core/persist";
import { DEFAULT_SCALE, type DragMode, dragged, type Scale, type ScaleKey, type Span, scaleOf } from "./gantt";

const SCALE_KEY = "projects:timeline-scale";

/** The names beside the grid, and the height of one row — shared by the header and every row. */
export const NAME_WIDTH = 232;
export const ROW_HEIGHT = 30;
/** Under this many pixels the pointer was pressing the bar, not carrying it. */
const SLOP_PX = 3;

/**
 * How closely the timeline is being read. It lives on the device rather than the account: the
 * zoom that fits a phone is not the one that fits the Mac it is also open on.
 */
export class TimelineScale {
  #key = $state<ScaleKey>(readSetting<ScaleKey>(SCALE_KEY) ?? DEFAULT_SCALE);

  get key() {
    return this.#key;
  }

  get value(): Scale {
    return scaleOf(this.#key);
  }

  set(key: ScaleKey) {
    this.#key = key;
    writeSetting(SCALE_KEY, key);
  }
}

/**
 * A bar under the pointer. What a row draws while a drag is running is the dragged span, not the
 * record — the record is written once, when the pointer is let go, so a drag across a month is
 * one write and one press of undo rather than thirty.
 */
export class TimelineDrag {
  #origin = 0;
  #span: Span | null = null;
  #mode: DragMode = "move";
  #dayWidth = 1;
  #commit: ((span: Span) => void) | null = null;

  id = $state<string | null>(null);
  preview = $state<Span | null>(null);
  moved = $state(false);

  begin(
    event: PointerEvent,
    {
      id,
      span,
      mode,
      scale,
      commit,
    }: { id: string; span: Span; mode: DragMode; scale: Scale; commit: (span: Span) => void },
  ) {
    event.preventDefault();
    this.#origin = event.clientX;
    this.#span = span;
    this.#mode = mode;
    this.#dayWidth = scale.dayWidth;
    this.#commit = commit;
    this.id = id;
    this.preview = span;
    this.moved = false;
    window.addEventListener("pointermove", this.#move);
    window.addEventListener("pointerup", this.#end);
    window.addEventListener("pointercancel", this.#cancel);
  }

  /** What this row should draw: the drag in progress when it is this row's, the record otherwise. */
  spanOf(id: string, span: Span | null) {
    return this.id === id && this.preview ? this.preview : span;
  }

  #move = (event: PointerEvent) => {
    if (!this.#span) return;
    const dx = event.clientX - this.#origin;
    if (Math.abs(dx) > SLOP_PX) this.moved = true;
    this.preview = dragged(this.#span, this.#mode, Math.round(dx / this.#dayWidth));
  };

  #end = () => {
    const span = this.preview;
    const commit = this.#commit;
    const moved = this.moved;
    this.#stop();
    if (moved && span && commit) commit(span);
  };

  #cancel = () => this.#stop();

  #stop() {
    window.removeEventListener("pointermove", this.#move);
    window.removeEventListener("pointerup", this.#end);
    window.removeEventListener("pointercancel", this.#cancel);
    this.#span = null;
    this.#commit = null;
    this.id = null;
    this.preview = null;
  }
}
