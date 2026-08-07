<script lang="ts" generics="T extends string">
  /**
   * A quiet switch: the active option is inked and underscored, the rest recede.
   * No pill, no floating thumb — the ring is the only strong shape on screen.
   *
   * An option carrying an `href` is a real link, so a section of a screen can be its own
   * address without growing a second navigation style.
   */
  let {
    options,
    value,
    onchange,
  }: {
    options: { value: T; label: string; href?: string }[];
    value: T;
    onchange?: (value: T) => void;
  } = $props();
</script>

{#snippet body(option: { value: T; label: string })}
  {@const active = option.value === value}
  <span class="t-label block {active ? 'text-fg' : 'text-fg-faint'}">{option.label}</span>
  <span class="block h-0.5 rounded-full {active ? 'bg-ink' : 'bg-transparent'}"></span>
{/snippet}

<div class="flex gap-4" role="tablist">
  {#each options as option (option.value)}
    {#if option.href}
      <a href={option.href} role="tab" aria-selected={option.value === value} class="space-y-1.5 pb-1.5">
        {@render body(option)}
      </a>
    {:else}
      <button
        type="button"
        role="tab"
        aria-selected={option.value === value}
        onclick={() => onchange?.(option.value)}
        class="space-y-1.5 pb-1.5"
      >
        {@render body(option)}
      </button>
    {/if}
  {/each}
</div>
