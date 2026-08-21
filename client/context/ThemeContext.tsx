import React, {
  createContext,
  useContext,
  useCallback,
  useMemo,
  ReactNode,
} from "react";

type ThemeMode = "light";

interface ThemeContextType {
  themeMode: ThemeMode;
  /** Compatibility no-op. OnWay has no user-selectable theme. */
  setThemeMode: (mode?: ThemeMode) => void;
  effectiveTheme: "light";
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // One official OnWay palette: light on every platform and browser preference.
  const themeMode: ThemeMode = "light";
  const effectiveTheme = "light" as const;
  const setThemeMode = useCallback((_mode: ThemeMode = "light") => {}, []);

  // Stable context value: ~45 screens consume useTheme, so a fresh object every
  // provider render used to re-render all of them even when nothing changed.
  const value = useMemo(
    () => ({ themeMode, setThemeMode, effectiveTheme }),
    [themeMode, setThemeMode, effectiveTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
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
