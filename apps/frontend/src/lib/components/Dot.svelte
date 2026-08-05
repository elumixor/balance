<script lang="ts">
  let { color, size = 8 }: { color: string; size?: number } = $props();
</script>

<span class="inline-block shrink-0 rounded-full" style="width:{size}px;height:{size}px;background:{color}"></span>
