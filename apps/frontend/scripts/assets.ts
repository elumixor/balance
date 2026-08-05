#!/usr/bin/env bun
// Regenerates the iOS icon and splash sets from `assets/icon.png`.
//
// `@capacitor/assets` wants a `splash.png` (and a dark variant) alongside the icon, and Balance
// has none — its splash is just the mark on the app background, which is cheaper to compose here
// than to keep as two more binaries in the repo.
import { $ } from "bun";
import sharp from "sharp";

const BACKGROUNDS = { splash: "#F6F6F4", "splash-dark": "#0E1013" };
const SPLASH_SIZE = 2732;
const MARK_SIZE = 820;

const icon = await sharp("assets/icon.png").resize(MARK_SIZE, MARK_SIZE).png().toBuffer();

for (const [name, background] of Object.entries(BACKGROUNDS)) {
  await sharp({ create: { width: SPLASH_SIZE, height: SPLASH_SIZE, channels: 4, background } })
    .composite([{ input: icon, gravity: "center" }])
    .png()
    .toFile(`assets/${name}.png`);
}

await $`bunx capacitor-assets generate --ios`;
