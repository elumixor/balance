/**
 * Where an occurrence stood in its series before anyone moved it. Google writes the original
 * start into the occurrence's id — `master_20260907T090000Z`, or `master_20260907` for an
 * all-day one — which is the only record of it once the occurrence has been dragged.
 */
const ID_SUFFIX = /_(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z)?$/;

/** The instant the occurrence was born at, or null for an id that doesn't say. */
export function originalStart(occurrenceId: string): Date | null {
  const match = ID_SUFFIX.exec(occurrenceId);
  if (!match) return null;
  const [, y, m, d, hh, mm, ss] = match;
  return hh
    ? new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss)))
    : new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
}

/**
 * Whether this is the occurrence the series starts with — where "from here on" and "all" are
 * the same answer. Unknown is taken as not the first, so the choice is offered rather than lost.
 */
export function isFirstOccurrence(event: { id: string; seriesStart: string | null }): boolean {
  if (!event.seriesStart) return false;
  const born = originalStart(event.id);
  if (!born) return false;
  const seriesStart = new Date(event.seriesStart);
  // An all-day id carries a date and no time; the master's start is that day in its calendar's
  // zone, so the two are compared by day.
  const dated = !/T\d{6}Z$/.test(event.id);
  if (dated) return born.getTime() <= seriesStart.getTime() + 24 * 60 * 60 * 1000 - 1;
  return born.getTime() <= seriesStart.getTime();
}
