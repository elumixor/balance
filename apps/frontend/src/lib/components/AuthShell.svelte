<script lang="ts">
  import type { Snippet } from "svelte";
  import BrandMark from "./BrandMark.svelte";

  let { tagline, children }: { tagline?: string; children: Snippet } = $props();
</script>

<!--
  On a phone this is one centred column: mark, name and form are a single group the page
  centres as a whole, so neither half drifts to an edge. The safe insets sit on the outer
  wrapper rather than the panels, because on a wide window this becomes a two-part page —
  the week itself, already divided, on the left, and the form on the right — and there the
  surface has to reach the edges of the screen.
-->
<div
  class="flex min-h-dvh flex-col justify-center bg-bg max-lg:safe-top max-lg:safe-bottom lg:flex-row"
>
  <div
    class="flex flex-col items-center border-line px-5 pt-6 pb-8 max-lg:text-center
      lg:flex-1 lg:justify-center lg:border-r lg:bg-surface lg:px-12 lg:py-12"
  >
    <div class="space-y-4 lg:max-w-sm lg:space-y-8">
      <!-- The mark is an <img>, which preflight makes display:block — text-center can't reach it. -->
      <div class="flex justify-center lg:hidden"><BrandMark size={44} /></div>
      <div class="hidden lg:block"><BrandMark size={200} /></div>
      <div class="space-y-1 lg:space-y-2">
        <h1 class="t-title">Balance</h1>
        {#if tagline}<p class="t-body text-fg-muted">{tagline}</p>{/if}
      </div>
    </div>
  </div>

  <div class="flex flex-col px-5 pb-6 lg:flex-1 lg:justify-center lg:px-12 lg:py-12">
    <div class="w-full space-y-6 lg:mx-auto lg:max-w-sm">
      {@render children()}
    </div>
  </div>
</div>
