<script lang="ts">
  import { Check, Copy } from "lucide-svelte";

  /**
   * The one way the technical half of a failure leaves the device.
   *
   * A stack, a query, a status line: worth having when somebody is fixing it, worth nothing on
   * screen. Every place that shows a failure says one short sentence and puts the rest behind this.
   */
  let { text, label = "Copy details", size = 15 }: { text: () => string; label?: string; size?: number } = $props();

  let copied = $state(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text());
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      // A webview without clipboard permission. Nothing to say — the button simply doesn't confirm.
    }
  }
</script>

<button
  type="button"
  class="press-sm shrink-0 rounded-md p-1.5 text-fg-faint hover:text-fg"
  aria-label={copied ? "Copied" : label}
  title={copied ? "Copied" : label}
  onclick={() => void copy()}
>
  {#if copied}<Check {size} />{:else}<Copy {size} />{/if}
</button>
