import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type DraftCalendar, EventDraft, SAVE_DELAY_MS, samePreview } from "./event-draft.svelte";
import { type CalendarEvent, NOT_A_MEETING } from "./types";

function event(extra: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "one",
    calendarId: "acc::cal",
    seriesId: null,
    seriesStart: null,
    title: "Standup",
    description: "Notes",
    start: new Date(2026, 7, 10, 9).toISOString(),
    end: new Date(2026, 7, 10, 9, 30).toISOString(),
    allDay: false,
    declined: false,
    tentative: false,
    readOnly: false,
    movable: true,
    countsTowardHours: true,
    url: null,
    mappingScope: "instance",
    activityId: null,
    activityName: null,
    weights: [],
    ...NOT_A_MEETING,
    ...extra,
  };
}

/** A calendar that remembers what it was asked and can be made to refuse. */
function calendar(overrides: Partial<Pick<DraftCalendar, "editEvent" | "becameId">> = {}) {
  return {
    editEvent: vi.fn(overrides.editEvent ?? (async () => undefined)),
    report: vi.fn(),
    becameId: vi.fn(overrides.becameId ?? (() => null)),
  } satisfies DraftCalendar;
}

describe("EventDraft", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("takes the event's fields on load and says so", () => {
    const draft = new EventDraft(calendar());
    expect(draft.load(event())).toBe(true);
    expect(draft.title).toBe("Standup");
    expect(draft.notes).toBe("Notes");
    expect(draft.date).toBe("2026-08-10");
    expect(draft.from).toBe("09:00");
    expect(draft.to).toBe("09:30");
    expect(draft.span).toBe("30m");
    expect(draft.editable).toBe(true);
  });

  it("reads an event with no notes as empty, and a locked one as not editable", () => {
    const draft = new EventDraft(calendar());
    draft.load(event({ description: null, movable: false }));
    expect(draft.notes).toBe("");
    expect(draft.editable).toBe(false);
    draft.load(event({ id: "two", allDay: true }));
    expect(draft.editable).toBe(false);
  });

  it("leaves the fields alone when the same event is loaded again", () => {
    const draft = new EventDraft(calendar());
    draft.load(event());
    draft.title = "Typed";
    expect(draft.load(event({ title: "Server" }))).toBe(false);
    expect(draft.title).toBe("Typed");
  });

  it("keeps what was typed when the block being typed into gets its real id", () => {
    const cal = calendar({ becameId: (id) => (id === "draft" ? "real" : null) });
    const draft = new EventDraft(cal);
    draft.load(event({ id: "draft", title: "" }));
    draft.title = "Half typ";
    expect(draft.load(event({ id: "real", title: "" }))).toBe(false);
    expect(draft.title).toBe("Half typ");
    // A third block is another block, whatever the first one became.
    expect(draft.load(event({ id: "other", title: "Other" }))).toBe(true);
    expect(draft.title).toBe("Other");
  });

  it("writes a moment after the last keystroke, with only what moved", () => {
    const cal = calendar();
    const draft = new EventDraft(cal);
    draft.load(event());
    draft.title = " Renamed ";
    draft.queue();
    draft.title = " Renamed twice ";
    draft.queue();
    vi.advanceTimersByTime(SAVE_DELAY_MS - 1);
    expect(cal.editEvent).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(cal.editEvent).toHaveBeenCalledTimes(1);
    expect(cal.editEvent.mock.calls[0][1]).toEqual({
      title: "Renamed twice",
      description: "Notes",
      start: new Date(2026, 7, 10, 9),
      end: new Date(2026, 7, 10, 9, 30),
    });
  });

  it("flushes a pending edit at once and never writes an unchanged one", () => {
    const cal = calendar();
    const draft = new EventDraft(cal);
    draft.load(event());
    draft.flush();
    draft.queue();
    draft.flush();
    expect(cal.editEvent).not.toHaveBeenCalled();
    draft.to = "10:00";
    draft.queue();
    draft.flush();
    expect(cal.editEvent).toHaveBeenCalledTimes(1);
    vi.runAllTimers();
    expect(cal.editEvent).toHaveBeenCalledTimes(1);
  });

  it("carries an end before its start into the next day", () => {
    const draft = new EventDraft(calendar());
    draft.load(event());
    draft.from = "23:00";
    draft.to = "01:00";
    expect(draft.span).toBe("2h");
    expect(draft.parseRange()?.end).toEqual(new Date(2026, 7, 11, 1));
    expect(draft.parseRange("22:00", "22:30")?.start).toEqual(new Date(2026, 7, 10, 22));
  });

  it("says so once when the times can't be read, and writes nothing", () => {
    const cal = calendar();
    const draft = new EventDraft(cal);
    draft.load(event());
    draft.to = "soon";
    expect(draft.span).toBe("");
    draft.queue();
    vi.runAllTimers();
    expect(cal.editEvent).not.toHaveBeenCalled();
    expect(cal.report).toHaveBeenCalledWith("Check the date and times", "Check the date and times.");
  });

  it("writes nothing for an event that can't be edited", () => {
    const cal = calendar();
    const draft = new EventDraft(cal);
    draft.load(event({ movable: false }));
    draft.title = "Renamed";
    draft.queue();
    vi.runAllTimers();
    expect(cal.editEvent).not.toHaveBeenCalled();
  });

  it("has nothing to say before an event is loaded", () => {
    const cal = calendar();
    const draft = new EventDraft(cal);
    draft.queue();
    vi.runAllTimers();
    expect(cal.editEvent).not.toHaveBeenCalled();
    expect(draft.preview).toBeNull();
  });

  it("drops the pending edit of a deleted event", () => {
    const cal = calendar();
    const draft = new EventDraft(cal);
    draft.load(event());
    draft.title = "Renamed";
    draft.queue();
    draft.discard();
    vi.runAllTimers();
    draft.flush();
    expect(cal.editEvent).not.toHaveBeenCalled();
    // Nothing pending is nothing to drop.
    draft.discard();
  });

  it("appends a line to the notes and writes at once", () => {
    const cal = calendar();
    const draft = new EventDraft(cal);
    draft.load(event({ description: "Agenda  " }));
    draft.append("https://zoom.us/j/1");
    expect(draft.notes).toBe("Agenda\n\nhttps://zoom.us/j/1");
    expect(cal.editEvent).toHaveBeenCalledTimes(1);
    draft.load(event({ id: "two", description: "   " }));
    draft.append("https://zoom.us/j/2");
    expect(draft.notes).toBe("https://zoom.us/j/2");
  });

  it("reports a write the calendar refuses, and its own edits too", async () => {
    const cal = calendar({ editEvent: async () => Promise.reject(new Error("403")) });
    const draft = new EventDraft(cal);
    await draft.write("The zone wasn’t saved", Promise.reject(new Error("refused")));
    expect(cal.report).toHaveBeenCalledWith("The zone wasn’t saved", new Error("refused"));
    await draft.write("Fine", Promise.resolve());
    expect(cal.report).toHaveBeenCalledTimes(1);

    draft.load(event());
    draft.title = "Renamed";
    draft.queue();
    await vi.runAllTimersAsync();
    expect(cal.report).toHaveBeenCalledWith("The edit wasn’t saved", new Error("403"));
  });

  it("previews where a time field is pointing, and nothing while none is", () => {
    const draft = new EventDraft(calendar());
    draft.load(event());
    expect(draft.preview).toBeNull();
    draft.previewTo = "11:00";
    expect(draft.preview).toEqual({
      id: "one",
      start: new Date(2026, 7, 10, 9).toISOString(),
      end: new Date(2026, 7, 10, 11).toISOString(),
    });
    draft.previewFrom = "08:00";
    expect(draft.preview?.start).toBe(new Date(2026, 7, 10, 8).toISOString());
    draft.previewTo = null;
    expect(draft.preview?.end).toBe(new Date(2026, 7, 10, 9, 30).toISOString());
    draft.previewFrom = "nope";
    expect(draft.preview).toBeNull();
    // Another block puts the fields away, the preview with them.
    draft.load(event({ id: "two" }));
    expect(draft.previewFrom).toBeNull();
    expect(draft.preview).toBeNull();
  });
});

describe("samePreview", () => {
  it("compares by the block and its ends", () => {
    const a = { id: "one", start: "s", end: "e" };
    expect(samePreview(null, null)).toBe(true);
    expect(samePreview(a, { ...a })).toBe(true);
    expect(samePreview(a, null)).toBe(false);
    expect(samePreview(a, { ...a, end: "later" })).toBe(false);
  });
});
