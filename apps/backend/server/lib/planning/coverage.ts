/**
 * How full a day is, and how closely a day or a week went the way it was drawn.
 *
 * Three numbers, all in 0..1, all pure. They decide whether the commit button unlocks and what the
 * bonuses pay, so they are kept apart from everything that reads a database or a calendar.
 */

/** An hour only counts once it has been given a meaning — see `coverage`. */
export interface MappedHours {
  /** Hours of the day that belong to some category. */
  hours: number;
}

/** What a day has to reach before it counts as planned, unless the user has said otherwise. */
export const DEFAULT_COVERAGE_THRESHOLD = 0.7;

/**
 * The share of the day's budget that has been given a meaning.
 *
 * Only *mapped* hours count. A calendar full of meetings other people booked is not a planned day
 * — deciding what those meetings are for is the work, and it is the same work whether the block
 * came from you or from somebody's invitation.
 *
 * The budget is the ring's claimed hours divided by seven rather than the whole waking day: the
 * ring is already the user's own answer to how much of their life they mean to direct, and asking
 * for more than that on a Tuesday is asking them to fail.
 */
export function coverage(options: { mappedHours: number; weeklyClaimedHours: number }) {
  const target = options.weeklyClaimedHours / 7;
  if (target <= 0) return 0;
  return clamp(options.mappedHours / target);
}

/** A category's week, as the stats already work it out. */
export interface CategoryTarget {
  targetHours: number;
  actualHours: number;
  isBuffer: boolean;
}

/**
 * How much of the week landed where it was meant to, weighted by how much was asked of each
 * category.
 *
 * Deliberately not symmetric: `min(actual, target)` means overshooting a category you wanted more
 * of costs nothing, while missing one costs in proportion. The buffer is skipped — it is the
 * hours nobody claimed, and rewarding time spent in it would reward not planning.
 */
export function balanceMatch(categories: readonly CategoryTarget[]) {
  let asked = 0;
  let met = 0;
  for (const category of categories) {
    if (category.isBuffer || category.targetHours <= 0) continue;
    asked += category.targetHours;
    met += Math.min(category.actualHours, category.targetHours);
  }
  if (asked <= 0) return 0;
  return clamp(met / asked);
}

/** A block, either as it was drawn at commit time or as the day actually ended up. */
export interface Block {
  start: number;
  end: number;
  categoryId: string | null;
}

/**
 * How much of the day you drew actually happened, as overlapping minutes over planned minutes.
 *
 * Matched by category and by clock, not by event id: moving the gym an hour later is most of a
 * kept promise, and replacing one block with another of the same category is the whole of one.
 * An unmapped block can't match anything — its promise was never specific enough to keep.
 */
export function scheduleMatch(planned: readonly Block[], actual: readonly Block[]) {
  let promised = 0;
  let kept = 0;

  for (const block of planned) {
    const minutes = span(block);
    if (minutes <= 0 || !block.categoryId) continue;
    promised += minutes;

    // Per planned block rather than per pair: two actual blocks covering the same planned hour
    // are one kept hour, and counting the overlap twice would pay for a double booking.
    const covered = merge(actual.filter((other) => other.categoryId === block.categoryId));
    for (const other of covered) kept += overlap(block, other);
  }

  if (promised <= 0) return 0;
  return clamp(kept / promised);
}

function span(block: Block) {
  return Math.max(0, block.end - block.start);
}

function overlap(a: Block, b: Block) {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

/** Overlapping blocks of one category flattened into the stretches of time they cover. */
function merge(blocks: readonly Block[]): Block[] {
  const sorted = [...blocks].filter((block) => span(block) > 0).sort((a, b) => a.start - b.start);
  const merged: Block[] = [];
  for (const block of sorted) {
    const last = merged.at(-1);
    if (last && block.start <= last.end) last.end = Math.max(last.end, block.end);
    else merged.push({ ...block });
  }
  return merged;
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}
