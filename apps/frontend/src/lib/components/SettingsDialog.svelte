<script lang="ts">
  import { goto } from "$app/navigation";
  import { auth } from "$lib/auth.svelte";
  import { buildInfo } from "$lib/build-info";
  import CalendarsSection from "$lib/calendar/CalendarsSection.svelte";
  import { isDesktop, isNativeShell } from "$lib/desktop/platform";
  import { preferences } from "$lib/preferences.svelte";
  import LocationsSection from "$lib/settings/LocationsSection.svelte";
  import SettingRow from "$lib/settings/SettingRow.svelte";
  import SettingsSection from "$lib/settings/SettingsSection.svelte";
  import { settings } from "$lib/settings.svelte";
  import { clearStore } from "$lib/store.svelte";
  import { theme, type ThemeMode } from "$lib/theme.svelte";
  import {
    Bell,
    CalendarClock,
    CalendarDays,
    CalendarRange,
    ChevronDown,
    Footprints,
    Moon,
    Palette,
    PenLine,
    Sunrise,
    Timer,
    Volume2,
  } from "lucide-svelte";
  import TimeInput from "../planning/TimeInput.svelte";
  import Button from "./Button.svelte";
  import DesktopDownload from "./DesktopDownload.svelte";
  import DesktopUpdate from "./DesktopUpdate.svelte";
  import Dialog from "./Dialog.svelte";
  import NumberField from "./NumberField.svelte";
  import Popover from "./Popover.svelte";
  import PopoverItem from "./PopoverItem.svelte";
  import Segmented from "./Segmented.svelte";
  import Switch from "./Switch.svelte";

  /**
   * Everything about the account that isn't the week: who is signed in, how the app looks, when it
   * asks you to plan, what it says before an event, where you leave from, and which calendars it
   * reads.
   *
   * Laid out as cards in two columns rather than one long scroll of headings and paragraphs. Six
   * sections stacked in a phone-width column meant every visit began with scrolling past the five
   * you didn't come for, and the explanations under each heading — read once, in the way forever
   * after — are now on the rows they explain, where hovering asks for them.
   *
   * Two settings used to live here and don't any more. "Hours I plan in a day" asked people to
   * choose a number that only ever made their own day look emptier than it was; a day is planned
   * against the whole of itself now. And "a day counts as planned at" asked them to set the bar
   * they'd rather not fail, which is not a bar — it is 70%, in `coverage.ts`, for everyone.
   */
  const MODES: { value: ThemeMode; label: string }[] = [
    { value: "system", label: "System" },
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
  ];

  const WEEKDAYS = [
    { value: 1, label: "Monday" },
    { value: 2, label: "Tuesday" },
    { value: 3, label: "Wednesday" },
    { value: 4, label: "Thursday" },
    { value: 5, label: "Friday" },
    { value: 6, label: "Saturday" },
    { value: 7, label: "Sunday" },
  ];

  /** Planning the evening before is the one worth an extra star — the label says which is which. */
  const PLAN_WHEN: { value: "evening" | "morning"; label: string }[] = [
    { value: "evening", label: "Tonight" },
    { value: "morning", label: "Morning" },
  ];

  const initial = $derived((auth.email || "?").charAt(0).toUpperCase());
  const sessions = $derived(preferences.sessions);
  const reminders = $derived(preferences.reminders);
  const weekday = $derived(WEEKDAYS.find((day) => day.value === sessions.weeklyWeekday)?.label ?? "Sunday");

  /** Nothing here has a Save button, so a panel closing mid-edit still writes what it was given. */
  $effect(() => () => preferences.flush());

  async function signOut() {
    settings.hide();
    await auth.signOut();
    // Whatever is cached belongs to the account that just left.
    await clearStore();
    await goto("/sign-in");
  }
</script>

<Dialog title="Settings" open={settings.open} size="lg" onclose={() => settings.hide()}>
  <section class="flex items-center gap-3 rounded-lg border border-line bg-surface-alt px-4 py-3">
    <span
      class="t-body flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line-strong bg-surface text-fg-muted"
    >
      {#if auth.avatarUrl}
        <img src={auth.avatarUrl} alt="" class="size-full object-cover" />
      {:else}
        {initial}
      {/if}
    </span>
    <div class="min-w-0 flex-1">
      <p class="t-body-strong truncate">{auth.email || "Signed in"}</p>
      <p class="t-micro text-fg-faint">Google account</p>
    </div>
    <Button label="Sign out" variant="outline" size="sm" onclick={() => void signOut()} />
  </section>

  <!-- Two columns on anything wider than a phone. The cards are different heights and there is no
       reading order between them, so they are two independent stacks rather than a grid whose
       rows would leave a gap beside every short section. -->
  <div class="gap-4 md:columns-2 [&>*]:mb-4 [&>*]:break-inside-avoid">
    <SettingsSection icon={Palette} title="Appearance">
      <Segmented options={MODES} value={theme.mode} onchange={(mode) => theme.setMode(mode)} />
    </SettingsSection>

    <!-- The ritual the whole app hangs off: when to look back, and when to decide the next day. -->
    <SettingsSection
      icon={CalendarClock}
      title="Planning sessions"
      note="Two moments a day, on iPhone and Apple Watch."
    >
      {#snippet trailing()}
        <Switch
          checked={sessions.enabled}
          label="Ask me to plan"
          onchange={(enabled) => preferences.setSessions({ enabled })}
        />
      {/snippet}

      <div class="space-y-0.5">
        <SettingRow
          icon={Moon}
          label="Evening"
          hint="Look back on today, and plan tomorrow while it's still tonight."
          disabled={!sessions.enabled}
        >
          {#snippet control()}
            <TimeInput
              value={sessions.eveningTime}
              label="Evening session time"
              onchange={(eveningTime) => preferences.setSessions({ eveningTime })}
            />
          {/snippet}
        </SettingRow>

        <SettingRow
          icon={Sunrise}
          label="Morning"
          hint="Yesterday, and what today could be — for whoever would rather plan over coffee."
          disabled={!sessions.enabled}
        >
          {#snippet control()}
            <TimeInput
              value={sessions.morningTime}
              label="Morning session time"
              onchange={(morningTime) => preferences.setSessions({ morningTime })}
            />
          {/snippet}
        </SettingRow>

        <SettingRow
          icon={CalendarRange}
          label="Weekly"
          hint="The longer sitting. It replaces that evening's reminder and plans the week ahead."
          disabled={!sessions.enabled}
        >
          {#snippet control()}
            <div class="flex items-center gap-1.5">
              <!-- An app popover, not the platform's select: the rest of the app picks this way. -->
              <Popover width={180}>
                {#snippet trigger(open)}
                  <button
                    type="button"
                    onclick={open}
                    aria-label="Day of the weekly session"
                    class="press-sm flex items-center gap-1 rounded-md border border-line px-2 py-1.5"
                  >
                    <span class="t-label text-fg">{weekday}</span>
                    <ChevronDown size={13} class="text-fg-faint" />
                  </button>
                {/snippet}
                {#snippet content(close)}
                  {#each WEEKDAYS as day (day.value)}
                    <PopoverItem
                      label={day.label}
                      selected={day.value === sessions.weeklyWeekday}
                      onclick={() => {
                        preferences.setSessions({ weeklyWeekday: day.value });
                        close();
                      }}
                    />
                  {/each}
                {/snippet}
              </Popover>
              <TimeInput
                value={sessions.weeklyTime}
                label="Weekly session time"
                onchange={(weeklyTime) => preferences.setSessions({ weeklyTime })}
              />
            </div>
          {/snippet}
        </SettingRow>

        <SettingRow
          icon={PenLine}
          label="I plan"
          hint="Which sitting you mean to plan in. Planning the night before earns an extra star."
          disabled={!sessions.enabled}
        >
          {#snippet control()}
            <Segmented
              options={PLAN_WHEN}
              value={sessions.planWhen}
              onchange={(planWhen) => preferences.setSessions({ planWhen })}
            />
          {/snippet}
        </SettingRow>
      </div>
    </SettingsSection>

    <!-- Shown everywhere, though a browser tab can act on none of them: it has nowhere to put a
         reminder card and no notifications of its own. They belong to the account rather than to
         this device, so setting them from whichever screen is open reaches the ones that use
         them — the Mac app, the iPhone, and the watch on its wrist. -->
    <SettingsSection
      icon={Bell}
      title="Reminders"
      note={isNativeShell ? undefined : "Delivered by the Balance apps for Mac and iPhone."}
    >
      {#snippet trailing()}
        <Switch
          checked={reminders.enabled}
          label="Remind me about events"
          onchange={(enabled) => preferences.setReminders({ enabled })}
        />
      {/snippet}

      <div class="space-y-0.5">
        <SettingRow
          icon={Timer}
          label="Heads-up"
          hint="How long before it starts. Used for events the calendar carries no reminder of its own for."
          disabled={!reminders.enabled}
        >
          {#snippet control()}
            <div class="flex items-center gap-1.5">
              <NumberField
                value={reminders.leadMinutes}
                unit="min"
                ariaLabel="Minutes before an event"
                inputmode="numeric"
                onchange={(leadMinutes) => preferences.setReminders({ leadMinutes: Math.max(0, Math.round(leadMinutes)) })}
              />
              <span class="t-micro text-fg-faint">before</span>
            </div>
          {/snippet}
        </SettingRow>

        <SettingRow
          icon={CalendarClock}
          label="The event's own"
          hint="Honour the reminders already set on an event in the calendar, as well as this one."
          disabled={!reminders.enabled}
        >
          {#snippet control()}
            <Switch
              checked={reminders.useCalendarReminders}
              label="Use the event's own reminders too"
              disabled={!reminders.enabled}
              onchange={(useCalendarReminders) => preferences.setReminders({ useCalendarReminders })}
            />
          {/snippet}
        </SettingRow>

        <SettingRow
          icon={Footprints}
          label="When to leave"
          hint="A second reminder when it's time to set off, for events with an address."
          disabled={!reminders.enabled}
        >
          {#snippet control()}
            <Switch
              checked={reminders.leaveInTime}
              label="Tell me when to leave"
              disabled={!reminders.enabled}
              onchange={(leaveInTime) => preferences.setReminders({ leaveInTime })}
            />
          {/snippet}
        </SettingRow>

        <SettingRow icon={Volume2} label="Sound" disabled={!reminders.enabled}>
          {#snippet control()}
            <Switch
              checked={reminders.sound}
              label="Sound"
              disabled={!reminders.enabled}
              onchange={(sound) => preferences.setReminders({ sound })}
            />
          {/snippet}
        </SettingRow>
      </div>
    </SettingsSection>

    <LocationsSection />

    <SettingsSection icon={CalendarDays} title="Calendars">
      <CalendarsSection />
    </SettingsSection>
  </div>

  <!-- Only in a browser: the two app shells are already what it would install. -->
  {#if !isNativeShell}
    <DesktopDownload />
  {/if}

  <!-- And only in the Mac app, which is the one build that replaces itself. -->
  {#if isDesktop}
    <DesktopUpdate />
  {/if}

  <!-- Which build this is: the native shells carry their own copy of the frontend, and this is the
       only thing on screen that says how old it is. The parts are spaced well apart, because at
       this size four fields run together into one string of characters otherwise. -->
  <p class="t-data-micro flex select-text flex-wrap items-center justify-center gap-x-3 text-fg-faint">
    {#each buildInfo.parts as part, index (part)}
      {#if index > 0}<span class="text-line-strong">·</span>{/if}
      <span>{part}</span>
    {/each}
  </p>
</Dialog>
