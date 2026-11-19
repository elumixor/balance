import { describe, expect, test } from "bun:test";
import {
  asRing,
  hoursBySphere,
  nestingRefusal,
  overBudgetHours,
  overBudgetWarning,
  parentsOf,
  progressOf,
  qualifiedNames,
  rollUp,
  topLevel,
} from "./tree";

const HOUR = 3_600_000;

const projects = { id: "projects", parentId: null, name: "Projects", targetHoursPerWeek: 24, isBuffer: false };
const narrative = { id: "narrative", parentId: "projects", name: "Narrative", targetHoursPerWeek: 4, isBuffer: false };
const engine = { id: "engine", parentId: "projects", name: "Engine", targetHoursPerWeek: 12, isBuffer: false };
const health = { id: "health", parentId: null, name: "Health", targetHoursPerWeek: 7, isBuffer: false };
const buffer = { id: "buffer", parentId: null, name: "Buffer", targetHoursPerWeek: 137, isBuffer: true };
const spheres = [projects, narrative, engine, health, buffer];
const parents = parentsOf(spheres);

describe("topLevel", () => {
  test("keeps the slices of the ring and drops their parts", () => {
    expect(topLevel(spheres).map((s) => s.id)).toEqual(["projects", "health", "buffer"]);
  });
});

describe("rollUp", () => {
  test("a part's share goes to its parent", () => {
    expect(rollUp([{ categoryId: "narrative", weightPercent: 100 }], parents)).toEqual([
      { categoryId: "projects", weightPercent: 100 },
    ]);
  });

  test("shares landing on one sphere become one", () => {
    const rolled = rollUp(
      [
        { categoryId: "narrative", weightPercent: 40 },
        { categoryId: "projects", weightPercent: 30 },
        { categoryId: "health", weightPercent: 30 },
      ],
      parents,
    );
    expect(rolled).toEqual([
      { categoryId: "projects", weightPercent: 70 },
      { categoryId: "health", weightPercent: 30 },
    ]);
  });

  test("keeps whatever else a weight carries", () => {
    const [rolled] = rollUp([{ categoryId: "narrative", weightPercent: 100, color: "#fff" }], parents);
    expect(rolled).toEqual({ categoryId: "projects", weightPercent: 100, color: "#fff" });
  });

  test("leaves top-level weights alone", () => {
    const weights = [{ categoryId: "health", weightPercent: 100 }];
    expect(rollUp(weights, parents)).toEqual(weights);
  });
});

describe("nestingRefusal", () => {
  test("a new sphere fits under a top-level one", () => {
    expect(nestingRefusal("new", "projects", spheres)).toBeNull();
  });

  test("not under itself", () => {
    expect(nestingRefusal("projects", "projects", spheres)).toBe("self");
  });

  test("not under a sphere that isn't there", () => {
    expect(nestingRefusal("new", "gone", spheres)).toBe("missing");
  });

  test("not under the buffer", () => {
    expect(nestingRefusal("new", "buffer", spheres)).toBe("buffer");
  });

  test("not under a part", () => {
    expect(nestingRefusal("new", "narrative", spheres)).toBe("nested");
  });

  test("a sphere holding parts can't become one", () => {
    expect(nestingRefusal("projects", "health", spheres)).toBe("has-parts");
  });
});

describe("the sum check", () => {
  test("parts that fit say nothing", () => {
    expect(overBudgetHours(projects, spheres)).toBe(0);
    expect(overBudgetWarning(projects, spheres)).toBeNull();
  });

  test("parts that ask for exactly the whole fit", () => {
    const full = [projects, narrative, engine, { ...engine, id: "third", targetHoursPerWeek: 8 }];
    expect(overBudgetWarning(projects, full)).toBeNull();
  });

  test("parts that ask for more are named, with by how much", () => {
    const over = [projects, narrative, engine, { ...engine, id: "third", targetHoursPerWeek: 10.5 }];
    expect(overBudgetHours(projects, over)).toBe(2.5);
    expect(overBudgetWarning(projects, over)).toBe(
      "The parts of Projects ask for 26.5h a week, 2.5h more than its 24h.",
    );
  });

  test("a sphere with no parts is never over", () => {
    expect(overBudgetHours(health, spheres)).toBe(0);
  });
});

describe("hoursBySphere", () => {
  const window = { start: 0, end: 168 * HOUR };
  const block = (start: number, end: number, categoryId: string, weightPercent = 100) => ({
    start: start * HOUR,
    end: end * HOUR,
    weights: [{ categoryId, weightPercent }],
  });

  test("a part's hours are its own and its parent's", () => {
    const hours = hoursBySphere([block(1, 3, "narrative")], window, 10 * HOUR, parents);
    expect(hours.get("narrative")).toEqual({ tracked: 2, scheduled: 0 });
    expect(hours.get("projects")).toEqual({ tracked: 2, scheduled: 0 });
  });

  test("a block running through now is split at it", () => {
    const hours = hoursBySphere([block(9, 12, "narrative")], window, 10 * HOUR, parents);
    expect(hours.get("narrative")).toEqual({ tracked: 1, scheduled: 2 });
  });

  test("the parent adds its own blocks to its parts'", () => {
    const hours = hoursBySphere(
      [block(1, 2, "projects"), block(3, 5, "narrative"), block(20, 23, "engine")],
      window,
      10 * HOUR,
      parents,
    );
    expect(hours.get("projects")).toEqual({ tracked: 3, scheduled: 3 });
    expect(hours.get("engine")).toEqual({ tracked: 0, scheduled: 3 });
  });

  test("overlapping blocks share the hour rather than count it twice", () => {
    const hours = hoursBySphere([block(1, 2, "narrative"), block(1, 2, "health")], window, 10 * HOUR, parents);
    expect(hours.get("narrative")).toEqual({ tracked: 0.5, scheduled: 0 });
    expect(hours.get("health")).toEqual({ tracked: 0.5, scheduled: 0 });
    expect(hours.get("projects")).toEqual({ tracked: 0.5, scheduled: 0 });
  });

  test("a split block credits each sphere its share", () => {
    const hours = hoursBySphere(
      [
        {
          start: 0,
          end: 2 * HOUR,
          weights: [
            { categoryId: "narrative", weightPercent: 50 },
            { categoryId: "health", weightPercent: 50 },
          ],
        },
      ],
      window,
      10 * HOUR,
      parents,
    );
    expect(hours.get("narrative")).toEqual({ tracked: 1, scheduled: 0 });
    expect(hours.get("health")).toEqual({ tracked: 1, scheduled: 0 });
  });

  test("hours outside the window don't count", () => {
    const hours = hoursBySphere([block(-2, 1, "health"), block(167, 170, "health")], window, 10 * HOUR, parents);
    expect(hours.get("health")).toEqual({ tracked: 1, scheduled: 1 });
  });

  test("a now before the window makes everything scheduled, after it everything tracked", () => {
    expect(hoursBySphere([block(1, 2, "health")], window, -5 * HOUR, parents).get("health")).toEqual({
      tracked: 0,
      scheduled: 1,
    });
    expect(hoursBySphere([block(1, 2, "health")], window, 500 * HOUR, parents).get("health")).toEqual({
      tracked: 1,
      scheduled: 0,
    });
  });

  test("a sphere with no blocks has no entry", () => {
    expect(hoursBySphere([], window, 0, parents).size).toBe(0);
  });
});

describe("asRing", () => {
  test("a list with no parts passes through untouched", () => {
    const flat = [health, buffer];
    const events = [{ id: "e", weights: [{ categoryId: "health", weightPercent: 100 }] }];
    expect(asRing(flat, events)).toEqual({ spheres: flat, events });
  });

  test("parts leave the spheres and their weights land on the parent", () => {
    const events = [
      {
        id: "e",
        weights: [
          { categoryId: "narrative", weightPercent: 50 },
          { categoryId: "engine", weightPercent: 30 },
          { categoryId: "health", weightPercent: 20 },
        ],
      },
    ];
    const ring = asRing(spheres, events);
    expect(ring.spheres.map((s) => s.id)).toEqual(["projects", "health", "buffer"]);
    expect(ring.events[0].weights).toEqual([
      { categoryId: "projects", weightPercent: 80 },
      { categoryId: "health", weightPercent: 20 },
    ]);
    expect(ring.events[0].id).toBe("e");
  });
});

describe("qualifiedNames", () => {
  test("a part carries its parent's name, a root its own", () => {
    const names = qualifiedNames(spheres);
    expect(names.get("narrative")).toBe("Projects › Narrative");
    expect(names.get("projects")).toBe("Projects");
  });

  test("a part whose parent is gone keeps its own name", () => {
    expect(qualifiedNames([narrative]).get("narrative")).toBe("Narrative");
  });
});

describe("progressOf", () => {
  const withUrn = spheres.map((s) => ({ ...s, urn: null as string | null }));

  test("parents come before their parts and the Buffer is left out", () => {
    const rows = progressOf(withUrn, new Map());
    expect(rows.map((r) => r.id)).toEqual(["projects", "narrative", "engine", "health"]);
  });

  test("remaining counts tracked and scheduled, never below zero", () => {
    const rows = progressOf(
      withUrn,
      new Map([
        ["projects", { tracked: 10, scheduled: 4 }],
        ["narrative", { tracked: 3, scheduled: 3 }],
      ]),
    );
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get("projects")?.remainingHours).toBe(10);
    expect(byId.get("narrative")?.remainingHours).toBe(0);
    expect(byId.get("health")).toMatchObject({ trackedHours: 0, scheduledHours: 0, remainingHours: 7 });
  });

  test("a part whose parent is gone stands as a root", () => {
    const rows = progressOf([{ ...narrative, urn: "https://keep.desk.atmagaming.com/p/x" }], new Map());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "narrative", urn: "https://keep.desk.atmagaming.com/p/x", warning: null });
  });

  test("a parent whose parts ask for too much carries the warning", () => {
    const greedy = { ...engine, targetHoursPerWeek: 30 };
    const rows = progressOf([projects, narrative, greedy].map((s) => ({ ...s, urn: null })), new Map());
    expect(rows[0].warning).toContain("10h more");
    expect(rows[1].warning).toBeNull();
  });
});
