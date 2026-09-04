<script lang="ts">
  import { auth } from "$lib/auth.svelte";
  import { buildInfo } from "$lib/build-info";
  import { Button, Segmented } from "$lib/components";
  import DesktopDownload from "./DesktopDownload.svelte";
  import DesktopUpdate from "./DesktopUpdate.svelte";
  import { desktopAutostart } from "$lib/desktop/autostart.svelte";
  import { isDesktop, isNativeShell } from "$lib/desktop/platform";
  import { theme, type ThemeMode } from "$lib/theme.svelte";
  import SettingsGroup from "./SettingsGroup.svelte";
  import ToggleRow from "./ToggleRow.svelte";

  /** Who is signed in, how the app looks, and which build this is. */
  let { onsignout }: { onsignout: () => void } = $props();

  const MODES: { value: ThemeMode; label: string }[] = [
    { value: "system", label: "System" },
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
  ];

  const initial = $derived((auth.email || "?").charAt(0).toUpperCase());

  // Read when the pane opens: the answer belongs to the system, and could have changed there.
  $effect(() => void desktopAutostart.load());
</script>

<SettingsGroup title="Account" divided={false}>
  <div class="flex items-center gap-3">
    <span
      class="t-body flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full
        border border-line-strong bg-surface-alt text-fg-muted"
    >
      {#if auth.avatarUrl}
        <img src={auth.avatarUrl} alt="" class="size-full object-cover" />
      {:else}
        {initial}
      {/if}
    </span>
    <div class="min-w-0 flex-1">
      <p class="t-body truncate text-fg">{auth.email || "Signed in"}</p>
      <p class="t-micro text-fg-faint">Google account</p>
    </div>
    <Button label="Sign out" variant="outline" size="sm" onclick={onsignout} />
  </div>
</SettingsGroup>

<SettingsGroup title="Appearance">
  <Segmented options={MODES} value={theme.mode} onchange={(mode) => theme.setMode(mode)} />
</SettingsGroup>

<!-- Only in a browser: the two app shells are already what it would install. -->
{#if !isNativeShell}
  <SettingsGroup title="Balance for Mac" note="The menu bar knows what you're in the middle of.">
    <DesktopDownload />
  </SettingsGroup>
{/if}

<!-- And only in the Mac app, which is the one build that replaces itself. -->
{#if isDesktop}
  <SettingsGroup title="Startup">
    <ToggleRow
      label="Open at login"
      note="The menu bar and reminders are there without opening the app."
      checked={desktopAutostart.enabled === true}
      disabled={desktopAutostart.enabled === null}
      onchange={(enabled) => void desktopAutostart.set(enabled)}
    />
  </SettingsGroup>

  <SettingsGroup title="Updates">
    <DesktopUpdate />
  </SettingsGroup>
{/if}

<SettingsGroup title="This build">
  <!-- The native shells carry their own copy of the frontend, and this is the only thing on
       screen that says how old it is. -->
  <p class="t-data-micro flex select-text flex-wrap items-center gap-x-3 text-fg-faint">
    {#each buildInfo.parts as part, index (part)}
      {#if index > 0}<span class="text-line-strong">·</span>{/if}
      <span>{part}</span>
    {/each}
  </p>
</SettingsGroup>
