// Central development/production mode detection.
//
// Development mode enables the "0000" OTP test code and suppresses real SMS sending.
// Production mode uses OTPIQ only. A published Replit deployment is treated as
// production even if DEV_MODE somehow leaks into its environment (defense-in-depth),
// so the 0000 bypass can never be active in a real deployment.
export function isDevMode(): boolean {
  // Published deployments are always production — no bypass ever.
  if (process.env.REPLIT_DEPLOYMENT === "1") return false;
  // Only the explicit DEV_MODE flag controls the bypass; NODE_ENV is intentionally
  // ignored because the dev server always runs with NODE_ENV=development regardless
  // of whether real SMS should be sent. Set DEV_MODE=false to disable the 0000 bypass.
  return process.env.DEV_MODE === "true";
}
