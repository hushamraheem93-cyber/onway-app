import { Platform, I18nManager } from "react-native";

I18nManager.allowRTL(true);
I18nManager.forceRTL(true);

// ─── Core Brand ─────────────────────────────────────────────────────────────
const primary      = "#E86520";
const primaryLight = "#F28B4E";
const primaryDark  = "#C4520F";
const secondary    = "#FFF0E8";

// ─── Status Colors ───────────────────────────────────────────────────────────
const success      = "#10B981";
const successLight = "#D1FAE5";
const warning      = "#F59E0B";
const warningLight = "#FEF3C7";
const error        = "#EF4444";
const errorLight   = "#FEE2E2";
const info         = "#3B82F6";
const infoLight    = "#EFF6FF";

// ─── Gray Scale ──────────────────────────────────────────────────────────────
const gray50  = "#F9FAFB";
const gray100 = "#F3F4F6";
const gray200 = "#E5E7EB";
const gray300 = "#D1D5DB";
const gray400 = "#9CA3AF";
const gray500 = "#6B7280";
const gray600 = "#4B5563";
const gray700 = "#374151";
const gray800 = "#1F2937";

// ─── Portal Colors ───────────────────────────────────────────────────────────
const vendorPurple      = "#673AB7";
const vendorPurpleLight = "#EDE7F6";
const driverBlue        = "#1565C0";
const driverBlueLight   = "#E3F2FD";

// ─── Utility ─────────────────────────────────────────────────────────────────
const white       = "#FFFFFF";
const black       = "#000000";
const overlay     = "rgba(0,0,0,0.5)";
const overlayCard = "rgba(0,0,0,0.05)";
const whatsapp    = "#25D366";
const statusPurple = "#8B5CF6";
const statusCyan   = "#06B6D4";

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
  background:          "#F7F9FC",
  backgroundCard:      white,
  backgroundSecondary: "#F0F0F0",
  backgroundTertiary:  "#E8E8E8",

  // ── Text ─────────────────────────────────────────────────────────────────
  textPrimary:   "#2D2D2D",
  textSecondary: "#555555",
  textDisabled:  gray400,

  // ── Borders ───────────────────────────────────────────────────────────────
  border:  "#E0E0E0",
  divider: gray200,

  // ── Icons ─────────────────────────────────────────────────────────────────
  iconPrimary:   primary,
  iconSecondary: "#555555",
  iconMuted:     gray400,
  iconDanger:    error,
  iconSuccess:   success,
  iconWarning:   warning,

  // ── Portals ───────────────────────────────────────────────────────────────
  vendorPurple,
  vendorPurpleLight,
  driverBlue,
  driverBlueLight,

  // ── Utility ───────────────────────────────────────────────────────────────
  white,
  black,
  transparent:  "transparent" as const,
  overlay,
  overlayCard,
  whatsapp,
  shadowColor:  black,

  // ── Intentional Status-Only Colors ────────────────────────────────────────
  statusPurple,
  statusCyan,

  // ── On-brand surface (text/icons on primary-colored backgrounds) ──────────
  textOnBrand:        white,
  textOnBrandMuted:   "rgba(255,255,255,0.8)",
  textOnBrandSubtle:  "rgba(255,255,255,0.75)",
  iconOnBrand:        "rgba(255,255,255,0.55)",
  decorativeOnBrand:  "rgba(255,255,255,0.07)",

  // ── Legacy aliases (backward compat) ─────────────────────────────────────
  surface:       white,
  onGrey:        "#4A4A4A",
};

// ─── Order Status Colors (single source) ────────────────────────────────────
export const ORDER_STATUS_COLORS: Record<string, string> = {
  pending:     warning,
  confirmed:   info,
  preparing:   statusPurple,
  ready:       primary,
  picked_up:   primaryLight,
  in_delivery: statusCyan,
  delivering:  statusCyan,
  delivered:   success,
  cancelled:   error,
  issue:       error,
};

// ─── Order Status Labels ─────────────────────────────────────────────────────
export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending:     "قيد الانتظار",
  confirmed:   "تم التأكيد",
  preparing:   "جاري التحضير",
  ready:       "جاهز للاستلام",
  picked_up:   "استلم السائق",
  in_delivery: "في الطريق إليك",
  delivering:  "في الطريق إليك",
  delivered:   "تم التوصيل",
  cancelled:   "ملغي",
  issue:       "يوجد مشكلة",
};

// ─── Colors (Light / Dark Themes) ────────────────────────────────────────────
export const Colors = {
  light: {
    text:             "#2D2D2D",
    textSecondary:    "#555555",
    textDisabled:     gray400,
    buttonText:       black,
    link:             primary,
    tabIconDefault:   gray500,
    tabIconSelected:  primary,
    primary,
    primaryLight,
    secondary,
    backgroundRoot:      "#F7F9FC",
    backgroundDefault:   white,
    backgroundCard:      white,
    backgroundSecondary: "#F0F0F0",
    backgroundTertiary:  "#E8E8E8",
    border:  "#E0E0E0",
    divider: gray200,
    iconPrimary:   primary,
    iconSecondary: "#555555",
    iconMuted:     gray400,
    iconDanger:    error,
    iconSuccess:   success,
    iconWarning:   warning,
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
  },
  dark: {
    text:             "#ECEDEE",
    textSecondary:    "#9BA1A6",
    textDisabled:     gray600,
    buttonText:       black,
    link:             primary,
    tabIconDefault:   gray500,
    tabIconSelected:  primary,
    primary,
    primaryLight,
    secondary,
    backgroundRoot:      "#1A1A1A",
    backgroundDefault:   "#2A2A2A",
    backgroundCard:      "#2A2A2A",
    backgroundSecondary: "#353535",
    backgroundTertiary:  "#404040",
    border:  "#404040",
    divider: "#404040",
    iconPrimary:   primary,
    iconSecondary: "#9BA1A6",
    iconMuted:     gray600,
    iconDanger:    "#F87171",
    iconSuccess:   "#34D399",
    iconWarning:   "#FCD34D",
    success:      "#34D399",
    successLight: "#064E3B",
    warning:      "#FCD34D",
    warningLight: "#451A03",
    error:        "#F87171",
    errorLight:   "#450A0A",
    info:         "#60A5FA",
    infoLight:    "#1E3A5F",
    gray50:  "#374151",
    gray100: "#374151",
    gray200: "#4B5563",
    gray300: gray500,
    gray400: gray400,
    gray500: gray300,
    gray600: gray200,
    gray700: gray100,
    gray800: gray50,
    white,
    black,
    overlay,
    shadowColor: black,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — TYPOGRAPHY TOKENS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Font Size Scale ─────────────────────────────────────────────────────────
export const FontSize = {
  xs:    10,
  sm:    11,
  base:  13,
  md:    14,
  lg:    15,
  xl:    18,
  "2xl": 22,
  "3xl": 28,
  "4xl": 32,
};

// ─── Font Families ────────────────────────────────────────────────────────────
export const FontFamily = {
  // Tajawal — primary UI font (Arabic)
  tajawal:        "Tajawal_400Regular",
  tajawalMedium:  "Tajawal_500Medium",
  tajawalBold:    "Tajawal_700Bold",
  tajawalXBold:   "Tajawal_800ExtraBold",
  // Cairo — headings and labels (Arabic)
  cairo:          "Cairo_400Regular",
  cairoMedium:    "Cairo_600SemiBold",
  cairoBold:      "Cairo_700Bold",
  cairoXBold:     "Cairo_900Black",
  // Montserrat — Latin branding
  montserrat:     "Montserrat_400Regular",
  montserratBold: "Montserrat_700Bold",
  montserratXBold:"Montserrat_800ExtraBold",
};

// ─── Font Weights ─────────────────────────────────────────────────────────────
export const FontWeight = {
  regular:  "400" as const,
  medium:   "500" as const,
  semiBold: "600" as const,
  bold:     "700" as const,
  xBold:    "800" as const,
  black:    "900" as const,
};

// ─── Line Heights ─────────────────────────────────────────────────────────────
export const LineHeight = {
  xs:    14,
  sm:    16,
  base:  20,
  md:    22,
  lg:    24,
  xl:    28,
  "2xl": 32,
  "3xl": 36,
  "4xl": 44,
};

// ─── Typography ───────────────────────────────────────────────────────────────
// Full text styles — spread into StyleSheet definitions.
export const Typography = {
  h1:      { fontSize: FontSize["2xl"], lineHeight: LineHeight["3xl"], fontFamily: FontFamily.cairoBold,   fontWeight: FontWeight.bold     },
  h2:      { fontSize: FontSize.xl,    lineHeight: LineHeight.xl,      fontFamily: FontFamily.cairoBold,   fontWeight: FontWeight.bold     },
  h3:      { fontSize: FontSize.lg,    lineHeight: LineHeight.lg,      fontFamily: FontFamily.cairoMedium, fontWeight: FontWeight.semiBold },
  h4:      { fontSize: FontSize.base,  lineHeight: LineHeight.md,      fontFamily: FontFamily.cairoMedium, fontWeight: FontWeight.semiBold },
  body:    { fontSize: FontSize.base,  lineHeight: LineHeight.md,      fontFamily: FontFamily.tajawal,     fontWeight: FontWeight.regular  },
  bodyMd:  { fontSize: FontSize.md,    lineHeight: LineHeight.lg,      fontFamily: FontFamily.tajawal,     fontWeight: FontWeight.regular  },
  small:   { fontSize: FontSize.sm,    lineHeight: LineHeight.base,    fontFamily: FontFamily.tajawal,     fontWeight: FontWeight.regular  },
  caption: { fontSize: FontSize.xs,    lineHeight: LineHeight.sm,      fontFamily: FontFamily.tajawal,     fontWeight: FontWeight.regular  },
  label:   { fontSize: FontSize.base,  lineHeight: LineHeight.md,      fontFamily: FontFamily.cairoMedium, fontWeight: FontWeight.semiBold },
  link:    { fontSize: FontSize.base,  lineHeight: LineHeight.md,      fontFamily: FontFamily.tajawal,     fontWeight: FontWeight.regular  },
  price:   { fontSize: FontSize.lg,    lineHeight: LineHeight.lg,      fontFamily: FontFamily.cairoBold,   fontWeight: FontWeight.bold     },
  badge:   { fontSize: FontSize.xs,    lineHeight: LineHeight.xs,      fontFamily: FontFamily.cairoBold,   fontWeight: FontWeight.bold     },
  tab:     { fontSize: FontSize.xs,    lineHeight: LineHeight.sm,      fontFamily: FontFamily.cairoMedium, fontWeight: FontWeight.semiBold },
  button:  { fontSize: FontSize.base,  lineHeight: LineHeight.md,      fontFamily: FontFamily.cairoBold,   fontWeight: FontWeight.bold     },
  input:   { fontSize: FontSize.base,  lineHeight: LineHeight.md,      fontFamily: FontFamily.tajawal,     fontWeight: FontWeight.regular  },
  number:  { fontSize: FontSize.xl,    lineHeight: LineHeight.xl,      fontFamily: FontFamily.montserratBold, fontWeight: FontWeight.bold  },
};

// ─── Fonts (platform-specific fallback) ──────────────────────────────────────
export const Fonts = Platform.select({
  ios:     { sans: FontFamily.tajawal, sansBold: FontFamily.tajawalBold, sansMedium: FontFamily.tajawalMedium },
  android: { sans: FontFamily.tajawal, sansBold: FontFamily.tajawalBold, sansMedium: FontFamily.tajawalMedium },
  default: { sans: FontFamily.tajawal, sansBold: FontFamily.tajawalBold, sansMedium: FontFamily.tajawalMedium },
  web: {
    sans:       "Tajawal, system-ui, -apple-system, sans-serif",
    sansBold:   "Tajawal, system-ui, -apple-system, sans-serif",
    sansMedium: "Tajawal, system-ui, -apple-system, sans-serif",
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — SPATIAL & DIMENSION TOKENS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Spacing ─────────────────────────────────────────────────────────────────
export const Spacing = {
  xs:           4,
  sm:           8,
  md:           12,
  lg:           16,
  xl:           20,
  "2xl":        24,
  "3xl":        32,
  "4xl":        40,
  "5xl":        48,
  inputHeight:  48,
  buttonHeight: 52,
};

// ─── Border Radius ────────────────────────────────────────────────────────────
export const BorderRadius = {
  none:  0,
  xs:    8,
  sm:    12,
  md:    16,
  lg:    18,
  xl:    24,
  "2xl": 32,
  "3xl": 40,
  full:  9999,
};

// ─── Design System Constants ──────────────────────────────────────────────────
export const DesignSystem = {
  screenPadding:     16,
  gridGap:           12,
  categoryCard:      { width: 110, height: 140 },
  categoryImageSize: 85,
  bannerHeight:      195,
  bannerRadius:      16,
};

// ─── Icon Sizes ───────────────────────────────────────────────────────────────
export const IconSize = {
  xs:    12,
  sm:    16,
  md:    20,
  base:  24,
  lg:    28,
  xl:    32,
  "2xl": 40,
  "3xl": 48,
};

// ─── Avatar System ────────────────────────────────────────────────────────────
export const AvatarSize = {
  xs:    24,
  sm:    32,
  md:    40,
  lg:    48,
  xl:    64,
  "2xl": 80,
  "3xl": 96,
};

export const AvatarStyles = {
  borderRadius:      9999,
  defaultBackground: secondary,
  defaultColor:      primary,
  fontFamily:        FontFamily.cairoBold,
  sizes:             AvatarSize,
};

// ─── Opacity Scale ────────────────────────────────────────────────────────────
export const Opacity = {
  none:        0,
  ghost:       0.05,
  subtle:      0.10,
  faint:       0.15,
  low:         0.20,
  muted:       0.30,
  medium:      0.50,
  high:        0.70,
  soft:        0.80,
  near:        0.90,
  full:        1,
  // Semantic
  disabled:    0.40,
  interactive: 0.85,
  overlay:     0.50,
  scrim:       0.60,
  onBrand:     0.55,
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4 — SHADOW & ELEVATION TOKENS
// ═══════════════════════════════════════════════════════════════════════════════

export const Shadows = {
  none: { shadowColor: black, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0,    shadowRadius: 0,  elevation: 0  },
  xs:   { shadowColor: black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 3,  elevation: 1  },
  sm:   { shadowColor: black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6,  elevation: 2  },
  md:   { shadowColor: black, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 10, elevation: 4  },
  lg:   { shadowColor: black, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 16, elevation: 8  },
  xl:   { shadowColor: black, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.14, shadowRadius: 24, elevation: 12 },
};

// Explicit elevation scale (Android-first)
export const Elevation = {
  none:  0,
  xs:    1,
  sm:    2,
  md:    4,
  lg:    8,
  xl:    12,
  "2xl": 16,
  "3xl": 24,
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5 — ANIMATION TOKENS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Animation Durations, Springs & Easing Curves ────────────────────────────
export const Anim = {
  duration: {
    instant:  80,
    fastest:  150,
    fast:     200,
    normal:   300,
    slow:     500,
    slower:   700,
    slowest:  1000,
    splash:   1600,
  },
  spring: {
    snappy: { friction: 8,  tension: 80 },
    normal: { friction: 7,  tension: 60 },
    bouncy: { friction: 5,  tension: 50 },
    gentle: { friction: 10, tension: 40 },
  },
};

// ─── Easing Curves (cubic-bezier control points) ─────────────────────────────
// Use with Easing.bezier(x1, y1, x2, y2) from 'react-native'
// or withTiming(..., { easing: Easing.bezier(...AnimCurve.uiStandard) })
export const AnimCurve = {
  linear:       [0.00, 0.00, 1.00, 1.00] as [number, number, number, number],
  ease:         [0.25, 0.10, 0.25, 1.00] as [number, number, number, number],
  easeIn:       [0.42, 0.00, 1.00, 1.00] as [number, number, number, number],
  easeOut:      [0.00, 0.00, 0.58, 1.00] as [number, number, number, number],
  easeInOut:    [0.42, 0.00, 0.58, 1.00] as [number, number, number, number],
  uiSnappy:     [0.20, 0.00, 0.00, 1.00] as [number, number, number, number],
  uiStandard:   [0.40, 0.00, 0.20, 1.00] as [number, number, number, number],
  uiDecelerate: [0.00, 0.00, 0.20, 1.00] as [number, number, number, number],
  uiAccelerate: [0.40, 0.00, 1.00, 1.00] as [number, number, number, number],
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6 — LAYOUT TOKENS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Z-Index Layers ───────────────────────────────────────────────────────────
export const ZIndex = {
  base:    0,
  raised:  1,
  sticky:  10,
  overlay: 100,
  modal:   200,
  toast:   300,
};

// ─── Breakpoints (for web / responsive layouts) ───────────────────────────────
export const Breakpoints = {
  sm:    480,
  md:    768,
  lg:    1024,
  xl:    1280,
  "2xl": 1536,
};

// ─── Helper: responsive value by current width ────────────────────────────────
export function responsive<T>(width: number, values: { sm?: T; md?: T; lg?: T; xl?: T; default: T }): T {
  if (width >= Breakpoints.xl && values.xl  !== undefined) return values.xl;
  if (width >= Breakpoints.lg && values.lg  !== undefined) return values.lg;
  if (width >= Breakpoints.md && values.md  !== undefined) return values.md;
  if (width >= Breakpoints.sm && values.sm  !== undefined) return values.sm;
  return values.default;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7 — GRADIENT PRESETS
// ═══════════════════════════════════════════════════════════════════════════════

export const Gradients = {
  splash:     [primary, primaryDark]                            as [string, string],
  background: ["#FFF3EE", "#FFF9F6", "#FFFCFA", white]         as [string, string, string, string],
};

export const GradientPresets = {
  // Brand
  brand:        [primary, primaryDark]                          as [string, string],
  brandLight:   [secondary, white]                              as [string, string],
  brandSubtle:  ["#FFF3EE", "#FFF9F6", "#FFFCFA", white]       as [string, string, string, string],
  // Status
  successGrad:  [success, "#059669"]                            as [string, string],
  errorGrad:    [error, "#DC2626"]                              as [string, string],
  warningGrad:  [warning, "#D97706"]                            as [string, string],
  infoGrad:     [info, "#2563EB"]                               as [string, string],
  // Portals
  vendor:       [vendorPurple, "#512DA8"]                       as [string, string],
  driver:       [driverBlue, "#0D47A1"]                         as [string, string],
  // Utility
  dark:         [gray800, gray700]                              as [string, string],
  glass:        ["rgba(255,255,255,0.85)", "rgba(255,255,255,0.40)"] as [string, string],
  cardOverlay:  ["transparent", "rgba(0,0,0,0.55)"]            as [string, string],
  shimmer:      [gray100, gray50, gray100]                      as [string, string, string],
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 8 — COMPONENT STYLE TOKENS
// Plain style objects — spread or reference in StyleSheet.create() calls.
// All values are traced back to design tokens above.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Button Variants ──────────────────────────────────────────────────────────
export const ButtonVariants = {
  primary: {
    backgroundColor: primary,
    borderRadius:    BorderRadius.xl,
    height:          Spacing.buttonHeight,
    textColor:       white,
    fontFamily:      FontFamily.cairoBold,
    fontSize:        FontSize.base,
  },
  secondary: {
    backgroundColor: secondary,
    borderRadius:    BorderRadius.xl,
    height:          Spacing.buttonHeight,
    textColor:       primary,
    fontFamily:      FontFamily.cairoBold,
    fontSize:        FontSize.base,
  },
  outline: {
    backgroundColor: "transparent",
    borderRadius:    BorderRadius.xl,
    height:          Spacing.buttonHeight,
    borderWidth:     1.5,
    borderColor:     primary,
    textColor:       primary,
    fontFamily:      FontFamily.cairoBold,
    fontSize:        FontSize.base,
  },
  ghost: {
    backgroundColor: "transparent",
    borderRadius:    BorderRadius.xl,
    height:          Spacing.buttonHeight,
    textColor:       primary,
    fontFamily:      FontFamily.cairoBold,
    fontSize:        FontSize.base,
  },
  danger: {
    backgroundColor: error,
    borderRadius:    BorderRadius.xl,
    height:          Spacing.buttonHeight,
    textColor:       white,
    fontFamily:      FontFamily.cairoBold,
    fontSize:        FontSize.base,
  },
  vendor: {
    backgroundColor: vendorPurple,
    borderRadius:    BorderRadius.xl,
    height:          Spacing.buttonHeight,
    textColor:       white,
    fontFamily:      FontFamily.cairoBold,
    fontSize:        FontSize.base,
  },
  driver: {
    backgroundColor: driverBlue,
    borderRadius:    BorderRadius.xl,
    height:          Spacing.buttonHeight,
    textColor:       white,
    fontFamily:      FontFamily.cairoBold,
    fontSize:        FontSize.base,
  },
  small: {
    height:           36,
    borderRadius:     BorderRadius.sm,
    fontSize:         FontSize.sm,
    paddingHorizontal:Spacing.md,
  },
  large: {
    height:           60,
    borderRadius:     BorderRadius.xl,
    fontSize:         FontSize.lg,
    paddingHorizontal:Spacing["2xl"],
  },
};

// ─── Input Variants ───────────────────────────────────────────────────────────
export const InputVariants = {
  default: {
    height:           Spacing.inputHeight,
    borderRadius:     BorderRadius.sm,
    borderWidth:      1,
    borderColor:      gray200,
    backgroundColor:  white,
    paddingHorizontal:Spacing.md,
    fontSize:         FontSize.base,
    fontFamily:       FontFamily.tajawal,
    color:            "#2D2D2D",
    textAlign:        "right" as const,
  },
  focused: {
    borderColor:      primary,
    backgroundColor:  secondary,
  },
  error: {
    borderColor:      error,
    backgroundColor:  errorLight,
  },
  success: {
    borderColor:      success,
    backgroundColor:  successLight,
  },
  disabled: {
    backgroundColor:  gray100,
    borderColor:      gray200,
    opacity:          Opacity.disabled,
  },
  search: {
    height:           44,
    borderRadius:     BorderRadius.md,
    borderWidth:      0,
    backgroundColor:  gray100,
    paddingHorizontal:Spacing.md,
    fontSize:         FontSize.base,
    fontFamily:       FontFamily.tajawal,
    textAlign:        "right" as const,
  },
};

// ─── Card Variants ────────────────────────────────────────────────────────────
export const CardVariants = {
  elevated: {
    backgroundColor: white,
    borderRadius:    BorderRadius.md,
    ...Shadows.md,
  },
  outlined: {
    backgroundColor: white,
    borderRadius:    BorderRadius.md,
    borderWidth:     1,
    borderColor:     gray200,
  },
  flat: {
    backgroundColor: gray50,
    borderRadius:    BorderRadius.md,
  },
  primary: {
    backgroundColor: secondary,
    borderRadius:    BorderRadius.md,
    borderWidth:     1,
    borderColor:     primary + "22",
  },
  vendor: {
    backgroundColor: vendorPurpleLight,
    borderRadius:    BorderRadius.md,
    borderWidth:     1,
    borderColor:     vendorPurple + "22",
  },
  driver: {
    backgroundColor: driverBlueLight,
    borderRadius:    BorderRadius.md,
    borderWidth:     1,
    borderColor:     driverBlue + "22",
  },
};

// ─── Badge Variants ───────────────────────────────────────────────────────────
export const BadgeVariants = {
  default: { backgroundColor: gray100,          color: gray600,      borderRadius: BorderRadius.full },
  primary: { backgroundColor: secondary,        color: primary,      borderRadius: BorderRadius.full },
  success: { backgroundColor: successLight,     color: success,      borderRadius: BorderRadius.full },
  warning: { backgroundColor: warningLight,     color: warning,      borderRadius: BorderRadius.full },
  error:   { backgroundColor: errorLight,       color: error,        borderRadius: BorderRadius.full },
  info:    { backgroundColor: infoLight,        color: info,         borderRadius: BorderRadius.full },
  purple:  { backgroundColor: vendorPurpleLight, color: vendorPurple, borderRadius: BorderRadius.full },
  cyan:    { backgroundColor: infoLight,        color: statusCyan,   borderRadius: BorderRadius.full },
  dark:    { backgroundColor: gray800,          color: white,        borderRadius: BorderRadius.full },
};

// ─── Chip Variants (Badge + padding, interactive) ─────────────────────────────
export const ChipVariants = {
  default: { ...BadgeVariants.default, paddingHorizontal: Spacing.sm,  paddingVertical: Spacing.xs  },
  primary: { ...BadgeVariants.primary, paddingHorizontal: Spacing.sm,  paddingVertical: Spacing.xs  },
  success: { ...BadgeVariants.success, paddingHorizontal: Spacing.sm,  paddingVertical: Spacing.xs  },
  warning: { ...BadgeVariants.warning, paddingHorizontal: Spacing.sm,  paddingVertical: Spacing.xs  },
  error:   { ...BadgeVariants.error,   paddingHorizontal: Spacing.sm,  paddingVertical: Spacing.xs  },
  info:    { ...BadgeVariants.info,    paddingHorizontal: Spacing.sm,  paddingVertical: Spacing.xs  },
  purple:  { ...BadgeVariants.purple,  paddingHorizontal: Spacing.sm,  paddingVertical: Spacing.xs  },
  cyan:    { ...BadgeVariants.cyan,    paddingHorizontal: Spacing.sm,  paddingVertical: Spacing.xs  },
  dark:    { ...BadgeVariants.dark,    paddingHorizontal: Spacing.sm,  paddingVertical: Spacing.xs  },
};

// ─── Tag Variants (Square corners) ────────────────────────────────────────────
export const TagVariants = {
  default: { ...BadgeVariants.default, borderRadius: BorderRadius.xs, paddingHorizontal: Spacing.xs, paddingVertical: 2 },
  primary: { ...BadgeVariants.primary, borderRadius: BorderRadius.xs, paddingHorizontal: Spacing.xs, paddingVertical: 2 },
  success: { ...BadgeVariants.success, borderRadius: BorderRadius.xs, paddingHorizontal: Spacing.xs, paddingVertical: 2 },
  warning: { ...BadgeVariants.warning, borderRadius: BorderRadius.xs, paddingHorizontal: Spacing.xs, paddingVertical: 2 },
  error:   { ...BadgeVariants.error,   borderRadius: BorderRadius.xs, paddingHorizontal: Spacing.xs, paddingVertical: 2 },
  info:    { ...BadgeVariants.info,    borderRadius: BorderRadius.xs, paddingHorizontal: Spacing.xs, paddingVertical: 2 },
};

// ─── List Item Styles ─────────────────────────────────────────────────────────
export const ListItemStyles = {
  container: {
    paddingHorizontal: Spacing.lg,
    paddingVertical:   Spacing.md,
    backgroundColor:   white,
    flexDirection:     "row" as const,
    alignItems:        "center" as const,
  },
  bordered: {
    borderBottomWidth: 1,
    borderBottomColor: gray200,
  },
  compact: {
    paddingHorizontal: Spacing.md,
    paddingVertical:   Spacing.sm,
  },
  iconSize:        IconSize.base,
  rightIconColor:  gray400,
  titleFontFamily: FontFamily.tajawalBold,
  titleFontSize:   FontSize.base,
  subFontFamily:   FontFamily.tajawal,
  subFontSize:     FontSize.sm,
  subColor:        gray500,
};

// ─── Modal Styles ─────────────────────────────────────────────────────────────
export const ModalStyles = {
  overlay: {
    flex:             1,
    backgroundColor:  overlay,
    justifyContent:   "flex-end" as const,
  },
  container: {
    backgroundColor:      white,
    borderTopLeftRadius:  BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingTop:           Spacing.md,
    paddingHorizontal:    Spacing.lg,
    paddingBottom:        Spacing["2xl"],
  },
  handle: {
    width:           40,
    height:          4,
    backgroundColor: gray300,
    borderRadius:    BorderRadius.full,
    alignSelf:       "center" as const,
    marginBottom:    Spacing.md,
  },
  title: {
    fontFamily:   FontFamily.cairoBold,
    fontSize:     FontSize.xl,
    color:        "#2D2D2D",
    textAlign:    "right" as const,
    marginBottom: Spacing.sm,
  },
};

// ─── Bottom Sheet Styles ──────────────────────────────────────────────────────
export const BottomSheetStyles = {
  overlay:   ModalStyles.overlay,
  container: ModalStyles.container,
  handle: {
    width:           32,
    height:          4,
    backgroundColor: gray300,
    borderRadius:    BorderRadius.full,
    alignSelf:       "center" as const,
    marginTop:       Spacing.sm,
    marginBottom:    Spacing.md,
  },
  title:     ModalStyles.title,
};

// ─── Dialog Styles ────────────────────────────────────────────────────────────
export const DialogStyles = {
  backdrop: {
    flex:            1,
    backgroundColor: overlay,
    justifyContent:  "center" as const,
    alignItems:      "center" as const,
  },
  container: {
    backgroundColor:  white,
    borderRadius:     BorderRadius.lg,
    padding:          Spacing["2xl"],
    marginHorizontal: Spacing["3xl"],
    width:            "85%" as const,
    ...Shadows.xl,
  },
  title: {
    fontFamily:   FontFamily.cairoBold,
    fontSize:     FontSize.xl,
    color:        "#2D2D2D",
    textAlign:    "right" as const,
    marginBottom: Spacing.sm,
  },
  message: {
    fontFamily:  FontFamily.tajawal,
    fontSize:    FontSize.base,
    color:       gray500,
    textAlign:   "right" as const,
    lineHeight:  LineHeight.md,
    marginBottom:Spacing.lg,
  },
};

// ─── Toast / Snackbar Styles ──────────────────────────────────────────────────
export const ToastStyles = {
  container: {
    borderRadius:     BorderRadius.sm,
    paddingHorizontal:Spacing.lg,
    paddingVertical:  Spacing.sm,
    flexDirection:    "row" as const,
    alignItems:       "center" as const,
    gap:              Spacing.sm,
    ...Shadows.lg,
  },
  variants: {
    success: { backgroundColor: success, textColor: white, iconName: "check-circle"   },
    error:   { backgroundColor: error,   textColor: white, iconName: "alert-circle"   },
    warning: { backgroundColor: warning, textColor: white, iconName: "alert-triangle" },
    info:    { backgroundColor: info,    textColor: white, iconName: "info"           },
  },
  text: {
    fontFamily: FontFamily.tajawal,
    fontSize:   FontSize.base,
    color:      white,
    textAlign:  "right" as const,
  },
};

export const SnackbarStyles = {
  container: {
    ...ToastStyles.container,
    borderRadius:     BorderRadius.md,
    marginHorizontal: Spacing.lg,
    marginBottom:     Spacing.lg,
  },
  variants: ToastStyles.variants,
  text:     ToastStyles.text,
};

// ─── Skeleton Loader Styles ───────────────────────────────────────────────────
export const SkeletonStyles = {
  baseColor:      gray100,
  highlightColor: gray50,
  animDuration:   Anim.duration.slow,
  shimmerWidth:   80,
  variants: {
    text:   { height: 14,                   borderRadius: BorderRadius.xs   },
    title:  { height: 20,                   borderRadius: BorderRadius.xs   },
    avatar: { borderRadius: BorderRadius.full                               },
    card:   { height: 160,                  borderRadius: BorderRadius.md   },
    banner: { height: 195,                  borderRadius: BorderRadius.lg   },
    button: { height: Spacing.buttonHeight, borderRadius: BorderRadius.xl   },
    chip:   { height: 28,                   borderRadius: BorderRadius.full },
  },
};

// ─── Loading Indicator Styles ─────────────────────────────────────────────────
export const LoadingStyles = {
  size: {
    sm: "small" as const,
    md: "large" as const,
  },
  color: {
    brand:   primary,
    white:   white,
    muted:   gray400,
    success: success,
    vendor:  vendorPurple,
    driver:  driverBlue,
  },
  overlay: {
    backgroundColor: overlay,
    justifyContent:  "center" as const,
    alignItems:      "center" as const,
  },
};

// ─── Empty State Styles ───────────────────────────────────────────────────────
export const EmptyStateStyles = {
  container: {
    flex:           1,
    justifyContent: "center" as const,
    alignItems:     "center" as const,
    padding:        Spacing["3xl"],
  },
  iconSize:  80,
  iconColor: gray300,
  title: {
    fontFamily:  FontFamily.cairoBold,
    fontSize:    FontSize.xl,
    color:       gray700,
    textAlign:   "center" as const,
    marginTop:   Spacing.lg,
  },
  message: {
    fontFamily:  FontFamily.tajawal,
    fontSize:    FontSize.base,
    color:       gray500,
    textAlign:   "center" as const,
    lineHeight:  LineHeight.md,
    marginTop:   Spacing.sm,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 9 — DOMAIN TOKENS (Order / Portal / Admin)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Order Status — Full Style Map ────────────────────────────────────────────
export const ORDER_STATUS_STYLES: Record<string, {
  color:      string;
  background: string;
  label:      string;
  iconName:   string;
}> = {
  pending:     { color: warning,      background: warningLight,      label: ORDER_STATUS_LABELS.pending,     iconName: "clock"        },
  confirmed:   { color: info,         background: infoLight,         label: ORDER_STATUS_LABELS.confirmed,   iconName: "check-circle" },
  preparing:   { color: statusPurple, background: vendorPurpleLight, label: ORDER_STATUS_LABELS.preparing,   iconName: "activity"     },
  ready:       { color: primary,      background: secondary,         label: ORDER_STATUS_LABELS.ready,       iconName: "package"      },
  picked_up:   { color: primaryLight, background: secondary,         label: ORDER_STATUS_LABELS.picked_up,   iconName: "shopping-bag" },
  in_delivery: { color: statusCyan,   background: infoLight,         label: ORDER_STATUS_LABELS.in_delivery, iconName: "truck"        },
  delivering:  { color: statusCyan,   background: infoLight,         label: ORDER_STATUS_LABELS.delivering,  iconName: "truck"        },
  delivered:   { color: success,      background: successLight,      label: ORDER_STATUS_LABELS.delivered,   iconName: "check-circle" },
  cancelled:   { color: error,        background: errorLight,        label: ORDER_STATUS_LABELS.cancelled,   iconName: "x-circle"     },
  issue:       { color: error,        background: errorLight,        label: ORDER_STATUS_LABELS.issue,       iconName: "alert-circle" },
};

// ─── Portal Themes ────────────────────────────────────────────────────────────
export const VendorTheme = {
  primary:      vendorPurple,
  primaryLight: vendorPurpleLight,
  accent:       statusPurple,
  gradient:     [vendorPurple, "#512DA8"] as [string, string],
  tabBar: {
    active:     vendorPurple,
    inactive:   gray400,
    badge:      error,
    background: white,
  },
  header: {
    tintColor:  vendorPurple,
    background: white,
  },
  card:   CardVariants.vendor,
  badge:  BadgeVariants.purple,
};

export const DriverTheme = {
  primary:      driverBlue,
  primaryLight: driverBlueLight,
  accent:       statusCyan,
  gradient:     [driverBlue, "#0D47A1"] as [string, string],
  online:  { color: success,  background: successLight },
  offline: { color: gray500,  background: gray100      },
  busy:    { color: warning,  background: warningLight  },
  tabBar: {
    active:     "#4A4A4A",
    inactive:   gray400,
    fab:        primary,
    fabBorder:  white,
    background: white,
  },
  header: {
    tintColor:  driverBlue,
    background: white,
  },
  card:   CardVariants.driver,
};

export const AdminTheme = {
  primary:  primary,
  accent:   info,
  gradient: [primary, primaryDark] as [string, string],
  sidebar: {
    background:  gray800,
    text:        white,
    activeItem:  primary,
    inactiveItem:gray400,
    borderColor: gray700,
  },
  card:  CardVariants.elevated,
  badge: BadgeVariants.primary,
  table: {
    headerBackground: gray100,
    rowBackground:    white,
    altRowBackground: gray50,
    borderColor:      gray200,
    headerFontFamily: FontFamily.cairoBold,
    cellFontFamily:   FontFamily.tajawal,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 10 — ACCESSIBILITY TOKENS
// ═══════════════════════════════════════════════════════════════════════════════

export const A11y = {
  minTouchTarget:       44,    // px — Apple HIG & Material Design minimum
  minContrastAA:        4.5,   // WCAG 2.1 Level AA
  minContrastAAA:       7.0,   // WCAG 2.1 Level AAA
  minContrastLargeText: 3.0,   // WCAG 2.1 for 18pt+ or 14pt bold
  focusRingColor:       primary,
  focusRingWidth:       2,
  reducedMotionDuration:0,     // ms — for prefers-reduced-motion
  minimumFontSize:      11,    // px — below this is inaccessible
  minimumLineHeight:    1.2,   // relative — minimum for readability
  semanticRoles: {
    button:  "button"  as const,
    image:   "image"   as const,
    text:    "text"    as const,
    header:  "header"  as const,
    link:    "link"    as const,
    summary: "summary" as const,
    none:    "none"    as const,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 11 — RTL SUPPORT TOKENS
// ═══════════════════════════════════════════════════════════════════════════════

export const RTL = {
  isRTL:            true,
  writingDirection: "rtl"        as const,
  textAlign:        "right"      as const,
  // Logical flex directions — use instead of "flex-start" / "flex-end"
  contentStart:     "flex-end"   as "flex-end",
  contentEnd:       "flex-start" as "flex-start",
  // Logical helpers — auto-flip for RTL
  marginStart:  (n: number) => ({ marginEnd:    n }),
  marginEnd:    (n: number) => ({ marginStart:  n }),
  paddingStart: (n: number) => ({ paddingEnd:   n }),
  paddingEnd:   (n: number) => ({ paddingStart: n }),
  // Icon flip — for directional icons (arrows, chevrons)
  iconFlip:         [{ scaleX: -1 as -1 }],
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 12 — UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Apply opacity to a hex color.
 * hexAlpha("#E86520", 0.20) → "#E8652033"
 */
export function hexAlpha(hex: string, opacity: number): string {
  const clamped = Math.min(1, Math.max(0, opacity));
  const o = Math.round(clamped * 255).toString(16).padStart(2, "0");
  return hex + o;
}

/**
 * Get the full ORDER_STATUS_STYLES entry for a given status.
 * Returns a safe fallback for unknown statuses.
 */
export function getStatusStyle(status: string): {
  color: string; background: string; label: string; iconName: string;
} {
  return ORDER_STATUS_STYLES[status] ?? {
    color:      gray500,
    background: gray100,
    label:      status,
    iconName:   "help-circle",
  };
}

/**
 * Get the display color for a given order status.
 */
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

/**
 * Get theme colors for the current mode (light | dark).
 * Used when context-based useTheme() is not available.
 */
export function getThemeColors(mode: "light" | "dark") {
  return Colors[mode];
}
