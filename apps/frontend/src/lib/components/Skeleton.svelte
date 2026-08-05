<script lang="ts">
  let {
    width = "100%",
    height = 14,
    radius = 4,
  }: { width?: string | number; height?: number; radius?: number } = $props();

  const w = $derived(typeof width === "number" ? `${width}px` : width);
</script>

<div class="skeleton" style="width:{w};height:{height}px;border-radius:{radius}px"></div>
