import { api, apiGet, callApi } from "$lib/core/api";
import type { Assisted, CheckpointHelp, CreateSuggestion, DecisionAdvice, WeekNote } from "$lib/projects/assist";
import type { Progress } from "$lib/projects/types";

/** The device's day and zone travel with the ask, the same way the planning sessions send theirs. */
export const getProjectProgress = (timeZone: string, today: string) =>
  apiGet<Progress>("/projects/progress", { timeZone, today });

export const assistCreate = (input: { idea: string; sphere: string; existingProjects: string[] }) =>
  callApi(api.projects.assist.create.$post(input)).then((r) => r as Assisted<CreateSuggestion>);

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

export const assistCheckpoint = (input: {
  project: string;
  stage: string;
  sentence: string;
  count: number;
  threshold: number;
  note: string;
}) => callApi(api.projects.assist.checkpoint.$post(input)).then((r) => r as Assisted<CheckpointHelp>);

export const assistDecision = (input: {
  project: string;
  stage: string;
  sentence: string;
  count: number;
  threshold: number;
  measurable: boolean;
  hoursInvested: number;
  hoursPerWeek: number;
  extended: boolean;
  isLast: boolean;
  checkpoints: { day: string; count: number; moved: boolean; note: string }[];
}) => callApi(api.projects.assist.decision.$post(input)).then((r) => r as Assisted<DecisionAdvice>);
