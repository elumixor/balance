/**
 * Reading the places somebody has already named in Google Maps.
 *
 * Home, the office, the gym: everybody who uses Maps has said where those are, and being asked to
 * type them again — and to spell them the way a routing API wants — is the app asking for work
 * that has been done. Google has no API for it, and is unlikely to grow one: saved places and
 * labels are Maps' own account data, not Places' public index. What it does have is Takeout, so
 * the way in is a file, and this reads it.
 *
 * Two exports say what this app wants, and both are GeoJSON despite the `.json`:
 * "Maps · My labeled places" is Home, Work and anything else labelled; "Maps (your places)" is
 * `Saved Places.json`, the starred list. Their properties differ by vintage — the classic export
 * nests everything under `Location` with capitalised keys, newer ones are flat and lower-case —
 * so both spellings are read and neither is required.
 *
 * Nothing here is a decision: a file is a list of candidates, and the sheet is where somebody
 * picks the four that are worth naming out of nine hundred starred restaurants.
 */

/** One place a Maps export names, before anybody has decided to keep it. */
export interface ImportedPlace {
  /** What to call it — the label, the business name, or the street line as a last resort. */
  readonly label: string;
  /** The address to route from. Empty when the export named the place without spelling it out. */
  readonly address: string;
  readonly latitude?: number;
  readonly longitude?: number;
}

/**
 * Every place the file names, in the order it names them, each one only once. A file the export
 * changed the shape of, or one that isn't an export at all, is no places rather than an error:
 * the sheet that says "nothing in that file" is a better answer than a card about JSON.
 */
export function parseGooglePlaces(text: string): ImportedPlace[] {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }

  const found: ImportedPlace[] = [];
  const seen = new Set<string>();
  for (const feature of featuresOf(parsed)) {
    const place = fromFeature(feature);
    if (!place) continue;
    // The same place is in two lists as often as not, and a list is a list of places, not of rows.
    const key = (place.address || place.label).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(place);
  }
  return found;
}

/** A FeatureCollection, or the bare array of features some tools hand on. */
function featuresOf(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (isRecord(parsed) && Array.isArray(parsed.features)) return parsed.features;
  return [];
}

function fromFeature(feature: unknown): ImportedPlace | null {
  if (!isRecord(feature)) return null;
  const properties = isRecord(feature.properties) ? feature.properties : {};
  const location = isRecord(properties.Location) ? properties.Location : {};

  const address = text(location.Address) ?? text(properties.address) ?? "";
  // "Business Name" is the classic export's word for it; a labelled place carries its label as
  // the name, which is exactly what somebody wants the place called here.
  const label =
    text(location["Business Name"]) ?? text(properties.name) ?? text(properties.Title) ?? streetLine(address);
  if (!label) return null;

  const url = text(properties["Google Maps URL"]) ?? text(properties.google_maps_url) ?? "";
  const point = fromGeometry(feature.geometry) ?? fromLatLng(location["Geo Coordinates"]) ?? fromUrl(url);
  return { label, address, ...point };
}

/** GeoJSON is longitude first, which is the one thing about it worth getting wrong once. */
function fromGeometry(geometry: unknown): Point | null {
  if (!isRecord(geometry) || !Array.isArray(geometry.coordinates)) return null;
  return point(geometry.coordinates[1], geometry.coordinates[0]);
}

/** The classic export's own pair, written as strings about as often as numbers. */
function fromLatLng(coordinates: unknown): Point | null {
  if (!isRecord(coordinates)) return null;
  return point(coordinates.Latitude, coordinates.Longitude);
}

/**
 * The place's own link, which carries the point twice in two spellings — `!3d…!4d…` for the pin
 * itself and `@lat,lng` for where the map was looking. The pin is the truer of the two.
 */
function fromUrl(url: string): Point | null {
  const pin = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(url);
  if (pin) return point(pin[1], pin[2]);
  const view = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(url);
  return view ? point(view[1], view[2]) : null;
}

interface Point {
  readonly latitude: number;
  readonly longitude: number;
}

/**
 * A pair of coordinates, or nothing. Null Island is nothing: the export writes `[0, 0]` for a
 * place it never pinned down, and a journey to the Atlantic is worse than a journey to an address.
 */
function point(latitude: unknown, longitude: unknown): Point | null {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { latitude: lat, longitude: lng };
}

/** "Bergmannstraße 1, 10961 Berlin" is called "Bergmannstraße 1" until somebody renames it. */
const streetLine = (address: string) => address.split(",")[0].trim();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);
