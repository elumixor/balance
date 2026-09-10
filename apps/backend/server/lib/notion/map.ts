import type { ProjectField, TaskPriority, TaskStatus } from "~/db/schema";

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

/** The icons the panel draws beside a field, by what kind of value it holds. */
const FIELD_ICONS: Record<ProjectField["type"], string> = {
  date: "calendar",
  number: "hash",
  url: "link",
  text: "align-left",
};

/**
 * The panel to the right of a project's name: every property that says something, in the order
 * Notion lists them. Relations and rollups are left out — a project's people and its tasks are
 * drawn as people and tasks, and a row saying "Tasks: 47 pages" is not a field anybody reads.
 */
export function fieldsOf(properties: Record<string, unknown>, skip: readonly string[] = []): ProjectField[] {
  const skipped = new Set(skip.map((name) => name.toLowerCase()));
  const fields: ProjectField[] = [];
  for (const [label, raw] of Object.entries(properties)) {
    const property = raw as Property;
    if (skipped.has(label.toLowerCase())) continue;
    const field = fieldOf(label, property);
    if (field?.value) fields.push(field);
  }
  return fields;
}

function fieldOf(label: string, property: Property): ProjectField | null {
  const id = `${property.id ?? label}`;
  const field = (type: ProjectField["type"], value: string) => ({ id, icon: FIELD_ICONS[type], label, type, value });
  switch (property.type) {
    case "title":
    case "relation":
    case "rollup":
    case "people":
    case "files":
    case "button":
      return null;
    case "date": {
      const { startsOn, endsOn } = dateOf(property);
      if (!startsOn) return null;
      return field("date", endsOn && endsOn !== startsOn ? `${startsOn} → ${endsOn}` : startsOn);
    }
    case "number":
      return field("number", property.number === null || property.number === undefined ? "" : `${property.number}`);
    case "url":
      return field("url", `${property.url ?? ""}`);
    case "email":
      return field("url", `${property.email ?? ""}`);
    case "checkbox":
      return field("text", property.checkbox ? "Yes" : "");
    case "select":
    case "status":
      return field("text", selectName(property));
    case "multi_select":
      return field("text", ((property.multi_select ?? []) as { name: string }[]).map((one) => one.name).join(", "));
    case "formula": {
      const formula = property.formula as { string?: string; number?: number; boolean?: boolean } | undefined;
      const value = formula?.string ?? (formula?.number === undefined ? "" : `${formula.number}`);
      return field("text", value);
    }
    default:
      return field("text", plainText(property));
  }
}
