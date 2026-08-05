<script lang="ts" generics="T extends string">
  /**
   * A quiet switch: the active option is inked and underscored, the rest recede.
   * No pill, no floating thumb — the ring is the only strong shape on screen.
   */
  let {
    options,
    value,
    onchange,
  }: { options: { value: T; label: string }[]; value: T; onchange: (value: T) => void } = $props();
</script>

<div class="flex gap-4" role="tablist">
  {#each options as option (option.value)}
    <button
      type="button"
      role="tab"
      aria-selected={option.value === value}
      onclick={() => onchange(option.value)}
      class="space-y-1.5 pb-1.5"
    >
      <span class="t-label block {option.value === value ? 'text-fg' : 'text-fg-faint'}">{option.label}</span>
      <span class="block h-0.5 rounded-full {option.value === value ? 'bg-ink' : 'bg-transparent'}"></span>
    </button>
  {/each}
</div>
