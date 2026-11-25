import type { goalsApi } from "$lib/core/api";

/** A goal as the server answers it: what was set, where it stands today, and what it asks for next. */
export type Goal = Awaited<ReturnType<typeof goalsApi.$get>>["goals"][number];

/** The goals screen's data: every goal, and the one the server says to do next. */
export interface GoalBoard {
  goals: Goal[];
  /** The goal to do next, or null once every goal is met for now. */
  nextId: string | null;
  /** The sentence that asks for it. */
  nudge: string;
}

/** What it takes to make a goal. `levels` is the ladder, easiest first. */
export interface GoalDraft {
  key: string;
  title: string;
  kind: string;
  metric: string;
  cadence: "daily" | "weekly";
  timeZone: string;
  levels: { target: number }[];
}

export type GoalScope = "read" | "progress" | "manage";

/** A key an app holds, without its secret, which exists once in the answer that made it. */
export interface GoalKey {
  id: string;
  name: string;
  source: string;
  scopes: GoalScope[];
  createdAt: string;
  lastUsedAt: string | null;
}
