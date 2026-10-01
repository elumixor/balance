import type { TaskPriority, TaskStatus } from "~/db/schema";

/** A property value as Notion sends it: a tagged union this file is the only reader of. */
type Property = Record<string, unknown> & { type?: string };

/** Every text-ish property reduced to the words in it — titles, rich text, and nothing else. */
export function plainText(property: Property | undefined): string {
  if (!property) return "";
  const runs = (property.title ?? property.rich_text) as { plain_text?: string }[] | undefined;
  if (Array.isArray(runs)) return runs.map((run) => run.plain_text ?? "").join("");
  return "";
}

export function selectName(property: Property | undefined): string {
  const value = (property?.select ?? property?.status) as { name?: string } | null | undefined;
  return value?.name ?? "";
}

export function relationIds(property: Property | undefined): string[] {
  const relation = property?.relation as { id: string }[] | undefined;
  if (Array.isArray(relation)) return relation.map((entry) => entry.id);
  const people = property?.people as { id: string }[] | undefined;
  return Array.isArray(people) ? people.map((entry) => entry.id) : [];
}

/**
 * A date property as two days. A single date ends the day it starts — a bar with no width is a
 * bar nobody can see — and a time of day is dropped: the timeline's unit is a day.
 */
export function dateOf(property: Property | undefined): { startsOn: string | null; endsOn: string | null } {
  const date = property?.date as { start?: string | null; end?: string | null } | null | undefined;
  const start = date?.start?.slice(0, 10) ?? null;
  if (!start) return { startsOn: null, endsOn: null };
  return { startsOn: start, endsOn: date?.end?.slice(0, 10) ?? start };
}

const PRIORITIES: Record<string, TaskPriority> = {
  low: "low",
  medium: "medium",
  normal: "medium",
  high: "high",
  critical: "critical",
  urgent: "critical",
};

export function priorityOf(label: string): TaskPriority | null {
  return PRIORITIES[label.trim().toLowerCase()] ?? null;
}

/**
 * Where a task is, from the column it sits in and the group that column belongs to.
 *
 * The group is what carries the meaning — a board can call its last column anything — and the
 * name only decides between the two ways a board can be finished with something: done, or
 * dropped. A column in no group at all is read by its own name, which is how a plain select
 * property standing in for a status still lands somewhere sensible.
 */
export function taskStatus(label: string, group: string | null): TaskStatus {
  const name = label.trim().toLowerCase();
  if (/reject|cancel|won't|wont|drop/.test(name)) return "dropped";
  if (/block/.test(name)) return "blocked";
  switch (group) {
    case "complete":
      return "done";
    case "in_progress":
      return "doing";
    case "to_do":
      return "todo";
    default:
      break;
  }
  if (/done|complete|shipped|closed/.test(name)) return "done";
  if (/progress|doing|review|test/.test(name)) return "doing";
  return "todo";
}

/** Text that lists people, "Ana, Bo" — a formula's answer or a select's options. */
const NAME_LIST = /\s*,\s*/;

/**
 * Who a row says it is for, as keys a filter can match: ids where the property names Notion users
 * or pages of people, and the names themselves where it only has words — a formula, a select.
 */
export function assigneeKeys(property: Property | undefined): string[] {
  switch (property?.type) {
    case "people":
    case "relation":
      return relationIds(property);
    case "created_by":
      return [(property.created_by as { id?: string } | undefined)?.id ?? ""].filter(Boolean);
    case "select":
      return [selectName(property)].filter(Boolean);
    case "multi_select":
      return ((property.multi_select ?? []) as { name: string }[]).map((one) => one.name);
    case "formula": {
      const text = (property.formula as { string?: string | null } | undefined)?.string ?? "";
      return text.split(NAME_LIST).filter(Boolean);
    }
    default:
      return [];
  }
}
