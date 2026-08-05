import { api, apiGet, callApi, unwrapOk } from "./api";
import type { Activity, ActivityWeight, Category, Entry, StatsResponse, TrackData } from "./types";

// Categories
export const getCategories = () => callApi(api.categories.$get()).then((r) => r.categories as Category[]);
export const createCategory = (input: { name: string; color: string; targetHoursPerWeek: number }) =>
  callApi(api.categories.$post(input)).then((r) => unwrapOk(r).category as Category);
export const updateCategory = (id: string, input: { name: string; color: string; targetHoursPerWeek: number }) =>
  callApi(api.categories(id).$patch(input)).then((r) => unwrapOk(r).category as Category);
export const archiveCategory = (id: string) => callApi(api.categories(id).archive.$post()).then(unwrapOk);

// Activities
export const getActivities = () => callApi(api.activities.$get()).then((r) => r.activities as Activity[]);
export const createActivity = (input: { name: string; weights: ActivityWeight[] }) =>
  callApi(api.activities.$post(input)).then((r) => unwrapOk(r).activity as Activity);
export const updateActivity = (id: string, input: { name: string; weights: ActivityWeight[] }) =>
  callApi(api.activities(id).$patch(input)).then((r) => unwrapOk(r).activity as Activity);
export const archiveActivity = (id: string) => callApi(api.activities(id).archive.$post()).then(unwrapOk);

// Entries / timer
export const getTrackData = (limit = 20) => apiGet<TrackData>("/entries", { limit });
export const getRunningEntry = () => callApi(api.entries.running.$get()).then((r) => r.entry as Entry | null);
export const startTimer = (activityId: string) =>
  callApi(api.timer.start.$post({ activityId })).then((r) => unwrapOk(r).entry as Entry);
export const stopTimer = () => callApi(api.timer.stop.$post());
export const createManualEntry = (input: {
  activityId: string;
  startedAt: string;
  endedAt: string;
  note?: string | null;
}) => callApi(api.entries.$post(input)).then((r) => unwrapOk(r).entry as Entry);
export const updateEntry = (
  id: string,
  input: { activityId: string; startedAt: string; endedAt: string; note?: string | null },
) => callApi(api.entries(id).$patch(input)).then((r) => unwrapOk(r).entry as Entry);
export const deleteEntry = (id: string) => callApi(api.entries(id).$delete());

// Stats
export const getStats = (period: "day" | "week" | "month", date?: string) =>
  apiGet<StatsResponse>("/stats", { period, date });
