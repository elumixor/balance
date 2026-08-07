<script lang="ts">
  /** The product's own artefact: a wheel, balanced on every side. */
  let { size = 44 }: { size?: number } = $props();
</script>

<img src="/favicon.png" alt="" width={size} height={size} aria-hidden="true" />
