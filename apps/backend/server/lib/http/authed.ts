import { type BaseContext, type ExecutableEventHandler, handler } from "@elumixor/nitro-client/server";
import type { ZodType, z } from "zod";
import { type DbUser, resolveUser } from "~/lib/auth/service";

type SchemaInput = Record<string, ZodType>;
type Schemas = { body?: SchemaInput; query?: SchemaInput };
type InferSchema<S extends SchemaInput> = { [K in keyof S]: z.infer<S[K]> };
type Inferred<S extends Schemas> = { [K in keyof S]: S[K] extends SchemaInput ? InferSchema<S[K]> : never };

type AuthedContext = BaseContext & { readonly user: DbUser };
type Authed<R> = ExecutableEventHandler<Promise<Awaited<R>>>;

/**
 * `handler`, for a route that only means something to a signed-in account.
 *
 * The session is resolved before the body runs and handed over as `user`; a request without one
 * never reaches the route. Whatever the route throws goes to `server/error.ts`, which is the one
 * place an error becomes a response — so a route body just returns its answer or throws.
 *
 * The call shape is the one the client generator reads — schemas first, the arrow function last —
 * so a route written with this is generated exactly like one written with `handler`.
 */
export function authed<S extends Schemas, R>(schemas: S, fn: (context: Inferred<S> & AuthedContext) => R): Authed<R>;
export function authed<R>(fn: (context: AuthedContext) => R): Authed<R>;
export function authed(
  schemasOrFn: Schemas | ((context: AuthedContext) => unknown),
  maybeFn?: (context: AuthedContext) => unknown,
): ExecutableEventHandler<Promise<unknown>> {
  if (typeof schemasOrFn === "function") {
    return handler(async (context) => schemasOrFn({ ...context, user: await resolveUser(context.event) }));
  }
  const fn = maybeFn as (context: AuthedContext) => unknown;
  return handler(schemasOrFn, async (context) => fn({ ...context, user: await resolveUser(context.event) }));
}
