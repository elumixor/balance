import { describe, expect, it } from "vitest";
import { KIP_ORIGIN } from "$lib/core/env";
import { urnHref } from "./urn";

describe("urnHref", () => {
  it("opens a Kip page by its embed", () => {
    expect(urnHref("kip:page/0b1c")).toBe(`${KIP_ORIGIN}/embed/page/0b1c`);
  });

  it("escapes what it puts into the path", () => {
    expect(urnHref("kip:page/a b/c")).toBe(`${KIP_ORIGIN}/embed/page/a%20b%2Fc`);
  });

  it("has no address for any other URN", () => {
    expect(urnHref("kip:database/0b1c")).toBeNull();
    expect(urnHref("linear:issue/ABC-1")).toBeNull();
    expect(urnHref("kip:page/")).toBeNull();
  });
});
