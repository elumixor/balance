import { api, apiGet, callApi } from "$lib/core/api";
import type { Assisted, WeekNote } from "$lib/projects/assist";
import type {
  NotionAssignable,
  NotionDatabase,
  NotionMapping,
  NotionStatus,
  NotionSyncResult,
  NotionTaskFilter,
  NotionTaskMapping,
  NotionView,
  Progress,
} from "$lib/projects/types";

/** The device's day and zone travel with the ask, the same way the planning sessions send theirs. */
export const getProjectProgress = (timeZone: string, today: string) =>
  apiGet<Progress>("/projects/progress", { timeZone, today });

export const assistWeek = (input: {
  freeHours: number;
  projects: {
    id: string;
    name: string;
    claimed: number;
    logged: number;
    priority: number;
  }[];
  fixed: string[];
}) => callApi(api.projects.assist.week.$post(input)).then((r) => r as Assisted<WeekNote>);

export const getNotionStatus = () => apiGet<NotionStatus>("/notion/status");

/** The consent URL, asked for over the authenticated channel — see `core/oauth-connect.ts`. */
export const startNotionConnect = (mode: "app" | "web", origin: string) =>
  callApi(api.notion.start.$post({ mode, origin })).then((r) => r.url);

export const listNotionDatabases = (connectionId: string) =>
  apiGet<{ databases: NotionDatabase[] }>("/notion/databases", { connectionId }).then((r) => r.databases);

export const listNotionViews = (connectionId: string, dataSourceId: string) =>
  apiGet<{ views: NotionView[] }>("/notion/views", { connectionId, dataSourceId }).then((r) => r.views);

export const listNotionAssignees = (connectionId: string, dataSourceId: string, propertyId: string) =>
  apiGet<{ people: NotionAssignable[] }>("/notion/assignees", { connectionId, dataSourceId, propertyId }).then(
    (r) => r.people,
  );

export const linkProjectToNotion = (input: {
  projectId: string;
  connectionId: string;
  dataSourceId: string;
  viewId: string | null;
  mapping: NotionTaskMapping;
  filter: NotionTaskFilter;
}) => callApi(api.notion.link.$post(input)) as Promise<NotionSyncResult>;

export const unlinkProjectFromNotion = (projectId: string) =>
  callApi(api.notion.unlink.$post({ projectId })) as Promise<NotionStatus>;

export const configureNotion = (input: {
  connectionId: string;
  dataSourceId: string;
  categoryId: string;
  mapping: NotionMapping;
}) => callApi(api.notion.configure.$post(input)) as Promise<NotionStatus>;

export const disconnectNotion = (connectionId: string) =>
  callApi(api.notion.disconnect.$post({ connectionId })) as Promise<NotionStatus>;

/** One run of the mirror. Never fails for a stale grant — the status it answers with says so. */
export const syncNotion = () => callApi(api.notion.sync.$post({})) as Promise<NotionSyncResult>;
