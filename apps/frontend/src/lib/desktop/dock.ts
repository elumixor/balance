import { invoke } from "@tauri-apps/api/core";
import { isDesktop } from "./platform";

/**
 * Today's date, on the Dock icon.
 *
 * A calendar app whose icon says the same thing every day is a calendar you have to open to use.
 * The tile is drawn here rather than in Rust for the same reason the menu bar is: the app's own
 * type, palette and idea of what day it is all live in the webview, and the shell only paints
 * what it's handed.
 *
 * macOS forgets it on quit — the change never touches the bundle — so this runs on every launch.
 */

/** Drawn oversized and declared small on the other side, which is what keeps it sharp. */
const SIZE = 1024;
/** How often the day is checked. A Mac that slept through midnight wakes to yesterday. */
const TICK_MS = 60_000;

class DesktopDock {
  #stop: (() => void) | null = null;
  /** The day currently on the icon, so a tick that changes nothing costs nothing. */
  #painted = "";

  /** Idempotent, and a no-op anywhere but the desktop build. */
  start() {
    if (!isDesktop || this.#stop) return;

    void this.paint();
    const tick = setInterval(() => void this.paint(), TICK_MS);
    // Waking the Mac doesn't fire the timer for the hours it was asleep, but coming back to the
    // app always fires this.
    const onFocus = () => void this.paint();
    window.addEventListener("focus", onFocus);

    this.#stop = () => {
      clearInterval(tick);
      window.removeEventListener("focus", onFocus);
    };
  }

  stop() {
    this.#stop?.();
    this.#stop = null;
  }

  async paint(now = new Date()) {
    if (!isDesktop) return;
    const day = now.toDateString();
    if (day === this.#painted) return;
    // Claimed before the await, so two ticks a moment apart don't both draw.
    this.#painted = day;
    try {
      await invoke("set_dock_icon", { png: [...(await render(now))] });
    } catch (e) {
      this.#painted = "";
      console.error("The Dock refused the icon", e);
    }
  }
}

export const desktopDock = new DesktopDock();

/** The app's own icon with the date laid over it, as PNG bytes. */
async function render(now: Date): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(SIZE, SIZE);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no canvas to draw the icon on");

  const icon = await base();
  if (icon) context.drawImage(icon, 0, 0, SIZE, SIZE);
  // The app's face, not the system's fallback — which is what a canvas draws with if the web
  // font hasn't landed yet.
  await document.fonts.ready;

  // A plate in the corner rather than a number across the middle: the icon is mostly ring, and
  // the ring is what makes it recognisable at Dock size.
  const plate = SIZE * 0.46;
  const inset = SIZE * 0.09;
  const x = SIZE - inset - plate;
  const y = SIZE - inset - plate;

  context.fillStyle = "#f6f6f4";
  context.beginPath();
  context.roundRect(x, y, plate, plate, plate * 0.22);
  context.fill();

  context.textAlign = "center";
  context.fillStyle = "#6a6f75";
  context.font = `600 ${plate * 0.18}px "Instrument Sans", system-ui, sans-serif`;
  context.textBaseline = "alphabetic";
  context.fillText(
    now.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase(),
    x + plate / 2,
    y + plate * 0.31,
  );

  context.fillStyle = "#15171a";
  context.font = `600 ${plate * 0.52}px "Instrument Sans", system-ui, sans-serif`;
  context.fillText(String(now.getDate()), x + plate / 2, y + plate * 0.83);

  const blob = await canvas.convertToBlob({ type: "image/png" });
  return new Uint8Array(await blob.arrayBuffer());
}

let icon: Promise<ImageBitmap | null> | null = null;

/** The bundled icon, fetched once. A tile drawn without it is still a readable date. */
function base() {
  icon ??= fetch("/icon-512.png")
    .then((response) => response.blob())
    .then((blob) => createImageBitmap(blob))
    .catch(() => null);
  return icon;
}
