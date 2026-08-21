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
  const { theme } = useTheme();
  // `darkColor` is retained in the public props for compatibility only.
  void darkColor;

  const getColor = () => {
    if (lightColor) {
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
    ios: "Cairo_400Regular",
    android: "Cairo_400Regular",
    web: "Cairo, system-ui, sans-serif",
  });

  const getFontFamily = () => {
    const typeStyle = getTypeStyle();
    if (typeStyle.fontWeight === "700") {
      return Platform.select({
        ios: "Cairo_700Bold",
        android: "Cairo_700Bold",
        web: "Cairo, system-ui, sans-serif",
      });
    }
    if (typeStyle.fontWeight === "600") {
      return Platform.select({
        ios: "Cairo_600SemiBold",
        android: "Cairo_600SemiBold",
        web: "Cairo, system-ui, sans-serif",
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
