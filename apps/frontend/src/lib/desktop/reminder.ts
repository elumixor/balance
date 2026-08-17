import type { TravelLeg } from "$lib/travel";

/**
 * What a reminder card shows, and how it gets to the window that shows it.
 *
 * The card is a second webview with no session of its own, so it is handed the finished answer
 * instead of the means to work one out: the window that scheduled the reminder already knows the
 * event, the link, the address and how long the bus takes. It travels in the URL, which is the
 * one channel a freshly built webview has before it has run any of its own code.
 */

export type ReminderKind = "starts" | "leave";

export interface ReminderCard {
  /** The event's id, so a snooze can be matched back to what it was about. */
  readonly id: string;
  readonly kind: ReminderKind;
  readonly title: string;
  readonly start: string;
  readonly end: string;
  /** The category colour, so the card is the same colour as the block on the week. */
  readonly color: string;
  /** The category icon, so the card names what the event counts as, not just its colour. */
  readonly icon: string;
  readonly location: string | null;
  readonly join: { url: string; label: string } | null;
  readonly links: { url: string; label: string }[];
  readonly travel: TravelLeg[];
}

/** URL-safe base64, because the card arrives as a query parameter. */
export function encodeReminder(card: ReminderCard) {
  const json = new TextEncoder().encode(JSON.stringify(card));
  const binary = String.fromCharCode(...json);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeReminder(param: string | null): ReminderCard | null {
  if (!param) return null;
  try {
    const binary = atob(param.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as ReminderCard;
  } catch {
    // A card that can't be read is a card that isn't shown — there is nothing useful to say.
    return null;
  }
}
