<script lang="ts">
  import { auth } from "$lib/auth.svelte";
  import { SETTINGS_HOTKEY } from "$lib/keys";
  import { settings } from "$lib/settings.svelte";
  import Tooltip from "./Tooltip.svelte";

  /**
   * The face of the account, and the way into settings — the same panel the hotkey opens, because
   * two doors onto one room should be one room.
   *
   * `compact` is for the rail, where it lines up beside the window buttons and wants their scale.
   * A finger needs the bigger one, a cursor doesn't.
   */
  let { compact = false }: { compact?: boolean } = $props();

  const initial = $derived((auth.email || "?").charAt(0).toUpperCase());
</script>

<!-- The name of the thing it opens, not whose account it is — the row's other icons say what they
     do, and the email is the first line inside the panel anyway. -->
<Tooltip label="Settings" hotkey={SETTINGS_HOTKEY}>
  <button
    type="button"
    onclick={() => settings.show()}
    aria-label="Settings"
    class="press-sm t-micro flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-line-strong bg-surface-alt text-fg-muted {compact
      ? 'size-[18px]'
      : 'size-7'}"
  >
    {#if auth.avatarUrl}
      <img src={auth.avatarUrl} alt="" class="size-full object-cover" />
    {:else}
      {initial}
    {/if}
  </button>
</Tooltip>
