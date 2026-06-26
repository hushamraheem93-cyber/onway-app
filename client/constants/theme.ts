import { Platform, I18nManager } from "react-native";

// Enable RTL
I18nManager.allowRTL(true);
I18nManager.forceRTL(true);

// ONWAY Brand Colors
const primaryColor = "#E86520";
const secondaryColor = "#FFF0E8";
const primaryLight = "#F28B4E";
const primaryDark = "#C4520F";
const onGrey = "#4A4A4A";
const wayYellow = "#E86520";

export const AppColors = {
  primary: primaryColor,
  secondary: secondaryColor,
  primaryLight: primaryLight,
  primaryDark: primaryDark,
  onGrey: onGrey,
  wayYellow: wayYellow,
  background: "#F7F9FC",
  surface: "#FFFFFF",
  textPrimary: "#2D2D2D",
  textSecondary: "#555555",
  border: "#E0E0E0",
  success: "#4CAF50",
  successLight: "#E8F5E9",
  error: "#F44336",
  errorLight: "#FFEBEE",
  warning: "#F59E0B",
  warningLight: "#FFF8E1",
  info: "#3B82F6",
  infoLight: "#EFF6FF",
  // Vendor portal
  vendorPurple: "#673AB7",
  vendorPurpleLight: "#F3EEFF",
  // Driver portal
  driverBlue: "#1565C0",
  driverBlueLight: "#E3F2FD",
};

/** Order status → display color mapping */
export const ORDER_STATUS_COLORS: Record<string, string> = {
  pending: "#F59E0B",
  confirmed: "#3B82F6",
  preparing: "#8B5CF6",
  ready: "#E86520",
  picked_up: "#F97316",
  in_delivery: "#06B6D4",
  delivering: "#06B6D4",
  delivered: "#10B981",
  cancelled: "#EF4444",
  issue: "#EF4444",
};

/** Order status → Arabic label */
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

// Design System Constants
export const DesignSystem = {
  screenPadding: 16,
  gridGap: 12,
  categoryCard: {
    width: 110,
    height: 140,
  },
  categoryImageSize: 85,
  bannerHeight: 195,
  bannerRadius: 16,
};

export const Colors = {
  light: {
    text: "#2D2D2D",
    textSecondary: "#555555",
    buttonText: "#000000",
    tabIconDefault: "#757575",
    tabIconSelected: primaryColor,
    link: wayYellow,
    primary: primaryColor,
    primaryLight: primaryLight,
    backgroundRoot: "#F7F9FC",
    backgroundDefault: "#FFFFFF",
    backgroundSecondary: "#F0F0F0",
    backgroundTertiary: "#E8E8E8",
    border: "#E0E0E0",
    success: "#4CAF50",
    error: "#F44336",
  },
  dark: {
    text: "#ECEDEE",
    textSecondary: "#9BA1A6",
    buttonText: "#000000",
    tabIconDefault: "#9BA1A6",
    tabIconSelected: wayYellow,
    link: wayYellow,
    primary: primaryColor,
    primaryLight: primaryLight,
    backgroundRoot: "#1A1A1A",
    backgroundDefault: "#2A2A2A",
    backgroundSecondary: "#353535",
    backgroundTertiary: "#404040",
    border: "#404040",
    success: "#66BB6A",
    error: "#EF5350",
  },
};

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

export const BorderRadius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 18,
  xl: 24,
  "2xl": 32,
  "3xl": 40,
  full: 9999,
};

export const Typography = {
  h1: {
    fontSize: 22,
    lineHeight: 36,
    fontWeight: "700" as const,
  },
  h2: {
    fontSize: 18,
    lineHeight: 30,
    fontWeight: "700" as const,
  },
  h3: {
    fontSize: 15,
    lineHeight: 26,
    fontWeight: "600" as const,
  },
  h4: {
    fontSize: 13,
    lineHeight: 22,
    fontWeight: "600" as const,
  },
  body: {
    fontSize: 13,
    lineHeight: 22,
    fontWeight: "400" as const,
  },
  small: {
    fontSize: 11,
    lineHeight: 19,
    fontWeight: "400" as const,
  },
  category: {
    fontSize: 13,
    lineHeight: 22,
    fontWeight: "600" as const,
  },
  link: {
    fontSize: 13,
    lineHeight: 22,
    fontWeight: "400" as const,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: "Tajawal_400Regular",
    sansBold: "Tajawal_700Bold",
    sansMedium: "Tajawal_500Medium",
  },
  android: {
    sans: "Tajawal_400Regular",
    sansBold: "Tajawal_700Bold",
    sansMedium: "Tajawal_500Medium",
  },
  default: {
    sans: "Tajawal_400Regular",
    sansBold: "Tajawal_700Bold",
    sansMedium: "Tajawal_500Medium",
  },
  web: {
    sans: "Tajawal, system-ui, -apple-system, sans-serif",
    sansBold: "Tajawal, system-ui, -apple-system, sans-serif",
    sansMedium: "Tajawal, system-ui, -apple-system, sans-serif",
  },
});

export const Shadows = {
  sm: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  md: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  lg: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
};
