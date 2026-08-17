#!/usr/bin/env bun
// Regenerates the iOS icon and splash sets from `assets/icon.png`.
//
// `@capacitor/assets` wants a `splash.png` (and a dark variant) alongside the icon, and Balance
// has none — its splash is just the mark on the app background, which is cheaper to compose here
// than to keep as two more binaries in the repo.
import { copyFile, mkdir } from "node:fs/promises";
import { $ } from "bun";
import sharp from "sharp";

const BACKGROUNDS = { splash: "#F6F6F4", "splash-dark": "#0E1013" };
const SPLASH_SIZE = 2732;
const MARK_SIZE = 820;

/**
 * On a home screen the mark sits among icons that are mostly flat colour, and at full strength its
 * chrome and its glow shout over all of them. The iOS set is therefore drawn from a toned-down
 * copy: less saturation, a shallower range between the metal's highlights and the black behind it,
 * and a touch darker overall. Everything else — the splash screens, the source of truth in the
 * repo — keeps the mark as it is.
 */
const IOS_TONE = { contrast: 0.88, lift: 12, saturation: 0.78, brightness: 0.86 };
const IOS_ASSETS = "assets/.ios";

const icon = await sharp("assets/icon.png").resize(MARK_SIZE, MARK_SIZE).png().toBuffer();

for (const [name, background] of Object.entries(BACKGROUNDS)) {
  await sharp({ create: { width: SPLASH_SIZE, height: SPLASH_SIZE, channels: 4, background } })
    .composite([{ input: icon, gravity: "center" }])
    .png()
    .toFile(`assets/${name}.png`);
}

// `capacitor-assets` reads one folder, so the iOS run gets its own — the toned icon beside the
// splashes it still needs, which are the untouched ones.
await mkdir(IOS_ASSETS, { recursive: true });
await sharp("assets/icon.png")
  .linear(IOS_TONE.contrast, IOS_TONE.lift)
  .modulate({ saturation: IOS_TONE.saturation, brightness: IOS_TONE.brightness })
  .png()
  .toFile(`${IOS_ASSETS}/icon.png`);
for (const name of Object.keys(BACKGROUNDS)) await copyFile(`assets/${name}.png`, `${IOS_ASSETS}/${name}.png`);

await $`bunx capacitor-assets generate --ios --assetPath ${IOS_ASSETS}`;
