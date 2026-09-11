import { z } from "zod";
import { authed } from "~/lib/http/authed";
import { MAX_COMMAND_LENGTH, WatchVoiceService } from "~/lib/watch/voice-service";

/**
 * One spoken instruction from the wrist, carried out — see `lib/watch/voice-service.ts`. The
 * watch dictates the words; everything about what they mean happens here, because the tools that
 * can act on this account live on this side and a watch has no room for a second copy of them.
 */
export default authed(
  {
    body: {
      text: z.string().trim().min(1).max(MAX_COMMAND_LENGTH),
      /** Where the person is standing, so "tomorrow at nine" is their nine and not UTC's. */
      timeZone: z.string().optional(),
    },
  },
  async ({ body, user }) => new WatchVoiceService(user).handle(body.text, { timeZone: body.timeZone }),
);
