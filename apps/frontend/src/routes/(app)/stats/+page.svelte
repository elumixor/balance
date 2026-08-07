<script lang="ts">
  import ConnectCard from "$lib/calendar/ConnectCard.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import LoadError from "$lib/components/LoadError.svelte";
  import Panel from "$lib/components/Panel.svelte";
  import BalanceRing from "$lib/components/ring/BalanceRing.svelte";
  import Rows from "$lib/components/Rows.svelte";
  import Screen from "$lib/components/Screen.svelte";
  import SectionHeader from "$lib/components/SectionHeader.svelte";
  import Segmented from "$lib/components/Segmented.svelte";
  import SkeletonRows from "$lib/components/SkeletonRows.svelte";
  import SplitPane from "$lib/components/SplitPane.svelte";
  import { formatHoursAndMinutes } from "$lib/format";
  import CategoryRow from "$lib/stats/CategoryRow.svelte";
  import { statsFor, store, type PeriodKind } from "$lib/store.svelte";
  import TrendRow from "$lib/stats/TrendRow.svelte";
  import { viewport } from "$lib/viewport.svelte";

  const PERIODS: { value: PeriodKind; label: string }[] = [
    { value: "day", label: "Today" },
    { value: "week", label: "This week" },
    { value: "month", label: "This month" },
  ];

  let period = $state<PeriodKind>("week");

  // Each period keeps its own answer, so flipping back to one already seen is instant.
  const stats = $derived(statsFor(period));
  const data = $derived(stats.value ?? null);
  const categories = $derived(store.categories.value ?? []);
  const loadError = $derived(stats.error ?? store.categories.error);

  const load = (kind: PeriodKind) => Promise.all([statsFor(kind).ensure(), store.categories.ensure()]);
  const retry = () => Promise.all([stats.refresh(), store.categories.refresh()]);

  $effect(() => void load(period));

  const bufferIds = $derived(new Set(categories.filter((c) => c.isBuffer).map((c) => c.id)));
  // Rest + Buffer is whatever the plan doesn't claim, so weighing it against a
  // target would be meaningless — it stays out of the ring and the list.
  const planned = $derived((data?.categories ?? []).filter((c) => !bufferIds.has(c.categoryId)));
  const trends = $derived((data?.trends ?? []).filter((t) => !bufferIds.has(t.categoryId)));
  const trackedHours = $derived(planned.reduce((sum, c) => sum + c.actualHours, 0));
  const plannedHours = $derived(planned.reduce((sum, c) => sum + c.targetHours, 0));
</script>

<Screen title="Balance" wide>
  <Segmented options={PERIODS} value={period} onchange={(value) => (period = value)} />

  {#if loadError && !data}
    <div class="mt-6"><LoadError message={loadError} onretry={retry} /></div>
  {:else if !data}
    <div class="mt-6"><SkeletonRows count={5} /></div>
  {:else if !data.connected}
    <!-- Actual hours come from the calendar, so without one there is nothing to weigh a plan against. -->
    <div class="mt-6"><ConnectCard needsReconnect={data.needsReconnect} /></div>
  {:else if planned.length === 0}
    <EmptyState title="Nothing to weigh yet." hint="Plan your week, then put a few hours in your calendar." />
  {:else}
    <div class="mt-6">
      <SplitPane>
        {#snippet aside()}
          <BalanceRing
            slices={planned.map((c) => ({
              id: c.categoryId,
              label: c.name,
              color: c.color,
              targetHours: c.targetHours,
              actualHours: c.actualHours,
            }))}
            size={viewport.xl ? 300 : 236}
            centerValue={formatHoursAndMinutes(trackedHours)}
            centerLabel="tracked of {formatHoursAndMinutes(plannedHours)} planned"
          />
          <p class="t-micro mt-5 max-w-[34ch] text-center text-fg-faint">
            Outer arc is your plan, inner arc is what you actually did.
          </p>
        {/snippet}

        <div class="mt-6 xl:mt-0">
          <Rows items={planned} key={(stat) => stat.categoryId}>
            {#snippet children(stat)}
              <CategoryRow {stat} />
            {/snippet}
          </Rows>

          {#if trends.length > 0}
            <div class="mt-8">
              <SectionHeader title="Last {data?.trendPeriodCount ?? trends[0].points.length} {period}s">
                {#snippet trailing()}
                  <span class="t-micro text-fg-faint">line = target</span>
                {/snippet}
              </SectionHeader>
              <Panel>
                <Rows items={trends} key={(trend) => trend.categoryId} stagger={false}>
                  {#snippet children(trend)}
                    <TrendRow {trend} />
                  {/snippet}
                </Rows>
              </Panel>
            </div>
          {/if}
        </div>
      </SplitPane>
    </div>
  {/if}
</Screen>
