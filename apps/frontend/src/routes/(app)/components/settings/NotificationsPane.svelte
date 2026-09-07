<script lang="ts">
  import { Divider, NumberField, Select } from "$lib/components";
  import { isNativeShell } from "$lib/desktop/platform";
  import { preferences } from "$lib/account/preferences.svelte";
  import { Bell, BellRing, CalendarRange, Navigation, Sunrise, Sunset, Timer, Volume2 } from "lucide-svelte";
  import SettingRow from "./SettingRow.svelte";
  import SettingsGroup from "./SettingsGroup.svelte";
  import TimeInput from "./TimeInput.svelte";
  import ToggleRow from "./ToggleRow.svelte";

  /**
   * Everything the app says on its own: the two sittings it asks for, and the reminders before
   * events. Each is a switch, and under it the rows it governs — dimmed while it is off.
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

<SettingsGroup title="Notifications">
  <div class="space-y-1">
    <ToggleRow
      icon={Bell}
      label="Ask me to plan"
      checked={sessions.enabled}
      note={isNativeShell ? undefined : "On iPhone and Apple Watch."}
      onchange={(enabled) => preferences.setSessions({ enabled })}
    />
    <SettingRow icon={Sunset} label="Evening" disabled={!sessions.enabled}>
      <TimeInput value={sessions.eveningTime} label="Evening session time" onchange={(eveningTime) => preferences.setSessions({ eveningTime })} />
    </SettingRow>
    <SettingRow icon={Sunrise} label="Morning" disabled={!sessions.enabled}>
      <TimeInput value={sessions.morningTime} label="Morning session time" onchange={(morningTime) => preferences.setSessions({ morningTime })} />
    </SettingRow>
    <SettingRow icon={CalendarRange} label="Week" disabled={!sessions.enabled}>
      <Select
        options={WEEKDAYS}
        value={sessions.weeklyWeekday}
        label="Day of the weekly session"
        variant="bare"
        onchange={(weeklyWeekday) => preferences.setSessions({ weeklyWeekday })}
      />
      <TimeInput value={sessions.weeklyTime} label="Weekly session time" onchange={(weeklyTime) => preferences.setSessions({ weeklyTime })} />
    </SettingRow>
  </div>

  <Divider />

  <div class="space-y-1">
    <ToggleRow
      icon={BellRing}
      label="Remind me about events"
      checked={reminders.enabled}
      note={isNativeShell ? undefined : "On Mac and iPhone."}
      onchange={(enabled) => preferences.setReminders({ enabled })}
    />
    <SettingRow icon={Timer} label="Before an event" note="Unless the event says otherwise." disabled={!reminders.enabled}>
      <NumberField
        value={reminders.leadMinutes}
        unit="min"
        ariaLabel="Minutes before an event"
        inputmode="numeric"
        onchange={(leadMinutes) => preferences.setReminders({ leadMinutes: Math.max(0, Math.round(leadMinutes)) })}
      />
    </SettingRow>
    <ToggleRow
      icon={Bell}
      label="The event's own reminders too"
      checked={reminders.useCalendarReminders}
      disabled={!reminders.enabled}
      onchange={(useCalendarReminders) => preferences.setReminders({ useCalendarReminders })}
    />
    <ToggleRow
      icon={Navigation}
      label="Tell me when to leave"
      checked={reminders.leaveInTime}
      disabled={!reminders.enabled}
      onchange={(leaveInTime) => preferences.setReminders({ leaveInTime })}
    />
    <ToggleRow
      icon={Volume2}
      label="Sound"
      checked={reminders.sound}
      disabled={!reminders.enabled}
      onchange={(sound) => preferences.setReminders({ sound })}
    />
  </div>
</SettingsGroup>
