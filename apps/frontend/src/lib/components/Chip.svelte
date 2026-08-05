<script lang="ts">
  let {
    label,
    selected = false,
    onclick,
  }: { label: string; selected?: boolean; onclick: () => void } = $props();
</script>

<button
  type="button"
  {onclick}
  aria-label={label}
  aria-pressed={selected}
  class="press t-label rounded-md border px-3 py-1.5 {selected
    ? 'border-ink bg-ink text-ink-fg'
    : 'border-line bg-surface text-fg'}"
>
  {label}
</button>
