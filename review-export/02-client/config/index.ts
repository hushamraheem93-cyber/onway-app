/**
 * OnWay — App configuration constants.
 * Single source of truth for all app-wide settings.
 */

// ── Brand ─────────────────────────────────────────────────────────────────────
export const APP_NAME = "OnWay" as const;
export const APP_TAGLINE = "من الضلوعية… إلى باب بيتك" as const;
export const APP_CITY = "الضلوعية" as const;

// ── Colors (mirrors theme.ts AppColors) ──────────────────────────────────────
export const COLORS = {
  primary: "#F97316",
  primaryDark: "#EA580C",
  secondary: "#FFF2EC",
  success: "#10B981",
  warning: "#F59E0B",
  error: "#EF4444",
  info: "#3B82F6",
} as const;

// ── Timing ────────────────────────────────────────────────────────────────────
export const TIMING = {
  /** Driver status polling interval (ms) */
  driverPoll: 5_000,
  /** Order tracking refresh interval (ms) */
  orderTrackingPoll: 15_000,
  /** OTP expiry (ms) */
  otpExpiry: 5 * 60 * 1000,
  /** Toast display duration (ms) */
  toast: 2_500,
  /** Minimum splash display duration (ms) */
  splashMin: 1_200,
} as const;

// ── Pagination ────────────────────────────────────────────────────────────────
export const PAGINATION = {
  ordersPageSize: 20,
  productsPageSize: 30,
  notificationsPageSize: 20,
} as const;

// ── Image compression ─────────────────────────────────────────────────────────
export const IMAGE_CONFIG = {
  profile:  { width: 400,  height: 400, quality: 0.8 },
  product:  { width: 1200, quality: 0.8 },
  banner:   { width: 1200, quality: 0.8 },
  category: { width: 600,  quality: 0.8 },
} as const;

// ── FlatList performance ──────────────────────────────────────────────────────
export const FLATLIST = {
  initialNumToRender: 10,
  windowSize: 7,
  maxToRenderPerBatch: 8,
} as const;

// ── Phone number ──────────────────────────────────────────────────────────────
export const PHONE = {
  /** Iraqi country code */
  prefix: "+964",
  /** Digit count after prefix */
  localLength: 10,
  /** Regex for Iraqi mobile numbers */
  regex: /^07[3-9]\d{8}$/,
} as const;

// ── Currency ──────────────────────────────────────────────────────────────────
export const CURRENCY = {
  code: "IQD",
  symbol: "د.ع",
  decimals: 0,
} as const;
