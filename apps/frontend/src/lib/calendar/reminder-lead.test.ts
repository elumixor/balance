import { describe, expect, it } from "vitest";
import { describeLead, formatLead, LEAD_PRESETS, parseLead } from "./reminder-lead";

describe("parseLead", () => {
  it("reads every way a lead gets typed", () => {
    expect(parseLead("5")).toBe(5);
    expect(parseLead("5m")).toBe(5);
    expect(parseLead(" 5 min ")).toBe(5);
    expect(parseLead("30 minutes before")).toBe(30);
    expect(parseLead("1h")).toBe(60);
    expect(parseLead("1.5 hours")).toBe(90);
    expect(parseLead("2 days early")).toBe(2880);
    expect(parseLead("1w")).toBe(10080);
    expect(parseLead("1h 30m")).toBe(90);
    expect(parseLead("1h30")).toBeNull();
    expect(parseLead("1h 30x")).toBeNull();
  });

  it("knows the moment itself", () => {
    expect(parseLead("at time")).toBe(0);
    expect(parseLead("0")).toBe(0);
    expect(parseLead("When it starts")).toBe(0);
  });

  it("refuses what isn't a lead", () => {
    expect(parseLead("")).toBeNull();
    expect(parseLead("soon")).toBeNull();
    expect(parseLead("5 fortnights")).toBeNull();
    expect(parseLead("-5m")).toBeNull();
    expect(parseLead("99w")).toBeNull();
  });
});

describe("formatLead", () => {
  it("picks the shortest unit that says it exactly", () => {
    expect(LEAD_PRESETS.map(formatLead)).toEqual(["at time", "5m", "10m", "15m", "30m", "1h", "2h", "1d"]);
    expect(formatLead(90)).toBe("1h 30m");
    expect(formatLead(10080)).toBe("1w");
    expect(formatLead(-3)).toBe("at time");
  });

  it("round-trips through parseLead", () => {
    for (const minutes of [...LEAD_PRESETS, 90, 10080, 45]) expect(parseLead(formatLead(minutes))).toBe(minutes);
  });
});

describe("describeLead", () => {
  it("spells the unit out, singular or plural", () => {
    expect(describeLead(0)).toBe("At time");
    expect(describeLead(1)).toBe("1 minute before");
    expect(describeLead(45)).toBe("45 minutes before");
    expect(describeLead(60)).toBe("1 hour before");
    expect(describeLead(120)).toBe("2 hours before");
    expect(describeLead(1440)).toBe("1 day before");
    expect(describeLead(20160)).toBe("2 weeks before");
  });
});
