import { Platform, I18nManager } from "react-native";

// Enable RTL
I18nManager.allowRTL(true);
I18nManager.forceRTL(true);

// App Colors - Inspired by Talabaty with soft orange palette
const primaryColor = "#FF8C42";
const primaryLight = "#FFB174";
const primaryDark = "#E67A30";

export const AppColors = {
  primary: primaryColor,
  primaryLight: primaryLight,
  primaryDark: primaryDark,
  background: "#F5F5F5",
  surface: "#FFFFFF",
  textPrimary: "#2C2C2C",
  textSecondary: "#757575",
  border: "#E0E0E0",
  success: "#4CAF50",
  error: "#F44336",
};

export const Colors = {
  light: {
    text: "#2C2C2C",
    textSecondary: "#757575",
    buttonText: "#FFFFFF",
    tabIconDefault: "#757575",
    tabIconSelected: primaryColor,
    link: primaryColor,
    primary: primaryColor,
    primaryLight: primaryLight,
    backgroundRoot: "#F5F5F5",
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
    buttonText: "#FFFFFF",
    tabIconDefault: "#9BA1A6",
    tabIconSelected: primaryLight,
    link: primaryLight,
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
  lg: 20,
  xl: 24,
  "2xl": 32,
  "3xl": 40,
  full: 9999,
};

export const Typography = {
  h1: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: "700" as const,
  },
  h2: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: "700" as const,
  },
  h3: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: "600" as const,
  },
  h4: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "600" as const,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "400" as const,
  },
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400" as const,
  },
  link: {
    fontSize: 16,
    lineHeight: 24,
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
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  lg: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
};
