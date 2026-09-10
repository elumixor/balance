<script lang="ts">
  import { weekKey } from "$lib/calendar/dates";
  import { createCalendarEvent } from "$lib/calendar/queries";
  import { Button, Dialog, Spinner, Switch, Textarea } from "$lib/components";
  import { calendarWeek, invalidate } from "$lib/core/store.svelte";
  import { activities, categories } from "$lib/core/synced.svelte";
  import type { DayPlanAssist, DayPlanBlock } from "$lib/planning/day-assist";
  import { planMode } from "$lib/planning/plan-mode.svelte";
  import { assistDayPlan } from "$lib/planning/queries";
  import { Sparkles } from "lucide-svelte";

  /**
   * The other way into a planned day: say what it's for, answer at most a couple of questions if
   * the model needs them, then look at the blocks it proposes before any of them touch the
   * calendar. Skipping this is not a lesser path — dismissing it just leaves the grid behind it,
   * exactly as plan mode always has, for building the day by hand.
   *
   * Nothing is written until "Add to calendar" is pressed, and even then only the blocks still
   * ticked. After that this sheet is done; the coverage bar behind it already knows what landed.
   */

  type Stage = "intro" | "loading" | "question" | "review" | "unavailable";

  let stage = $state<Stage>("intro");
  let text = $state("");
  let answers = $state<{ question: string; answer: string }[]>([]);
  let pending = $state<DayPlanAssist | null>(null);
  let blockRows = $state<{ block: DayPlanBlock; selected: boolean }[]>([]);
  let writing = $state(false);
  let writeError = $state<string | null>(null);

  /** The Q&A caps at two rounds — a plan that still needs a third guess should just be made. */
  const MAX_QUESTIONS = 2;

  function reset() {
    stage = "intro";
    text = "";
    answers = [];
    pending = null;
    blockRows = [];
    writeError = null;
    writing = false;
  }

  function dayBounds(day: string) {
    const [year, month, date] = day.split("-").map(Number);
    const start = new Date(year, month - 1, date).getTime();
    const end = new Date(year, month - 1, date + 1).getTime();
    return { start, end };
  }

  function toLocalDate(day: string, hhmm: string) {
    const [year, month, date] = day.split("-").map(Number);
    const [hours, minutes] = hhmm.split(":").map(Number);
    return new Date(year, month - 1, date, hours || 0, minutes || 0);
  }

  function formatHHmm(iso: string) {
    const d = new Date(iso);
    return `${`${d.getHours()}`.padStart(2, "0")}:${`${d.getMinutes()}`.padStart(2, "0")}`;
  }

  function existingBlocksFor(day: string) {
    const { start, end } = dayBounds(day);
    const week = calendarWeek(weekKey(new Date(start))).value;
    const events = week?.events ?? [];
    return events
      .filter((e) => !e.allDay && Date.parse(e.start) < end && Date.parse(e.end) > start)
      .map((e) => ({ title: e.title || "Untitled", start: formatHHmm(e.start), end: formatHHmm(e.end) }));
  }

  function activityCandidates() {
    const categoryName = new Map(categories.all.map((c) => [c.id, c.name]));
    return activities.all.map((a) => ({
      id: a.id,
      name: a.name,
      categories:
        a.weights.map((w) => `${categoryName.get(w.categoryId) ?? "?"} ${w.weightPercent}%`).join(" / ") ||
        "nothing",
    }));
  }

  function activityName(id: string) {
    return activities.all.find((a) => a.id === id)?.name ?? "Untitled activity";
  }

  async function ask() {
    const day = planMode.day;
    if (!day) return;
    stage = "loading";
    const weekday = new Date(dayBounds(day).start).toLocaleDateString(undefined, { weekday: "long" });
    const result = await assistDayPlan({
      day,
      weekday,
      prompt: text.trim(),
      answers,
      existing: existingBlocksFor(day),
      activities: activityCandidates(),
      final: answers.length >= MAX_QUESTIONS,
    });
    if (!result.available) {
      stage = "unavailable";
      return;
    }
    pending = result.plan;
    if (pending.question) {
      stage = "question";
    } else {
      blockRows = pending.blocks.map((block) => ({ block, selected: true }));
      stage = "review";
    }
  }

  function chooseOption(option: string) {
    if (!pending?.question) return;
    answers = [...answers, { question: pending.question.text, answer: option }];
    void ask();
  }

  async function accept() {
    const day = planMode.day;
    if (!day) return;
    const toWrite = blockRows.filter((row) => row.selected);
    if (toWrite.length === 0) return;
    writing = true;
    writeError = null;
    try {
      for (const row of toWrite) {
        await createCalendarEvent({
          activityId: row.block.activityId,
          title: row.block.title,
          start: toLocalDate(day, row.block.start).toISOString(),
          end: toLocalDate(day, row.block.end).toISOString(),
        });
      }
      invalidate.calendar();
      close();
    } catch (e) {
      writeError = e instanceof Error ? e.message : "Couldn't add those to your calendar";
    } finally {
      writing = false;
    }
  }

  function close() {
    planMode.showAssist = false;
    reset();
  }
</script>

<Dialog title="Plan today with AI" open={planMode.showAssist} onclose={close}>
  {#if stage === "intro"}
    <div class="space-y-3">
      <div class="flex items-start gap-2">
        <Sparkles size={14} class="mt-1 shrink-0 text-fg-faint" />
        <p class="t-body text-fg-muted">
          Say what today is for, in your own words, and this turns it into blocks on the grid — nothing lands on the
          calendar until you say so.
        </p>
      </div>
      <Textarea bind:value={text} placeholder="e.g. deep work on the launch in the morning, gym at 5, dinner with Alex" rows={3} ariaLabel="What today is for" />
      <Button full label="Plan it" disabled={!text.trim()} onclick={ask} />
      <button type="button" class="t-micro block w-full text-center text-fg-faint underline" onclick={close}>
        Skip — I'll plan it myself
      </button>
    </div>
  {:else if stage === "loading"}
    <div class="flex items-center justify-center py-10"><Spinner /></div>
  {:else if stage === "question" && pending?.question}
    <div class="space-y-3">
      <p class="t-label text-fg">{pending.question.text}</p>
      <div class="grid gap-2">
        {#each pending.question.options as option (option)}
          <button
            type="button"
            class="press hoverable t-body rounded-md border border-line p-3 text-left"
            onclick={() => chooseOption(option)}
          >
            {option}
          </button>
        {/each}
      </div>
    </div>
  {:else if stage === "review" && pending}
    <div class="space-y-3">
      {#if pending.note}<p class="t-body text-fg-muted">{pending.note}</p>{/if}
      {#if blockRows.length === 0}
        <p class="t-body text-fg-muted">Nothing came back — plan it by hand on the grid below.</p>
      {:else}
        <div class="space-y-2">
          {#each blockRows as row, i (row.block.title + row.block.start)}
            <div class="flex items-center gap-3 rounded-md border border-line p-3">
              <Switch
                checked={row.selected}
                label={row.block.title}
                onchange={(checked) => (blockRows[i] = { ...row, selected: checked })}
              />
              <div class="min-w-0 flex-1">
                <p class="t-label truncate text-fg">{row.block.title}</p>
                <p class="t-micro text-fg-muted">{row.block.start}–{row.block.end} · {activityName(row.block.activityId)}</p>
              </div>
            </div>
          {/each}
        </div>
      {/if}
      {#if writeError}<p class="t-micro text-danger">{writeError}</p>{/if}
      <Button
        full
        label="Add to calendar"
        loading={writing}
        disabled={!blockRows.some((row) => row.selected)}
        onclick={accept}
      />
      <button type="button" class="t-micro block w-full text-center text-fg-faint underline" onclick={close}>
        Discard — I'll plan it myself
      </button>
    </div>
  {:else if stage === "unavailable"}
    <div class="space-y-3">
      <p class="t-body text-fg-muted">No model is configured, so there's nothing to suggest — plan it by hand on the grid below.</p>
      <Button full label="Got it" onclick={close} />
    </div>
  {/if}
</Dialog>
