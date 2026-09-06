import { HeartPulse } from "lucide-svelte";
import { isIOSApp } from "$lib/mobile/platform";
import { healthKit } from "./health-kit";
import SleepSection from "./SleepSection.svelte";
import { sleepScore } from "./sleep-score";
import { asSleepPlan, asSleepSummary, sleepSummary } from "./sleep-summary";
import type { Integration } from "./types";

/** A night rarely sits inside its block: the samples are read with this much slack either side. */
const NIGHT_SLACK_MS = 4 * 60 * 60_000;

export const appleHealth: Integration = {
  id: "apple-health",
  name: "Apple Health",
  note: "What your watch or phone recorded, shown under the blocks that planned it.",
  icon: HeartPulse,
  available: isIOSApp,
  unavailableNote: "Read by Balance for iPhone, where Health data lives. Link here; the record arrives from there.",
  feeds: [
    {
      id: "sleep",
      label: "Sleep",
      note: "The night Health recorded: how long, when, and how deep.",
      async record(window, previous) {
        const from = new Date(window.start.getTime() - NIGHT_SLACK_MS);
        const to = new Date(window.end.getTime() + NIGHT_SLACK_MS);
        const { samples } = await healthKit.sleepSamples({ from: from.toISOString(), to: to.toISOString() });
        const summary = sleepSummary(
          samples.map((s) => ({ start: new Date(s.start), end: new Date(s.end), stage: s.stage })),
          window,
        );
        if (!summary) return null;
        const planned = asSleepPlan(previous) ?? {
          plannedStart: window.start.toISOString(),
          plannedEnd: window.end.toISOString(),
        };
        return { ...summary, ...planned, score: sleepScore(summary, new Date(planned.plannedStart)) };
      },
      actual(record) {
        const summary = asSleepSummary(record);
        return summary ? { start: new Date(summary.start), end: new Date(summary.end) } : null;
      },
      section: SleepSection,
    },
  ],
  connect: () => healthKit.authorize(),
};
