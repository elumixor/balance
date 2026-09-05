<script lang="ts">
  import StarGlyph from "./StarGlyph.svelte";

  /**
   * A number of stars, as the one pill: the glyph, then the count, on the quiet ground. What a
   * sitting pays, what a week earned, the badge in the rail, the rank on the recap — every count
   * in the app is this, so a star never reads differently from one screen to the next. It is
   * only ever the number: a payout and a total look the same, with no sign in front.
   *
   * `size` is the glyph's; the text and the padding follow it, so the pill is a caption at 11
   * and a headline at 28 without a second component.
   */
  let { value, size = 12, class: klass = "" }: { value: number; size?: number; class?: string } = $props();
  const rung = $derived(size >= 20 ? "t-data-strong" : size >= 13 ? "t-label" : "t-micro");
  const padding = $derived(size >= 20 ? "gap-1.5 px-3 py-1.5" : size >= 13 ? "gap-1 py-1 pr-2.5 pl-2" : "gap-1 py-0.5 pr-1.5 pl-1");
</script>

<span class="inline-flex items-center rounded-full bg-surface-alt whitespace-nowrap text-fg {padding} {klass}">
  <StarGlyph {size} />
  <span class="{rung} leading-none! tabular-nums">{value}</span>
</span>
