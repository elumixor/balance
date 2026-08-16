<script lang="ts">
  import { goto } from "$app/navigation";
  import { auth } from "$lib/auth.svelte";
  import { clearStore } from "$lib/store.svelte";
  import { theme, type ThemeMode } from "$lib/theme.svelte";
  import { LogOut, Monitor, Moon, Sun } from "lucide-svelte";
  import Divider from "./Divider.svelte";
  import Popover from "./Popover.svelte";
  import PopoverItem from "./PopoverItem.svelte";

  const MODES: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
    { value: "system", label: "Match device", icon: Monitor },
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
  ];

  /** Mobile hangs this off the right edge of a screen header; the side rail off its left. */
  let { align = "end" }: { align?: "start" | "end" } = $props();

  const initial = $derived((auth.email || "?").charAt(0).toUpperCase());

  async function signOut(close: () => void) {
    close();
    await auth.signOut();
    // Whatever is cached belongs to the account that just left.
    clearStore();
    await goto("/sign-in");
  }
</script>

<!-- One place for the two things that aren't part of the week: appearance and account. -->
<Popover width={230} {align}>
  {#snippet trigger(open: () => void)}
    <button
      type="button"
      onclick={open}
      aria-label="Account and appearance"
      title={auth.email}
      class="press-sm t-micro flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line-strong bg-surface-alt text-fg-muted"
    >
      {#if auth.avatarUrl}
        <img src={auth.avatarUrl} alt="" class="size-full object-cover" />
      {:else}
        {initial}
      {/if}
    </button>
  {/snippet}

  {#snippet content(close: () => void)}
    {#if auth.email}
      <p class="t-micro truncate px-3 pt-2 pb-2.5 text-fg-faint">{auth.email}</p>
    {/if}
    <Divider />
    <p class="t-micro px-3 pt-2.5 pb-1 text-fg-muted">Appearance</p>
    {#each MODES as mode (mode.value)}
      <PopoverItem
        label={mode.label}
        selected={theme.mode === mode.value}
        onclick={() => {
          theme.setMode(mode.value);
          close();
        }}
      >
        {#snippet icon()}
          <mode.icon size={15} class="text-fg-muted" />
        {/snippet}
      </PopoverItem>
    {/each}
    <Divider />
    <PopoverItem label="Sign out" tone="danger" onclick={() => signOut(close)}>
      {#snippet icon()}
        <LogOut size={15} />
      {/snippet}
    </PopoverItem>
  {/snippet}
</Popover>
