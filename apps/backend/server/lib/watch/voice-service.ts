import { tool as aiTool, type ToolSet } from "ai";
import { z } from "zod";
import { converse } from "~/lib/ai/gateway";
import type { DbUser } from "~/lib/auth/service";
import { ApiError } from "~/lib/http/api-error";
import { mcpTools } from "~/lib/mcp/tools";
import { PreferencesService } from "~/lib/preferences/service";

/**
 * What a sentence spoken into a watch does to the calendar.
 *
 * It is the assistant's tools rather than a second set of its own: `lib/mcp/tools.ts` is already
 * the list of what an assistant may do with this account, written against the services, and a
 * voice command is only another client asking. Anything the watch gains here an MCP client gains
 * for free, and the two can never drift into disagreeing about what "move my run" means.
 *
 * Two things are the watch's own. The answer is written to be *heard* — one short sentence, read
 * off a wrist that is already dropping — and "now" and the zone travel with the request, because
 * the person is standing somewhere and this process runs in UTC.
 */

/** How many tool calls one sentence is allowed. Past this it is a conversation, not a command. */
const MAX_STEPS = 8;

/** As long a sentence as dictation on a wrist can plausibly produce. */
export const MAX_COMMAND_LENGTH = 500;

const VOICE = `You are the voice of Balance, a personal time-balance app, answering on a watch.
The person speaks one instruction and lowers their wrist, so your reply is one short sentence —
under 15 words — in plain second person, with no markdown, no lists and no emoji.

Do what was asked using the tools rather than describing how they could do it themselves. Read the
calendar before changing it whenever the instruction names a block by what it is rather than by id.
Times are instants: work them out from the current time and time zone given below and always send
an offset. When an instruction is genuinely ambiguous, say what you need in that one sentence
instead of guessing. Never delete a whole series — say it has to be done in the app.

Report what you did, not what you are about to do: "Moved your run to 6pm." If a tool refused,
say the refusal in your own words. If nothing changed, say that plainly.`;

export class WatchVoiceService {
  constructor(private readonly user: DbUser) {}

  async handle(text: string, options: { timeZone?: string; now?: Date } = {}) {
    const spoken = text.trim();
    if (!spoken) throw new ApiError("Nothing was said");

    const now = options.now ?? new Date();
    const timeZone = options.timeZone ?? (await new PreferencesService(this.user.id).get()).sessions.timeZone;

    const used: string[] = [];
    const { text: reply, toolsUsed } = await converse({
      system: VOICE,
      prompt: `Current time: ${now.toISOString()} (${timeZone}).\nThe person said: "${spoken}"`,
      tools: this.#tools(used),
      maxSteps: MAX_STEPS,
    });

    return {
      reply: reply || "Nothing changed.",
      // Whether any screen has to refetch, which is the only thing the watch does with this.
      changed: toolsUsed.some((name) => writers.has(name)),
      used,
    };
  }

  /**
   * The MCP tools as the model's own. A tool that refuses — "reconnect your calendar" — comes back
   * as its sentence rather than an exception, the same rule `/mcp` follows: the model has to be
   * able to tell the person what went wrong, and a thrown error would only end the turn.
   */
  #tools(used: string[]): ToolSet {
    const entries = mcpTools.map((definition) => [
      definition.name,
      aiTool({
        description: definition.description,
        inputSchema: z.object(definition.inputSchema),
        execute: async (args: Record<string, unknown>) => {
          used.push(definition.name);
          try {
            return await definition.run(args, this.user);
          } catch (e) {
            if (e instanceof ApiError) return { error: e.message };
            throw e;
          }
        },
      }),
    ]);
    return Object.fromEntries(entries) as ToolSet;
  }
}

/** The tools that move something, so the watch knows when to refetch its week. */
const writers = new Set(mcpTools.filter((t) => !t.readOnly).map((t) => t.name));
