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

/**
 * `capacitor-assets` leaves the icon set as the single 1024 image Xcode is happy to scale, and
 * App Store Connect answers every upload with a list of the sizes it would rather have had
 * (ITMS-90890, ITMS-90892). They cost a few hundred kilobytes, so the set is written out in full
 * here instead of arguing with the warning.
 *
 * The icon is drawn on black rather than left transparent: the mark's own background is the black
 * square it was made with, and an alpha channel in an app icon is a rejection, not a warning.
 */
const ICON_SET = "ios/App/App/Assets.xcassets/AppIcon.appiconset";
const ICONS = [
  { idiom: "iphone", size: "20x20", scales: [2, 3] },
  { idiom: "iphone", size: "29x29", scales: [2, 3] },
  { idiom: "iphone", size: "40x40", scales: [2, 3] },
  { idiom: "iphone", size: "60x60", scales: [2, 3] },
  { idiom: "ipad", size: "20x20", scales: [1, 2] },
  { idiom: "ipad", size: "29x29", scales: [1, 2] },
  { idiom: "ipad", size: "40x40", scales: [1, 2] },
  { idiom: "ipad", size: "76x76", scales: [1, 2] },
  { idiom: "ipad", size: "83.5x83.5", scales: [2] },
  { idiom: "ios-marketing", size: "1024x1024", scales: [1] },
];

const toned = await sharp(`${IOS_ASSETS}/icon.png`).png().toBuffer();
const images = [];

for (const { idiom, size, scales } of ICONS) {
  const points = Number(size.split("x")[0]);
  for (const scale of scales) {
    const pixels = Math.round(points * scale);
    const filename = `AppIcon-${idiom}-${size}@${scale}x.png`;
    await sharp(toned)
      .resize(pixels, pixels, { fit: "cover" })
      .flatten({ background: "#000000" })
      .png()
      .toFile(`${ICON_SET}/${filename}`);
    images.push({ idiom, size, scale: `${scale}x`, filename });
  }
}

await Bun.write(
  `${ICON_SET}/Contents.json`,
  `${JSON.stringify({ images, info: { author: "xcode", version: 1 } }, null, 2)}\n`,
);
