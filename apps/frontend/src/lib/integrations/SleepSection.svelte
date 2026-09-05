<script lang="ts">
  import { CardRow, SplitBar } from "$lib/components";
  import { formatClock, formatHoursAndMinutes } from "$lib/format";
  import { isIOSApp } from "$lib/mobile/platform";
  import type { CalendarEvent } from "$lib/types";
  import { Moon } from "lucide-svelte";
  import { asSleepScore } from "./sleep-score";
  import { asSleepPlan, asSleepSummary } from "./sleep-summary";

  /**
   * The night under a "Sleep" block, as Apple Health recorded it: how long, when, and — where a
   * watch was worn — how deep. Drawn from the record the iPhone wrote, so it reads the same on
   * every screen; before there is one, it says which device will bring it.
   */
  let { event }: { event: CalendarEvent } = $props();

  const summary = $derived(asSleepSummary(event.record));
  const score = $derived(asSleepScore(event.record));
  /** What the night was measured against: the block as planned, kept in the record once the block has moved. */
  const plan = $derived(asSleepPlan(event.record));
  const planned = $derived(
    (new Date(plan?.plannedEnd ?? event.end).getTime() - new Date(plan?.plannedStart ?? event.start).getTime()) / 3_600_000,
  );
  const upcoming = $derived(new Date(event.end).getTime() > Date.now());

  /** Deep, REM, core, awake — darkest to lightest, the way the Health app orders a night. */
  const STAGES = [
    { id: "deep", label: "Deep", color: "#3730a3" },
    { id: "rem", label: "REM", color: "#6366f1" },
    { id: "core", label: "Core", color: "#a5b4fc" },
    { id: "asleep", label: "Asleep", color: "#a5b4fc" },
    { id: "awake", label: "Awake", color: "#f59e0b" },
  ] as const;

  const splits = $derived(
    summary ? STAGES.map((stage) => ({ id: stage.id, color: stage.color, value: summary.stages[stage.id] ?? 0 })) : [],
  );
  const delta = $derived(summary ? summary.asleepMinutes / 60 - planned : 0);

  /** The three things Health grades a night on, each out of its own share of 100. */
  const PARTS = [
    { id: "duration", label: "Duration", max: 50 },
    { id: "bedtime", label: "Bedtime", max: 30 },
    { id: "interruptions", label: "Interruptions", max: 20 },
  ] as const;
  const BAND_COLORS = {
    "Very low": "#ef4444",
    Low: "#f59e0b",
    OK: "#eab308",
    High: "#22c55e",
    "Very high": "#0ea5e9",
  } as const;
</script>

<CardRow icon={Moon} set={Boolean(summary)} align="start">
  <div class="min-w-0 flex-1 space-y-2 py-1">
    {#if summary}
      <div class="flex items-baseline justify-between gap-3">
        <span class="t-label text-fg">{formatHoursAndMinutes(summary.asleepMinutes / 60)} asleep</span>
        <span class="t-micro text-fg-faint">
          {formatClock(new Date(summary.start))} – {formatClock(new Date(summary.end))}
        </span>
      </div>
      {#if summary.staged}
        <SplitBar {splits} thickness={6} />
        <div class="flex flex-wrap gap-x-3 gap-y-1">
          {#each STAGES as stage (stage.id)}
            {@const minutes = summary.stages[stage.id]}
            {#if minutes}
              <span class="t-micro flex items-center gap-1 text-fg-muted">
                <span class="inline-block size-2 rounded-full" style="background:{stage.color}"></span>
                {stage.label} {formatHoursAndMinutes(minutes / 60)}
              </span>
            {/if}
          {/each}
        </div>
      {/if}
      {#if score}
        <div class="flex items-baseline justify-between gap-3 pt-1">
          <span class="t-label text-fg">
            <span class="tabular-nums" style="color:{BAND_COLORS[score.band]}">{score.total}</span>
            <span class="text-fg-muted">{score.band}</span>
          </span>
          <span class="t-micro text-fg-faint">Sleep score</span>
        </div>
        <div class="flex flex-wrap gap-x-3 gap-y-1">
          {#each PARTS as part (part.id)}
            <span class="t-micro flex items-center gap-1.5 text-fg-muted">
              <span class="relative inline-block h-1 w-8 overflow-hidden rounded-full bg-fg/10">
                <span
                  class="absolute inset-y-0 left-0 rounded-full"
                  style="width:{(score[part.id] / part.max) * 100}%;background:{BAND_COLORS[score.band]}"
                ></span>
              </span>
              {part.label} <span class="tabular-nums text-fg-faint">{score[part.id]}/{part.max}</span>
            </span>
          {/each}
        </div>
      {/if}
      <p class="t-micro text-fg-faint">
        {#if Math.abs(delta) < 0.1}
          As planned{summary.awakenings ? `, awake ${summary.awakenings} time${summary.awakenings === 1 ? "" : "s"}` : ""}.
        {:else}
          {formatHoursAndMinutes(Math.abs(delta))} {delta > 0 ? "more" : "less"} than planned{summary.awakenings
            ? `, awake ${summary.awakenings} time${summary.awakenings === 1 ? "" : "s"}`
            : ""}.
        {/if}
      </p>
    {:else if upcoming}
      <p class="t-label text-fg-faint">Apple Health will record this night.</p>
    {:else}
      <p class="t-label text-fg-faint">
        {isIOSApp ? "Nothing recorded for this night yet." : "Recorded by Balance for iPhone when it next opens."}
      </p>
    {/if}
  </div>
</CardRow>
