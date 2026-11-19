import { describe, expect, it } from "vitest";
import { KEEP_ORIGIN } from "$lib/core/env";
import { pageHref, urnHref } from "./urn";

describe("urnHref", () => {
  it("opens a Keep page link by its embed", () => {
    expect(urnHref("https://keep.desk.atmagaming.com/p/0b1c")).toBe(`${KEEP_ORIGIN}/embed/page/0b1c`);
    expect(urnHref("https://keep.desk.atmagaming.com/p/0b1c/")).toBe(`${KEEP_ORIGIN}/embed/page/0b1c`);
  });

  it("still reads a legacy URN", () => {
    expect(urnHref("keep:page/0b1c")).toBe(`${KEEP_ORIGIN}/embed/page/0b1c`);
  });

  it("escapes what it puts into the path", () => {
    expect(urnHref("keep:page/a%20b")).toBe(`${KEEP_ORIGIN}/embed/page/a%20b`);
    expect(urnHref("keep:page/a b")).toBe(`${KEEP_ORIGIN}/embed/page/a%20b`);
  });

  it("opens any other https link as it is", () => {
    expect(urnHref("https://linear.app/x/issue/ABC-1")).toBe("https://linear.app/x/issue/ABC-1");
  });

  it("has no address for anything else", () => {
    expect(urnHref("keep:database/0b1c")).toBeNull();
    expect(urnHref("keep:page/")).toBeNull();
    expect(urnHref("http://keep.desk.atmagaming.com/p/0b1c")).toBeNull();
  });
});

describe("pageHref", () => {
  it("opens a Keep page as a page", () => {
    expect(pageHref("keep:page/0b1c")).toBe(`${KEEP_ORIGIN}/p/0b1c`);
    expect(pageHref("https://keep.desk.atmagaming.com/p/0b1c")).toBe(`${KEEP_ORIGIN}/p/0b1c`);
  });

  it("opens other https links as they are and nothing else", () => {
    expect(pageHref("https://example.com/a")).toBe("https://example.com/a");
    expect(pageHref("ftp://example.com/a")).toBeNull();
  });
});
