<script lang="ts">
  import Skeleton from "./Skeleton.svelte";

  let { count = 4 }: { count?: number } = $props();
</script>

<div class="space-y-4">
  {#each Array.from({ length: count }, (_, i) => i) as i (i)}
    <div class="space-y-2">
      <Skeleton width={`${55 + ((i * 13) % 30)}%`} />
      <Skeleton width="35%" height={11} />
    </div>
  {/each}
</div>
