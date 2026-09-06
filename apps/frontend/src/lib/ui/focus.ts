/**
 * Focuses a field that may still be hidden.
 *
 * A popup spends its first frames hidden while it works out where it belongs, and a hidden field
 * can't take focus, so this keeps asking until it lands — and stops the moment the node leaves the
 * document, so an unmount never leaves a frame loop running. `preventScroll` because a plain
 * `focus()` on a field still at (0,0) scrolls whatever ancestor is scrollable into "view" of that
 * phantom position: a screen lurches and shows a scrollbar the moment the popup opens.
 *
 * Usable as a Svelte action (`use:focusWhenReady`) and returns the cancel for effects.
 */
export function focusWhenReady(node: HTMLElement) {
  let frame = 0;
  const focus = () => {
    node.focus({ preventScroll: true });
    if (node.isConnected && document.activeElement !== node) frame = requestAnimationFrame(focus);
  };
  focus();
  const cancel = () => cancelAnimationFrame(frame);
  return { destroy: cancel, cancel };
}
