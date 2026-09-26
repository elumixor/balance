import { describe, expect, it } from "vitest";
import { accountHint, accountLabel, matchesAccount } from "./account-names";

const gmail = { email: "me@gmail.com" };
const nameless = { email: null };

describe("accountLabel", () => {
  it("prefers the name given here, then the address, then says so", () => {
    expect(accountLabel(gmail, "Work")).toBe("Work");
    expect(accountLabel(gmail, "  ")).toBe("me@gmail.com");
    expect(accountLabel(nameless, "")).toBe("Unknown account");
  });
});

describe("accountHint", () => {
  it("shows the address under a name, and nothing under an address", () => {
    expect(accountHint(gmail, "Work")).toBe("me@gmail.com");
    expect(accountHint(gmail, "")).toBeNull();
    expect(accountHint(nameless, "Work")).toBeNull();
  });
});

describe("matchesAccount", () => {
  it("finds an account by its name or its address, in any case, and everything for nothing typed", () => {
    expect(matchesAccount(gmail, "Work", "wor")).toBe(true);
    expect(matchesAccount(gmail, "Work", "GMAIL")).toBe(true);
    expect(matchesAccount(gmail, "Work", "zz")).toBe(false);
    expect(matchesAccount(nameless, "", "")).toBe(true);
    expect(matchesAccount(nameless, "Work", "gmail")).toBe(false);
  });
});
