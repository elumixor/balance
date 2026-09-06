export interface Claim {
  readonly id: string;
  readonly claimed: number;
}

interface Allocation {
  readonly id: string;
  readonly claimed: number;
  readonly hours: number;
}

/**
 * Fits a sphere's claims under its cap in rank order: the first project keeps its whole claim,
 * the next what is left, and so on until the cap is spent. Nothing is scaled — a project at half
 * its hours is a project at half speed, and the date rule already says what that means. Under the
 * cap, every claim is kept as it is.
 */
export function allocate(cap: number, ranked: readonly Claim[]): Allocation[] {
  let left = Math.max(0, cap);
  return ranked.map((claim) => {
    const hours = Math.min(claim.claimed, left);
    left -= hours;
    return { id: claim.id, claimed: claim.claimed, hours: Math.round(hours * 4) / 4 };
  });
}

/** The sum of a sphere's claims against its cap, over the projects that are live. */
export function overclaim(cap: number, claims: readonly Claim[]) {
  const total = claims.reduce((sum, c) => sum + c.claimed, 0);
  return { total, cap, over: Math.max(0, total - cap) };
}
