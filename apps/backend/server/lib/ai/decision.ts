import { createGateway } from "@ai-sdk/gateway";
import { env } from "~/lib/env";

/**
 * The decision model: answers multiple-choice questions about a piece of state with a probability
 * per option, and writes no text. Cheap and fast enough to ask once per calendar event, which a
 * language model writing JSON never was. Typed answers are why it fits filing — "which of these"
 * is the whole question.
 */
export const DECISION_MODEL = "typesafe-ai/jev";

export const decisionModel = createGateway({ apiKey: env.AI_GATEWAY_API_KEY }).decisionModel(DECISION_MODEL);
