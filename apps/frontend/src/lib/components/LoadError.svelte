<script lang="ts">
  import Button from "./Button.svelte";
  import Panel from "./Panel.svelte";

  /** Shown when a screen's data never arrived. Says what happened and offers the fix. */
  let { message, onretry }: { message?: string | null; onretry: () => void } = $props();
</script>

<Panel>
  <div class="flex flex-col items-start gap-3">
    <div class="space-y-1">
      <p class="t-body">Couldn't load your data</p>
      <p class="t-label text-fg-muted">{message ?? "Something went wrong on the way to the server."}</p>
    </div>
    <Button label="Try again" variant="outline" size="sm" onclick={onretry} />
  </div>
</Panel>
