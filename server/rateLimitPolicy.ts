export type RateLimitPolicy = Record<string, number>;

export function resolveRateLimit(fullPath: string, limits: RateLimitPolicy): number {
  const exact = limits[fullPath];
  if (exact !== undefined) return exact;

  const pathParts = fullPath.split("/").filter(Boolean);
  for (const [pattern, limit] of Object.entries(limits)) {
    if (!pattern.includes(":")) continue;
    const patternParts = pattern.split("/").filter(Boolean);
    if (patternParts.length !== pathParts.length) continue;
    const matches = patternParts.every((part, index) => part.startsWith(":") || part === pathParts[index]);
    if (matches) return limit;
  }

  return limits.default ?? 600;
}

export function resettableRateLimitKey(ip: string, path: string): string {
  return `${ip}:${path}`;
}
