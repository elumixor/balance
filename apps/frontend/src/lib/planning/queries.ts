import { api, apiGet, callApi, unwrapOk } from "$lib/core/api";
import type { CommitResult, SessionNotification, SessionSummary, Slot, StarProgress } from "$lib/planning/types";

/** The zone travels with every ask: a planning day is a day in a place, and only the device knows. */
export const getSessionSummary = (slot: Slot, timeZone: string) =>
  apiGet<SessionSummary>("/planning/summary", { slot, timeZone });

export const getProgress = (timeZone: string) => apiGet<StarProgress>("/planning/progress", { timeZone });

export const getSessionNotifications = (timeZone: string) =>
  apiGet<{ enabled: boolean; slots: SessionNotification[] }>("/planning/notifications", { timeZone });

export const commitPlannedDay = (input: { day: string; timeZone: string; rest?: boolean }) =>
  callApi(api.planning.day.$post(input)).then((r) => unwrapOk(r) as CommitResult);

export const commitPlannedWeek = (input: { weekStart: string; timeZone: string }) =>
  callApi(api.planning.week.$post(input)).then((r) => unwrapOk(r) as CommitResult);
