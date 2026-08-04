import * as SecureStore from "expo-secure-store";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, useColorScheme } from "react-native";
import type { ThemeColors } from "./colors";
import { palette, radii, spacing } from "./colors";
import { fonts, type } from "./typography";

export type ThemeMode = "system" | "light" | "dark";

interface Theme {
  colors: ThemeColors;
  spacing: typeof spacing;
  radii: typeof radii;
  type: typeof type;
  fonts: typeof fonts;
  scheme: "light" | "dark";
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  /** True when the user asked the system to limit animation. */
  reduceMotion: boolean;
}

const ThemeContext = createContext<Theme | null>(null);
const MODE_KEY = "balance.theme-mode";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme() === "dark" ? "dark" : "light";
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    SecureStore.getItemAsync(MODE_KEY)
      .then((stored) => {
        if (stored === "light" || stored === "dark" || stored === "system") setModeState(stored);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => sub.remove();
  }, []);

  const value = useMemo<Theme>(() => {
    const scheme = mode === "system" ? systemScheme : mode;
    return {
      colors: palette[scheme],
      spacing,
      radii,
      type,
      fonts,
      scheme,
      mode,
      reduceMotion,
      setMode: (next: ThemeMode) => {
        setModeState(next);
        SecureStore.setItemAsync(MODE_KEY, next).catch(() => {});
      },
    };
  }, [mode, systemScheme, reduceMotion]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
