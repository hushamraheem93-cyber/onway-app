/**
 * OnWay ships one official light design on web. Do not read the browser's
 * system appearance value: it must never activate a dark surface.
 */
export function useColorScheme() {
  return "light" as const;
}
