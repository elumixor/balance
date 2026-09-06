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

  function setEnd(kind: RuleEnd["kind"]) {
    const end: RuleEnd =
      kind === "never"
        ? NEVER
        : kind === "until"
          ? { kind, day: draft.end.kind === "until" ? draft.end.day : formatDateInput(day) }
          : { kind, count: draft.end.kind === "count" ? draft.end.count : DEFAULT_COUNT };
    draft = { ...draft, end };
  }

  function toggleWeekday(weekday: number) {
    const next = draft.weekdays.includes(weekday)
      ? draft.weekdays.filter((d) => d !== weekday)
      : [...draft.weekdays, weekday];
    // A weekly rule with no day is no rule: the last day stays.
    if (next.length > 0) draft = { ...draft, weekdays: next };
  }
</script>

<AnchoredPopup {rect} width={280} {onclose}>
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
    </div>
  {:else}
    <div class="space-y-3 p-3">
      <div class="flex items-center gap-2">
        <span class="t-label text-fg-muted">Every</span>
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

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <span class="t-label text-fg-muted">Ends</span>
          <Segmented options={ENDS} value={draft.end.kind} onchange={setEnd} />
        </div>
        {#if draft.end.kind === "until"}
          <input
            type="date"
            value={draft.end.day}
            oninput={(e) => (draft = { ...draft, end: { kind: "until", day: e.currentTarget.value } })}
            aria-label="Last day"
            class="field-bare w-full"
          />
        {:else if draft.end.kind === "count"}
          <div class="flex items-center gap-2">
            <NumberField
              value={draft.end.count}
              unit="times"
              ariaLabel="How many times"
              inputmode="numeric"
              onchange={(n) => (draft = { ...draft, end: { kind: "count", count: Math.max(1, Math.round(n)) } })}
            />
          </div>
        {/if}
      </div>

      <div class="flex items-center justify-between gap-2 border-t border-line pt-3">
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
