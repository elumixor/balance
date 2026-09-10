import type { TaskStatus } from "~/db/schema";
import { taskStatus } from "./map";

/** A data source's properties, as Notion describes them — the half of the schema this reads. */
export interface RawSchema {
  readonly properties: Record<string, RawProperty>;
}

interface RawProperty {
  readonly id?: string;
  readonly type: string;
  readonly status?: { options?: { id: string; name: string }[]; groups?: { name: string; option_ids: string[] }[] };
  readonly select?: { options?: { id: string; name: string }[] };
  readonly relation?: { data_source_id?: string };
}

/** Which of a board's columns the app writes when it puts a task somewhere. */
export type ColumnNames = Partial<Record<TaskStatus, string>>;

/**
 * The handful of properties a tasks database has to have for the app to read it, found by type
 * and then by name — every board names them differently, and a database this app didn't make is
 * the normal case rather than the exception.
 */
export interface TaskFields {
  readonly title: string;
  readonly status: string | null;
  readonly date: string | null;
  readonly priority: string | null;
  readonly assignee: string | null;
  readonly parent: string | null;
  /** What each of the app's statuses is called on this board, for a write going the other way. */
  readonly columns: ColumnNames;
  /** The column each status option belongs to, so a name the app has never seen still lands. */
  readonly groups: Readonly<Record<string, string>>;
}

const ASSIGNEE_NAMES = ["assignee", "assignees", "developer", "owner", "responsible"];
const PARENT_NAMES = ["parent item", "parent task", "parent"];
const PRIORITY_NAMES = ["priority", "importance"];

export function resolveTaskFields(schema: RawSchema): TaskFields {
  const entries = Object.entries(schema.properties);
  const byType = (type: string) => entries.filter(([, property]) => property.type === type).map(([name]) => name);
  const named = (candidates: readonly string[], types: readonly string[]) =>
    entries.find(([name, property]) => types.includes(property.type) && candidates.includes(name.toLowerCase()))?.[0] ??
    null;

  const status = byType("status")[0] ?? byType("select").find((name) => name.toLowerCase() === "status") ?? null;
  const property = status ? schema.properties[status] : undefined;
  const groups = groupsOf(property);

  return {
    title: byType("title")[0] ?? "Name",
    status,
    date: byType("date")[0] ?? null,
    priority: named(PRIORITY_NAMES, ["select", "status"]),
    assignee: named(ASSIGNEE_NAMES, ["relation", "people"]),
    parent: named(PARENT_NAMES, ["relation"]),
    columns: columnsOf(property, groups),
    groups,
  };
}

/** Every option of a status property, said as the group it belongs to — "to_do", and so on. */
function groupsOf(property: RawProperty | undefined): Record<string, string> {
  const options = property?.status?.options ?? [];
  const groups = property?.status?.groups ?? [];
  const byOptionId = new Map(options.map((option) => [option.id, option.name]));
  const resolved: Record<string, string> = {};
  for (const group of groups)
    for (const id of group.option_ids) {
      const name = byOptionId.get(id);
      if (name) resolved[name] = normalizeGroup(group.name);
    }
  return resolved;
}

function normalizeGroup(name: string) {
  const lowered = name.toLowerCase();
  if (lowered.includes("complete") || lowered.includes("done")) return "complete";
  if (lowered.includes("progress") || lowered.includes("doing")) return "in_progress";
  return "to_do";
}

/**
 * The column to write for each status the app has: the first option that already means it. A
 * status with no column on this board is left out, and a write that would need one does nothing
 * rather than inventing an option somebody would have to clean up.
 */
function columnsOf(property: RawProperty | undefined, groups: Record<string, string>): ColumnNames {
  const options = property?.status?.options ?? property?.select?.options ?? [];
  const columns: ColumnNames = {};
  for (const option of options) {
    const status = taskStatus(option.name, groups[option.name] ?? null);
    columns[status] ??= option.name;
  }
  return columns;
}
