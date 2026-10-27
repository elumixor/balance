import { describe, expect, it } from "vitest";
import { KEEP_ORIGIN } from "$lib/core/env";
import { urnHref } from "./urn";

describe("urnHref", () => {
  it("opens a Keep page by its embed", () => {
    expect(urnHref("keep:page/0b1c")).toBe(`${KEEP_ORIGIN}/embed/page/0b1c`);
  });

  it("escapes what it puts into the path", () => {
    expect(urnHref("keep:page/a b/c")).toBe(`${KEEP_ORIGIN}/embed/page/a%20b%2Fc`);
  });

  it("has no address for any other URN", () => {
    expect(urnHref("keep:database/0b1c")).toBeNull();
    expect(urnHref("linear:issue/ABC-1")).toBeNull();
    expect(urnHref("keep:page/")).toBeNull();
  });
});
