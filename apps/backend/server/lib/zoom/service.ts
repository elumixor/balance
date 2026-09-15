import { eq } from "drizzle-orm";
import { db } from "~/db";
import { zoomConnections } from "~/db/schema";
import { decryptSecret, encryptSecret } from "~/lib/calendar/crypto";
import { ApiError } from "~/lib/http/api-error";
import { type MeetingRequest, ZoomClient, type ZoomMeeting } from "./client";
import { ZoomAuthError, type ZoomGrant, zoomConfigured, zoomOAuth } from "./oauth";

/**
 * What the settings row draws. "Zoom isn't set up here", "not connected" and "the grant expired"
 * are three states with a row each rather than errors — the same rule the calendar and Notion are
 * under, and for the same reason: a 401 out of here reads as a dead session and bounces somebody
 * to sign-in.
 */
export interface ZoomStatus {
  /** Whether this deployment has a Zoom app at all. False means the row offers nothing. */
  readonly available: boolean;
  readonly connected: boolean;
  readonly needsReconnect: boolean;
  readonly accountEmail: string;
}

/** Renewed this long before it actually expires, so a write never starts on a dying token. */
const REFRESH_MARGIN_MS = 60_000;

export class ZoomService {
  constructor(private readonly userId: string) {}

  async status(): Promise<ZoomStatus> {
    const available = zoomConfigured();
    const row = available ? await this.#row() : null;
    return {
      available,
      connected: Boolean(row),
      needsReconnect: row?.needsReconnect ?? false,
      accountEmail: row?.accountEmail ?? "",
    };
  }

  /** The consent screen's URL. The app opens it in a real browser and waits for the row to change. */
  authUrl(state: string) {
    return zoomOAuth.authUrl(state);
  }

  /** What the callback does with the code Zoom sent back: one grant, kept encrypted. */
  async complete(code: string) {
    await this.#write(await zoomOAuth.exchangeCode(code));
    return this.status();
  }

  async disconnect() {
    await db.delete(zoomConnections).where(eq(zoomConnections.userId, this.userId));
  }

  /**
   * A room for an event, made in the connected account. The one thing this service exists for:
   * everything else here is keeping a grant alive long enough to do it.
   */
  async createMeeting(request: MeetingRequest): Promise<ZoomMeeting> {
    return this.#withGrant((client) => client.createMeeting(request));
  }

  /**
   * Whatever a grant is asked to do, with the token renewed first if it is close to the end and
   * the connection marked for reconnection if Zoom refuses it outright. A rotated refresh token
   * is written before the call that uses it, because Zoom refuses the one it replaced.
   */
  async #withGrant<T>(run: (client: ZoomClient) => Promise<T>): Promise<T> {
    const row = await this.#row();
    if (!row) throw new ApiError("Connect Zoom first");
    if (row.needsReconnect) throw new ZoomAuthError("That Zoom connection has expired.");

    let accessToken = decryptSecret(row.token);
    try {
      if (row.expiresAt.getTime() - Date.now() < REFRESH_MARGIN_MS) {
        const renewed = await zoomOAuth.refresh(decryptSecret(row.refreshToken));
        await this.#write(renewed);
        accessToken = renewed.accessToken;
      }
      return await run(new ZoomClient(accessToken));
    } catch (e) {
      if (e instanceof ZoomAuthError) {
        await db.update(zoomConnections).set({ needsReconnect: true }).where(eq(zoomConnections.userId, this.userId));
      }
      throw e;
    }
  }

  #row() {
    return db.query.zoomConnections.findFirst({ where: eq(zoomConnections.userId, this.userId) });
  }

  async #write(grant: ZoomGrant) {
    const values = {
      userId: this.userId,
      token: encryptSecret(grant.accessToken),
      refreshToken: encryptSecret(grant.refreshToken),
      expiresAt: grant.expiresAt,
      needsReconnect: false,
    };
    await db.insert(zoomConnections).values(values).onConflictDoUpdate({ target: zoomConnections.userId, set: values });
  }
}
