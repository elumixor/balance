import { UpstreamError } from "~/lib/http/api-error";
import { ZoomAuthError } from "./oauth";

const API = "https://api.zoom.us/v2";

/** A scheduled meeting, as Zoom answers it and as the calendar wants it. */
export interface ZoomMeeting {
  /** The link a guest opens. */
  readonly joinUrl: string;
  /** The meeting id in the shape Zoom prints it, which is what people read out loud. */
  readonly meetingCode: string;
  /** The passcode, when the account's settings put one on it. Null when there is none. */
  readonly passcode: string | null;
}

interface MeetingResponse {
  id?: number;
  join_url?: string;
  password?: string | null;
}

/** What a meeting is asked for with: a scheduled one, at a moment, for a length. */
export interface MeetingRequest {
  readonly topic: string;
  readonly start: Date;
  readonly minutes: number;
  /** The IANA zone the meeting reads as in Zoom's own listings. */
  readonly timeZone?: string;
}

/** A scheduled meeting, as opposed to an instant one or a recurring one. */
const SCHEDULED = 2;

/**
 * Zoom's API, written out rather than pulled in — the same call `lib/mcp/` makes for the
 * same reason: two endpoints do not need an SDK, and an SDK built around Node's `req`/`res` does
 * not survive being a Vercel function.
 */
export class ZoomClient {
  constructor(private readonly accessToken: string) {}

  /** A room in the connected account, at the event's own time. */
  async createMeeting(request: MeetingRequest): Promise<ZoomMeeting> {
    const answer = await this.#send<MeetingResponse>("/users/me/meetings", {
      topic: request.topic || "Meeting",
      type: SCHEDULED,
      start_time: request.start.toISOString().replace(/\.\d{3}Z$/, "Z"),
      duration: request.minutes,
      ...(request.timeZone === undefined ? {} : { timezone: request.timeZone }),
    });
    if (!answer.join_url) throw new UpstreamError("Zoom made a meeting without a join link");
    return {
      joinUrl: answer.join_url,
      meetingCode: printedId(answer.id),
      passcode: answer.password ?? null,
    };
  }

  /**
   * The room a call was taking place in, taken down. A meeting Zoom has already forgotten is not
   * an error: what the caller wanted — no such room — is the state either way.
   */
  async deleteMeeting(meetingId: string): Promise<void> {
    await this.#send(`/meetings/${encodeURIComponent(meetingId)}`, undefined, "DELETE", [404]);
  }

  async #send<T>(path: string, body?: unknown, method = body ? "POST" : "GET", tolerate: number[] = []): Promise<T> {
    const response = await fetch(`${API}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.accessToken}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (tolerate.includes(response.status)) return undefined as T;
    if (response.status === 401) throw new ZoomAuthError("That Zoom connection has expired.");
    if (!response.ok) throw new UpstreamError(`Zoom refused the request: ${await messageOf(response)}`);
    // A delete answers 204, and JSON.parse of nothing throws where the caller wants no answer.
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
}

/** Zoom's ids are numbers it prints in threes and fours — "812 3456 7890". */
function printedId(id: number | undefined) {
  if (id === undefined) return "";
  const digits = String(id);
  return digits.length === 11
    ? `${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`
    : `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`.trim();
}

async function messageOf(response: Response) {
  try {
    const answer = (await response.json()) as { message?: string };
    return answer.message ?? String(response.status);
  } catch {
    return String(response.status);
  }
}
