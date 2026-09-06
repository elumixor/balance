import { registerPlugin } from "@capacitor/core";
import type { SleepStage } from "./sleep-sessions";

/**
 * The webview's handle on `HealthKitPlugin.swift`. Health data is only readable on the phone
 * holding it, and only by native code, so this is the one road in: ask for permission, then ask
 * for samples. Nothing is decided here — what a night is belongs to `sleep-sessions.ts`.
 */
interface HealthKitPlugin {
  /** Whether this device has a Health store at all — an iPad has none. */
  available(): Promise<{ available: boolean }>;
  /**
   * Puts up the permission sheet. Resolves once it is answered, but not with the answer: Apple
   * keeps read permissions secret from the app asking, so a refusal looks like an empty store.
   */
  authorize(): Promise<void>;
  sleepSamples(options: { from: string; to: string }): Promise<{ samples: RawSleepSample[] }>;
}

interface RawSleepSample {
  readonly start: string;
  readonly end: string;
  readonly stage: SleepStage;
}

export const healthKit = registerPlugin<HealthKitPlugin>("HealthKit");
