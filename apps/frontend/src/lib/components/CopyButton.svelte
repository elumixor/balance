<script lang="ts">
  import { Check, Copy } from "lucide-svelte";
  import { onDestroy } from "svelte";

  /**
   * The one way the technical half of a failure leaves the device.
   *
   * A stack, a query, a status line: worth having when somebody is fixing it, worth nothing on
   * screen. Every place that shows a failure says one short sentence and puts the rest behind this.
   */
  let {
    text,
    label = "Copy details",
    size = 15,
    /** How much room around the glyph — a guest line wants less than a failure card. */
    class: klass = "p-1.5",
  }: { text: () => string; label?: string; size?: number; class?: string } = $props();

  /** How long the tick stays before the button offers to copy again. */
  const CONFIRM_MS = 1500;

  let copied = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text());
      copied = true;
      clearTimeout(timer);
      timer = setTimeout(() => (copied = false), CONFIRM_MS);
    } catch {
      // A webview without clipboard permission. Nothing to say — the button simply doesn't confirm.
    }
  }

  onDestroy(() => clearTimeout(timer));
</script>

<button
  type="button"
  class="press-sm shrink-0 rounded-md text-fg-faint hover:text-fg {klass}"
  aria-label={copied ? "Copied" : label}
  title={copied ? "Copied" : label}
  onclick={() => void copy()}
>
  {#if copied}<Check {size} />{:else}<Copy {size} />{/if}
</button>
