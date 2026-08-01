import { api } from "./api";
import type { Activity, ActivityWeight, Category, Entry, StatsResponse, TrackData } from "./types";

// Categories
export const getCategories = () => api<{ categories: Category[] }>("/categories").then((r) => r.categories);
export const createCategory = (input: { name: string; color: string; targetHoursPerWeek: number }) =>
  api<{ category: Category }>("/categories", { method: "POST", body: input }).then((r) => r.category);
export const updateCategory = (id: string, input: { name: string; color: string; targetHoursPerWeek: number }) =>
  api<{ category: Category }>(`/categories/${id}`, { method: "PATCH", body: input }).then((r) => r.category);
export const archiveCategory = (id: string) => api<{ ok: true }>(`/categories/${id}/archive`, { method: "POST" });

// Activities
export const getActivities = () => api<{ activities: Activity[] }>("/activities").then((r) => r.activities);
export const createActivity = (input: { name: string; weights: ActivityWeight[] }) =>
  api<{ activity: Activity }>("/activities", { method: "POST", body: input }).then((r) => r.activity);
export const updateActivity = (id: string, input: { name: string; weights: ActivityWeight[] }) =>
  api<{ activity: Activity }>(`/activities/${id}`, { method: "PATCH", body: input }).then((r) => r.activity);
export const archiveActivity = (id: string) => api<{ ok: true }>(`/activities/${id}/archive`, { method: "POST" });

// Entries / timer
export const getTrackData = (limit = 20) => api<TrackData>(`/entries?limit=${limit}`);
export const getRunningEntry = () => api<{ entry: Entry | null }>("/entries/running").then((r) => r.entry);
export const startTimer = (activityId: string) =>
  api<{ entry: Entry }>("/timer/start", { method: "POST", body: { activityId } }).then((r) => r.entry);
export const stopTimer = () => api<{ ok: true }>("/timer/stop", { method: "POST" });
export const createManualEntry = (input: { activityId: string; startedAt: string; endedAt: string; note?: string | null }) =>
  api<{ entry: Entry }>("/entries", { method: "POST", body: input }).then((r) => r.entry);
export const updateEntry = (
  id: string,
  input: { activityId: string; startedAt: string; endedAt: string; note?: string | null },
) => api<{ entry: Entry }>(`/entries/${id}`, { method: "PATCH", body: input }).then((r) => r.entry);
export const deleteEntry = (id: string) => api<{ ok: true }>(`/entries/${id}`, { method: "DELETE" });

// Stats
export const getStats = (period: "day" | "week" | "month", date?: string) =>
  api<StatsResponse>(`/stats?period=${period}${date ? `&date=${encodeURIComponent(date)}` : ""}`);
