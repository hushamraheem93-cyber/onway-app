import { View, type ViewProps } from "react-native";

import { useTheme } from "@/hooks/useTheme";

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
};

export function ThemedView({
  style,
  lightColor,
  darkColor,
  ...otherProps
}: ThemedViewProps) {
  const { theme } = useTheme();
  // `darkColor` remains accepted for compatibility but cannot activate dark UI.
  void darkColor;

  const backgroundColor = lightColor || theme.backgroundRoot;

  return <View style={[{ backgroundColor }, style]} {...otherProps} />;
}
