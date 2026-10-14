/**
 * The `/` typed into an event's name, which opens what the hour counts as without leaving the
 * keyboard: `Gym /hea` is the name "Gym" and the sphere being looked for, "hea".
 */
export interface Slash {
  /** Where the slash sits in the name. */
  readonly start: number;
  /** Where what is being looked for ends — the caret. */
  readonly end: number;
  /** What has been typed after the slash. */
  readonly query: string;
}

/**
 * The slash being typed at the caret, if there is one. It has to open a word — at the start of
 * the name or after a space — so "1/2 day" and a pasted path never open anything, and a sphere's
 * name may hold spaces ("Deep work") but not two in a row or a leading one, which is the name
 * carrying on after a slash nobody meant.
 */
export function slashAt(text: string, caret: number): Slash | null {
  const before = text.slice(0, caret);
  const start = before.lastIndexOf("/");
  if (start < 0) return null;
  if (start > 0 && !/\s/.test(before[start - 1])) return null;
  const query = before.slice(start + 1);
  if (query.startsWith(" ") || query.includes("  ")) return null;
  return { start, end: caret, query };
}

/** The name with the slash and what followed it taken out, and where the caret goes after. */
export function withoutSlash(text: string, slash: Slash): { text: string; caret: number } {
  const before = text.slice(0, slash.start).trimEnd();
  const after = text.slice(slash.end).trimStart();
  const joint = before && after ? " " : "";
  return { text: before + joint + after, caret: before.length + joint.length };
}
