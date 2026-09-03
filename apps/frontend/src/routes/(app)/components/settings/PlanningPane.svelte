<script lang="ts">
  import { Segmented, Select } from "$lib/components";
  import { preferences } from "$lib/preferences.svelte";
  import TimeInput from "./TimeInput.svelte";
  import ChoiceRow from "./ChoiceRow.svelte";
  import SettingsGroup from "./SettingsGroup.svelte";
  import ToggleRow from "./ToggleRow.svelte";

  /**
   * The ritual the whole app hangs off: when to look back, and when to decide the next day.
   *
   * Two settings used to live here and don't any more. "Hours I plan in a day" asked people to
   * choose a number that only ever made their own day look emptier than it was — a day is
   * measured against the whole of itself now. And "a day counts as planned at" asked them to set
   * the bar they would rather not fail, which is not a bar; it is 70%, in `coverage.ts`, for
   * everyone.
   */
  const WEEKDAYS = [
    { value: 1, label: "Monday" },
    { value: 2, label: "Tuesday" },
    { value: 3, label: "Wednesday" },
    { value: 4, label: "Thursday" },
    { value: 5, label: "Friday" },
    { value: 6, label: "Saturday" },
    { value: 7, label: "Sunday" },
  ];

  /** Planning the evening before is the one worth an extra star — the note says so. */
  const PLAN_WHEN: { value: "evening" | "morning"; label: string }[] = [
    { value: "evening", label: "Tonight" },
    { value: "morning", label: "In the morning" },
  ];

  const sessions = $derived(preferences.sessions);
  const off = $derived(!sessions.enabled);
</script>

<SettingsGroup title="Planning sessions" divided={false}>
  <ToggleRow
    label="Ask me to plan"
    checked={sessions.enabled}
    note="Two moments a day — one to see how it went, one to decide the next. On iPhone and Apple Watch."
    onchange={(enabled) => preferences.setSessions({ enabled })}
  />

  <div class="grid gap-4 sm:grid-cols-2">
    <ChoiceRow label="Evening" note="Look back on today, and plan tomorrow while it's still tonight." disabled={off}>
      {#snippet control()}
        <TimeInput
          value={sessions.eveningTime}
          label="Evening session time"
          onchange={(eveningTime) => preferences.setSessions({ eveningTime })}
        />
      {/snippet}
    </ChoiceRow>

    <ChoiceRow label="Morning" note="Yesterday, and what today could be — for planning over coffee." disabled={off}>
      {#snippet control()}
        <TimeInput
          value={sessions.morningTime}
          label="Morning session time"
          onchange={(morningTime) => preferences.setSessions({ morningTime })}
        />
      {/snippet}
    </ChoiceRow>
  </div>

  <ChoiceRow
    label="The longer sitting"
    note="Once a week, in place of that evening's reminder. It plans the week ahead."
    disabled={off}
  >
    {#snippet control()}
      <div class="flex flex-wrap items-center gap-2">
        <Select
          options={WEEKDAYS}
          value={sessions.weeklyWeekday}
          label="Day of the weekly session"
          width={160}
          onchange={(weeklyWeekday) => preferences.setSessions({ weeklyWeekday })}
        />
        <TimeInput
          value={sessions.weeklyTime}
          label="Weekly session time"
          onchange={(weeklyTime) => preferences.setSessions({ weeklyTime })}
        />
      </div>
    {/snippet}
  </ChoiceRow>

  <ChoiceRow label="I plan" note="Planning the night before earns an extra star." disabled={off}>
    {#snippet control()}
      <Segmented
        options={PLAN_WHEN}
        value={sessions.planWhen}
        onchange={(planWhen) => preferences.setSessions({ planWhen })}
      />
    {/snippet}
  </ChoiceRow>
</SettingsGroup>
