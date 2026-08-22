export const DEFAULT_FIREBASE_STORAGE_BUCKET = "onway-74c20.firebasestorage.app";

/**
 * Resolve the Firebase Storage bucket identically in the mobile client and server.
 * An explicit deployment value wins; otherwise Firebase's modern default bucket is
 * derived from the project id, with the OnWay project as the final local fallback.
 */
export function resolveFirebaseStorageBucket(
  configuredBucket?: string | null,
  projectId?: string | null,
): string {
  const configured = String(configuredBucket ?? "").trim();
  if (configured) return configured;
  const project = String(projectId ?? "").trim();
  return project ? `${project}.firebasestorage.app` : DEFAULT_FIREBASE_STORAGE_BUCKET;
}
