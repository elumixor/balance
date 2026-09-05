<script lang="ts">
  import { NumberField, Select } from "$lib/components";
  import { isNativeShell } from "$lib/desktop/platform";
  import { preferences } from "$lib/preferences.svelte";
  import TimeInput from "./TimeInput.svelte";
  import ToggleRow from "./ToggleRow.svelte";

  /**
   * Everything the app says on its own: the two sittings it asks for, and the reminders before
   * events. Each is a switch and, under it, the few numbers it needs, on one line where they fit.
   *
   * These belong to the account, not the device, and a browser tab can act on none of them — so
   * setting them from whichever screen is open reaches the ones that deliver: the Mac app, the
   * iPhone, and the watch.
   *
   * "Hours I plan in a day", "a day counts as planned at" and "I plan tonight / in the morning"
   * all lived here once. The first two asked for a number people only ever set to fail by; the
   * third nothing read — the planning window runs from the evening sitting to midday either way.
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

  const sessions = $derived(preferences.sessions);
  const reminders = $derived(preferences.reminders);
</script>

{#snippet field(label: string, control: import("svelte").Snippet)}
  <label class="flex items-center gap-2">
    <span class="t-label text-fg-muted">{label}</span>
    {@render control()}
  </label>
{/snippet}

<div class="space-y-8">
  <section class="space-y-4">
    <ToggleRow
      label="Ask me to plan"
      checked={sessions.enabled}
      note={isNativeShell ? undefined : "On iPhone and Apple Watch."}
      onchange={(enabled) => preferences.setSessions({ enabled })}
    />
    <div class="flex flex-wrap items-center gap-x-6 gap-y-3 pl-[52px] {sessions.enabled ? '' : 'pointer-events-none opacity-40'}">
      {#snippet evening()}
        <TimeInput value={sessions.eveningTime} label="Evening session time" onchange={(eveningTime) => preferences.setSessions({ eveningTime })} />
      {/snippet}
      {#snippet morning()}
        <TimeInput value={sessions.morningTime} label="Morning session time" onchange={(morningTime) => preferences.setSessions({ morningTime })} />
      {/snippet}
      {#snippet weekly()}
        <Select
          options={WEEKDAYS}
          value={sessions.weeklyWeekday}
          label="Day of the weekly session"
          width={140}
          onchange={(weeklyWeekday) => preferences.setSessions({ weeklyWeekday })}
        />
        <TimeInput value={sessions.weeklyTime} label="Weekly session time" onchange={(weeklyTime) => preferences.setSessions({ weeklyTime })} />
      {/snippet}
      {@render field("Evening", evening)}
      {@render field("Morning", morning)}
      {@render field("Week", weekly)}
    </div>
  </section>

  <section class="space-y-4 border-t border-line pt-6">
    <ToggleRow
      label="Remind me about events"
      checked={reminders.enabled}
      note={isNativeShell ? undefined : "On Mac and iPhone."}
      onchange={(enabled) => preferences.setReminders({ enabled })}
    />
    <div class="space-y-3 pl-[52px] {reminders.enabled ? '' : 'pointer-events-none opacity-40'}">
      <div class="flex items-center gap-2">
        <NumberField
          value={reminders.leadMinutes}
          unit="min"
          ariaLabel="Minutes before an event"
          inputmode="numeric"
          onchange={(leadMinutes) => preferences.setReminders({ leadMinutes: Math.max(0, Math.round(leadMinutes)) })}
        />
        <span class="t-label text-fg-muted">before, unless the event says otherwise</span>
      </div>
      <ToggleRow
        label="Use the event's own reminders too"
        checked={reminders.useCalendarReminders}
        onchange={(useCalendarReminders) => preferences.setReminders({ useCalendarReminders })}
      />
      <ToggleRow
        label="Tell me when to leave"
        checked={reminders.leaveInTime}
        onchange={(leaveInTime) => preferences.setReminders({ leaveInTime })}
      />
      <ToggleRow label="Sound" checked={reminders.sound} onchange={(sound) => preferences.setReminders({ sound })} />
    </div>
  </section>
</div>
