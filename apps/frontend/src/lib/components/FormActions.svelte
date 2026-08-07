<script lang="ts">
  import Button from "./Button.svelte";

  /**
   * Both inline editors end the same way. On a phone the pair splits the width so either is a
   * thumb target; given room they shrink and sit at the right, where a form ends.
   */
  let {
    oncancel,
    onsave,
    saveLabel = "Save",
    saving = false,
    disabled = false,
  }: {
    oncancel: () => void;
    onsave: () => void;
    saveLabel?: string;
    saving?: boolean;
    disabled?: boolean;
  } = $props();
</script>

<div class="flex gap-2 md:justify-end">
  <Button label="Cancel" variant="outline" onclick={oncancel} class="flex-1 md:flex-none md:px-6" />
  <Button label={saveLabel} onclick={onsave} loading={saving} {disabled} class="flex-1 md:flex-none md:px-6" />
</div>
