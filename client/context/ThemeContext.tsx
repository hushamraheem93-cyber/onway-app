import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColorScheme as useSystemColorScheme } from "react-native";

type ThemeMode = "light" | "dark" | "system";

interface ThemeContextType {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  effectiveTheme: "light" | "dark";
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = "@onway_theme_mode";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemColorScheme = useSystemColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>("system");
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    loadThemeMode();
  }, []);

  const loadThemeMode = async () => {
    try {
      const savedMode = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      if (savedMode && (savedMode === "light" || savedMode === "dark" || savedMode === "system")) {
        setThemeModeState(savedMode as ThemeMode);
      }
    } catch {
      // silent
    } finally {
      setIsLoaded(true);
    }
  };

  const setThemeMode = useCallback(async (mode: ThemeMode) => {
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
      setThemeModeState(mode);
    } catch {
      // silent
    }
  }, []);

  // OnWay ships a single official LIGHT design (matching the iOS look). Dark mode
  // was only partially implemented across screens, so on an Android device set to
  // dark the theme-aware screens turned dark while hardcoded ones stayed light —
  // producing black/gray patches (search bar, vendor profile, checkout, tracking…).
  // Pin the effective theme to light regardless of system/saved mode so every
  // platform renders the same official colors. The themeMode plumbing is kept
  // intact (45 screens consume it) so dark mode can be re-enabled later if ever
  // fully designed. systemColorScheme is intentionally no longer read.
  void systemColorScheme;
  const effectiveTheme: "light" | "dark" = "light";

  // Stable context value: ~45 screens consume useTheme, so a fresh object every
  // provider render used to re-render all of them even when nothing changed.
  const value = useMemo(
    () => ({ themeMode, setThemeMode, effectiveTheme }),
    [themeMode, setThemeMode, effectiveTheme],
  );

  if (!isLoaded) {
    return null;
  }

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeMode() {
  const context = useContext(ThemeContext);
  if (!context) {
    return {
      themeMode: "light" as const,
      setThemeMode: () => {},
      effectiveTheme: "light" as const,
    };
  }
  return context;
}
