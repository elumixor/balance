import type { Arrival, TravelMode } from "./types";

/** What `travelmode=` wants in a maps link, which is a different spelling of the same four. */
const LINK_MODE: Record<TravelMode, string> = {
  transit: "transit",
  drive: "driving",
  bicycle: "bicycling",
  walk: "walking",
};

/** The mode as the `data=` form of a maps link spells it — the only form that takes a time. */
const DATA_MODE: Record<TravelMode, number> = { drive: 0, bicycle: 1, walk: 2, transit: 3 };

const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;

/**
 * A maps link for a journey, whether or not Google would tell us how long it takes.
 *
 * Opened on "arrive by" when the journey has an arrival to make: the documented `?api=1` form
 * can't say when, so Maps would plan from the moment the link is tapped and get the timetable
 * wrong for anything later today. The `data=` form (`!6e1` arrive by, `!8j` when, `!3e` the
 * mode) is undocumented but has held for a decade, and reads its time as local rather than UTC;
 * an arrival already gone is left out, because Maps has nothing to say about a bus that has left.
 */
export function directionsUrl(origin: string, destination: string, mode: TravelMode, arriveBy?: Arrival) {
  if (arriveBy && arriveBy.at.getTime() > Date.now()) {
    // Maps reads the number as the wall clock, so the instant is shifted onto the local one.
    const at = Math.round(arriveBy.at.getTime() / MS_PER_SECOND) + arriveBy.offsetMinutes * SECONDS_PER_MINUTE;
    const path = [origin, destination].map((place) => encodeURIComponent(place).replace(/%20/g, "+")).join("/");
    return `https://www.google.com/maps/dir/${path}/data=!4m6!4m5!2m3!6e1!7e2!8j${at}!3e${DATA_MODE[mode]}`;
  }
  const params = new URLSearchParams({ api: "1", origin, destination, travelmode: LINK_MODE[mode] });
  return `https://www.google.com/maps/dir/?${params}`;
}
