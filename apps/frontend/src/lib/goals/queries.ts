import { callApi, goalsApi } from "$lib/core/api";
import type { Goal, GoalBoard, GoalDraft, GoalKey, GoalScope } from "./types";

/** The list and the server's pick of what is next, asked together so the two cannot disagree for long. */
export async function getGoals(): Promise<GoalBoard> {
  const [list, next] = await Promise.all([callApi(goalsApi.$get()), callApi(goalsApi.next.$get())]);
  return { goals: list.goals, nextId: next.next?.id ?? null, nudge: next.nudge };
}

export const createGoal = (draft: GoalDraft) => callApi(goalsApi.$post(draft)).then((r) => r.goal as Goal);

export const removeGoal = (id: string) => callApi(goalsApi(id).$delete());

export const listGoalKeys = () => callApi(goalsApi.tokens.$get()).then((r) => r.keys as GoalKey[]);

export const createGoalKey = (input: { name: string; source: string; scopes: GoalScope[] }) =>
  callApi(goalsApi.tokens.$post(input)).then((r) => r as { token: string; key: GoalKey });

export const revokeGoalKey = (id: string) => callApi(goalsApi.tokens(id).$delete());
