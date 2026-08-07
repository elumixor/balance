<script lang="ts">
  import type { Snippet } from "svelte";
  import BrandMark from "./BrandMark.svelte";

  let { tagline, children }: { tagline: string; children: Snippet } = $props();
</script>

<!--
  On a phone this is one centred column. Given a wide window it becomes a two-part page: the
  week itself, already divided, on the left, and the form on the right — the same ring that
  runs the app, used once at poster scale.
-->
<div class="flex min-h-dvh flex-col bg-bg lg:flex-row">
  <div
    class="flex flex-col justify-center gap-6 border-line px-5 pt-12 pb-6
      lg:flex-1 lg:items-center lg:border-r lg:bg-surface lg:px-12 lg:py-12"
  >
    <div class="space-y-4 lg:max-w-sm lg:space-y-8">
      <div class="lg:hidden"><BrandMark size={44} /></div>
      <div class="hidden lg:block"><BrandMark size={200} /></div>
      <div class="space-y-1 lg:space-y-2">
        <h1 class="t-title">Balance</h1>
        <p class="t-body text-fg-muted">{tagline}</p>
      </div>
    </div>
  </div>

  <div class="flex flex-1 flex-col justify-center px-5 pt-2 pb-10 lg:px-12 lg:py-12">
    <div class="w-full space-y-6 lg:mx-auto lg:max-w-sm">
      {@render children()}
    </div>
  </div>
</div>
