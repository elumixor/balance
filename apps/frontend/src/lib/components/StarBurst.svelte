<script lang="ts">
  import StarGlyph from "./StarGlyph.svelte";

  /**
   * Stars, arriving. The one moment the app is allowed to be loud: each star pops in after the
   * last, a ring spreads behind the row, and then it all settles into a rating anyone can read
   * at a glance — the lit ones filled, the rest drawn in outline so the row is always the same
   * width.
   */
  let {
    lit,
    of = lit,
    size = 36,
  }: {
    lit: number;
    /** How many stars the row holds; the unlit ones are outlines. */
    of?: number;
    size?: number;
  } = $props();

  const STAGGER_MS = 140;
</script>

<div class="relative flex items-center justify-center gap-3" role="img" aria-label="{lit} of {of} stars">
  <span class="star-halo" style="width:{size * of * 1.6}px;height:{size * 1.6}px"></span>
  {#each Array.from({ length: of }) as _, index (index)}
    <span class="star-pop relative" style="animation-delay:{index * STAGGER_MS}ms">
      <StarGlyph {size} lit={index < lit} />
    </span>
  {/each}
</div>

<style>
  .star-pop {
    animation: star-pop 520ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  @keyframes star-pop {
    from {
      opacity: 0;
      transform: scale(0.3) rotate(-30deg);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  .star-halo {
    position: absolute;
    border-radius: 999px;
    background: color-mix(in oklab, var(--ink) 14%, transparent);
    animation: star-halo 900ms ease-out both;
    animation-delay: 120ms;
    pointer-events: none;
  }
  @keyframes star-halo {
    from {
      opacity: 0.9;
      transform: scale(0.4);
    }
    to {
      opacity: 0;
      transform: scale(1.4);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .star-pop,
    .star-halo {
      animation: none;
    }
    .star-halo {
      opacity: 0;
    }
  }
</style>
