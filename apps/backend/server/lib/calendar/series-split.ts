/**
 * Cutting a series in two at one occurrence — "this and following" — in RRULE terms.
 *
 * The calendar keeps one rule per series, so the change is made on the master: its rule is told
 * to end just before the occurrence, and a new series starts where that occurrence stands with
 * whatever is left of the rule. Google writes the occurrence's original start into its id
 * (`master_20260907T090000Z`, or `master_20260907` for an all-day one), which is the only
 * record of where the occurrence was before anyone moved it.
 */

export type SplitPoint =
  | { readonly kind: "instant"; readonly at: Date }
  | { readonly kind: "date"; readonly day: string };

const ID_SUFFIX = /_(\d{8})(T\d{6}Z)?$/;

/** Where the occurrence originally fell, off its id; the fallback is what the caller saw. */
export function splitPointOf(occurrenceId: string, fallback: Date): SplitPoint {
  const match = ID_SUFFIX.exec(occurrenceId);
  if (!match) return { kind: "instant", at: fallback };
  const [, day, time] = match;
  if (!time) return { kind: "date", day };
  const iso = `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}T${time.slice(1, 3)}:${time.slice(3, 5)}:${time.slice(5, 7)}Z`;
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? { kind: "instant", at: fallback } : { kind: "instant", at };
}

/** True when the split falls on the master's own start: nothing would be left before it. */
export function isSeriesStart(point: SplitPoint, masterStart: Date): boolean {
  return point.kind === "instant" ? point.at.getTime() <= masterStart.getTime() : point.day <= dateStamp(masterStart);
}

/**
 * The rule as it ends just before the split. COUNT can't share a line with UNTIL, so it goes; the
 * other lines — EXDATE, RDATE — are kept, since they still describe the days that remain.
 */
export function truncateRule(lines: readonly string[], point: SplitPoint): string[] {
  return lines.map((line) => {
    if (!line.startsWith("RRULE:")) return line;
    const parts = line
      .slice("RRULE:".length)
      .split(";")
      .filter((part) => !part.startsWith("COUNT=") && !part.startsWith("UNTIL="));
    return `RRULE:${[...parts, `UNTIL=${untilOf(point)}`].join(";")}`;
  });
}

/**
 * The rule for the new series. A rule that ends on a day still ends on it; one that ends after
 * so many times has already spent `elapsed` of them.
 */
export function remainingRule(lines: readonly string[], elapsed: number): string[] {
  return lines.map((line) => {
    if (!line.startsWith("RRULE:")) return line;
    const parts = line
      .slice("RRULE:".length)
      .split(";")
      .map((part) => {
        if (!part.startsWith("COUNT=")) return part;
        const count = Number(part.slice("COUNT=".length));
        return `COUNT=${Math.max(1, count - elapsed)}`;
      });
    return `RRULE:${parts.join(";")}`;
  });
}

/** The last moment before the split, the way RRULE spells one: a UTC instant, or a date. */
function untilOf(point: SplitPoint): string {
  if (point.kind === "date") {
    const [y, m, d] = [point.day.slice(0, 4), point.day.slice(4, 6), point.day.slice(6, 8)].map(Number);
    return dateStamp(new Date(Date.UTC(y, m - 1, d - 1)));
  }
  const before = new Date(point.at.getTime() - 1000);
  return `${dateStamp(before)}T${pad(before.getUTCHours())}${pad(before.getUTCMinutes())}${pad(before.getUTCSeconds())}Z`;
}

function dateStamp(at: Date) {
  return `${at.getUTCFullYear()}${pad(at.getUTCMonth() + 1)}${pad(at.getUTCDate())}`;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}
