import { describe, expect, it, vi } from "vitest";
import { CalendarHistory } from "./history.svelte";

/** A step that says whether its write landed, and remembers being run. */
function step(moved = true) {
  const undo = vi.fn(async () => moved);
  const redo = vi.fn(async () => moved);
  return { undo, redo };
}

/** The stacks move before the writes run; letting the queue drain is how the test sees both. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("CalendarHistory", () => {
  it("has nothing to take back until something is written", async () => {
    const history = new CalendarHistory();
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
    history.undo();
    history.redo();
    await settled();
    expect(history.canUndo).toBe(false);
  });

  it("walks back and forward through the writes", async () => {
    const history = new CalendarHistory();
    const first = step();
    const second = step();
    history.push(first);
    history.push(second);

    history.undo();
    await settled();
    expect(second.undo).toHaveBeenCalledTimes(1);
    expect(first.undo).not.toHaveBeenCalled();
    expect(history.canRedo).toBe(true);

    history.redo();
    await settled();
    expect(second.redo).toHaveBeenCalledTimes(1);
    expect(history.canRedo).toBe(false);
    expect(history.canUndo).toBe(true);
  });

  it("moves the stacks before the write behind them lands", () => {
    const history = new CalendarHistory();
    // Holding ⌘Z has to walk the week as fast as it's pressed, not a round trip at a time.
    history.push(step());
    history.push(step());
    history.undo();
    history.undo();
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(true);
  });

  it("a fresh write is a new branch: what was undone can't be redone past it", async () => {
    const history = new CalendarHistory();
    const undone = step();
    history.push(undone);
    history.undo();
    await settled();
    expect(history.canRedo).toBe(true);

    history.push(step());
    expect(history.canRedo).toBe(false);
    history.redo();
    await settled();
    expect(undone.redo).not.toHaveBeenCalled();
  });

  it("gives up the whole history when a write it was replaying fails", async () => {
    // The calendar is now somewhere neither stack describes, so every step above this one is
    // written against events that may not be where it thinks.
    const history = new CalendarHistory();
    history.push(step());
    history.push(step(false));
    history.undo();
    await settled();
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });

  it("gives up when a redo fails too", async () => {
    const history = new CalendarHistory();
    // Taking it back worked; putting it back didn't — the event it was written against is gone.
    const redo = vi.fn(async () => false);
    history.push({ undo: async () => true, redo });
    history.undo();
    await settled();
    history.redo();
    await settled();
    expect(redo).toHaveBeenCalled();
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });

  it("keeps the last fifty steps and no more", async () => {
    const history = new CalendarHistory();
    const steps = Array.from({ length: 60 }, () => step());
    for (const one of steps) history.push(one);
    for (let i = 0; i < 60; i++) history.undo();
    await settled();

    expect(steps.slice(10).every((one) => one.undo.mock.calls.length === 1)).toBe(true);
    // The ten oldest fell off the bottom rather than being replayed against a week long gone.
    expect(steps.slice(0, 10).some((one) => one.undo.mock.calls.length > 0)).toBe(false);
  });

  it("clear leaves nothing to walk in either direction", async () => {
    const history = new CalendarHistory();
    history.push(step());
    history.undo();
    await settled();
    history.clear();
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });
});
