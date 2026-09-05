/**
 * A still map, made of the tiles under a point.
 *
 * Google's static map wants billing the maps key doesn't have, and a map library is a lot of
 * machinery for a picture that never moves. A tile server's tiles are the same picture cut into
 * 256-pixel squares, so a preview is the few squares under the pin, each placed where the
 * mercator projection says it goes. Pure, so the arithmetic can be checked without a screen.
 *
 * The tiles are CARTO's Positron — OpenStreetMap's data drawn quiet and grey, the way Google
 * draws its own — so a street under a pin is a street and not a paint chart. Spread over the
 * three hosts CARTO offers, and at twice the pixels for the screens that can show them.
 */

export const TILE_PX = 256;
const TILE_HOSTS = ["a", "b", "c"];
const TILE_URL = (host: string) => `https://${host}.basemaps.cartocdn.com/light_all`;

export interface Tile {
  readonly url: string;
  /** Where the tile's top-left corner sits in the frame, in pixels; may be negative. */
  readonly left: number;
  readonly top: number;
}

/** Where a point falls in the world at a zoom, in tile-pixel units from the top-left corner. */
export function project(latitude: number, longitude: number, zoom: number) {
  const scale = TILE_PX * 2 ** zoom;
  const x = ((longitude + 180) / 360) * scale;
  const rad = (latitude * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * scale;
  return { x, y };
}

/** The tiles that cover a frame centred on a point, and where each one goes. */
export function tilesFor(input: {
  latitude: number;
  longitude: number;
  zoom: number;
  width: number;
  height: number;
}): Tile[] {
  const { x, y } = project(input.latitude, input.longitude, input.zoom);
  const originX = x - input.width / 2;
  const originY = y - input.height / 2;
  const count = 2 ** input.zoom;
  const tiles: Tile[] = [];
  for (let tx = Math.floor(originX / TILE_PX); tx * TILE_PX < originX + input.width; tx++) {
    for (let ty = Math.floor(originY / TILE_PX); ty * TILE_PX < originY + input.height; ty++) {
      if (ty < 0 || ty >= count) continue;
      // The world wraps east–west, so a frame over the antimeridian borrows from the other edge.
      const column = ((tx % count) + count) % count;
      const host = TILE_HOSTS[(column + ty) % TILE_HOSTS.length];
      tiles.push({
        url: `${TILE_URL(host)}/${input.zoom}/${column}/${ty}@2x.png`,
        left: tx * TILE_PX - originX,
        top: ty * TILE_PX - originY,
      });
    }
  }
  return tiles;
}
