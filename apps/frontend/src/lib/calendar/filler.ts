import { addDays, DAYS_PER_WEEK, startOfDay } from "$lib/dates";

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;

/** Something on the week already, whatever it is for. */
export interface Busy {
  readonly start: Date;
  readonly end: Date;
}

/** A project that still wants hours on this week. */
export interface Want {
  readonly id: string;
  /** Hours still owed this week: the claim less what is already booked or logged. */
  readonly hours: number;
}

export interface FillOptions {
  readonly weekStart: Date;
  /** Nothing is placed before this — the past is not free. */
  readonly from: Date;
  readonly busy: readonly Busy[];
  /** In rank order: when the free slots run out, the tail goes short. */
  readonly wants: readonly Want[];
  /** Working hours, as hours into the day. */
  readonly dayStart: number;
  readonly dayEnd: number;
  /** Days of the week that take blocks, 0 is Sunday. */
  readonly workdays: readonly number[];
  /** The longest block placed in one go. */
  readonly maxBlockHours: number;
  readonly slotMinutes: number;
}

export interface FillBlock {
  readonly id: string;
  readonly start: Date;
  readonly end: Date;
}

export const DEFAULT_FILL = {
  dayStart: 9,
  dayEnd: 18,
  workdays: [1, 2, 3, 4, 5],
  maxBlockHours: 2,
  slotMinutes: 30,
} satisfies Pick<FillOptions, "dayStart" | "dayEnd" | "workdays" | "maxBlockHours" | "slotMinutes">;

/**
 * Puts each project's remaining hours into the free slots of the week — a solver, not a prompt.
 * The free time is walked once, in order; the projects take turns in rank order, one block at a
 * time, so a short week shortens the tail rather than starving one project entirely. Deterministic
 * for the same inputs, which is what makes it a proposal that can be read before it is accepted.
 */
export function fillWeek(options: FillOptions): FillBlock[] {
  const free = freeSlots(options);
  const owed = new Map(options.wants.filter((w) => w.hours > 0).map((w) => [w.id, w.hours]));
  const order = options.wants.map((w) => w.id).filter((id) => owed.has(id));
  const blocks: FillBlock[] = [];
  let turn = 0;

  for (const slot of free) {
    let cursor = slot.start.getTime();
    while (cursor < slot.end.getTime() && owed.size > 0) {
      const id = order[turn % order.length];
      turn++;
      // `order` only ever holds ids still owed, so the lookup cannot miss.
      const left = owed.get(id) as number;
      const room = (slot.end.getTime() - cursor) / MS_PER_HOUR;
      const hours = Math.min(left, options.maxBlockHours, room);
      const length = Math.floor((hours * 60) / options.slotMinutes) * options.slotMinutes;
      if (length <= 0) break;
      const end = cursor + length * MS_PER_MINUTE;
      blocks.push({ id, start: new Date(cursor), end: new Date(end) });
      cursor = end;
      const remaining = left - length / 60;
      if (remaining < options.slotMinutes / 60) {
        owed.delete(id);
        order.splice(order.indexOf(id), 1);
        if (order.length === 0) break;
        turn = turn % order.length;
      } else owed.set(id, remaining);
    }
    if (owed.size === 0) break;
  }
  return blocks;
}

/** The working hours of the week with everything busy cut out, in order, never before `from`. */
export function freeSlots(
  options: Pick<FillOptions, "weekStart" | "from" | "busy" | "dayStart" | "dayEnd" | "workdays">,
): Busy[] {
  const busy = [...options.busy].sort((a, b) => a.start.getTime() - b.start.getTime());
  const slots: Busy[] = [];
  for (let day = 0; day < DAYS_PER_WEEK; day++) {
    const date = addDays(startOfDay(options.weekStart), day);
    if (!options.workdays.includes(date.getDay())) continue;
    let cursor = Math.max(date.getTime() + options.dayStart * MS_PER_HOUR, options.from.getTime());
    const end = date.getTime() + options.dayEnd * MS_PER_HOUR;
    for (const b of busy) {
      if (b.end.getTime() <= cursor || b.start.getTime() >= end) continue;
      if (b.start.getTime() > cursor) slots.push({ start: new Date(cursor), end: b.start });
      cursor = Math.max(cursor, b.end.getTime());
    }
    if (cursor < end) slots.push({ start: new Date(cursor), end: new Date(end) });
  }
  return slots;
}
