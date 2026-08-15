// Central development/production mode detection.
//
// Development mode enables the "0000" OTP test code and suppresses real SMS sending.
// Production mode uses OTPIQ only.
//
// Priority order:
//   1. NODE_ENV=production  → always off  (VPS / any production server)
//   2. REPLIT_DEPLOYMENT=1  → always off  (Replit published deployment, defence-in-depth)
//   3. DEV_MODE=true        → on          (explicit dev flag)
//   4. default              → off
export function isDevMode(): boolean {
  // Any production server (VPS, cloud VM, etc.) — bypass never active.
  if (process.env.NODE_ENV === "production") return false;
  // Published Replit deployments — defence-in-depth even if NODE_ENV leaks.
  if (process.env.REPLIT_DEPLOYMENT === "1") return false;
  // Only the explicit DEV_MODE flag enables the 0000 test code in development.
  return process.env.DEV_MODE === "true";
}

/**
 * H-49 — may this process serve the Expo Go surface (`static-build/`)?
 *
 * `static-build/` is a build artifact produced by `scripts/build.js` for Expo Go:
 * an UNSIGNED manifest plus JS bundles, served from the same origin as the API.
 * This app ships no OTA channel (no expo-updates, no `updates` block), so the
 * released binaries cannot consume it — but the server would still hand the
 * directory's contents to anything that asked, if the directory ever appeared on
 * a production host. No deploy script creates it today; that is a fact about the
 * scripts, not a property of the server, and facts about scripts change.
 *
 * So the server enforces it instead: in production the manifest route never
 * touches the filesystem and the static mount is never registered.
 *
 * The predicate is NOT isDevMode(). isDevMode() additionally requires an explicit
 * DEV_MODE=true, and the Expo Go workflow must keep working without that flag —
 * gating on it would break `npm run server:dev`.
 *
 * REPLIT_DEPLOYMENT is deliberately NOT part of this check: `.replit` builds
 * `static-build` in its deployment step precisely so the published Replit app has
 * a web UI to serve. Excluding it there would break that deployment, and a
 * Replit-managed container is not the production host this finding is about.
 */
export function isExpoGoSurfaceEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}
