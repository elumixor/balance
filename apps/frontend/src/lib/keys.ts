/**
 * Whether a keystroke belongs to a text field rather than to the app.
 *
 * Every bare-letter shortcut has to ask this first: `c` is "go to Calendar" everywhere except
 * inside the box where somebody is naming an event, and there it is the letter c.
 */
export function isTyping(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  return Boolean(
    element?.isContentEditable || element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement,
  );
}

/** True for a plain keypress — a shortcut that means something else once a modifier is held. */
export function isBareKey(event: KeyboardEvent) {
  return !event.metaKey && !event.ctrlKey && !event.altKey && !isTyping(event.target);
}
