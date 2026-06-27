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
  // wayYellow removed — was duplicate of primary
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

// ─── Gradients ───────────────────────────────────────────────────────────────
export const Gradients = {
  splash:     [primary, primaryDark] as const,
  background: ["#FFF3EE", "#FFF9F6", "#FFFCFA", white] as const,
};

// ─── Colors (Light / Dark Themes) ────────────────────────────────────────────
export const Colors = {
  light: {
    // Text
    text:             "#2D2D2D",
    textSecondary:    "#555555",
    textDisabled:     gray400,
    buttonText:       black,
    link:             primary,

    // Tab
    tabIconDefault:   gray500,
    tabIconSelected:  primary,

    // Brand
    primary,
    primaryLight,
    secondary,

    // Backgrounds
    backgroundRoot:      "#F7F9FC",
    backgroundDefault:   white,
    backgroundCard:      white,
    backgroundSecondary: "#F0F0F0",
    backgroundTertiary:  "#E8E8E8",

    // Borders
    border:  "#E0E0E0",
    divider: gray200,

    // Icons
    iconPrimary:   primary,
    iconSecondary: "#555555",
    iconMuted:     gray400,
    iconDanger:    error,
    iconSuccess:   success,
    iconWarning:   warning,

    // Status
    success,
    successLight,
    warning,
    warningLight,
    error,
    errorLight,
    info,
    infoLight,

    // Grays
    gray50,
    gray100,
    gray200,
    gray300,
    gray400,
    gray500,
    gray600,
    gray700,
    gray800,

    // Utility
    white,
    black,
    overlay,
    shadowColor: black,
  },
  dark: {
    // Text
    text:             "#ECEDEE",
    textSecondary:    "#9BA1A6",
    textDisabled:     gray600,
    buttonText:       black,
    link:             primary,

    // Tab
    tabIconDefault:   gray500,
    tabIconSelected:  primary,

    // Brand
    primary,
    primaryLight,
    secondary,

    // Backgrounds
    backgroundRoot:      "#1A1A1A",
    backgroundDefault:   "#2A2A2A",
    backgroundCard:      "#2A2A2A",
    backgroundSecondary: "#353535",
    backgroundTertiary:  "#404040",

    // Borders
    border:  "#404040",
    divider: "#404040",

    // Icons
    iconPrimary:   primary,
    iconSecondary: "#9BA1A6",
    iconMuted:     gray600,
    iconDanger:    "#F87171",
    iconSuccess:   "#34D399",
    iconWarning:   "#FCD34D",

    // Status
    success:      "#34D399",
    successLight: "#064E3B",
    warning:      "#FCD34D",
    warningLight: "#451A03",
    error:        "#F87171",
    errorLight:   "#450A0A",
    info:         "#60A5FA",
    infoLight:    "#1E3A5F",

    // Grays (inverted for dark)
    gray50:  "#374151",
    gray100: "#374151",
    gray200: "#4B5563",
    gray300: gray500,
    gray400: gray400,
    gray500: gray300,
    gray600: gray200,
    gray700: gray100,
    gray800: gray50,

    // Utility
    white,
    black,
    overlay,
    shadowColor: black,
  },
};

// ─── Design System Constants ──────────────────────────────────────────────────
export const DesignSystem = {
  screenPadding:   16,
  gridGap:         12,
  categoryCard:    { width: 110, height: 140 },
  categoryImageSize: 85,
  bannerHeight:    195,
  bannerRadius:    16,
};

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
  xs:    8,
  sm:    12,
  md:    16,
  lg:    18,
  xl:    24,
  "2xl": 32,
  "3xl": 40,
  full:  9999,
};

// ─── Typography ───────────────────────────────────────────────────────────────
export const Typography = {
  h1:       { fontSize: 22, lineHeight: 36, fontWeight: "700" as const },
  h2:       { fontSize: 18, lineHeight: 30, fontWeight: "700" as const },
  h3:       { fontSize: 15, lineHeight: 26, fontWeight: "600" as const },
  h4:       { fontSize: 13, lineHeight: 22, fontWeight: "600" as const },
  body:     { fontSize: 13, lineHeight: 22, fontWeight: "400" as const },
  small:    { fontSize: 11, lineHeight: 19, fontWeight: "400" as const },
  category: { fontSize: 13, lineHeight: 22, fontWeight: "600" as const },
  link:     { fontSize: 13, lineHeight: 22, fontWeight: "400" as const },
};

// ─── Fonts ────────────────────────────────────────────────────────────────────
export const Fonts = Platform.select({
  ios:     { sans: "Tajawal_400Regular", sansBold: "Tajawal_700Bold", sansMedium: "Tajawal_500Medium" },
  android: { sans: "Tajawal_400Regular", sansBold: "Tajawal_700Bold", sansMedium: "Tajawal_500Medium" },
  default: { sans: "Tajawal_400Regular", sansBold: "Tajawal_700Bold", sansMedium: "Tajawal_500Medium" },
  web:     {
    sans:       "Tajawal, system-ui, -apple-system, sans-serif",
    sansBold:   "Tajawal, system-ui, -apple-system, sans-serif",
    sansMedium: "Tajawal, system-ui, -apple-system, sans-serif",
  },
});

// ─── Shadows ──────────────────────────────────────────────────────────────────
export const Shadows = {
  sm: { shadowColor: black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6,  elevation: 2 },
  md: { shadowColor: black, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 },
  lg: { shadowColor: black, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
};
