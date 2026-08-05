<script lang="ts">
  import AccountMenu from "$lib/components/AccountMenu.svelte";
  import Divider from "$lib/components/Divider.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import LoadError from "$lib/components/LoadError.svelte";
  import Panel from "$lib/components/Panel.svelte";
  import BalanceRing from "$lib/components/ring/BalanceRing.svelte";
  import ScreenTitle from "$lib/components/ScreenTitle.svelte";
  import SectionHeader from "$lib/components/SectionHeader.svelte";
  import Segmented from "$lib/components/Segmented.svelte";
  import SkeletonRows from "$lib/components/SkeletonRows.svelte";
  import { formatHoursAndMinutes } from "$lib/format";
  import { getCategories, getStats } from "$lib/queries";
  import CategoryRow from "$lib/stats/CategoryRow.svelte";
  import TrendRow from "$lib/stats/TrendRow.svelte";
  import type { Category, StatsResponse } from "$lib/types";

  type PeriodKind = "day" | "week" | "month";

  const PERIODS: { value: PeriodKind; label: string }[] = [
    { value: "day", label: "Today" },
    { value: "week", label: "This week" },
    { value: "month", label: "This month" },
  ];

  let period = $state<PeriodKind>("week");
  let data = $state<StatsResponse | null>(null);
  let categories = $state<Category[]>([]);
  let loading = $state(true);
  let loadError = $state<string | null>(null);

  async function load(kind: PeriodKind) {
    loading = true;
    try {
      const [stats, cats] = await Promise.all([getStats(kind), getCategories()]);
      data = stats;
      categories = cats;
      loadError = null;
    } catch (e) {
      loadError = e instanceof Error ? e.message : "Couldn't load your balance.";
    } finally {
      loading = false;
    }
  }

  $effect(() => void load(period));

  const bufferIds = $derived(new Set(categories.filter((c) => c.isBuffer).map((c) => c.id)));
  // Rest + Buffer is whatever the plan doesn't claim, so weighing it against a
  // target would be meaningless — it stays out of the ring and the list.
  const planned = $derived((data?.categories ?? []).filter((c) => !bufferIds.has(c.categoryId)));
  const trends = $derived((data?.trends ?? []).filter((t) => !bufferIds.has(t.categoryId)));
  const trackedHours = $derived(planned.reduce((sum, c) => sum + c.actualHours, 0));
  const plannedHours = $derived(planned.reduce((sum, c) => sum + c.targetHours, 0));
</script>

<div class="safe-top px-5 pt-4 pb-10">
  <ScreenTitle title="Balance">
    {#snippet trailing()}
      <AccountMenu />
    {/snippet}
  </ScreenTitle>

  <Segmented options={PERIODS} value={period} onchange={(value) => (period = value)} />

  {#if loadError && !data}
    <LoadError message={loadError} onretry={() => load(period)} />
  {:else if loading && !data}
    <div class="mt-6"><SkeletonRows count={5} /></div>
  {:else if planned.length === 0}
    <EmptyState title="Nothing to weigh yet." hint="Plan your week, then track a few hours against it." />
  {:else}
    <div class="mt-6 mb-3 flex justify-center">
      <BalanceRing
        slices={planned.map((c) => ({
          id: c.categoryId,
          label: c.name,
          color: c.color,
          targetHours: c.targetHours,
          actualHours: c.actualHours,
        }))}
        centerValue={formatHoursAndMinutes(trackedHours)}
        centerLabel="tracked of {formatHoursAndMinutes(plannedHours)} planned"
      />
    </div>

    <div class="mt-4">
      {#each planned as stat, i (stat.categoryId)}
        <div class="list-item-in" style="animation-delay:{Math.min(i, 8) * 35}ms">
          {#if i > 0}<Divider />{/if}
          <CategoryRow {stat} />
        </div>
      {/each}
    </div>

    {#if trends.length > 0}
      <div class="mt-6">
        <SectionHeader title="Last {data?.trendPeriodCount ?? trends[0].points.length} {period}s">
          {#snippet trailing()}
            <span class="t-micro text-fg-faint">line = target</span>
          {/snippet}
        </SectionHeader>
        <Panel>
          {#each trends as trend, i (trend.categoryId)}
            {#if i > 0}<Divider />{/if}
            <TrendRow {trend} />
          {/each}
        </Panel>
      </div>
    {/if}

    <p class="t-micro mt-4 text-fg-faint">Outer arc is your plan, inner arc is what you actually did.</p>
  {/if}
</div>
