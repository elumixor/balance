import { describe, expect, it } from "vitest";
import { parseGooglePlaces } from "./google-places";

/** The classic "Maps (your places)" shape: everything nested, every key capitalised. */
function classic(overrides: Record<string, unknown> = {}) {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [13.4225, 52.4879] },
    properties: {
      "Google Maps URL": "http://maps.google.com/?cid=123",
      Location: {
        "Business Name": "Tempelhofer Feld",
        Address: "Tempelhofer Damm, 12101 Berlin, Germany",
        "Geo Coordinates": { Latitude: "52.4879", Longitude: "13.4225" },
      },
      ...overrides,
    },
  };
}

const collection = (...features: unknown[]) => JSON.stringify({ type: "FeatureCollection", features });

describe("parseGooglePlaces", () => {
  it("reads a classic saved place, longitude-first geometry and all", () => {
    expect(parseGooglePlaces(collection(classic()))).toEqual([
      {
        label: "Tempelhofer Feld",
        address: "Tempelhofer Damm, 12101 Berlin, Germany",
        latitude: 52.4879,
        longitude: 13.4225,
      },
    ]);
  });

  it("reads the flat, lower-case shape newer exports write", () => {
    const feature = {
      geometry: { type: "Point", coordinates: [30.5234, 50.4501] },
      properties: { name: "Home", address: "Khreshchatyk St, 1, Kyiv", google_maps_url: "https://maps.app.goo.gl/x" },
    };
    expect(parseGooglePlaces(collection(feature))).toEqual([
      { label: "Home", address: "Khreshchatyk St, 1, Kyiv", latitude: 50.4501, longitude: 30.5234 },
    ]);
  });

  it("takes a bare array of features, which is what half the converters hand on", () => {
    expect(parseGooglePlaces(JSON.stringify([classic()]))).toHaveLength(1);
  });

  it("falls back to Title when the place has no name of its own", () => {
    const feature = { properties: { Title: "The cabin", address: "Someplace" } };
    expect(parseGooglePlaces(collection(feature))[0].label).toBe("The cabin");
  });

  it("names an unnamed place after its street line", () => {
    const feature = { properties: { address: "Bergmannstraße 1, 10961 Berlin" } };
    expect(parseGooglePlaces(collection(feature))[0]).toEqual({
      label: "Bergmannstraße 1",
      address: "Bergmannstraße 1, 10961 Berlin",
    });
  });

  it("keeps a labelled place that was never spelled out", () => {
    const feature = { properties: { name: "Work" }, geometry: { type: "Point", coordinates: [13.4, 52.5] } };
    expect(parseGooglePlaces(collection(feature))).toEqual([
      { label: "Work", address: "", latitude: 52.5, longitude: 13.4 },
    ]);
  });

  it("skips a feature that names nothing at all", () => {
    // A feature with no properties at all is one of the two shapes a stripped-down converter writes.
    expect(
      parseGooglePlaces(collection({ properties: { address: "   " } }, { geometry: null }, "not a feature", null)),
    ).toEqual([]);
  });

  it("reads the classic pair when the geometry is missing", () => {
    const feature = classic();
    delete (feature as { geometry?: unknown }).geometry;
    expect(parseGooglePlaces(collection(feature))[0]).toMatchObject({ latitude: 52.4879, longitude: 13.4225 });
  });

  it("reads the pin out of the URL when nothing else carries a point", () => {
    const feature = {
      properties: {
        name: "Sagrada Família",
        address: "Carrer de Mallorca, Barcelona",
        "Google Maps URL": "https://www.google.com/maps/place/x/@41.3,2.1,17z/data=!4m2!3m1!1s0x0!3d41.4036!4d2.1744",
      },
    };
    expect(parseGooglePlaces(collection(feature))[0]).toMatchObject({ latitude: 41.4036, longitude: 2.1744 });
  });

  it("falls back to where the map was looking when there is no pin", () => {
    const feature = { properties: { name: "Somewhere", "Google Maps URL": "https://maps.google.com/@41.3,2.1,17z" } };
    expect(parseGooglePlaces(collection(feature))[0]).toMatchObject({ latitude: 41.3, longitude: 2.1 });
  });

  it("leaves a place with no point at all without one", () => {
    const feature = { properties: { name: "Somewhere", google_maps_url: "https://maps.app.goo.gl/abc" } };
    expect(parseGooglePlaces(collection(feature))[0]).toEqual({ label: "Somewhere", address: "" });
  });

  it("refuses Null Island, unreadable numbers and impossible coordinates", () => {
    const at = (coordinates: unknown) => ({ properties: { name: "X" }, geometry: { coordinates } });
    expect(parseGooglePlaces(collection(at([0, 0])))[0].latitude).toBeUndefined();
    expect(parseGooglePlaces(collection(at(["", "north"])))[0].latitude).toBeUndefined();
    expect(parseGooglePlaces(collection(at([13.4, 91])))[0].latitude).toBeUndefined();
    expect(parseGooglePlaces(collection(at([181, 52.5])))[0].latitude).toBeUndefined();
    expect(parseGooglePlaces(collection({ properties: { name: "X" }, geometry: { coordinates: "13.4,52.5" } }))[0])
      .toEqual({ label: "X", address: "" });
    expect(parseGooglePlaces(collection({ properties: { name: "X", Location: { "Geo Coordinates": 4 } } }))[0])
      .toEqual({ label: "X", address: "" });
  });

  it("lists the same place once, however many lists hold it", () => {
    expect(parseGooglePlaces(collection(classic(), classic()))).toHaveLength(1);
    const named = { properties: { name: "Home" } };
    expect(parseGooglePlaces(collection(named, named))).toHaveLength(1);
  });

  it("answers a file that is not an export with no places rather than a failure", () => {
    expect(parseGooglePlaces("")).toEqual([]);
    expect(parseGooglePlaces("BEGIN:VCALENDAR")).toEqual([]);
    expect(parseGooglePlaces("{ not json")).toEqual([]);
    expect(parseGooglePlaces('{"type":"FeatureCollection"}')).toEqual([]);
    expect(parseGooglePlaces('"a string"')).toEqual([]);
  });
});
