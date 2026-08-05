import { browser } from "$app/environment";

export type ThemeMode = "system" | "light" | "dark";

const MODE_KEY = "balance.theme-mode";

class Theme {
  mode = $state<ThemeMode>("system");
  /** True when the user asked the system to limit animation. */
  reduceMotion = $state(false);

  #systemDark = $state(false);

  get scheme(): "light" | "dark" {
    if (this.mode === "system") return this.#systemDark ? "dark" : "light";
    return this.mode;
  }

  /** Called once from the root layout, where the DOM is guaranteed to exist. */
  start() {
    if (!browser) return;
    const stored = localStorage.getItem(MODE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") this.mode = stored;

    const dark = window.matchMedia("(prefers-color-scheme: dark)");
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.#systemDark = dark.matches;
    this.reduceMotion = motion.matches;

    const onDark = (e: MediaQueryListEvent) => (this.#systemDark = e.matches);
    const onMotion = (e: MediaQueryListEvent) => (this.reduceMotion = e.matches);
    dark.addEventListener("change", onDark);
    motion.addEventListener("change", onMotion);

    $effect(() => {
      document.documentElement.classList.toggle("dark", this.scheme === "dark");
    });

    return () => {
      dark.removeEventListener("change", onDark);
      motion.removeEventListener("change", onMotion);
    };
  }

  setMode(mode: ThemeMode) {
    this.mode = mode;
    if (browser) localStorage.setItem(MODE_KEY, mode);
  }
}

export const theme = new Theme();
