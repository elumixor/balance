import { defineEventHandler, setResponseStatus } from "h3";
import type { EventHandlerRequest, H3Event } from "h3";
import { ApiError } from "./api-error";

/** Wraps a Nitro route handler so thrown ApiError/Error becomes a `{ error }` JSON body with the right status. */
export function defineApiHandler<Req extends EventHandlerRequest = EventHandlerRequest, T = unknown>(
  handler: (event: H3Event<Req>) => Promise<T>,
) {
  return defineEventHandler(async (event) => {
    try {
      return await handler(event as H3Event<Req>);
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 400;
      setResponseStatus(event, status);
      return { error: e instanceof Error ? e.message : "Unknown error" };
    }
  });
}
