import { createAnthropic } from "@ai-sdk/anthropic";
import { createGateway } from "@ai-sdk/gateway";
import { APICallError, generateText, type LanguageModel, Output } from "ai";
import type { z } from "zod";
import { env } from "~/lib/env";
import { captureError } from "~/lib/telemetry";

/**
 * The one model the API talks to, and the one way it asks.
 *
 * Every ask is a proposal — words for a reminder, a plan for a block — and every screen that
 * asks already draws itself without an answer. So a model that is down, slow or rate-limited
 * costs nobody anything: the failure is reported, because silence is how a dead key goes
 * unnoticed for a month, and the caller gets null and carries on.
 *
 * An ask goes to Anthropic directly first, on the account's monthly API credits, and to the
 * gateway when there is no credits key or Anthropic refuses it (spent credits, a revoked key).
 */
const DIRECT_MODEL = "claude-sonnet-5-5";
const GATEWAY_MODEL = "anthropic/claude-sonnet-5.5";

/** What Anthropic answers when the key is bad or the credits are gone — the gateway's turn. */
const REFUSED_STATUSES: ReadonlySet<number> = new Set([401, 403]);
const NO_CREDITS = "credit balance is too low";

const direct = env.ANTHROPIC_CREDITS_API_KEY
  ? createAnthropic({ apiKey: env.ANTHROPIC_CREDITS_API_KEY })(DIRECT_MODEL)
  : null;
const gateway = createGateway({ apiKey: env.AI_GATEWAY_API_KEY })(GATEWAY_MODEL);

type Ask<T> = { schema: z.ZodType<T>; system: string; prompt: string };

function refused(e: unknown) {
  if (!APICallError.isInstance(e)) return false;
  const status = e.statusCode ?? 0;
  return REFUSED_STATUSES.has(status) || (status === 400 && `${e.message} ${e.responseBody}`.includes(NO_CREDITS));
}

async function generate<T>(model: LanguageModel, { schema, ...prompt }: Ask<T>) {
  const { output } = await generateText({ model, ...prompt, output: Output.object({ schema }) });
  return output;
}

export async function ask<T>(options: Ask<T>): Promise<T | null> {
  try {
    if (!direct) return await generate(gateway, options);
    try {
      return await generate(direct, options);
    } catch (e) {
      if (!refused(e)) throw e;
      await captureError(e, { path: "ai-anthropic" });
      return await generate(gateway, options);
    }
  } catch (e) {
    await captureError(e, { path: "ai-gateway" });
    return null;
  }
}
