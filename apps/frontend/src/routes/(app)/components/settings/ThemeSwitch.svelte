<script lang="ts">
  import { Tooltip } from "$lib/components";
  import { theme, type ThemeMode } from "$lib/ui/theme.svelte";
  import { Monitor, Moon, Sun } from "lucide-svelte";

  /**
   * Appearance as three icons in one small switch. Three one-word choices don't need a row of
   * words each, and the icon is what the mode looks like from the outside — a sun, a moon, the
   * screen it follows.
   */
  const MODES: { mode: ThemeMode; label: string; icon: typeof Sun }[] = [
    { mode: "light", label: "Light", icon: Sun },
    { mode: "dark", label: "Dark", icon: Moon },
    { mode: "system", label: "Match this device", icon: Monitor },
  ];
</script>

<div class="flex rounded-md border border-line p-0.5" role="radiogroup" aria-label="Appearance">
  {#each MODES as option (option.mode)}
    {@const active = theme.mode === option.mode}
    <Tooltip label={option.label}>
      <button
        type="button"
        role="radio"
        aria-checked={active}
        aria-label={option.label}
        onclick={() => theme.setMode(option.mode)}
        class="press-sm flex size-7 items-center justify-center rounded-[5px] {active
          ? 'bg-surface-alt text-fg'
          : 'hoverable text-fg-faint'}"
      >
        <option.icon size={14} />
      </button>
    </Tooltip>
  {/each}
</div>
