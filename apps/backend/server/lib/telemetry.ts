import * as Sentry from "@sentry/node";
import { PostHog } from "posthog-node";
import { env, isProduction } from "./env";

/**
 * What the API says about itself when nobody is watching it.
 *
 * The frontend has `diagnostics` and a banner; this side has a log line in a Vercel function that
 * is thrown away in a day. Sentry keeps the failures with their stacks, PostHog keeps what the
 * account was doing when they happened.
 *
 * Everything here is written for a function that can be frozen the instant it answers: nothing is
 * buffered for later, and every send is awaited before the response goes out. A local `nitro dev`
 * says nothing to anyone — a stack from a half-written route would land in the same project as
 * production's.
 */

/** Vercel stamps the commit; a stack trace without one is a stack trace against unknown source. */
const SHORT_SHA_LENGTH = 7;
const RELEASE = `balance-api@${env.VERCEL_GIT_COMMIT_SHA?.slice(0, SHORT_SHA_LENGTH) ?? "dev"}`;
const ENVIRONMENT = env.VERCEL_ENV ?? env.NODE_ENV ?? "development";

/** How long a send is given before the answer goes out without it. A report is never worth a hang. */
const FLUSH_MS = 2_000;

let sentryReady = false;
let posthog: PostHog | null = null;

function startSentry() {
  if (sentryReady) return;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    release: RELEASE,
    environment: ENVIRONMENT,
    // Errors, not traces. This runs per request on Fluid Compute, and a sampled span is latency
    // spent on a question nobody has asked yet.
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });
  sentryReady = true;
}

function startPostHog() {
  // One event per send, no timer: the process may not exist a moment from now, and a queue that
  // is flushed on an interval is a queue that is lost.
  posthog ??= new PostHog(env.POSTHOG_KEY, { host: env.POSTHOG_HOST, flushAt: 1, flushInterval: 0 });
  return posthog;
}

export interface ErrorContext {
  /** The route it happened on — the one thing that says which of these is which. */
  path?: string;
  method?: string;
  /** Whose request it was, when the request got far enough to know. */
  userId?: string;
  status?: number;
}

/**
 * A failure the API didn't mean. Awaited by the caller, because the function it happened in can be
 * frozen the moment it answers — an unflushed report is no report at all.
 */
export async function captureError(error: unknown, context: ErrorContext = {}) {
  if (!isProduction) return;
  startSentry();
  Sentry.captureException(error, {
    tags: { path: context.path, method: context.method, status: context.status },
    user: context.userId ? { id: context.userId } : undefined,
  });

  const client = startPostHog();
  client.capture({
    distinctId: context.userId ?? "anonymous",
    event: "api_error",
    properties: {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : "Error",
      ...context,
    },
  });

  // One failure is not worth a second: a reporter that throws must not replace what it reports.
  await Promise.allSettled([Sentry.flush(FLUSH_MS), client.flush()]);
}
