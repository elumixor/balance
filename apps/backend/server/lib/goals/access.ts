import { type BaseContext, type ExecutableEventHandler, handler } from "@elumixor/nitro-client/server";
import type { H3Event } from "h3";
import type { ZodType, z } from "zod";
import type { DbUser } from "~/lib/auth/service";
import { ApiError } from "~/lib/http/api-error";
import { authenticateMcp } from "~/lib/mcp/authenticate";
import { GOAL_TOKEN_PREFIX, type GoalScope, goalTokenService } from "./tokens";

type SchemaInput = Record<string, ZodType>;
type Schemas = { body?: SchemaInput; query?: SchemaInput };
type InferSchema<S extends SchemaInput> = { [K in keyof S]: z.infer<S[K]> };
type Inferred<S extends Schemas> = { [K in keyof S]: S[K] extends SchemaInput ? InferSchema<S[K]> : never };

/** Who is calling a goals route. `source` is set when the caller is an app's own key. */
type GoalsContext = BaseContext & { readonly user: DbUser; readonly source: string | null };
type Route<R> = ExecutableEventHandler<Promise<Awaited<R>>>;

const BEARER = /^Bearer (.+)$/;
const FORBIDDEN = 403;

/**
 * Whose goals a request is about, and whether it may do what it asks.
 *
 * Three callers reach `/api/goals`. An app holds a goals key, which is held to its scopes. An
 * assistant key and a live session are the whole account already, so they pass every scope.
 */
async function callerOf(event: H3Event, scope: GoalScope) {
  const token = event.headers.get("authorization")?.match(BEARER)?.[1];
  if (!token?.startsWith(GOAL_TOKEN_PREFIX)) return { user: await authenticateMcp(event), source: null };
  const key = await goalTokenService.resolve(token);
  if (!key.scopes.includes(scope)) throw new ApiError(`This key lacks the "${scope}" scope`, FORBIDDEN);
  return { user: key.user, source: key.source };
}

interface Scoped {
  <S extends Schemas, R>(schemas: S, fn: (context: Inferred<S> & GoalsContext) => R): Route<R>;
  <R>(fn: (context: GoalsContext) => R): Route<R>;
}

/** `authed` for the goals routes: the same call shape, with the scope a goals key has to hold. */
function scoped(scope: GoalScope): Scoped {
  const route = (
    schemasOrFn: Schemas | ((context: GoalsContext) => unknown),
    maybeFn?: (context: GoalsContext) => unknown,
  ): ExecutableEventHandler<Promise<unknown>> => {
    if (typeof schemasOrFn === "function") {
      return handler(async (context) => schemasOrFn({ ...context, ...(await callerOf(context.event, scope)) }));
    }
    const fn = maybeFn as (context: GoalsContext) => unknown;
    return handler(schemasOrFn, async (context) => fn({ ...context, ...(await callerOf(context.event, scope)) }));
  };
  return route as Scoped;
}

/** A route that reads goals, streaks and progress. */
export const goalsReader = scoped("read");
/** A route that posts progress. */
export const goalsLogger = scoped("progress");
/** A route that makes, changes or removes a goal. */
export const goalsManager = scoped("manage");
