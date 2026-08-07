<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * On a phone the ring sits above its list and scrolls away with it. Given a wide window the
   * ring stops scrolling and parks in its own column, so the list moves underneath the shape
   * that explains it — which is the whole point of the ring.
   */
  let { aside, children }: { aside: Snippet; children: Snippet } = $props();
</script>

<div class="xl:grid xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)] xl:items-start xl:gap-12">
  <div class="flex flex-col items-center xl:sticky xl:top-10">
    {@render aside()}
  </div>
  <div class="min-w-0">
    {@render children()}
  </div>
</div>
