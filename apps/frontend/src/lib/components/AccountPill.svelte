<script lang="ts">
  import { auth } from "$lib/account/auth.svelte";
  import { SETTINGS_HOTKEY } from "$lib/platform/keys";
  import { progressData } from "$lib/planning/progress.svelte";
  import { sessionNudge } from "$lib/planning/session-nudge.svelte";
  import { settings } from "$lib/settings";
  import StarGlyph from "./StarGlyph.svelte";
  import Tooltip from "./Tooltip.svelte";

  /**
   * The star count and the face of the account, as one pill and one door. Both used to be their
   * own button onto the same panel, which meant two hover states side by side for one room; now
   * the whole pill lights up together, and either end of it opens settings.
   *
   * `compact` is for the rail, where it lines up beside the window buttons and wants their scale.
   * A finger needs the bigger one, a cursor doesn't.
   */
  let { compact = false }: { compact?: boolean } = $props();

  progressData.ensure();

  const stars = $derived(progressData.stars);
  const initial = $derived((auth.email || "?").charAt(0).toUpperCase());

  /** A dismissed ask is still owed: the dot says so, and the profile page holds the button. */
  const waiting = $derived(sessionNudge.dismissed);

  const label = $derived(
    [stars === null ? "Stars" : `${stars} stars`, waiting ? "settings, something waiting" : "settings"].join(", "),
  );
</script>

<Tooltip label={waiting ? "Something is waiting" : "Stars and settings"} hotkey={SETTINGS_HOTKEY}>
  <button
    type="button"
    onclick={() => settings.show(waiting ? "general" : undefined)}
    aria-label={label}
    class="press-sm hoverable relative flex shrink-0 items-center rounded-full {compact
      ? 'gap-1 py-0.5 pr-0.5 pl-1.5'
      : 'gap-1.5 py-1 pr-1 pl-2.5'}"
  >
    <StarGlyph size={compact ? 11 : 14} />
    {#if stars !== null}
      <span class="{compact ? 't-micro' : 't-label'} leading-none! text-fg tabular-nums">{stars}</span>
    {/if}
    <span
      class="t-micro flex items-center justify-center overflow-hidden rounded-full border border-line-strong
        bg-surface-alt text-fg-muted {compact ? 'size-[18px]' : 'size-7'}"
    >
      {#if auth.avatarUrl}
        <img src={auth.avatarUrl} alt="" class="size-full object-cover" />
      {:else}
        {initial}
      {/if}
    </span>
    {#if waiting}
      <span class="absolute -top-0.5 -right-0.5 size-2 rounded-full border border-surface bg-danger"></span>
    {/if}
  </button>
</Tooltip>
