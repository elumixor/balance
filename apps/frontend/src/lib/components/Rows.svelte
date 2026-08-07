<script lang="ts" generics="T">
  import type { Snippet } from "svelte";
  import Divider from "./Divider.svelte";

  /**
   * Every list in the app is the same list: hairline-separated rows that stagger in on
   * arrival. This owns that, so no screen re-derives the divider rule or the delay curve.
   */
  let {
    items,
    key,
    children,
    divider = true,
    /** Off for lists that arrive inside an already-animated container. */
    stagger = true,
  }: {
    items: T[];
    key: (item: T, index: number) => string;
    children: Snippet<[T, number]>;
    divider?: boolean;
    stagger?: boolean;
  } = $props();

  // The stagger caps out after eight rows — past that it reads as lag, not arrival.
  const delay = (index: number) => Math.min(index, 8) * 35;
</script>

{#each items as item, i (key(item, i))}
  <div class={stagger ? "list-item-in" : ""} style={stagger ? `animation-delay:${delay(i)}ms` : ""}>
    {#if divider && i > 0}<Divider />{/if}
    {@render children(item, i)}
  </div>
{/each}
