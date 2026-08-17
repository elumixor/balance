import { invoke } from "@tauri-apps/api/core";
import { isDesktop } from "./platform";
import { report } from "./report";

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
      report("The Dock refused the icon", e);
    }
  }
}

export const desktopDock = new DesktopDock();

/**
 * How much of the tile macOS expects to be empty. A full-bleed square sits proud of every other
 * icon in the Dock; the system's own are drawn inside a rounded square with air around it.
 */
const MARGIN = 0.1;
/** Apple's corner is a fraction of the icon, not a fixed radius — this is the Big Sur proportion. */
const CORNER = 0.2237;

/** The app's own icon with today's date over it, as PNG bytes. */
async function render(now: Date): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(SIZE, SIZE);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no canvas to draw the icon on");

  const inset = SIZE * MARGIN;
  const tile = SIZE - inset * 2;

  // Clipped rather than trusted: the artwork carries its own corners, but they are the phone's
  // proportion, and a tile drawn without the artwork at all still has to be the right shape.
  context.save();
  context.beginPath();
  context.roundRect(inset, inset, tile, tile, tile * CORNER);
  context.clip();
  context.fillStyle = "#0e1013";
  context.fillRect(inset, inset, tile, tile);
  const icon = await base();
  if (icon) context.drawImage(icon, inset, inset, tile, tile);
  context.restore();

  // The app's face, not the system's fallback — which is what a canvas draws with if the web
  // font hasn't landed yet.
  await document.fonts.ready;

  // Straight across the middle, over the ring. The date is the thing being read at Dock size, so
  // it gets the centre and the ring becomes what it sits on; a shadow under each line is what
  // holds it against the bright part of the artwork.
  const middle = SIZE / 2;
  const step = tile * 0.29;

  // A dark pool behind the date, so the text has something steady to sit on regardless of what
  // the artwork underneath looks like.
  const glowRadius = tile * 0.45;
  const glow = context.createRadialGradient(middle, middle, 0, middle, middle, glowRadius);
  glow.addColorStop(0, "rgba(0, 0, 0, 0.7)");
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.fillStyle = glow;
  context.beginPath();
  context.arc(middle, middle, glowRadius, 0, Math.PI * 2);
  context.fill();

  context.textAlign = "center";
  context.textBaseline = "middle";

  const line = (text: string, y: number, size: number, weight: number) => {
    context.font = `${weight} ${size}px "Instrument Sans", system-ui, sans-serif`;
    context.save();
    // Enough to lift the white off the pale part of the ring, and no more — it should read as
    // depth rather than as a drop shadow.
    context.shadowColor = "rgba(0, 0, 0, 0.8)";
    context.shadowBlur = 100;
    context.shadowOffsetY = tile * 0.008;
    // Slightly short of white, so the artwork behind it comes through and the date sits in the
    // icon rather than on top of it.
    context.lineWidth = 2;
    context.strokeStyle = "#000000";
    context.strokeText(text, middle, y);
    context.fillStyle = "rgba(255, 255, 255, 0.9)";
    context.fillText(text, middle, y);
    context.restore();
  };

  // The day is the thing being read; the two labels around it only say which day it is.
  line(now.toLocaleDateString(undefined, { weekday: "short" }), middle - step, tile * 0.17, 400);
  line(String(now.getDate()), middle, tile * 0.4, 600);
  line(now.toLocaleDateString(undefined, { month: "short" }), middle + step, tile * 0.17, 400);

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
