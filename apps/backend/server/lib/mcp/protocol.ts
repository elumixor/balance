import { z } from "zod";
import type { DbUser } from "~/lib/auth/service";
import { ApiError } from "~/lib/http/api-error";
import { captureError } from "~/lib/telemetry";
import { mcpTools } from "./tools";

/**
 * The Model Context Protocol, spoken directly.
 *
 * A stateless JSON-RPC endpoint is all a server of tools needs: every call carries its own key,
 * nothing is remembered between two of them, and there is no server-initiated message to keep a
 * stream open for. That is small enough to be worth owning — the official SDK brings a transport
 * built around Node's `req`/`res` and a zod version of its own, and neither fits a Nitro route
 * that has to run unchanged on a Vercel function.
 *
 * The one rule that isn't obvious: a tool that fails answers 200 with `isError`, not a JSON-RPC
 * error. A protocol error means the client asked wrongly; a failed tool is a result the model is
 * meant to read and try something else about.
 */

/**
 * Versions this server knows how to be, newest first — the list Claude Code's own client carries.
 * An unrecognised request is answered with the first, which is what the spec says to do.
 */
const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05", "2024-10-07"] as const;

const SERVER_INFO = { name: "balance", title: "Balance", version: "1.0.0" } as const;

const INSTRUCTIONS =
  "Balance is where somebody's week is planned and measured: spheres of life with hours a week " +
  "each, a calendar those hours are actually spent in, and projects the hours are for. Read " +
  "`list_spheres` before writing anything — every other tool names spheres by id. Times are " +
  "instants: send them with an offset. The calendar is the source of truth, so a block only " +
  "counts once it is on it.";

const JSON_RPC_VERSION = "2.0";
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

type Id = string | number | null;

interface Request {
  readonly jsonrpc: string;
  readonly id?: Id;
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

const requestSchema = z.object({
  jsonrpc: z.literal(JSON_RPC_VERSION),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
});

function result(id: Id, value: unknown) {
  return { jsonrpc: JSON_RPC_VERSION, id, result: value };
}

function failure(id: Id, code: number, message: string) {
  return { jsonrpc: JSON_RPC_VERSION, id, error: { code, message } };
}

/** Everything a model reads comes back as text; the same value is offered structured beside it. */
function toolResult(value: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value && typeof value === "object" && !Array.isArray(value) ? value : undefined,
  };
}

function toolFailure(message: string) {
  return { content: [{ type: "text", text: message }], isError: true };
}

const descriptors = mcpTools.map((tool) => ({
  name: tool.name,
  title: tool.title,
  description: tool.description,
  inputSchema: z.toJSONSchema(z.object(tool.inputSchema), { io: "input" }),
  annotations: { title: tool.title, readOnlyHint: tool.readOnly, destructiveHint: !tool.readOnly },
}));

const byName = new Map(mcpTools.map((tool) => [tool.name, tool]));

/**
 * Answers one JSON-RPC message, or nothing at all for a notification — which is what a client
 * sends to say it has finished starting up, and which must not be answered.
 */
export async function handleMessage(message: unknown, user: DbUser): Promise<object | null> {
  const parsed = requestSchema.safeParse(message);
  if (!parsed.success) return failure(null, INVALID_PARAMS, "Not a JSON-RPC 2.0 request");

  const request = parsed.data as Request;
  // A notification has no id, and the spec says an answer to one is an error in itself.
  const isNotification = request.id === undefined;
  const id = request.id ?? null;

  try {
    const answer = await dispatch(request, user);
    if (isNotification) return null;
    return result(id, answer ?? {});
  } catch (error) {
    if (isNotification) return null;
    if (error instanceof MethodNotFound) return failure(id, METHOD_NOT_FOUND, error.message);
    if (error instanceof ApiError) return failure(id, INVALID_PARAMS, error.message);
    await captureError(error as Error, { path: "/mcp", method: request.method });
    return failure(id, INTERNAL_ERROR, "Something went wrong on our side");
  }
}

class MethodNotFound extends Error {}

async function dispatch(request: Request, user: DbUser): Promise<unknown> {
  switch (request.method) {
    case "initialize":
      return {
        protocolVersion: negotiate(request.params?.protocolVersion),
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      };
    case "ping":
      return {};
    // Sent once the client is up, and after `initialize`; both are notifications and mean nothing here.
    case "notifications/initialized":
    case "notifications/cancelled":
      return {};
    case "tools/list":
      return { tools: descriptors };
    case "tools/call":
      return callTool(request.params, user);
    // Answered rather than refused: a client that asks and is told "none" stops asking.
    case "resources/list":
      return { resources: [] };
    case "resources/templates/list":
      return { resourceTemplates: [] };
    case "prompts/list":
      return { prompts: [] };
    default:
      throw new MethodNotFound(`Unknown method: ${request.method}`);
  }
}

function negotiate(requested: unknown) {
  const version = PROTOCOL_VERSIONS.find((known) => known === requested);
  return version ?? PROTOCOL_VERSIONS[0];
}

async function callTool(params: Record<string, unknown> | undefined, user: DbUser) {
  const name = typeof params?.name === "string" ? params.name : null;
  const tool = name ? byName.get(name) : undefined;
  if (!tool) throw new ApiError(`There is no tool called ${name ?? "(unnamed)"}`);

  const args = z.object(tool.inputSchema).safeParse(params?.arguments ?? {});
  if (!args.success) {
    const issue = args.error.issues[0];
    return toolFailure(`${issue.path.join(".") || "arguments"}: ${issue.message}`);
  }

  try {
    return toolResult(await tool.run(args.data as Record<string, unknown>, user));
  } catch (error) {
    // A refusal the API writes for a person — "reconnect your calendar" — is the answer here too.
    if (error instanceof ApiError) return toolFailure(error.message);
    await captureError(error as Error, { path: "/mcp", method: `tools/call:${tool.name}` });
    return toolFailure("Something went wrong on our side");
  }
}
