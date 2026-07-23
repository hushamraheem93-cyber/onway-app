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
