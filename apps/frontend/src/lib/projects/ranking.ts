export type Dimension = "priority" | "fun";

export interface Comparison {
  readonly aId: string;
  readonly bId: string;
  readonly dimension: Dimension;
  readonly winnerId: string;
}

export interface Question {
  readonly aId: string;
  readonly bId: string;
  readonly dimension: Dimension;
}

/**
 * Pairwise ranking, asking only what is needed. Every answered comparison is an edge; an order is
 * a topological sort of the edges that have been given, and a pair is only worth asking about
 * when neither project already beats the other by some chain of answers.
 */
function beats(comparisons: readonly Comparison[], dimension: Dimension) {
  const wins = new Map<string, Set<string>>();
  for (const c of comparisons) {
    if (c.dimension !== dimension) continue;
    const loser = c.winnerId === c.aId ? c.bId : c.aId;
    wins.set(c.winnerId, (wins.get(c.winnerId) ?? new Set()).add(loser));
  }
  return wins;
}

/** Whether `a` beats `b` through any chain of answers. */
function reaches(wins: Map<string, Set<string>>, a: string, b: string, seen = new Set<string>()): boolean {
  if (a === b) return true;
  if (seen.has(a)) return false;
  seen.add(a);
  for (const next of wins.get(a) ?? []) if (reaches(wins, next, b, seen)) return true;
  return false;
}

/** The next pair nothing answered yet decides, or null when the order is settled. */
export function nextQuestion(
  ids: readonly string[],
  comparisons: readonly Comparison[],
  dimension: Dimension,
): Question | null {
  const wins = beats(comparisons, dimension);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i];
      const b = ids[j];
      if (!reaches(wins, a, b) && !reaches(wins, b, a)) return { aId: a, bId: b, dimension };
    }
  }
  return null;
}

/**
 * The ids in order, best first, from whatever has been answered. Undecided pairs keep their given
 * order, so an unranked list comes back as it went in and a half-ranked one is stable.
 */
export function rankOrder(ids: readonly string[], comparisons: readonly Comparison[], dimension: Dimension): string[] {
  const wins = beats(comparisons, dimension);
  const score = (id: string) => ids.filter((other) => other !== id && reaches(wins, id, other)).length;
  return [...ids].sort((a, b) => score(b) - score(a));
}

/**
 * What the two orders say together: how often the more fun project outranks the higher-priority
 * one. Reported as an observation — the number is the number, and what to do about it is not
 * this function's to say.
 */
export function pattern(ids: readonly string[], comparisons: readonly Comparison[]): string | null {
  const priority = beats(comparisons, "priority");
  const fun = beats(comparisons, "fun");
  const decide = (wins: Map<string, Set<string>>, a: string, b: string) =>
    reaches(wins, a, b) ? 1 : reaches(wins, b, a) ? -1 : 0;
  let agree = 0;
  let disagree = 0;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const p = decide(priority, ids[i], ids[j]);
      const f = decide(fun, ids[i], ids[j]);
      // A pair one of the orders cannot tell apart says nothing about the other.
      if (p === 0 || f === 0) continue;
      if (p === f) agree++;
      else disagree++;
    }
  }
  const total = agree + disagree;
  if (total === 0) return null;
  if (disagree === 0) return "What you'd rather do and what matters most line up.";
  if (agree === 0) return "The order you'd rather do these in is the reverse of what matters most.";
  return `In ${disagree} of ${total} pairs, the one you'd rather do is not the one that matters more.`;
}
