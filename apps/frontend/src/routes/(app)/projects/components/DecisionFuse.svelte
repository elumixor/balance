<script lang="ts">
  import { restColor } from "$lib/colors";
  import { addDaysKey, checkpointsBetween, daysBetweenKeys, EXTENSION_DAYS } from "$lib/projects/decide-on";

  /**
   * The stage as a burning fuse: the line runs from the day it started to the day it will be
   * decided, filled in the sphere's colour as far as today has got. A tick every fortnight is a
   * checkpoint; the dashed tail is the one extension, if it was taken. Read in a glance, and the
   * same width on every card, so a row of cards compares how far along each one is.
   */
  let {
    startedOn,
    decideOn,
    extendedOn,
    today,
    color,
  }: { startedOn: string; decideOn: string; extendedOn: string | null; today: string; color: string } = $props();

  const total = $derived(Math.max(1, daysBetweenKeys(startedOn, decideOn)));
  const elapsed = $derived(Math.max(0, Math.min(1, daysBetweenKeys(startedOn, today) / total)));
  const overdue = $derived(daysBetweenKeys(decideOn, today) > 0);
  const ticks = $derived(checkpointsBetween(startedOn, decideOn).map((day) => daysBetweenKeys(startedOn, day) / total));
  /** Where the original date sat, when the tail past it is the extension. */
  const extensionFrom = $derived(
    extendedOn ? daysBetweenKeys(startedOn, addDaysKey(decideOn, -EXTENSION_DAYS)) / total : null,
  );
</script>

<svg viewBox="0 0 100 8" preserveAspectRatio="none" class="block h-2 w-full" aria-hidden="true">
  <line x1="0" y1="4" x2="100" y2="4" stroke={restColor} stroke-opacity="0.35" stroke-width="1.5" />
  {#if extensionFrom !== null}
    <line
      x1={extensionFrom * 100}
      y1="4"
      x2="100"
      y2="4"
      stroke={restColor}
      stroke-opacity="0.35"
      stroke-width="3"
      stroke-dasharray="1.5 1.5"
    />
  {/if}
  <line x1="0" y1="4" x2={elapsed * 100} y2="4" stroke={overdue ? "var(--danger)" : color} stroke-width="1.5" />
  {#each ticks as tick (tick)}
    <line
      x1={tick * 100}
      y1="1"
      x2={tick * 100}
      y2="7"
      stroke={tick <= elapsed ? color : restColor}
      stroke-opacity={tick <= elapsed ? 1 : 0.5}
      stroke-width="0.8"
      vector-effect="non-scaling-stroke"
    />
  {/each}
  <circle cx={elapsed * 100} cy="4" r="2.2" fill={overdue ? "var(--danger)" : color} />
</svg>
