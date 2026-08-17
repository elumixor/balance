import { mount, unmount } from "svelte";
import { iconFor } from "$lib/icons";

/**
 * The category icons the tray dropdown draws instead of a plain colour bar.
 *
 * Rust has no idea what a Lucide icon looks like, so the shape has to be turned into pixels
 * somewhere that does — the same move `dock.ts` makes for the Dock tile. A hidden instance of the
 * icon component is mounted, its rendered `<svg>` is drawn into a canvas, and the raw RGBA comes
 * back out. Cached by icon+colour, since the same category shows up on most rows in a week.
 */

/** Raster px per glyph. Big enough to stay sharp once macOS scales it down to a menu row. */
const SIZE = 36;
/** The glyph itself, as a fraction of `SIZE` — the rest is transparent padding around it. */
const SCALE = 0.7;

export interface RasterIcon {
  width: number;
  height: number;
  rgba: number[];
}

/** Shown for the one tick between a new icon+colour pairing appearing and its raster landing. */
const BLANK: RasterIcon = { width: 1, height: 1, rgba: [0, 0, 0, 0] };

class TrayIcons {
  #version = $state(0);
  #icons = new Map<string, RasterIcon>();
  #pending = new Set<string>();

  /** Synchronous by necessity — `update_tray`'s state is built inside a Svelte effect. Returns the
   * cached raster if there is one, and kicks off the (async) work to get one otherwise. */
  get(icon: string, color: string): RasterIcon {
    // Read every render so a landed raster's version bump re-triggers whatever called this.
    void this.#version;
    const key = `${icon}|${color}`;
    const cached = this.#icons.get(key);
    if (cached) return cached;

    if (!this.#pending.has(key)) {
      this.#pending.add(key);
      void rasterize(icon, color)
        .then((raster) => {
          this.#icons.set(key, raster);
          this.#version++;
        })
        .catch(() => {
          // A glyph that won't rasterize just stays blank — not worth losing the row over.
          this.#icons.set(key, BLANK);
          this.#version++;
        })
        .finally(() => this.#pending.delete(key));
    }
    return BLANK;
  }
}

export const trayIcons = new TrayIcons();

async function rasterize(icon: string, color: string): Promise<RasterIcon> {
  const host = document.createElement("div");
  const instance = mount(iconFor(icon), { target: host, props: { size: SIZE, strokeWidth: 2, color } });
  const markup = host.querySelector("svg")?.outerHTML ?? "";
  unmount(instance);

  const image = await loadImage(`data:image/svg+xml,${encodeURIComponent(markup)}`);
  const canvas = new OffscreenCanvas(SIZE, SIZE);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no canvas to draw the tray icon on");
  const drawn = SIZE * SCALE;
  const inset = (SIZE - drawn) / 2;
  context.drawImage(image, inset, inset, drawn, drawn);
  return { width: SIZE, height: SIZE, rgba: [...context.getImageData(0, 0, SIZE, SIZE).data] };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("the tray glyph wouldn't load"));
    image.src = url;
  });
}
