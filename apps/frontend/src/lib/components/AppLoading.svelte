<script lang="ts">
  import BrandMark from "./BrandMark.svelte";
</script>

<!--
  What the app shows while it works out who you are. A blank frame here would mean seconds
  of empty background on a cold web visit, since the shell is what the static build serves.
-->
<div class="flex min-h-dvh items-center justify-center bg-bg">
  <BrandMark size={56} />
</div>
