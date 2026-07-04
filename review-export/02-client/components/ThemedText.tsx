import { Text, type TextProps, Platform } from "react-native";

import { useTheme } from "@/hooks/useTheme";
import { Typography } from "@/constants/theme";

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: "h1" | "h2" | "h3" | "h4" | "body" | "small" | "link";
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = "body",
  ...rest
}: ThemedTextProps) {
  const { theme, isDark } = useTheme();

  const getColor = () => {
    if (isDark && darkColor) {
      return darkColor;
    }

    if (!isDark && lightColor) {
      return lightColor;
    }

    if (type === "link") {
      return theme.link;
    }

    return theme.text;
  };

  const getTypeStyle = () => {
    switch (type) {
      case "h1":
        return Typography.h1;
      case "h2":
        return Typography.h2;
      case "h3":
        return Typography.h3;
      case "h4":
        return Typography.h4;
      case "body":
        return Typography.body;
      case "small":
        return Typography.small;
      case "link":
        return Typography.link;
      default:
        return Typography.body;
    }
  };

  const fontFamily = Platform.select({
    ios: "Tajawal_400Regular",
    android: "Tajawal_400Regular",
    web: "Tajawal, system-ui, sans-serif",
  });

  const getFontFamily = () => {
    const typeStyle = getTypeStyle();
    if (typeStyle.fontWeight === "700") {
      return Platform.select({
        ios: "Tajawal_700Bold",
        android: "Tajawal_700Bold",
        web: "Tajawal, system-ui, sans-serif",
      });
    }
    if (typeStyle.fontWeight === "600") {
      return Platform.select({
        ios: "Tajawal_500Medium",
        android: "Tajawal_500Medium",
        web: "Tajawal, system-ui, sans-serif",
      });
    }
    return fontFamily;
  };

  return (
    <Text
      style={[
        {
          color: getColor(),
          fontFamily: getFontFamily(),
          includeFontPadding: false,
        },
        getTypeStyle(),
        style,
      ]}
      {...rest}
    />
  );
}
