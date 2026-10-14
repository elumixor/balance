import { describe, expect, it } from "vitest";
import { slashAt, withoutSlash } from "./slash";

describe("slashAt", () => {
  it("opens at the start of the name", () => {
    expect(slashAt("/hea", 4)).toEqual({ start: 0, end: 4, query: "hea" });
  });

  it("opens after a space, reading up to the caret only", () => {
    expect(slashAt("Gym /hea later", 8)).toEqual({ start: 4, end: 8, query: "hea" });
  });

  it("answers an empty query for a bare slash", () => {
    expect(slashAt("Gym /", 5)).toEqual({ start: 4, end: 5, query: "" });
  });

  it("keeps a single space inside a sphere's name", () => {
    expect(slashAt("/deep work", 10)?.query).toBe("deep work");
  });

  it("stays shut without a slash", () => {
    expect(slashAt("Gym", 3)).toBeNull();
  });

  it("stays shut for a slash inside a word", () => {
    expect(slashAt("1/2 day", 3)).toBeNull();
    expect(slashAt("see a/b", 7)).toBeNull();
  });

  it("stays shut for a slash after the caret", () => {
    expect(slashAt("Gym /hea", 3)).toBeNull();
  });

  it("stays shut once the name carries on past the slash", () => {
    expect(slashAt("/ later", 7)).toBeNull();
    expect(slashAt("/deep  work", 11)).toBeNull();
  });
});

describe("withoutSlash", () => {
  it("takes the slash out from the end of the name", () => {
    expect(withoutSlash("Gym /hea", { start: 4, end: 8, query: "hea" })).toEqual({ text: "Gym", caret: 3 });
  });

  it("joins what was either side with one space", () => {
    expect(withoutSlash("Gym /hea later", { start: 4, end: 8, query: "hea" })).toEqual({
      text: "Gym later",
      caret: 4,
    });
  });

  it("leaves nothing when the slash was the whole name", () => {
    expect(withoutSlash("/hea", { start: 0, end: 4, query: "hea" })).toEqual({ text: "", caret: 0 });
  });

  it("drops the space a slash at the start leaves behind", () => {
    expect(withoutSlash("/hea gym", { start: 0, end: 4, query: "hea" })).toEqual({ text: "gym", caret: 0 });
  });
});
