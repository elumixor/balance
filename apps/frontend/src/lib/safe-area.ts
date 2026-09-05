import { browser } from "$app/environment";

/**
 * The notch and the home indicator, in pixels, for a panel placed from a script. CSS reads
 * `env(safe-area-inset-*)` itself; a `getBoundingClientRect` clamp can't, so the two variables in
 * `app.css` carry the same numbers over.
 */
export function safeArea(): { readonly top: number; readonly bottom: number } {
  if (!browser) return { top: 0, bottom: 0 };
  const style = getComputedStyle(document.documentElement);
  return {
    top: Number.parseFloat(style.getPropertyValue("--safe-top")) || 0,
    bottom: Number.parseFloat(style.getPropertyValue("--safe-bottom")) || 0,
  };
}
