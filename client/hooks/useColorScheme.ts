/**
 * OnWay is Light Mode only. Keep this hook stable for existing imports while
 * preventing native system appearance from activating a dark UI.
 */
export function useColorScheme() {
  return "light" as const;
}
