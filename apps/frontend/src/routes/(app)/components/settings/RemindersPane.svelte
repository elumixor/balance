<script lang="ts">
  import { NumberField } from "$lib/components";
  import { isNativeShell } from "$lib/desktop/platform";
  import { preferences } from "$lib/preferences.svelte";
  import ChoiceRow from "./ChoiceRow.svelte";
  import SettingsGroup from "./SettingsGroup.svelte";
  import ToggleRow from "./ToggleRow.svelte";

  /**
   * What the app says before an event, and when.
   *
   * Shown everywhere, though a browser tab can act on none of it: it has nowhere to put a
   * reminder card and no notifications of its own. These belong to the account rather than to
   * this device, so setting them from whichever screen is open reaches the ones that use them —
   * the Mac app, the iPhone, and the watch on its wrist.
   */
  const reminders = $derived(preferences.reminders);
  const off = $derived(!reminders.enabled);
</script>

<SettingsGroup title="Event reminders" divided={false}>
  <ToggleRow
    label="Remind me about events"
    checked={reminders.enabled}
    note={isNativeShell ? undefined : "Delivered by the Balance apps for Mac and iPhone."}
    onchange={(enabled) => preferences.setReminders({ enabled })}
  />

  <ChoiceRow
    label="Say something before it starts"
    note="Used for events the calendar carries no reminder of its own for."
    disabled={off}
  >
    {#snippet control()}
      <div class="flex items-center gap-2">
        <NumberField
          value={reminders.leadMinutes}
          unit="min"
          ariaLabel="Minutes before an event"
          inputmode="numeric"
          onchange={(leadMinutes) => preferences.setReminders({ leadMinutes: Math.max(0, Math.round(leadMinutes)) })}
        />
        <span class="t-body text-fg-faint">before</span>
      </div>
    {/snippet}
  </ChoiceRow>

  <ToggleRow
    label="Use the event's own reminders too"
    checked={reminders.useCalendarReminders}
    disabled={off}
    onchange={(useCalendarReminders) => preferences.setReminders({ useCalendarReminders })}
  />

  <ToggleRow
    label="Tell me when to leave"
    checked={reminders.leaveInTime}
    note="A second reminder when it's time to set off, for events with an address."
    disabled={off}
    onchange={(leaveInTime) => preferences.setReminders({ leaveInTime })}
  />

  <ToggleRow
    label="Sound"
    checked={reminders.sound}
    disabled={off}
    onchange={(sound) => preferences.setReminders({ sound })}
  />
</SettingsGroup>
