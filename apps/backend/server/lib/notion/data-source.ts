import type { NotionTaskMapping, TaskStatus } from "~/db/schema";
import { taskStatus } from "./map";

/** A data source's properties, as Notion describes them — the half of the schema this reads. */
export interface RawSchema {
  readonly id?: string;
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
 * The properties a tasks database has to have for the app to read it, by their current names — as
 * somebody mapped them when linking, or found by type and then by name when nobody did.
 */
export interface TaskFields extends NotionTaskMapping {
  readonly title: string;
  /** A checkbox standing in for a status reads as done or not, and is written the same way. */
  readonly statusType: "status" | "select" | "checkbox" | null;
  readonly priority: string | null;
  /** What each of the app's statuses is called on this board, for a write going the other way. */
  readonly columns: ColumnNames;
  /** The column each status option belongs to, so a name the app has never seen still lands. */
  readonly groups: Readonly<Record<string, string>>;
}

/** Which property types can answer each part of a mapping — what the link dialog offers. */
export const MAPPABLE_TYPES: Readonly<Record<keyof NotionTaskMapping, readonly string[]>> = {
  status: ["status", "select", "checkbox"],
  dates: ["date"],
  assignee: ["people", "relation", "created_by", "select", "multi_select", "formula"],
  parent: ["relation"],
};

const ASSIGNEE_NAMES = ["assignee", "assignees", "developer", "owner", "responsible"];
const PARENT_NAMES = ["parent item", "parent task", "parent"];
const PRIORITY_NAMES = ["priority", "importance"];

/**
 * The mapping a board suggests by itself, as property ids: the first status property, the first
 * date, a person or relation named like an assignee, and a relation that is the board's own
 * sub-items. Ids rather than names, so a column renamed in Notion stays mapped.
 */
export function suggestTaskMapping(schema: RawSchema): NotionTaskMapping {
  const byName = suggestByName(schema);
  const idOf = (name: string | null) => (name ? (schema.properties[name]?.id ?? name) : null);
  return {
    status: idOf(byName.status),
    dates: idOf(byName.dates),
    assignee: idOf(byName.assignee),
    parent: idOf(byName.parent),
  };
}

function suggestByName(schema: RawSchema): NotionTaskMapping {
  const entries = Object.entries(schema.properties);
  const byType = (type: string) => entries.filter(([, property]) => property.type === type).map(([name]) => name);
  const named = (candidates: readonly string[], types: readonly string[]) =>
    entries.find(([name, property]) => types.includes(property.type) && candidates.includes(name.toLowerCase()))?.[0] ??
    null;
  const selfRelation =
    entries.find(
      ([, property]) => property.type === "relation" && property.relation?.data_source_id === schema.id,
    )?.[0] ?? null;

  return {
    status: byType("status")[0] ?? byType("select").find((name) => name.toLowerCase() === "status") ?? null,
    dates: byType("date")[0] ?? null,
    assignee: named(ASSIGNEE_NAMES, ["people", "relation"]) ?? byType("people")[0] ?? null,
    parent: named(PARENT_NAMES, MAPPABLE_TYPES.parent) ?? selfRelation,
  };
}

/**
 * Everything a sync reads a board with, by the names its properties have today. A chosen mapping
 * names properties by id (or, from before ids were kept, by name), and one the board no longer
 * has reads as none rather than as a guess.
 */
export function resolveTaskFields(schema: RawSchema, chosen: NotionTaskMapping | null = null): TaskFields {
  const entries = Object.entries(schema.properties);
  const nameOf = (key: string | null) =>
    key ? (entries.find(([name, one]) => one.id === key || name === key)?.[0] ?? null) : null;
  const mapping = chosen ?? suggestTaskMapping(schema);
  const pick = (key: keyof NotionTaskMapping) => nameOf(mapping[key]);

  const status = pick("status");
  const property = status ? schema.properties[status] : undefined;
  const groups = groupsOf(property);
  const statusType =
    property?.type === "status" || property?.type === "select" || property?.type === "checkbox" ? property.type : null;

  return {
    title: entries.find(([, one]) => one.type === "title")?.[0] ?? "Name",
    status,
    statusType,
    dates: pick("dates"),
    assignee: pick("assignee"),
    parent: pick("parent"),
    priority:
      entries.find(
        ([name, one]) => ["select", "status"].includes(one.type) && PRIORITY_NAMES.includes(name.toLowerCase()),
      )?.[0] ?? null,
    columns: columnsOf(property, groups),
    groups,
  };
}

/** The options of a status or select property, in board order — what a mapped column holds. */
export function optionsOf(property: RawProperty) {
  return (property.status?.options ?? property.select?.options ?? []).map((option) => option.name);
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
  const columns: ColumnNames = {};
  for (const name of property ? optionsOf(property) : []) {
    const status = taskStatus(name, groups[name] ?? null);
    columns[status] ??= name;
  }
  return columns;
}
