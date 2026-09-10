import { z } from "zod";

/**
 * Everything the API is configured with, read once and checked once.
 *
 * Every key is required: a deployment with one missing fails here, at start-up, with the names
 * of what is missing — not on the first request that happens to need it, hours later, as a
 * `fetch` to `undefined` or a cipher built on an empty key. The one exception is `DEV_AUTH_EMAIL`,
 * which is a switch rather than a setting and is ignored in production regardless.
 *
 * The `VERCEL*` and `NODE_ENV` keys are the platform's own and arrive on their own; they are
 * parsed here so that `process.env` is read in exactly one file.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  DATABASE_URL_UNPOOLED: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_PUBLISHABLE_KEY: z.string().min(1),
  TOKEN_ENCRYPTION_KEY: z.string().min(1),
  OAUTH_STATE_SECRET: z.string().min(1),
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1),
  GOOGLE_OAUTH_REDIRECT_URI: z.url(),
  /** The Notion connection projects are mirrored through — OAuth, so nobody pastes a secret. */
  NOTION_OAUTH_CLIENT_ID: z.string().min(1),
  NOTION_OAUTH_CLIENT_SECRET: z.string().min(1),
  NOTION_OAUTH_REDIRECT_URI: z.url(),
  /** The audience a native Google sign-in's id token has to name — the iOS OAuth client. */
  GOOGLE_IOS_CLIENT_ID: z.string().min(1),
  /** The audience a native Sign in with Apple token has to name. */
  APPLE_BUNDLE_ID: z.string().min(1),
  GOOGLE_MAPS_API_KEY: z.string().min(1),
  /** The blob store the macOS app and its update manifest are published to — see `/download`. */
  DOWNLOAD_BASE_URL: z.url(),
  AI_GATEWAY_API_KEY: z.string().min(1),
  SENTRY_DSN: z.url(),
  POSTHOG_KEY: z.string().min(1),
  POSTHOG_HOST: z.url(),
  DEV_AUTH_EMAIL: z.email().optional(),
  NODE_ENV: z.string().optional(),
  VERCEL: z.string().optional(),
  VERCEL_ENV: z.string().optional(),
  VERCEL_GIT_COMMIT_SHA: z.string().optional(),
});

class EnvError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Environment is not configured:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`);
    this.name = "EnvError";
  }
}

function load(source: NodeJS.ProcessEnv) {
  const result = schema.safeParse(source);
  if (result.success) return result.data;
  const error = new EnvError(result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`));
  // Said on the console as well as thrown: `nitro dev` swallows a plugin that fails to load and
  // answers every request with a bare 500, which is exactly the silence this file exists to end.
  console.error(error.message);
  throw error;
}

export const env = load(process.env);

/**
 * Whether this process is one somebody could be relying on. A production build and anything
 * running on Vercel count; a local `nitro dev` does not. The dev sign-in bypass reads it one way
 * round, telemetry the other.
 */
export const isProduction = env.NODE_ENV === "production" || Boolean(env.VERCEL);
