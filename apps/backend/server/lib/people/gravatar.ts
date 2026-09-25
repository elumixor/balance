import { createHash } from "node:crypto";

const SIZE = 160;
/** How long a lookup that is only ever a nicety may hold up whoever asked for it. */
const TIMEOUT_MS = 4000;

/** Where Gravatar keeps a picture for this address, when it keeps one at all. */
export function gravatarUrl(email: string): string {
  const hash = createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
  return `https://gravatar.com/avatar/${hash}?s=${SIZE}&d=404`;
}

/**
 * The address's Gravatar, or null. `d=404` makes an unknown address a 404 rather than a
 * silhouette, and a network that can't be reached is the same answer: no picture is never an error.
 */
export async function gravatarFor(email: string): Promise<string | null> {
  const url = gravatarUrl(email);
  try {
    const response = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(TIMEOUT_MS) });
    return response.ok ? url : null;
  } catch {
    return null;
  }
}
