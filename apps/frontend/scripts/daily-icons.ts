#!/usr/bin/env bun
// Regenerates the 31 alternate iOS home-screen icons — one per day of the month — from the
// shipped app icon.
//
// iOS has no runtime canvas the way the Dock does (`src/lib/desktop/dock.ts`): a home-screen icon
// is a fixed PNG chosen at build time, and the only thing an app can do at runtime is switch
// between a pre-bundled set via `setAlternateIconName`. Weekday and month would multiply this set
// past what's worth shipping, so the phone gets the day-of-month only; `DailyIconManager.swift`
// picks the matching file each launch and foreground.
//
//   bun run scripts/daily-icons.ts
import sharp from "sharp";

const BASE_ICON = "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png";
const OUT_DIR = "ios/App/App/AlternateIcons";
const SIZE = 1024;

function overlay(day: number): string {
  const n = String(day);
  // Two digits sit closer together and read smaller than one, so the size backs off to match.
  const fontSize = n.length > 1 ? SIZE * 0.42 : SIZE * 0.5;
  const mid = SIZE / 2;
  const glowRadius = SIZE * 0.4;

  return `
<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="black" stop-opacity="0.7" />
      <stop offset="100%" stop-color="black" stop-opacity="0" />
    </radialGradient>
    <filter id="blur" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="${SIZE * 0.02}" />
    </filter>
  </defs>
  <circle cx="${mid}" cy="${mid}" r="${glowRadius}" fill="url(#glow)" />
  <text x="${mid}" y="${mid}" text-anchor="middle" dominant-baseline="central"
        font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="${fontSize}"
        fill="black" stroke="black" stroke-width="${SIZE * 0.05}" filter="url(#blur)">${n}</text>
  <text x="${mid}" y="${mid}" text-anchor="middle" dominant-baseline="central"
        font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="${fontSize}"
        fill="white" stroke="black" stroke-width="2">${n}</text>
</svg>`;
}

await Bun.write(`${OUT_DIR}/.gitkeep`, "");
const base = sharp(BASE_ICON).resize(SIZE, SIZE).toBuffer();

for (let day = 1; day <= 31; day++) {
  const name = `AppIcon-Day${String(day).padStart(2, "0")}`;
  await sharp(await base)
    .composite([{ input: Buffer.from(overlay(day)) }])
    .flatten({ background: "#0e1013" })
    .png()
    .toFile(`${OUT_DIR}/${name}.png`);
  console.log(name);
}
