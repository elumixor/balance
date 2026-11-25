/** Who said a stretch of time belongs to a sphere, strongest first. */
export type ActivityBasis = "manual" | "source" | "calendar" | "place";

export interface ActivityPlace {
  label?: string;
  latitude?: number;
  longitude?: number;
  locationId?: string;
  wifi?: string;
}

/** One thing that happened: an observation a device posted, or a calendar block that has begun. */
export interface ActivityEvent {
  id: string;
  source: string;
  kind: "location" | "sleep" | "travel" | "activity" | "calendar";
  start: string;
  end: string;
  title: string | null;
  place: ActivityPlace | null;
  sphereId: string | null;
  basis: ActivityBasis | null;
  confidence: number;
}

/** A stretch of the lane: one sphere, and who said so. */
export interface ActivitySegment {
  start: string;
  end: string;
  sphereId: string;
  basis: ActivityBasis;
}

export interface ActivityTimeline {
  connected: boolean;
  needsReconnect: boolean;
  events: ActivityEvent[];
  segments: ActivitySegment[];
}
