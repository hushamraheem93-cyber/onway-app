import { Colors } from "@/constants/theme";
import { useThemeMode } from "@/context/ThemeContext";

export function useTheme() {
  const { effectiveTheme } = useThemeMode();
  const theme = Colors[effectiveTheme];

  return {
    theme,
  };
}
