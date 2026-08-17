<script lang="ts">
  import { goto } from "$app/navigation";
  import { auth } from "$lib/auth.svelte";
  import { buildInfo } from "$lib/build-info";
  import CalendarsSection from "$lib/calendar/CalendarsSection.svelte";
  import { settings } from "$lib/settings.svelte";
  import { clearStore } from "$lib/store.svelte";
  import { theme, type ThemeMode } from "$lib/theme.svelte";
  import Button from "./Button.svelte";
  import Dialog from "./Dialog.svelte";
  import SectionHeader from "./SectionHeader.svelte";
  import Segmented from "./Segmented.svelte";

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

  <section>
    <SectionHeader title="Calendars" />
    <CalendarsSection />
  </section>

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
