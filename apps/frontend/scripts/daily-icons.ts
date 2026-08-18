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
// Each day becomes its own `.appiconset` in the asset catalog rather than a loose 1024px PNG:
// App Store validation wants every icon — alternates included — present at 120x120 for iPhone and
// at 152x152 / 167x167 for iPad, and the catalog is what produces those. `wire_daily_icons.rb`
// lists the set names in ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES so the build compiles them.
//
//   bun run scripts/daily-icons.ts && (cd ios && ruby wire_daily_icons.rb)
import { mkdir, rm } from "node:fs/promises";
import sharp from "sharp";

const CATALOG = "ios/App/App/Assets.xcassets";
const BASE_ICON = `${CATALOG}/AppIcon.appiconset/AppIcon-ios-marketing-1024x1024@1x.png`;
const SIZE = 1024;

// The full device set, minus the 1024 marketing icon — the App Store only asks that of the
// primary icon, and shipping 31 more copies of it would only grow the bundle.
const VARIANTS = [
  { idiom: "iphone", size: 20, scale: 2 },
  { idiom: "iphone", size: 20, scale: 3 },
  { idiom: "iphone", size: 29, scale: 2 },
  { idiom: "iphone", size: 29, scale: 3 },
  { idiom: "iphone", size: 40, scale: 2 },
  { idiom: "iphone", size: 40, scale: 3 },
  { idiom: "iphone", size: 60, scale: 2 },
  { idiom: "iphone", size: 60, scale: 3 },
  { idiom: "ipad", size: 20, scale: 1 },
  { idiom: "ipad", size: 20, scale: 2 },
  { idiom: "ipad", size: 29, scale: 1 },
  { idiom: "ipad", size: 29, scale: 2 },
  { idiom: "ipad", size: 40, scale: 1 },
  { idiom: "ipad", size: 40, scale: 2 },
  { idiom: "ipad", size: 76, scale: 1 },
  { idiom: "ipad", size: 76, scale: 2 },
  { idiom: "ipad", size: 83.5, scale: 2 },
] as const;

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

const base = await sharp(BASE_ICON).resize(SIZE, SIZE).toBuffer();

for (let day = 1; day <= 31; day++) {
  const name = `AppIcon-Day${String(day).padStart(2, "0")}`;
  const dir = `${CATALOG}/${name}.appiconset`;
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  const full = await sharp(base)
    .composite([{ input: Buffer.from(overlay(day)) }])
    .flatten({ background: "#0e1013" })
    .png()
    .toBuffer();

  const images = [];
  for (const { idiom, size, scale } of VARIANTS) {
    const pixels = Math.round(size * scale);
    const filename = `${name}-${idiom}-${size}x${size}@${scale}x.png`;
    await sharp(full).resize(pixels, pixels).png().toFile(`${dir}/${filename}`);
    images.push({ idiom, size: `${size}x${size}`, scale: `${scale}x`, filename });
  }

  await Bun.write(
    `${dir}/Contents.json`,
    `${JSON.stringify({ images, info: { author: "xcode", version: 1 } }, null, 2)}\n`,
  );
  console.log(name);
}
