/**
 * The app's data, kept on the device between launches.
 *
 * A cache that only lives in memory is empty every cold start, so reopening the app means a
 * skeleton and a round trip before anything is on screen — on a phone that's most of the times
 * it's opened. Writing each cache through to `localStorage` means the last thing you saw is
 * already there in the first frame, and the network request happens behind it.
 *
 * Everything here is best-effort. Storage can be full, disabled, or holding an entry written by
 * an older build; none of those are worth an error on screen, so a bad read is just a miss.
 */

/**
 * Bumped when a stored shape stops matching what the code expects — old keys are ignored.
 * v2: calendars became a list of accounts, each with its own calendars. A v1 entry read back
 * into that shape has no `accounts` at all, and the screen it hydrates dies on the first frame.
 */
const PREFIX = "balance:v2";
const OWNER_KEY = `${PREFIX}:owner`;

/** Older than this and the round trip is worth waiting for after all. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface Entry<T> {
  /** When it was written, so age and eviction order don't need a separate index. */
  t: number;
  v: T;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    // Safari throws on access rather than returning null when storage is blocked.
    return null;
  }
}

/**
 * Whose data is on disk. Read at module load rather than after Clerk resolves, because the
 * whole point is to have rows before the session is confirmed.
 */
export function storedOwner() {
  return storage()?.getItem(OWNER_KEY) ?? null;
}

/**
 * Claims the stored data for a user. A different user than last time means none of it is
 * theirs, so it goes — the caller clears the in-memory copies to match.
 *
 * @returns whether the stored data belonged to someone else and was dropped.
 */
export function adoptOwner(userId: string) {
  const store = storage();
  if (!store) return false;
  const previous = storedOwner();
  if (previous === userId) return false;
  wipe();
  store.setItem(OWNER_KEY, userId);
  return previous !== null;
}

export function read<T>(key: string): T | undefined {
  const store = storage();
  if (!store) return undefined;
  try {
    const raw = store.getItem(`${PREFIX}:${key}`);
    if (!raw) return undefined;
    const entry = JSON.parse(raw) as Entry<T>;
    if (typeof entry?.t !== "number" || Date.now() - entry.t > MAX_AGE_MS) return undefined;
    return entry.v;
  } catch {
    return undefined;
  }
}

export function write<T>(key: string, value: T, now: number) {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(`${PREFIX}:${key}`, JSON.stringify({ t: now, v: value } satisfies Entry<T>));
  } catch {
    // A full quota shouldn't break a write that already succeeded on the server. Make room by
    // dropping the oldest weeks — they're the bulk of it — and let the next write try again.
    evictOldest(store, 8);
  }
}

export function drop(key: string) {
  storage()?.removeItem(`${PREFIX}:${key}`);
}

/** Sign-out: the next account must not open onto the last one's week. */
export function wipe() {
  const store = storage();
  if (!store) return;
  for (const key of ownKeys(store)) store.removeItem(key);
}

/**
 * Weeks accumulate one entry per week ever paged to, so the stored set is trimmed to the same
 * order of magnitude the in-memory map keeps — oldest written first out.
 */
export function prune(keyPrefix: string, keep: number) {
  const store = storage();
  if (!store) return;
  const full = `${PREFIX}:${keyPrefix}`;
  const entries = ownKeys(store)
    .filter((key) => key.startsWith(full))
    .map((key) => ({ key, t: writtenAt(store, key) }))
    .sort((a, b) => b.t - a.t);
  for (const entry of entries.slice(keep)) store.removeItem(entry.key);
}

function evictOldest(store: Storage, count: number) {
  const entries = ownKeys(store)
    .map((key) => ({ key, t: writtenAt(store, key) }))
    .sort((a, b) => a.t - b.t);
  for (const entry of entries.slice(0, count)) store.removeItem(entry.key);
}

function ownKeys(store: Storage) {
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key?.startsWith(`${PREFIX}:`) && key !== OWNER_KEY) keys.push(key);
  }
  return keys;
}

/** An entry nobody can date is treated as the oldest there is, which is what it behaves like. */
function writtenAt(store: Storage, key: string) {
  try {
    // The keys come from `ownKeys`, so the entry is there; a missing one parses to `null` and
    // throws on the read below, which is the same answer by another route.
    return (JSON.parse(store.getItem(key) as string) as Entry<unknown>).t ?? 0;
  } catch {
    return 0;
  }
}
