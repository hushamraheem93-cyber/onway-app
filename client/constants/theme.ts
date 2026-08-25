import { Platform } from "react-native";

// M-80: allowRTL/forceRTL used to run here as a side effect of importing the theme.
// They now live in client/lib/rtl.ts, applied from the entry point before anything
// lays out — a colour palette should not be deciding the app's layout direction.

// ─── Core Brand ─────────────────────────────────────────────────────────────
const primary = "#FB5B21";
const primaryLight = "#FC8B56";
const primaryDark = "#D94A17";
const secondary = "#FFF1EC";

// ─── Status Colors ───────────────────────────────────────────────────────────
const success = "#10B981";
const successLight = "#D1FAE5";
const warning = "#F59E0B";
const warningLight = "#FEF3C7";
const error = "#EF4444";
const errorLight = "#FEE2E2";
const info = "#3B82F6";
const infoLight = "#EFF6FF";

// ─── Gray Scale ──────────────────────────────────────────────────────────────
const gray50 = "#F9FAFB";
const gray100 = "#F3F4F6";
const gray200 = "#E5E7EB";
const gray300 = "#D1D5DB";
const gray400 = "#9CA3AF";
const gray500 = "#6B7280";
const gray600 = "#4B5563";
const gray700 = "#374151";
const gray800 = "#1F2937";

// ─── Portal Colors ───────────────────────────────────────────────────────────
// Legacy names retained for compatibility; all portal identity accents use OnWay orange.
const vendorPurple = primary;
const vendorPurpleLight = secondary;
const driverBlue = primary;
const driverBlueLight = secondary;

// ─── Utility ─────────────────────────────────────────────────────────────────
const white = "#FFFFFF";
const black = "#000000";
const overlay = "rgba(0,0,0,0.5)";
const overlayCard = "rgba(0,0,0,0.05)";
const whatsapp = "#25D366";
const statusPurple = "#8B5CF6";
const statusCyan = "#06B6D4";

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — SEMANTIC COLOR TOKENS
// ═══════════════════════════════════════════════════════════════════════════════

export const AppColors = {
  // ── Brand ────────────────────────────────────────────────────────────────
  primary,
  primaryLight,
  primaryDark,
  secondary,

  // ── Status ────────────────────────────────────────────────────────────────
  success,
  successLight,
  warning,
  warningLight,
  error,
  errorLight,
  info,
  infoLight,

  // ── Gray Scale ────────────────────────────────────────────────────────────
  gray50,
  gray100,
  gray200,
  gray300,
  gray400,
  gray500,
  gray600,
  gray700,
  gray800,

  // ── Backgrounds ──────────────────────────────────────────────────────────
  background: "#F7F9FC",
  backgroundCard: white,
  backgroundSecondary: "#F0F0F0",
  backgroundTertiary: "#E8E8E8",

  // ── Text ─────────────────────────────────────────────────────────────────
  textPrimary: "#2D2D2D",
  textSecondary: "#555555",
  textDisabled: gray400,

  // ── Borders ───────────────────────────────────────────────────────────────
  border: "#E0E0E0",
  divider: gray200,

  // ── Icons ─────────────────────────────────────────────────────────────────
  iconPrimary: primary,
  iconSecondary: "#555555",
  iconMuted: gray400,
  iconDanger: error,
  iconSuccess: success,
  iconWarning: warning,

  // ── Portals ───────────────────────────────────────────────────────────────
  vendorPurple,
  vendorPurpleLight,
  driverBlue,
  driverBlueLight,

  // ── Utility ───────────────────────────────────────────────────────────────
  white,
  black,
  transparent: "transparent" as const,
  overlay,
  overlayCard,
  whatsapp,
  shadowColor: black,

  // ── Intentional Status-Only Colors ────────────────────────────────────────
  statusPurple,
  statusCyan,

  // ── On-brand surface (text/icons on primary-colored backgrounds) ──────────
  textOnBrand: white,
  textOnBrandMuted: "rgba(255,255,255,0.8)",
  textOnBrandSubtle: "rgba(255,255,255,0.75)",
  iconOnBrand: "rgba(255,255,255,0.55)",
  decorativeOnBrand: "rgba(255,255,255,0.07)",

  // ── Legacy aliases (backward compat) ─────────────────────────────────────
  surface: white,
  onGrey: "#4A4A4A",
};

// ─── Order Status Colors (single source) ────────────────────────────────────
export const ORDER_STATUS_COLORS: Record<string, string> = {
  pending: warning,
  confirmed: info,
  preparing: statusPurple,
  ready: primary,
  picked_up: primaryLight,
  in_delivery: statusCyan,
  delivering: statusCyan,
  delivered: success,
  cancelled: error,
  issue: error,
};

// ─── Order Status Labels ─────────────────────────────────────────────────────
export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "قيد الانتظار",
  confirmed: "تم التأكيد",
  preparing: "جاري التحضير",
  ready: "جاهز للاستلام",
  picked_up: "استلم السائق",
  in_delivery: "في الطريق إليك",
  delivering: "في الطريق إليك",
  delivered: "تم التوصيل",
  cancelled: "ملغي",
  issue: "يوجد مشكلة",
};

// ─── Colors (Light-only runtime palette) ─────────────────────────────────────
const lightColors = {
  text: "#2D2D2D",
  textSecondary: "#555555",
  textDisabled: gray400,
  buttonText: black,
  link: primary,
  tabIconDefault: gray500,
  tabIconSelected: primary,
  primary,
  primaryLight,
  secondary,
  backgroundRoot: "#F7F9FC",
  backgroundDefault: white,
  backgroundCard: white,
  backgroundSecondary: "#F0F0F0",
  backgroundTertiary: "#E8E8E8",
  border: "#E0E0E0",
  divider: gray200,
  iconPrimary: primary,
  iconSecondary: "#555555",
  iconMuted: gray400,
  iconDanger: error,
  iconSuccess: success,
  iconWarning: warning,
  success,
  successLight,
  warning,
  warningLight,
  error,
  errorLight,
  info,
  infoLight,
  gray50,
  gray100,
  gray200,
  gray300,
  gray400,
  gray500,
  gray600,
  gray700,
  gray800,
  white,
  black,
  overlay,
  shadowColor: black,
};

export const Colors = {
  light: lightColors,
  // Compatibility alias only: the product has no dark theme or user switcher.
  // Any legacy caller asking for "dark" still receives the official light palette.
  dark: lightColors,
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — TYPOGRAPHY TOKENS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Font Size Scale ─────────────────────────────────────────────────────────
export const FontSize = {
  xs: 10,
  sm: 11,
  base: 13,
  md: 14,
  lg: 15,
  xl: 18,
  "2xl": 22,
  "3xl": 28,
  "4xl": 32,
};

// ─── Font Families ────────────────────────────────────────────────────────────
export const FontFamily = {
  // Cairo — primary UI font (Arabic); legacy property names are retained for compatibility.
  tajawal: "Cairo_400Regular",
  tajawalMedium: "Cairo_600SemiBold",
  tajawalBold: "Cairo_700Bold",
  tajawalXBold: "Cairo_700Bold",
  // Cairo — headings and labels (Arabic)
  cairo: "Cairo_400Regular",
  cairoMedium: "Cairo_600SemiBold",
  cairoBold: "Cairo_700Bold",
  cairoXBold: "Cairo_900Black",
  // Montserrat — Latin branding
  montserrat: "Montserrat_400Regular",
  montserratBold: "Montserrat_700Bold",
  montserratXBold: "Montserrat_800ExtraBold",
};

// ─── Font Weights ─────────────────────────────────────────────────────────────
export const FontWeight = {
  regular: "400" as const,
  medium: "500" as const,
  semiBold: "600" as const,
  bold: "700" as const,
  xBold: "800" as const,
  black: "900" as const,
};

// ─── Line Heights ─────────────────────────────────────────────────────────────
export const LineHeight = {
  xs: 14,
  sm: 16,
  base: 20,
  md: 22,
  lg: 24,
  xl: 28,
  "2xl": 32,
  "3xl": 36,
  "4xl": 44,
};

// ─── Typography ───────────────────────────────────────────────────────────────
// Full text styles — spread into StyleSheet definitions.
export const Typography = {
  h1: {
    fontSize: FontSize["2xl"],
    lineHeight: LineHeight["3xl"],
    fontFamily: FontFamily.cairoBold,
    fontWeight: FontWeight.bold,
  },
  h2: {
    fontSize: FontSize.xl,
    lineHeight: LineHeight.xl,
    fontFamily: FontFamily.cairoBold,
    fontWeight: FontWeight.bold,
  },
  h3: {
    fontSize: FontSize.lg,
    lineHeight: LineHeight.lg,
    fontFamily: FontFamily.cairoMedium,
    fontWeight: FontWeight.semiBold,
  },
  h4: {
    fontSize: FontSize.base,
    lineHeight: LineHeight.md,
    fontFamily: FontFamily.cairoMedium,
    fontWeight: FontWeight.semiBold,
  },
  body: {
    fontSize: FontSize.base,
    lineHeight: LineHeight.md,
    fontFamily: FontFamily.tajawal,
    fontWeight: FontWeight.regular,
  },
  bodyMd: {
    fontSize: FontSize.md,
    lineHeight: LineHeight.lg,
    fontFamily: FontFamily.tajawal,
    fontWeight: FontWeight.regular,
  },
  small: {
    fontSize: FontSize.sm,
    lineHeight: LineHeight.base,
    fontFamily: FontFamily.tajawal,
    fontWeight: FontWeight.regular,
  },
  caption: {
    fontSize: FontSize.xs,
    lineHeight: LineHeight.sm,
    fontFamily: FontFamily.tajawal,
    fontWeight: FontWeight.regular,
  },
  label: {
    fontSize: FontSize.base,
    lineHeight: LineHeight.md,
    fontFamily: FontFamily.cairoMedium,
    fontWeight: FontWeight.semiBold,
  },
  link: {
    fontSize: FontSize.base,
    lineHeight: LineHeight.md,
    fontFamily: FontFamily.tajawal,
    fontWeight: FontWeight.regular,
  },
  price: {
    fontSize: FontSize.lg,
    lineHeight: LineHeight.lg,
    fontFamily: FontFamily.cairoBold,
    fontWeight: FontWeight.bold,
  },
  badge: {
    fontSize: FontSize.xs,
    lineHeight: LineHeight.xs,
    fontFamily: FontFamily.cairoBold,
    fontWeight: FontWeight.bold,
  },
  tab: {
    fontSize: FontSize.xs,
    lineHeight: LineHeight.sm,
    fontFamily: FontFamily.cairoMedium,
    fontWeight: FontWeight.semiBold,
  },
  button: {
    fontSize: FontSize.base,
    lineHeight: LineHeight.md,
    fontFamily: FontFamily.cairoBold,
    fontWeight: FontWeight.bold,
  },
  input: {
    fontSize: FontSize.base,
    lineHeight: LineHeight.md,
    fontFamily: FontFamily.tajawal,
    fontWeight: FontWeight.regular,
  },
  number: {
    fontSize: FontSize.xl,
    lineHeight: LineHeight.xl,
    fontFamily: FontFamily.montserratBold,
    fontWeight: FontWeight.bold,
  },
};

// ─── Fonts (platform-specific fallback) ──────────────────────────────────────
export const Fonts = Platform.select({
  ios: {
    sans: FontFamily.tajawal,
    sansBold: FontFamily.tajawalBold,
    sansMedium: FontFamily.tajawalMedium,
  },
  android: {
    sans: FontFamily.tajawal,
    sansBold: FontFamily.tajawalBold,
    sansMedium: FontFamily.tajawalMedium,
  },
  default: {
    sans: FontFamily.tajawal,
    sansBold: FontFamily.tajawalBold,
    sansMedium: FontFamily.tajawalMedium,
  },
  web: {
    sans: "Cairo, system-ui, -apple-system, sans-serif",
    sansBold: "Cairo, system-ui, -apple-system, sans-serif",
    sansMedium: "Cairo, system-ui, -apple-system, sans-serif",
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — SPATIAL & DIMENSION TOKENS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Spacing ─────────────────────────────────────────────────────────────────
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 40,
  "5xl": 48,
  inputHeight: 48,
  buttonHeight: 52,
};

// ─── Border Radius ────────────────────────────────────────────────────────────
export const BorderRadius = {
  none: 0,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 18,
  xl: 24,
  "2xl": 32,
  "3xl": 40,
  full: 9999,
};

// ─── Design System Constants ──────────────────────────────────────────────────
export const DesignSystem = {
  // The single horizontal inset for screen content. HomeScreen's FlatList pads its
  // content by exactly this, and BannerSlider/OfferBanner size themselves to
  // SCREEN_WIDTH minus twice it — so the two MUST stay one number.
  //
  // They had drifted: this said 16 while HomeScreen hardcoded 18. Both banners were
  // therefore laid out 4px wider than the box drawing them. OfferBanner overhung the
  // padding, and in BannerSlider the ScrollView's own width (the step pagingEnabled
  // snaps by) disagreed with BANNER_WIDTH (the step scrollTo and handleScroll use) by
  // those 4px, so every page left a widening sliver of the neighbouring banner
  // visible — 4px after one swipe, 8 after two, 12 after three.
  screenPadding: 18,
  gridGap: 12,
  categoryCard: { width: 110, height: 140 },
  categoryImageSize: 85,
  bannerHeight: 195,
  bannerRadius: 16,

  // The banner frame is a ratio, not a height.
  //
  // 11:6 is not a taste call — every banner asset in the repository is 1408×768,
  // which is exactly 11/6, and the frame this replaces measured 1.8308:1 on a
  // 393pt device (357/195). The artwork and the old frame already agreed to within
  // 0.1%; the number simply lived in the PNGs instead of the code. Deriving the
  // height from it makes `contentFit: "cover"` crop nothing at all, where the fixed
  // 195 cropped up to 20.6% on phones, 63.8% on tablets and 81.0% on the web.
  bannerAspectRatio: 11 / 6,

  // …and the width is what has to be capped, not the height.
  //
  // On a wide viewport you cannot have all three of: a full-width banner, a fixed
  // ratio, and a sane height. Holding the ratio while spanning 1920px yields a
  // 1028px banner — 95% of the window. Capping the HEIGHT instead would break the
  // ratio and bring the cropping straight back (51.8% on tablet, 74.7% on web).
  // So the banner stops growing at 560pt and centres itself: 305px tall on every
  // tablet and desktop, and still zero crop.
  bannerMaxWidth: 560,
};

/**
 * The banner frame, resolved for a given window width.
 *
 * Both BannerSlider and OfferBanner call this, and inside the slider the SAME
 * returned width is what sizes the ScrollView (the step `pagingEnabled` snaps by),
 * the pages, `scrollTo` and `handleScroll`. Keeping one function is the point:
 * B-1 was two copies of a padding number drifting 4px apart, which desynced paging
 * from the page width and left a widening sliver of the neighbouring banner on
 * screen. One source cannot drift from itself.
 */
export function bannerFrame(screenWidth: number) {
  const width = Math.min(
    screenWidth - DesignSystem.screenPadding * 2,
    DesignSystem.bannerMaxWidth,
  );
  return { width, height: width / DesignSystem.bannerAspectRatio };
}

// ─── Icon Sizes ───────────────────────────────────────────────────────────────
export const IconSize = {
  xs: 12,
  sm: 16,
  md: 20,
  base: 24,
  lg: 28,
  xl: 32,
  "2xl": 40,
  "3xl": 48,
};

// ─── Avatar System ────────────────────────────────────────────────────────────
export const AvatarSize = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 48,
  xl: 64,
  "2xl": 80,
  "3xl": 96,
};
export const Opacity = {
  none: 0,
  ghost: 0.05,
  subtle: 0.1,
  faint: 0.15,
  low: 0.2,
  muted: 0.3,
  medium: 0.5,
  high: 0.7,
  soft: 0.8,
  near: 0.9,
  full: 1,
  // Semantic
  disabled: 0.4,
  interactive: 0.85,
  overlay: 0.5,
  scrim: 0.6,
  onBrand: 0.55,
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4 — SHADOW & ELEVATION TOKENS
// ═══════════════════════════════════════════════════════════════════════════════

export const Shadows = {
  none: {
    shadowColor: black,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  xs: {
    shadowColor: black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  sm: {
    shadowColor: black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  md: {
    shadowColor: black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 4,
  },
  lg: {
    shadowColor: black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 8,
  },
  xl: {
    shadowColor: black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 12,
  },
};
export const Anim = {
  duration: {
    instant: 80,
    fastest: 150,
    fast: 200,
    normal: 300,
    slow: 500,
    slower: 700,
    slowest: 1000,
    splash: 1600,
  },
  spring: {
    snappy: { friction: 8, tension: 80 },
    normal: { friction: 7, tension: 60 },
    bouncy: { friction: 5, tension: 50 },
    gentle: { friction: 10, tension: 40 },
  },
};

// ─── Easing Curves (cubic-bezier control points) ─────────────────────────────
// Use with Easing.bezier(x1, y1, x2, y2) from 'react-native'
// or withTiming(..., { easing: Easing.bezier(...AnimCurve.uiStandard) })
export const AnimCurve = {
  linear: [0.0, 0.0, 1.0, 1.0] as [number, number, number, number],
  ease: [0.25, 0.1, 0.25, 1.0] as [number, number, number, number],
  easeIn: [0.42, 0.0, 1.0, 1.0] as [number, number, number, number],
  easeOut: [0.0, 0.0, 0.58, 1.0] as [number, number, number, number],
  easeInOut: [0.42, 0.0, 0.58, 1.0] as [number, number, number, number],
  uiSnappy: [0.2, 0.0, 0.0, 1.0] as [number, number, number, number],
  uiStandard: [0.4, 0.0, 0.2, 1.0] as [number, number, number, number],
  uiDecelerate: [0.0, 0.0, 0.2, 1.0] as [number, number, number, number],
  uiAccelerate: [0.4, 0.0, 1.0, 1.0] as [number, number, number, number],
};
export const Breakpoints = {
  sm: 480,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
};

// ─── Helper: responsive value by current width ────────────────────────────────
export function responsive<T>(
  width: number,
  values: { sm?: T; md?: T; lg?: T; xl?: T; default: T },
): T {
  if (width >= Breakpoints.xl && values.xl !== undefined) return values.xl;
  if (width >= Breakpoints.lg && values.lg !== undefined) return values.lg;
  if (width >= Breakpoints.md && values.md !== undefined) return values.md;
  if (width >= Breakpoints.sm && values.sm !== undefined) return values.sm;
  return values.default;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7 — GRADIENT PRESETS
// ═══════════════════════════════════════════════════════════════════════════════

export const Gradients = {
  splash: [primary, primaryDark] as [string, string],
  background: ["#FFF3EE", "#FFF9F6", "#FFFCFA", white] as [
    string,
    string,
    string,
    string,
  ],
};

// Kept even though nothing imports it: sprint9-theme-light-mode asserts that the
// vendor and driver presets resolve to the OnWay brand gradient, which is how the
// old purple/blue portal identities are prevented from coming back.
export const GradientPresets = {
  // Brand
  brand: [primary, primaryDark] as [string, string],
  brandLight: [secondary, white] as [string, string],
  brandSubtle: ["#FFF3EE", "#FFF9F6", "#FFFCFA", white] as [
    string,
    string,
    string,
    string,
  ],
  // Status
  successGrad: [success, "#059669"] as [string, string],
  errorGrad: [error, "#DC2626"] as [string, string],
  warningGrad: [warning, "#D97706"] as [string, string],
  infoGrad: [info, "#2563EB"] as [string, string],
  // Portals use the same OnWay brand gradient; status colors remain semantic.
  vendor: [primary, primaryDark] as [string, string],
  driver: [primary, primaryDark] as [string, string],
  // Utility
  // Compatibility preset: a neutral light gradient, never a dark surface.
  dark: [gray100, gray50] as [string, string],
  glass: ["rgba(255,255,255,0.85)", "rgba(255,255,255,0.40)"] as [
    string,
    string,
  ],
  cardOverlay: ["transparent", "rgba(0,0,0,0.55)"] as [string, string],
  shimmer: [gray100, gray50, gray100] as [string, string, string],
};

export const CardVariants = {
  elevated: {
    backgroundColor: white,
    borderRadius: BorderRadius.md,
    ...Shadows.md,
  },
  outlined: {
    backgroundColor: white,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: gray200,
  },
  flat: {
    backgroundColor: gray50,
    borderRadius: BorderRadius.md,
  },
  primary: {
    backgroundColor: secondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: primary + "22",
  },
  vendor: {
    backgroundColor: vendorPurpleLight,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: vendorPurple + "22",
  },
  driver: {
    backgroundColor: driverBlueLight,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: driverBlue + "22",
  },
};

// ─── Badge Variants ───────────────────────────────────────────────────────────
export const BadgeVariants = {
  default: {
    backgroundColor: gray100,
    color: gray600,
    borderRadius: BorderRadius.full,
  },
  primary: {
    backgroundColor: secondary,
    color: primary,
    borderRadius: BorderRadius.full,
  },
  success: {
    backgroundColor: successLight,
    color: success,
    borderRadius: BorderRadius.full,
  },
  warning: {
    backgroundColor: warningLight,
    color: warning,
    borderRadius: BorderRadius.full,
  },
  error: {
    backgroundColor: errorLight,
    color: error,
    borderRadius: BorderRadius.full,
  },
  info: {
    backgroundColor: infoLight,
    color: info,
    borderRadius: BorderRadius.full,
  },
  purple: {
    backgroundColor: vendorPurpleLight,
    color: vendorPurple,
    borderRadius: BorderRadius.full,
  },
  cyan: {
    backgroundColor: infoLight,
    color: statusCyan,
    borderRadius: BorderRadius.full,
  },
  // Compatibility variant: retained by name for old imports, but light-only.
  dark: {
    backgroundColor: gray100,
    color: gray700,
    borderRadius: BorderRadius.full,
  },
};
export const ModalStyles = {
  overlay: {
    flex: 1,
    backgroundColor: overlay,
    justifyContent: "flex-end" as const,
  },
  container: {
    backgroundColor: white,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing["2xl"],
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: gray300,
    borderRadius: BorderRadius.full,
    alignSelf: "center" as const,
    marginBottom: Spacing.md,
  },
  title: {
    fontFamily: FontFamily.cairoBold,
    fontSize: FontSize.xl,
    color: "#2D2D2D",
    textAlign: "right" as const,
    marginBottom: Spacing.sm,
  },
};
export const ToastStyles = {
  container: {
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: Spacing.sm,
    ...Shadows.lg,
  },
  variants: {
    success: {
      backgroundColor: success,
      textColor: white,
      iconName: "check-circle",
    },
    error: {
      backgroundColor: error,
      textColor: white,
      iconName: "alert-circle",
    },
    warning: {
      backgroundColor: warning,
      textColor: white,
      iconName: "alert-triangle",
    },
    info: { backgroundColor: info, textColor: white, iconName: "info" },
  },
  text: {
    fontFamily: FontFamily.tajawal,
    fontSize: FontSize.base,
    color: white,
    textAlign: "right" as const,
  },
};
export const ORDER_STATUS_STYLES: Record<
  string,
  {
    color: string;
    background: string;
    label: string;
    iconName: string;
  }
> = {
  pending: {
    color: warning,
    background: warningLight,
    label: ORDER_STATUS_LABELS.pending,
    iconName: "clock",
  },
  confirmed: {
    color: info,
    background: infoLight,
    label: ORDER_STATUS_LABELS.confirmed,
    iconName: "check-circle",
  },
  preparing: {
    color: statusPurple,
    background: vendorPurpleLight,
    label: ORDER_STATUS_LABELS.preparing,
    iconName: "activity",
  },
  ready: {
    color: primary,
    background: secondary,
    label: ORDER_STATUS_LABELS.ready,
    iconName: "package",
  },
  picked_up: {
    color: primaryLight,
    background: secondary,
    label: ORDER_STATUS_LABELS.picked_up,
    iconName: "shopping-bag",
  },
  in_delivery: {
    color: statusCyan,
    background: infoLight,
    label: ORDER_STATUS_LABELS.in_delivery,
    iconName: "truck",
  },
  delivering: {
    color: statusCyan,
    background: infoLight,
    label: ORDER_STATUS_LABELS.delivering,
    iconName: "truck",
  },
  delivered: {
    color: success,
    background: successLight,
    label: ORDER_STATUS_LABELS.delivered,
    iconName: "check-circle",
  },
  cancelled: {
    color: error,
    background: errorLight,
    label: ORDER_STATUS_LABELS.cancelled,
    iconName: "x-circle",
  },
  issue: {
    color: error,
    background: errorLight,
    label: ORDER_STATUS_LABELS.issue,
    iconName: "alert-circle",
  },
};
export const RTL = {
  isRTL: true,
  writingDirection: "rtl" as const,
  textAlign: "right" as const,
  // Logical flex directions — use instead of "flex-start" / "flex-end"
  contentStart: "flex-end" as "flex-end",
  contentEnd: "flex-start" as "flex-start",
  // Logical helpers — auto-flip for RTL
  marginStart: (n: number) => ({ marginEnd: n }),
  marginEnd: (n: number) => ({ marginStart: n }),
  paddingStart: (n: number) => ({ paddingEnd: n }),
  paddingEnd: (n: number) => ({ paddingStart: n }),
  // Icon flip — for directional icons (arrows, chevrons)
  iconFlip: [{ scaleX: -1 as -1 }],
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 12 — UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Apply opacity to a hex color.
 * hexAlpha("#FB5B21", 0.20) → "#FB5B2133"
 */
export function hexAlpha(hex: string, opacity: number): string {
  const clamped = Math.min(1, Math.max(0, opacity));
  const o = Math.round(clamped * 255)
    .toString(16)
    .padStart(2, "0");
  return hex + o;
}
export function getStatusColor(status: string): string {
  return ORDER_STATUS_COLORS[status] ?? gray500;
}

/**
 * Get the Arabic display label for a given order status.
 */
export function getStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status;
}

/**
 * Clamp a number between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Scale spacing by a multiplier — for consistent rhythm.
 * e.g. spacingMultiple(Spacing.sm, 3) === 24
 */
export function spacingMultiple(base: number, multiplier: number): number {
  return base * multiplier;
}