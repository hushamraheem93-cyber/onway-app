// Central development/production mode detection.
//
// Development mode enables the "0000" OTP test code and suppresses real SMS sending.
// Production mode uses OTPIQ only. A published Replit deployment is treated as
// production even if DEV_MODE somehow leaks into its environment (defense-in-depth),
// so the 0000 bypass can never be active in a real deployment.
export function isDevMode(): boolean {
  if (process.env.REPLIT_DEPLOYMENT === "1") return false; // published deployment → always production
  return process.env.NODE_ENV === "development" || process.env.DEV_MODE === "true";
}
