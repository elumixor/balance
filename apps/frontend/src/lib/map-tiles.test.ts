import { describe, expect, it } from "vitest";
import { project, TILE_PX, tilesFor } from "./map-tiles";

describe("project", () => {
  it("puts the origin of the world at the centre of the single tile", () => {
    expect(project(0, 0, 0)).toEqual({ x: TILE_PX / 2, y: TILE_PX / 2 });
  });

  it("scales with the zoom", () => {
    const near = project(50, 14, 10);
    const far = project(50, 14, 11);
    expect(far.x).toBeCloseTo(near.x * 2);
    expect(far.y).toBeCloseTo(near.y * 2);
  });
});

describe("tilesFor", () => {
  const frame = { latitude: 50.0834882, longitude: 14.4666322, zoom: 15, width: 320, height: 140 };

  it("covers the whole frame and nothing much beyond it", () => {
    const tiles = tilesFor(frame);
    // A 320×140 frame straddles at most two columns and two rows of 256-pixel tiles.
    expect(tiles.length).toBeGreaterThanOrEqual(2);
    expect(tiles.length).toBeLessThanOrEqual(4);
    const left = Math.min(...tiles.map((t) => t.left));
    const right = Math.max(...tiles.map((t) => t.left + TILE_PX));
    const top = Math.min(...tiles.map((t) => t.top));
    const bottom = Math.max(...tiles.map((t) => t.top + TILE_PX));
    expect(left).toBeLessThanOrEqual(0);
    expect(top).toBeLessThanOrEqual(0);
    expect(right).toBeGreaterThanOrEqual(frame.width);
    expect(bottom).toBeGreaterThanOrEqual(frame.height);
  });

  it("names the tile Prague actually sits on", () => {
    const urls = tilesFor(frame).map((t) => t.url);
    expect(urls.some((url) => url.endsWith("/15/17700/11101.png"))).toBe(true);
  });

  it("wraps across the antimeridian rather than asking for a tile that doesn't exist", () => {
    const tiles = tilesFor({ latitude: 0, longitude: 179.999, zoom: 3, width: 320, height: 140 });
    for (const tile of tiles) {
      const column = Number(tile.url.split("/")[4]);
      expect(column).toBeGreaterThanOrEqual(0);
      expect(column).toBeLessThan(8);
    }
    expect(new Set(tiles.map((t) => t.url)).size).toBe(tiles.length);
  });

  it("drops rows beyond the poles", () => {
    const tiles = tilesFor({ latitude: 85, longitude: 0, zoom: 1, width: 320, height: 600 });
    for (const tile of tiles) expect(Number.parseInt(tile.url.split("/")[5], 10)).toBeGreaterThanOrEqual(0);
  });
});
