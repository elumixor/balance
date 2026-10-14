import { ApiClientError } from "$lib/core/api";
import { calendarWeek } from "$lib/core/store.svelte";
import { diagnostics } from "$lib/platform/diagnostics.svelte";
import { weekRange } from "./dates";
import { classifyCalendarEvents } from "./queries";

/** Weeks already handed to the server this session, by their Monday. */
const asked = new Set<string>();
let queue: Promise<void> = Promise.resolve();

/**
 * Asks the server to file the grey blocks of each week once a session, after the week has been
 * drawn — the blocks the model is sure about come back mapped, and the week is fetched again
 * behind the rows it already shows. One week at a time: neighbouring weeks share their series,
 * and two runs at once would ask about the same one twice.
 *
 * Nobody waits on it. Being offline or signed out forgets the week so the next visit asks again;
 * only a server that answered and refused is worth a card.
 */
export function autoFile(keys: readonly string[]) {
  for (const key of keys) {
    if (asked.has(key)) continue;
    asked.add(key);
    queue = queue.then(() => fileWeek(key));
  }
}

async function fileWeek(key: string) {
  try {
    const { classified } = await classifyCalendarEvents(weekRange(key));
    if (classified > 0) await calendarWeek(key).refresh();
  } catch (error) {
    if (!(error instanceof ApiClientError) || error.status === undefined) {
      asked.delete(key);
      return;
    }
    // A deployment that doesn't have the route yet is a server behind the app, not a failure
    // anybody holding it can act on.
    if (error.status === 404) return;
    diagnostics.report("Calendar", error, { title: "Couldn't file this week's blocks by themselves." });
  }
}
