export type ProjectStatus = "active" | "paused" | "done" | "dropped";
export type TaskStatus = "todo" | "doing" | "blocked" | "done" | "dropped";
export type TaskPriority = "low" | "medium" | "high" | "critical";

/** One row of the panel beside a project's name — "Start Date", "Dashboard". */
export interface ProjectField {
  id: string;
  icon: string;
  label: string;
  type: "text" | "date" | "number" | "url";
  value: string;
}

/** Work with a name, under a sphere, that can hold other work. Every level is one of these. */
export interface Project {
  id: string;
  parentId: string | null;
  categoryId: string;
  name: string;
  description: string;
  /** An emoji or a lucide icon name. Null falls back to the sphere's icon. */
  icon: string | null;
  status: ProjectStatus;
  hoursPerWeek: number;
  fields: ProjectField[];
  memberIds: string[];
  ordinal: number;
  /** The page this mirrors, when it came from a Notion workspace. */
  notionUrl: string | null;
}

/** Somebody a project is shared with, or a task is assigned to. Never an account. */
export interface Person {
  id: string;
  name: string;
  email: string | null;
  color: string;
}

/** A band across a project's timeline. With no dates of its own it spans the tasks in it. */
export interface Stage {
  id: string;
  projectId: string;
  name: string;
  ordinal: number;
  startsOn: string | null;
  endsOn: string | null;
}

/** One bar on the timeline. Tasks nest, and a parent with no dates spans its children. */
export interface Task {
  id: string;
  projectId: string;
  stageId: string | null;
  parentId: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  /** What the board this came from calls the column — "Ready For Test". */
  statusLabel: string;
  priority: TaskPriority | null;
  startsOn: string | null;
  endsOn: string | null;
  assigneeIds: string[];
  estimateHours: number | null;
  ordinal: number;
  notionUrl: string | null;
}

/** Something recurring that never completes, measured only by whether it kept happening. */
export interface Practice {
  id: string;
  categoryId: string;
  name: string;
  unit: "times" | "hours";
  targetPerWeek: number;
}

export interface ProjectProgress {
  /** Hours logged per week, oldest first, this week last. Same length as `Progress.weeks`. */
  hoursByWeek: number[];
  /** The same with everything nested under it added in. */
  rolledUpByWeek: number[];
}

export interface PracticeProgress {
  byWeek: number[];
  adherence: number;
}

/** The calendar's answer to every project and practice at once — `/mobile/projects/progress`. */
export interface Progress {
  connected: boolean;
  needsReconnect: boolean;
  /** The Monday of each column, `YYYY-MM-DD`. */
  weeks: string[];
  projects: Record<string, ProjectProgress>;
  practices: Record<string, PracticeProgress>;
}

/** What each column of the projects database means here — the setup dialog's answers. */
export interface NotionMapping {
  description: string | null;
  fields: string[];
}

/** One database the connected workspace can see, with the columns it holds. */
export interface NotionDatabase {
  id: string;
  name: string;
  properties: { name: string; type: string }[];
}

/** What the settings row draws about the mirrored workspace — `/mobile/notion/status`. */
export interface NotionStatus {
  connected: boolean;
  needsReconnect: boolean;
  workspaceName: string;
  /** The data source projects are read from, or empty while nobody has picked one. */
  dataSourceId: string;
  /** The sphere mirrored projects land in. Empty until the setup dialog has been through. */
  categoryId: string;
  mapping: NotionMapping;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export interface NotionSyncResult {
  status: NotionStatus;
  summary: { projects: number; tasks: number; people: number } | null;
}
