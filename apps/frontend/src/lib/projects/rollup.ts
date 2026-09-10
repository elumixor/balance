import type { Task, TaskStatus } from "./types";

export interface Completion {
  readonly done: number;
  readonly total: number;
  /** Zero to one. Nothing to do is nothing done — an empty stage draws an empty ring. */
  readonly share: number;
}

/** What is on somebody's plate: everything but the two ways a task can be over. */
export const OPEN_STATUSES: readonly TaskStatus[] = ["todo", "doing", "blocked"];

/**
 * How far through a stage is, counted on the tasks that actually hold work — the leaves. A parent
 * is a heading over its subtasks, and counting it as well would let one piece of work be half the
 * progress of a stage that has twenty.
 */
export function completionOf(tasks: readonly Task[]): Completion {
  const parents = new Set(tasks.map((task) => task.parentId).filter((id): id is string => id !== null));
  const leaves = tasks.filter((task) => !parents.has(task.id) && task.status !== "dropped");
  const done = leaves.filter((task) => task.status === "done").length;
  return { done, total: leaves.length, share: leaves.length === 0 ? 0 : done / leaves.length };
}
