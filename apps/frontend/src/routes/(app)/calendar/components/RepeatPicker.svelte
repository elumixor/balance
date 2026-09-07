<script lang="ts">
  import { AnchoredPopup, NumberField, Segmented } from "$lib/components";
  import { formatDateInput } from "$lib/ui/format";
  import { describe, type Frequency, NEVER, presets, type Rule, type RuleEnd, toRRule } from "$lib/calendar/recurrence";

  /**
   * How often an event repeats: the handful of rules an event on this day would usually want,
   * and behind "Custom…" the whole shape — every N of something, which weekdays, and how it ends.
   */
  let {
    rect,
    value,
    day,
    onchoose,
    onclose,
  }: {
    rect: DOMRect | null;
    value: Rule | null;
    day: Date;
    onchoose: (rule: Rule | null) => void;
    onclose: () => void;
  } = $props();

  const FREQUENCIES: { value: Frequency; label: string }[] = [
    { value: "daily", label: "Day" },
    { value: "weekly", label: "Week" },
    { value: "monthly", label: "Month" },
    { value: "yearly", label: "Year" },
  ];
  const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
  const ENDS: { value: RuleEnd["kind"]; label: string }[] = [
    { value: "never", label: "Never" },
    { value: "until", label: "On a day" },
    { value: "count", label: "After" },
  ];
  const DEFAULT_COUNT = 10;
  /** Wide enough for "Every [n] Day Week Month Year" on one line. */
  const WIDTH = 350;
  const ROWS = "grid grid-cols-[3rem_1fr] items-center gap-x-2 gap-y-3";
  const MAX_INTERVAL = 99;

  const choices = $derived(presets(day));
  const current = $derived(value ? toRRule(value) : "");
  /** A rule the presets don't cover opens straight onto the editor, since that's where it lives. */
  let custom = $state(false);
  $effect(() => {
    if (value && !choices.some((c) => toRRule(c.rule) === current)) custom = true;
  });

  let draft = $state<Rule>({ frequency: "weekly", interval: 1, weekdays: [], end: NEVER });
  $effect(() => {
    draft = value ?? { frequency: "weekly", interval: 1, weekdays: [day.getDay()], end: NEVER };
  });

  function endOf(kind: RuleEnd["kind"], was: RuleEnd): RuleEnd {
    return kind === "never"
      ? NEVER
      : kind === "until"
        ? { kind, day: was.kind === "until" ? was.day : formatDateInput(day) }
        : { kind, count: was.kind === "count" ? was.count : DEFAULT_COUNT };
  }

  function setEnd(kind: RuleEnd["kind"]) {
    draft = { ...draft, end: endOf(kind, draft.end) };
  }

  /**
   * A rule the presets name still has to say when it stops, so its end sits under the list too —
   * every change there is the whole rule written again, since the calendar keeps only one line.
   */
  function chooseEnd(end: RuleEnd) {
    if (value) onchoose({ ...value, end });
  }

  function toggleWeekday(weekday: number) {
    const next = draft.weekdays.includes(weekday)
      ? draft.weekdays.filter((d) => d !== weekday)
      : [...draft.weekdays, weekday];
    // A weekly rule with no day is no rule: the last day stays.
    if (next.length > 0) draft = { ...draft, weekdays: next };
  }
</script>

<!-- Two columns everywhere: the word down the left, the control beside it, so "Every", "Ends" and
     what they take line up whichever of them is showing. -->
{#snippet ends(end: RuleEnd, setKind: (kind: RuleEnd["kind"]) => void, set: (end: RuleEnd) => void)}
  <span class="t-label text-fg-muted">Ends</span>
  <Segmented options={ENDS} value={end.kind} onchange={setKind} />
  {#if end.kind === "until"}
    <span></span>
    <input
      type="date"
      value={end.day}
      onchange={(e) => set({ kind: "until", day: e.currentTarget.value })}
      aria-label="Last day"
      class="field-bare w-full"
    />
  {:else if end.kind === "count"}
    <span></span>
    <div class="flex">
      <NumberField
        value={end.count}
        unit="times"
        ariaLabel="How many times"
        inputmode="numeric"
        onchange={(n) => set({ kind: "count", count: Math.max(1, Math.round(n)) })}
      />
    </div>
  {/if}
{/snippet}

<AnchoredPopup {rect} width={WIDTH} {onclose}>
  {#if !custom}
    <div class="p-1.5">
      <button
        type="button"
        onclick={() => onchoose(null)}
        class="menu-row {value ? 'text-fg-muted' : ''}"
      >
        Doesn’t repeat
      </button>
      {#each choices as choice (choice.label)}
        {@const chosen = toRRule(choice.rule) === current}
        <button
          type="button"
          onclick={() => onchoose(choice.rule)}
          class="menu-row {chosen ? '' : 'text-fg-muted'}"
        >
          <span class="flex-1">{choice.label}</span>
          {#if chosen}<span class="size-1.5 rounded-full bg-ink"></span>{/if}
        </button>
      {/each}
      <button
        type="button"
        onclick={() => (custom = true)}
        class="menu-row text-fg-muted"
      >
        Custom…
      </button>
      {#if value}
        <div class="{ROWS} mt-1.5 border-t border-line px-1.5 pt-2.5 pb-1">
          {@render ends(value.end, (kind) => chooseEnd(endOf(kind, value.end)), chooseEnd)}
        </div>
      {/if}
    </div>
  {:else}
    <div class="p-3">
      <div class={ROWS}>
        <span class="t-label text-fg-muted">Every</span>
        <div class="flex items-center gap-3">
          <NumberField
            value={draft.interval}
            unit=""
            ariaLabel="Every how many"
            inputmode="numeric"
            onchange={(n) => (draft = { ...draft, interval: Math.min(MAX_INTERVAL, Math.max(1, Math.round(n))) })}
          />
          <Segmented
            options={FREQUENCIES}
            value={draft.frequency}
            onchange={(frequency) => (draft = { ...draft, frequency })}
          />
        </div>

        {#if draft.frequency === "weekly"}
          <span></span>
          <div class="flex gap-1">
            {#each WEEKDAYS as letter, weekday (weekday)}
              <button
                type="button"
                aria-label="Repeat on weekday {weekday}"
                aria-pressed={draft.weekdays.includes(weekday)}
                onclick={() => toggleWeekday(weekday)}
                class="press-sm t-label flex size-7 items-center justify-center rounded-full border {draft.weekdays.includes(
                  weekday,
                )
                  ? 'border-ink bg-ink text-ink-fg'
                  : 'border-line text-fg-muted'}"
              >
                {letter}
              </button>
            {/each}
          </div>
        {/if}

        {@render ends(draft.end, setEnd, (end) => (draft = { ...draft, end }))}
      </div>

      <div class="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
        <span class="t-micro min-w-0 truncate text-fg-faint">{describe(draft, day)}</span>
        <div class="flex shrink-0 gap-2">
          <button type="button" onclick={() => (custom = false)} class="press t-label px-2 text-fg-muted">Back</button>
          <button
            type="button"
            onclick={() => onchoose(draft)}
            class="press t-label rounded-md border border-ink bg-ink px-3 py-1.5 text-ink-fg"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  {/if}
</AnchoredPopup>
