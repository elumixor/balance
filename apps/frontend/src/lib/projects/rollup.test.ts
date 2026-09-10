import { describe, expect, it } from "vitest";
import { completionOf } from "./rollup";
import type { Task, TaskStatus } from "./types";

const task = (id: string, status: TaskStatus, parentId: string | null = null) => ({ id, parentId, status }) as Task;

describe("completionOf", () => {
  it("counts the leaves, not the headings above them", () => {
    expect(
      completionOf([
        task("parent", "todo"),
        task("a", "done", "parent"),
        task("b", "doing", "parent"),
        task("alone", "done"),
      ]),
    ).toEqual({ done: 2, total: 3, share: 2 / 3 });
  });

  it("leaves a dropped task out of both halves", () => {
    expect(completionOf([task("a", "done"), task("b", "dropped")])).toEqual({ done: 1, total: 1, share: 1 });
  });

  it("says nothing is done when there is nothing to do", () => {
    expect(completionOf([])).toEqual({ done: 0, total: 0, share: 0 });
  });
});
