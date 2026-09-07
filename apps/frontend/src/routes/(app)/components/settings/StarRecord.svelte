<script lang="ts">
  import { StarCount, Tooltip } from "$lib/components";
  import type { StarProgress } from "$lib/planning/types";
  import { CalendarDays, ChevronDown } from "lucide-svelte";
  import SettingRow from "./SettingRow.svelte";

  /**
   * The record behind the count, folded away under a row of its own: four weeks of days and the
   * totals. The count and the two rows above are what the page is opened for; this is for the
   * days somebody wants to look.
   */
  let { progress }: { progress: StarProgress } = $props();

  let open = $state(false);

  const stats = $derived([
    { label: "Best streak", value: `${progress.bestStreak}d` },
    { label: "Days planned", value: `${progress.plannedDays}` },
    { label: "Planned ahead", value: `${progress.aheadDays}` },
    { label: "Rest days", value: `${progress.restDays}` },
    { label: "Weeks planned", value: `${progress.weeksPlanned}` },
    { label: "This week", value: progress.weekStars },
  ]);

  function dayLabel(day: string) {
    const [year, month, date] = day.split("-").map(Number);
    return new Date(year, month - 1, date).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  }
</script>

<SettingRow icon={CalendarDays} label="Record" onclick={() => (open = !open)}>
  <ChevronDown size={15} class="text-fg-faint transition-transform duration-150 {open ? 'rotate-180' : ''}" />
</SettingRow>

{#if open}
  <div class="px-1.5 pt-1 pb-3">
    <!-- Four weeks of days: lit when planned, green when planned the evening before. -->
    <div class="grid grid-cols-14 gap-1">
      {#each progress.recent as cell (cell.day)}
        <Tooltip label="{dayLabel(cell.day)}{cell.stars > 0 ? `, +${cell.stars} stars` : ''}">
          <span
            class="block aspect-square w-full rounded-sm {cell.planned
              ? cell.ahead
                ? 'bg-positive'
                : 'bg-ink'
              : 'bg-surface-alt'} {cell.rest ? 'opacity-50' : ''}"
          ></span>
        </Tooltip>
      {/each}
    </div>

    <dl class="mt-4 grid grid-cols-3 gap-x-4 gap-y-3">
      {#each stats as stat (stat.label)}
        <div>
          <dt class="t-micro text-fg-faint">{stat.label}</dt>
          <dd class="t-data">
            {#if typeof stat.value === "number"}<StarCount value={stat.value} size={13} />{:else}{stat.value}{/if}
          </dd>
        </div>
      {/each}
    </dl>
  </div>
{/if}
