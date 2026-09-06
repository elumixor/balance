<script lang="ts">
  import { Button, Dialog, Dot, NumberField } from "$lib/components";
import type { WeekNote } from "$lib/projects/assist";
  import { restColor } from "$lib/ui/colors";
  import { formatClock, formatDayDate, formatHoursDecimal } from "$lib/ui/format";
  import { projectsData } from "$lib/projects/projects-data.svelte";
  import { assistWeek } from "$lib/core/queries";
  import { comparisons, projects } from "$lib/core/synced.svelte";
  import type { Category } from "$lib/core/records";
  import { rankOrder } from "$lib/projects/ranking";
  import { X } from "lucide-svelte";
  import { calendarData } from "$lib/calendar/calendar-data.svelte";
  import { DEFAULT_FILL, type FillBlock, fillWeek, freeSlots } from "$lib/calendar/filler";
  import { projectHours } from "$lib/calendar/project-hours";

  /**
   * The coming week, proposed: each live project's remaining claim laid into the free working
   * hours by a solver, shown as a list of blocks to accept, trim or throw out. Nothing lands on
   * the calendar until the button — and the model, when there is one, only writes the note along
   * the top about what to drop when the week is short.
   */
  let { open, onclose, categories }: { open: boolean; onclose: () => void; categories: readonly Category[] } = $props();

  const data = calendarData;
  const colorOf = $derived(new Map(categories.map((c) => [c.id, c.color])));

  let dayStart = $state(DEFAULT_FILL.dayStart);
  let dayEnd = $state(DEFAULT_FILL.dayEnd);
  let removed = $state(new Set<string>());
  let note = $state<WeekNote | null>(null);
  let placing = $state(false);

  const weekStart = $derived(data.weekStart);
  const now = $derived(new Date());
  const busy = $derived(
    data.events
      .filter((e) => e.countsTowardHours && !e.declined)
      .map((e) => ({ start: new Date(e.start), end: new Date(e.end) })),
  );

  /** Claims in rank order, less what the week already holds for each. */
  const wants = $derived.by(() => {
    const totals = projectHours(data.eventsForTotals, projects.all, weekStart);
    const order = rankOrder(
      totals.map((t) => t.id),
      comparisons.all,
      "priority",
    );
    return order
      .map((id) => totals.find((t) => t.id === id))
      .filter((t): t is NonNullable<typeof t> => Boolean(t))
      .map((t) => ({ id: t.id, hours: Math.max(0, t.claimedHours - t.actualHours), name: t.name, categoryId: t.categoryId, claimed: t.claimedHours, logged: t.actualHours }));
  });

  const free = $derived(freeSlots({ ...DEFAULT_FILL, weekStart, from: now, busy, dayStart, dayEnd }));
  const freeHours = $derived(free.reduce((sum, s) => sum + (s.end.getTime() - s.start.getTime()) / 3_600_000, 0));
  const proposed = $derived(fillWeek({ ...DEFAULT_FILL, weekStart, from: now, busy, wants, dayStart, dayEnd }));
  const kept = $derived(proposed.filter((b) => !removed.has(keyOf(b))));
  const wanted = $derived(wants.reduce((sum, w) => sum + w.hours, 0));
  const placed = $derived(kept.reduce((sum, b) => sum + (b.end.getTime() - b.start.getTime()) / 3_600_000, 0));

  const keyOf = (b: FillBlock) => `${b.id}:${b.start.getTime()}`;
  const nameOf = (id: string) => wants.find((w) => w.id === id)?.name || "Untitled project";
  const colorFor = (id: string) => colorOf.get(wants.find((w) => w.id === id)?.categoryId ?? "") ?? restColor;

  // The note is asked for once per opening, and only when there is something to say about.
  $effect(() => {
    if (!open) return;
    removed = new Set();
    note = null;
    if (wants.length === 0) return;
    void assistWeek({
      freeHours: Math.round(freeHours * 4) / 4,
      projects: wants.map((w, i) => ({ id: w.id, name: w.name, claimed: w.claimed, logged: w.logged, priority: i + 1 })),
      fixed: data.events.filter((e) => e.countsTowardHours && new Date(e.end) > now).map((e) => e.title).slice(0, 20),
    })
      .then((r) => {
        if (r.available) note = r.suggestion;
      })
      .catch(() => undefined);
  });

  /** Accepts the list as it stands: one block at a time, each its own step of undo. */
  async function accept() {
    placing = true;
    try {
      for (const block of kept) {
        const source = data.sourceForProject(block.id);
        if (source) await data.placeBlock(source, block.start, block.end);
      }
    } finally {
      placing = false;
      onclose();
    }
  }

  const byDay = $derived.by(() => {
    const groups = new Map<string, FillBlock[]>();
    for (const b of kept) {
      const key = b.start.toDateString();
      groups.set(key, [...(groups.get(key) ?? []), b]);
    }
    return [...groups.entries()];
  });
</script>

<Dialog title="Plan the week" {open} {onclose}>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <label class="t-micro flex items-center gap-1.5 text-fg-muted">
        from <NumberField value={dayStart} unit="h" inputmode="numeric" ariaLabel="Day starts" onchange={(v) => (dayStart = Math.max(0, Math.min(23, Math.round(v))))} />
      </label>
      <label class="t-micro flex items-center gap-1.5 text-fg-muted">
        to <NumberField value={dayEnd} unit="h" inputmode="numeric" ariaLabel="Day ends" onchange={(v) => (dayEnd = Math.max(dayStart + 1, Math.min(24, Math.round(v))))} />
      </label>
      <span class="t-micro text-fg-faint">{formatHoursDecimal(freeHours)} free · {formatHoursDecimal(wanted)} wanted</span>
    </div>

    {#if note}
      <div class="space-y-1 rounded-md bg-surface-alt px-3 py-2">
        <p class="t-label text-fg">{note.note}</p>
        {#each note.drop as d (d.projectId)}
          <p class="t-micro text-fg-muted">{nameOf(d.projectId)}: {formatHoursDecimal(d.hours)} this week — {d.why}</p>
        {/each}
      </div>
    {/if}

    {#if wants.length === 0}
      <p class="t-label text-fg-muted">Every live project already has its hours this week.</p>
    {:else if proposed.length === 0}
      <p class="t-label text-fg-muted">No free working hours left this week to put them in.</p>
    {/if}

    {#each byDay as [day, blocks] (day)}
      <div class="space-y-1">
        <p class="t-micro text-fg-faint">{formatDayDate(blocks[0].start)}</p>
        {#each blocks as block (keyOf(block))}
          <div class="flex items-center gap-2">
            <Dot color={colorFor(block.id)} size={6} />
            <span class="t-label min-w-0 flex-1 truncate text-fg">{nameOf(block.id)}</span>
            <span class="t-micro shrink-0 tabular-nums text-fg-muted">{formatClock(block.start)}–{formatClock(block.end)}</span>
            <Button variant="bare" title="Leave this one out" onclick={() => (removed = new Set([...removed, keyOf(block)]))}>
              {#snippet icon()}<X size={13} class="text-fg-faint" />{/snippet}
            </Button>
          </div>
        {/each}
      </div>
    {/each}

    <div class="flex items-center justify-between gap-2">
      <span class="t-micro text-fg-faint">{kept.length} blocks · {formatHoursDecimal(placed)}</span>
      <div class="flex gap-2">
        <Button size="sm" variant="outline" label="Not now" onclick={onclose} />
        <Button size="sm" label="Put them on the week" disabled={kept.length === 0} loading={placing} onclick={accept} />
      </div>
    </div>
  </div>
</Dialog>
