export type ProjectStatus = "active" | "paused" | "done" | "dropped";
export type TaskStatus = "todo" | "doing" | "blocked" | "done" | "dropped";
export type TaskPriority = "low" | "medium" | "high" | "critical";

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
  memberIds: string[];
  ordinal: number;
  /** Where this is in Notion — the page it was imported from, or the task database it links. */
  notionUrl: string | null;
  /** The workspace its tasks are read through; null when it isn't linked to Notion. */
  notionConnectionId: string | null;
  notionTasksDataSourceId: string | null;
  /** A saved view of that database whose filter picks this project's rows; null takes them all. */
  notionViewId: string | null;
  /** What the linked task database calls itself. */
  notionTasksName: string | null;
  /** Which of its columns mean what; null while they are read by type and name. */
  notionTaskMapping: NotionTaskMapping | null;
  /** Whose tasks to keep; null or empty keeps every row. */
  notionTaskFilter: NotionTaskFilter | null;
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

/** Which column of the projects database is the sentence under a project's name. */
export interface NotionMapping {
  description: string | null;
}

/** Which property of a task database answers each thing the timeline draws, by Notion's id. */
export interface NotionTaskMapping {
  status: string | null;
  dates: string | null;
  assignee: string | null;
  parent: string | null;
}

export interface NotionColumn {
  id: string;
  name: string;
  type: string;
  /** A status or select column's options, in board order. */
  options: string[];
}

/** One database a workspace can see, with its columns and how it would be read as a task board. */
export interface NotionDatabase {
  id: string;
  name: string;
  url: string;
  properties: NotionColumn[];
  suggested: NotionTaskMapping;
}

/** Whose rows of a task board are one project's — ids, or names where the property has only names. */
export interface NotionTaskFilter {
  assignees: string[];
}

/** Somebody a board's assignee property can name; `me` is the account's own Notion login. */
export interface NotionAssignable {
  id: string;
  name: string;
  me: boolean;
}

/** A saved view of a database — a filter Notion runs, so one board can feed many projects. */
export interface NotionView {
  id: string;
  name: string;
}

/** One granted workspace, as the account that granted it — `/mobile/notion/status`. */
export interface NotionConnection {
  id: string;
  workspaceName: string;
  /** An emoji or an image URL. */
  workspaceIcon: string | null;
  accountName: string;
  accountEmail: string;
  needsReconnect: boolean;
  /** The data source projects are imported from, or empty while nobody has picked one. */
  dataSourceId: string;
  /** The sphere imported projects land in. Empty until the import dialog has been through. */
  categoryId: string;
  mapping: NotionMapping;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export interface NotionStatus {
  connections: NotionConnection[];
}

export interface NotionSyncResult {
  status: NotionStatus;
  summary: { projects: number; tasks: number; people: number } | null;
}
