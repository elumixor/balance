import { isNativeShell } from "$lib/desktop/platform";

/**
 * Whether a keystroke belongs to a text field rather than to the app.
 *
 * Every bare-letter shortcut has to ask this first: `c` is "go to Calendar" everywhere except
 * inside the box where somebody is naming an event, and there it is the letter c.
 */
function isTyping(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  return Boolean(
    element?.isContentEditable || element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement,
  );
}

/**
 * How settings are opened from the keyboard.
 *
 * ⌘, in the native shells, the way every other Mac app spells it. In a browser that combination
 * already belongs to the browser — Chrome opens its own preferences on it and never lets the page
 * see it — so the tab takes ⌘⇧, instead.
 */
export const SETTINGS_HOTKEY = isNativeShell ? "⌘," : "⌘⇧,";

/** Whether a keystroke is the one that opens settings. Matched by physical key: with shift held,
 *  the comma key reports itself as `<`. */
export function isSettingsKey(event: KeyboardEvent) {
  if (!(event.metaKey || event.ctrlKey) || isTyping(event.target)) return false;
  if (event.code !== "Comma" && event.key !== ",") return false;
  return isNativeShell || event.shiftKey;
}

/**
 * The bare letter outside a text field — the same shape as `c` and `p` for the tabs — and ⌘R in
 * the native shells, where there is no browser to reload. In a browser ⌘R (Ctrl+R) stays the
 * browser's: it reloads the page, and the app doesn't take it away.
 */
export function isRefreshKey(event: KeyboardEvent) {
  if (event.altKey || event.shiftKey || isTyping(event.target)) return false;
  if (event.key.toLowerCase() !== "r") return false;
  const modified = event.metaKey || event.ctrlKey;
  return !modified || isNativeShell;
}

/** True for a plain keypress — a shortcut that means something else once a modifier is held. */
export function isBareKey(event: KeyboardEvent) {
  return !event.metaKey && !event.ctrlKey && !event.altKey && !isTyping(event.target);
}
