<script lang="ts">
  import { theme, type ThemeMode } from "$lib/theme.svelte";
  import { Monitor, Moon, Sun } from "lucide-svelte";

  /**
   * Appearance as one button rather than a menu: the three modes are a short cycle, and a list
   * that only ever offers three one-word choices costs more taps than it saves. The icon is the
   * mode it is in, so the control also reports the state it's reporting on.
   *
   * `system` first, because that is where it starts and where most people leave it.
   */
  const CYCLE: { mode: ThemeMode; label: string; icon: typeof Sun }[] = [
    { mode: "system", label: "Appearance: matching this device", icon: Monitor },
    { mode: "light", label: "Appearance: light", icon: Sun },
    { mode: "dark", label: "Appearance: dark", icon: Moon },
  ];

  let { compact = false }: { compact?: boolean } = $props();

  const current = $derived(CYCLE.find((step) => step.mode === theme.mode) ?? CYCLE[0]);

  function advance() {
    const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length];
    theme.setMode(next.mode);
  }
</script>

<button
  type="button"
  onclick={advance}
  aria-label={current.label}
  title={current.label}
  class="press-sm flex shrink-0 items-center justify-center rounded-full text-fg-muted hoverable {compact
    ? 'size-[18px]'
    : 'size-7'}"
>
  <current.icon size={compact ? 12 : 15} />
</button>
