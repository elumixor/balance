import * as Sentry from "@sentry/svelte";
import posthog from "posthog-js";
import { buildInfo } from "$lib/core/build-info";
import { API_BASE_URL } from "$lib/core/env";

/**
 * Where a failure goes once the app has said it out loud.
 *
 * `diagnostics` is what the person holding the phone sees; this is what the person fixing it sees.
 * The two are one call — every report already funnels through `diagnostics.report`, so this hangs
 * off that rather than asking every module to remember a second thing. A webview on a phone has no
 * console anybody can open, and the last two times the app died on iOS the only evidence was a
 * screenshot; that is the problem being solved here.
 *
 * Sentry takes the failures, PostHog takes what happened before them. The keys are baked in by
 * `vite.config.ts`, which refuses to build without them.
 */

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
/** PostHog's EU and US clouds are different hosts, and a self-hosted one is a third. */
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST;

/**
 * Which build this is, in the form Sentry groups releases by. The commit is what makes a stack
 * trace mean something a week later, and it is already on the settings screen for the same reason.
 */
const RELEASE = `balance@${buildInfo.version}+${buildInfo.commit}`;

/**
 * A development build says nothing to anyone. Every error thrown while a feature is half-written
 * would otherwise land in the same project as production's, and the dev server counts as a
 * session in every funnel. `DEV` is Vite's own flag, so a preview build still reports.
 */
const ENABLED = !import.meta.env.DEV;

class Telemetry {
  #started = false;

  /**
   * Started before the first request and before Clerk, from the root layout, so a start-up that
   * fails is inside the window rather than in front of it.
   */
  start() {
    if (this.#started || typeof window === "undefined" || !ENABLED) return;
    this.#started = true;

    Sentry.init({
      dsn: SENTRY_DSN,
      release: RELEASE,
      environment: "production",
      // Errors, not traces: this ships inside a webview on a phone, and a performance sample is
      // a request that competes with the week the person is waiting for.
      tracesSampleRate: 0,
      // The account is named by `identify` once there is one; nothing else here is a person.
      sendDefaultPii: false,
      initialScope: { tags: { platform: buildInfo.platform, api: API_BASE_URL || "same-origin" } },
    });

    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      // A person is only worth a profile once they are somebody — see `identify`.
      person_profiles: "identified_only",
      // The router owns navigation here, and a calendar is one URL all week; `screen` says when
      // a screen was actually opened, which is the thing worth counting.
      capture_pageview: false,
      // A week grid is thousands of positioned divs. Autocapture on it is noise with a bandwidth
      // cost, and every event worth having is one this app names itself.
      autocapture: false,
      // Sentry owns failures. Two copies of the same stack in two places is one too many.
      capture_exceptions: false,
      persistence: "localStorage",
    });
    posthog.register({ platform: buildInfo.platform, version: buildInfo.version, commit: buildInfo.commit });
  }

  /** Whose session this is, once Clerk has said. Both SDKs key everything else off it. */
  identify(userId: string, email?: string) {
    if (!userId || !ENABLED) return;
    Sentry.setUser({ id: userId, email });
    posthog.identify(userId, email ? { email } : undefined);
  }

  /** Signing out ends the person as well as the session — the next account is not this one. */
  forget() {
    if (!ENABLED) return;
    Sentry.setUser(null);
    posthog.reset();
  }

  /**
   * A failure, with the scope the banner shows it under. Called from `diagnostics.report`, so
   * everything the app already knows how to say arrives here without being told twice.
   */
  capture(scope: string, error: unknown, detail?: string) {
    if (!ENABLED) return;
    Sentry.captureException(error, { tags: { scope }, extra: detail ? { detail } : undefined });
    posthog.capture("app_error", { scope, message: messageOf(error), detail });
  }

  /** Something the app did on purpose, for the funnel that says whether the ritual is working. */
  event(name: string, properties?: Record<string, unknown>) {
    if (!ENABLED) return;
    posthog.capture(name, properties);
    // A breadcrumb rather than an event: what Sentry wants from this is the trail before a crash.
    Sentry.addBreadcrumb({ category: "app", message: name, data: properties, level: "info" });
  }

  /** A screen was opened. Manual, because one URL can be a week, a day and a plan in turn. */
  screen(path: string) {
    if (!ENABLED) return;
    posthog.capture("$pageview", { $current_url: path, path });
    Sentry.addBreadcrumb({ category: "navigation", message: path, level: "info" });
  }
}

export const telemetry = new Telemetry();

function messageOf(error: unknown) {
  if (error instanceof Error) return error.message || error.name;
  return typeof error === "string" ? error : String(error);
}
