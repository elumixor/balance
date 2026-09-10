import { api, apiGet, callApi } from "$lib/core/api";
import type { Assisted, WeekNote } from "$lib/projects/assist";
import type { NotionDatabase, NotionMapping, NotionStatus, NotionSyncResult, Progress } from "$lib/projects/types";

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

export const listNotionDatabases = () =>
  apiGet<{ databases: NotionDatabase[] }>("/notion/databases").then((r) => r.databases);

export const configureNotion = (input: { dataSourceId: string; categoryId: string; mapping: NotionMapping }) =>
  callApi(api.notion.configure.$post(input)) as Promise<NotionStatus>;

export const disconnectNotion = () => callApi(api.notion.disconnect.$post({})) as Promise<NotionStatus>;

/** One run of the mirror. Never fails for a stale grant — the status it answers with says so. */
export const syncNotion = () => callApi(api.notion.sync.$post({})) as Promise<NotionSyncResult>;
