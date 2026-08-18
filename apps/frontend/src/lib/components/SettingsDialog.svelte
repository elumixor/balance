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
  import Dialog from "./Dialog.svelte";
  import Field from "./Field.svelte";
  import NumberField from "./NumberField.svelte";
  import SectionHeader from "./SectionHeader.svelte";
  import Segmented from "./Segmented.svelte";
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
    clearStore();
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

  <!-- Shown everywhere, though only the macOS app can act on them: a browser tab has nowhere to
       put a reminder card. They belong to the account rather than to this machine, so setting
       them from whichever screen is open reaches the one that will use them. -->
  <section>
    <SectionHeader title="Reminders" />
    {#if !isDesktop}
      <p class="t-micro mb-3 text-fg-faint">Reminders appear in the Balance app for Mac.</p>
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
