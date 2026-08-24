<script lang="ts">
  import { goto } from "$app/navigation";
  import { auth } from "$lib/auth.svelte";
  import { buildInfo } from "$lib/build-info";
  import CalendarsSection from "$lib/calendar/CalendarsSection.svelte";
  import { isDesktop, isNativeShell } from "$lib/desktop/platform";
  import { preferences, TRAVEL_MODES } from "$lib/preferences.svelte";
  import { settings } from "$lib/settings.svelte";
  import { clearStore } from "$lib/store.svelte";
  import { theme, type ThemeMode } from "$lib/theme.svelte";
  import Button from "./Button.svelte";
  import Chip from "./Chip.svelte";
  import DesktopDownload from "./DesktopDownload.svelte";
  import DesktopUpdate from "./DesktopUpdate.svelte";
  import Dialog from "./Dialog.svelte";
  import Field from "./Field.svelte";
  import NumberField from "./NumberField.svelte";
  import SectionHeader from "./SectionHeader.svelte";
  import Segmented from "./Segmented.svelte";
  import TimeInput from "../planning/TimeInput.svelte";
  import Switch from "./Switch.svelte";

  /**
   * The one panel for everything that isn't the week: who is signed in, how the app looks, and
   * which calendars it reads. All three used to be a popover hanging off an 18px avatar, which
   * was the wrong shape for them and had nowhere to put the third.
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
    { value: "morning", label: "In the morning" },
  ];

  const initial = $derived((auth.email || "?").charAt(0).toUpperCase());

  /**
   * Where you leave from, held here while it's being typed. Every other setting on this panel is
   * one gesture, but an address is a sentence — writing each keystroke through would put a
   * half-typed street into `localStorage` and, worse, send it to the maps API behind an open
   * event card.
   */
  let origin = $state(preferences.travel.origin);
  const ORIGIN_SAVE_MS = 600;
  let originTimer: ReturnType<typeof setTimeout> | null = null;

  // The settings come from the account, so they can land after the panel is already open — on a
  // cold start, or because another device changed them. Whatever isn't being typed follows them.
  $effect(() => {
    const saved = preferences.travel.origin;
    if (!originTimer) origin = saved;
  });

  function typeOrigin(next: string) {
    origin = next;
    if (originTimer) clearTimeout(originTimer);
    originTimer = setTimeout(saveOrigin, ORIGIN_SAVE_MS);
  }

  function saveOrigin() {
    if (originTimer) clearTimeout(originTimer);
    originTimer = null;
    if (origin.trim() !== preferences.travel.origin) preferences.setTravel({ origin: origin.trim() });
  }

  /** Closing the panel is as good as finishing the sentence. */
  $effect(() => () => {
    saveOrigin();
    preferences.flush();
  });

  async function signOut() {
    settings.hide();
    await auth.signOut();
    // Whatever is cached belongs to the account that just left.
    await clearStore();
    await goto("/sign-in");
  }
</script>

<Dialog title="Settings" open={settings.open} onclose={() => settings.hide()}>
  <section class="flex items-center gap-3">
    <span
      class="t-body flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line-strong bg-surface-alt text-fg-muted"
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

  <section>
    <SectionHeader title="Appearance" />
    <Segmented options={MODES} value={theme.mode} onchange={(mode) => theme.setMode(mode)} />
  </section>

  <!-- The ritual the whole app hangs off: when to look back, when to plan, and how full a day has
       to be before it counts. Kept above the event reminders because it is the one people change
       — a lead time is set once, a planning hour moves with your life. -->
  <section>
    <SectionHeader title="Planning sessions" />
    <p class="t-micro mb-3 text-fg-faint">
      Two moments a day: one to see how it went, one to decide the next. On iPhone and Apple Watch.
    </p>
    <div class="space-y-1">
      <div class="flex min-h-8 items-center justify-between gap-3">
        <span class="t-body">Ask me to plan</span>
        <Switch
          checked={preferences.sessions.enabled}
          label="Ask me to plan"
          onchange={(enabled) => preferences.setSessions({ enabled })}
        />
      </div>

      {#if preferences.sessions.enabled}
        <div class="flex min-h-8 items-center justify-between gap-3">
          <span class="t-body">Evening</span>
          <TimeInput
            value={preferences.sessions.eveningTime}
            label="Evening session time"
            onchange={(eveningTime) => preferences.setSessions({ eveningTime })}
          />
        </div>
        <div class="flex min-h-8 items-center justify-between gap-3">
          <span class="t-body">Morning</span>
          <TimeInput
            value={preferences.sessions.morningTime}
            label="Morning session time"
            onchange={(morningTime) => preferences.setSessions({ morningTime })}
          />
        </div>
        <div class="flex min-h-8 items-center justify-between gap-3">
          <span class="t-body">The longer sitting</span>
          <div class="flex items-center gap-1.5">
            <select
              value={preferences.sessions.weeklyWeekday}
              aria-label="Day of the weekly session"
              onchange={(e) => preferences.setSessions({ weeklyWeekday: Number(e.currentTarget.value) })}
              class="t-body rounded-md border border-line-strong bg-surface px-2 py-1"
            >
              {#each WEEKDAYS as weekday (weekday.value)}
                <option value={weekday.value}>{weekday.label}</option>
              {/each}
            </select>
            <TimeInput
              value={preferences.sessions.weeklyTime}
              label="Weekly session time"
              onchange={(weeklyTime) => preferences.setSessions({ weeklyTime })}
            />
          </div>
        </div>

        <!-- Planning the evening before is worth an extra star, and the copy says so rather than
             leaving it to be discovered. -->
        <div class="flex min-h-8 items-center justify-between gap-3">
          <span class="t-body">I plan</span>
          <Segmented
            options={PLAN_WHEN}
            value={preferences.sessions.planWhen}
            onchange={(planWhen) => preferences.setSessions({ planWhen })}
          />
        </div>
        <!-- The ring is a whole week of intent, sleep included. A seventh of it is not a planning
             target, so this is what a day is actually measured against. -->
        <div class="flex min-h-8 items-center justify-between gap-3">
          <span class="t-body">Hours I plan in a day</span>
          <NumberField
            value={preferences.sessions.plannableHours}
            unit="h"
            ariaLabel="Hours I plan in a day"
            inputmode="numeric"
            onchange={(plannableHours) =>
              preferences.setSessions({ plannableHours: Math.min(16, Math.max(1, Math.round(plannableHours))) })}
          />
        </div>
        <div class="flex min-h-8 items-center justify-between gap-3">
          <span class="t-body">A day counts as planned at</span>
          <NumberField
            value={preferences.sessions.coveragePercent}
            unit="%"
            ariaLabel="How full a day has to be"
            inputmode="numeric"
            onchange={(coveragePercent) =>
              preferences.setSessions({ coveragePercent: Math.min(100, Math.max(10, Math.round(coveragePercent))) })}
          />
        </div>
      {/if}
    </div>
  </section>

  <!-- Shown everywhere, though a browser tab can act on none of them: it has nowhere to put a
       reminder card and no notifications of its own. They belong to the account rather than to
       this device, so setting them from whichever screen is open reaches the ones that use
       them — the Mac app, the iPhone, and the watch on its wrist. -->
  <section>
    <SectionHeader title="Reminders" />
    {#if !isNativeShell}
      <p class="t-micro mb-3 text-fg-faint">Reminders appear in the Balance apps for Mac and iPhone.</p>
    {/if}
    <div class="space-y-1">
      <div class="flex min-h-8 items-center justify-between gap-3">
        <span class="t-body">Remind me about events</span>
        <Switch
          checked={preferences.reminders.enabled}
          label="Remind me about events"
          onchange={(enabled) => preferences.setReminders({ enabled })}
        />
      </div>
      <div class="flex min-h-8 items-center justify-between gap-3">
        <span class="t-body">Say something</span>
        <div class="flex items-center gap-1.5">
          <NumberField
            value={preferences.reminders.leadMinutes}
            unit="min"
            ariaLabel="Minutes before an event"
            inputmode="numeric"
            onchange={(leadMinutes) => preferences.setReminders({ leadMinutes: Math.max(0, Math.round(leadMinutes)) })}
          />
          <span class="t-body text-fg-muted">before</span>
        </div>
      </div>
      <div class="flex min-h-8 items-center justify-between gap-3">
        <span class="t-body">Use the event's own reminders too</span>
        <Switch
          checked={preferences.reminders.useCalendarReminders}
          label="Use the event's own reminders too"
          onchange={(useCalendarReminders) => preferences.setReminders({ useCalendarReminders })}
        />
      </div>
      <div class="flex min-h-8 items-center justify-between gap-3">
        <span class="t-body">Tell me when to leave</span>
        <Switch
          checked={preferences.reminders.leaveInTime}
          label="Tell me when to leave"
          onchange={(leaveInTime) => preferences.setReminders({ leaveInTime })}
        />
      </div>
      <div class="flex min-h-8 items-center justify-between gap-3">
        <span class="t-body">Sound</span>
        <Switch
          checked={preferences.reminders.sound}
          label="Sound"
          onchange={(sound) => preferences.setReminders({ sound })}
        />
      </div>
    </div>
  </section>

  <section>
    <SectionHeader title="Travel" />
    <p class="t-micro mb-3 text-fg-faint">
      {#if !preferences.travelAvailable}
        Journey times are off — the server has no Google Maps key.
      {:else}
        Journey times need an address Google Maps can find.
      {/if}
    </p>
    <div class="space-y-3">
      <div class="space-y-1.5">
        <span class="t-label block text-fg-muted">Usually leaving from</span>
        <Field
          value={origin}
          oninput={typeOrigin}
          placeholder="Street, city"
          ariaLabel="Usually leaving from"
          autocapitalize="sentences"
        />
      </div>
      <div class="space-y-1.5">
        <span class="t-label block text-fg-muted">Ways of getting there</span>
        <div class="flex flex-wrap gap-1.5">
          {#each TRAVEL_MODES as mode (mode.value)}
            <Chip
              label={mode.label}
              selected={preferences.travel.modes.includes(mode.value)}
              onclick={() => preferences.toggleMode(mode.value)}
            />
          {/each}
        </div>
      </div>
      <div class="flex min-h-8 items-center justify-between gap-3">
        <span class="t-body">Be there early by</span>
        <NumberField
          value={preferences.travel.bufferMinutes}
          unit="min"
          ariaLabel="Minutes to be there early"
          inputmode="numeric"
          onchange={(bufferMinutes) =>
            preferences.setTravel({ bufferMinutes: Math.max(0, Math.round(bufferMinutes)) })}
        />
      </div>
    </div>
  </section>

  <section>
    <SectionHeader title="Calendars" />
    <CalendarsSection />
  </section>

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
