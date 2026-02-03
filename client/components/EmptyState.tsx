import React from "react";
import { StyleSheet, View, Dimensions, Pressable } from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { AppColors } from "@/constants/theme";

const { width } = Dimensions.get("window");

interface EmptyStateProps {
  image?: any;
  title: string;
  subtitle?: string;
  buttonText?: string;
  onButtonPress?: () => void;
}

export function EmptyState({
  image,
  title,
  subtitle,
  buttonText,
  onButtonPress,
}: EmptyStateProps) {
  const { theme } = useTheme();

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onButtonPress?.();
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      {image ? (
        <View style={styles.imageContainer}>
          <Image source={image} style={styles.image} contentFit="contain" />
        </View>
      ) : null}
      <ThemedText type="h2" style={styles.title}>
        {title}
      </ThemedText>
      {subtitle ? (
        <ThemedText type="body" style={[styles.subtitle, { color: "#8E8E93" }]}>
          {subtitle}
        </ThemedText>
      ) : null}
      {buttonText && onButtonPress ? (
        <Pressable onPress={handlePress} style={styles.button}>
          <ThemedText type="h4" style={styles.buttonText}>
            {buttonText}
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  imageContainer: {
    marginBottom: 30,
  },
  image: {
    width: width * 0.6,
    height: width * 0.6,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 40,
  },
  button: {
    backgroundColor: AppColors.primary,
    paddingVertical: 15,
    paddingHorizontal: 60,
    borderRadius: 30,
    shadowColor: AppColors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
  },
});
