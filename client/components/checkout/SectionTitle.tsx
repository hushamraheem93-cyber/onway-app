import React from "react";
import { View, StyleSheet } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { AppColors, Spacing } from "@/constants/theme";

interface Props {
  title: string;
}

export function SectionTitle({ title }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.accent} />
      <ThemedText type="h3" style={styles.title}>{title}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  accent: {
    width: 4,
    height: 20,
    borderRadius: 2,
    backgroundColor: AppColors.primary,
  },
  title: {
    textAlign: "right",
  },
});
