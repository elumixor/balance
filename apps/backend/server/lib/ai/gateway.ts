import { createGateway } from "@ai-sdk/gateway";
import { generateObject, generateText, stepCountIs, type ToolSet } from "ai";
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
 */
const MODEL = "anthropic/claude-sonnet-5";

const gateway = createGateway({ apiKey: env.AI_GATEWAY_API_KEY });
export const model = gateway(MODEL);

export async function ask<T>(options: { schema: z.ZodType<T>; system: string; prompt: string }): Promise<T | null> {
  try {
    const { object } = await generateObject({ model, ...options });
    return object;
  } catch (e) {
    await captureError(e, { path: "ai-gateway" });
    return null;
  }
}

/**
 * The same model, asked to *do* something rather than to propose one: it is handed tools and runs
 * until it has an answer in words. Used by the watch's voice mode, where the person said a
 * sentence and expects the calendar to have moved by the time they lower their wrist.
 *
 * A failure here is not silent the way `ask`'s is — a spoken instruction that changed nothing has
 * to say so — so this throws, and the route turns it into an answer.
 */
export async function converse(options: {
  system: string;
  prompt: string;
  tools: ToolSet;
  maxSteps: number;
}): Promise<{ text: string; toolsUsed: string[] }> {
  const { system, prompt, tools, maxSteps } = options;
  const result = await generateText({ model, system, prompt, tools, stopWhen: stepCountIs(maxSteps) });
  return {
    text: result.text.trim(),
    toolsUsed: result.steps.flatMap((step) => step.toolCalls.map((call) => call.toolName)),
  };
}
