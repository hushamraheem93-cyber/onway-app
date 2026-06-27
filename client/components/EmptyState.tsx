import React from "react";
import { StyleSheet, View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { AppColors } from "@/constants/theme";

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  image?: any;
  title: string;
  subtitle?: string;
  buttonText?: string;
  onButtonPress?: () => void;
}

function EmptyStateComponent({
  icon = "cart",
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
      <View style={[styles.imageContainer, { backgroundColor: theme.backgroundDefault }]}>
        <View style={styles.orangeBox}>
          <Ionicons name={icon} size={80} color={AppColors.white} />
        </View>
      </View>

      <ThemedText type="h2" style={styles.title}>
        {title}
      </ThemedText>

      {subtitle ? (
        <ThemedText type="body" style={styles.subtitle}>
          {subtitle}
        </ThemedText>
      ) : null}

      {buttonText && onButtonPress ? (
        <Pressable onPress={handlePress} style={styles.button}>
          <View style={styles.btnIconCircle}>
            <Ionicons name="chevron-back" size={20} color={AppColors.primary} />
          </View>
          <ThemedText type="h4" style={styles.buttonText}>
            {buttonText}
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

export const EmptyState = React.memo(EmptyStateComponent);
const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 30,
  },
  imageContainer: {
    width: 180,
    height: 180,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 30,
    shadowColor: AppColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  orangeBox: {
    width: 120,
    height: 120,
    backgroundColor: AppColors.primary,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 17,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 13,
    color: AppColors.gray400,
    textAlign: "center",
    lineHeight: 24,
  },
  button: {
    backgroundColor: AppColors.primary,
    flexDirection: "row",
    paddingVertical: 15,
    paddingHorizontal: 25,
    borderRadius: 50,
    marginTop: 40,
    alignItems: "center",
  },
  buttonText: {
    color: AppColors.white,
    fontWeight: "bold",
    marginRight: 15,
  },
  btnIconCircle: {
    backgroundColor: AppColors.white,
    borderRadius: 20,
    padding: 5,
    marginLeft: 10,
  },
});
