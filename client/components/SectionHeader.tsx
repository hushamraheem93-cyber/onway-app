import React from "react";
import { StyleSheet, View, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, AppColors } from "@/constants/theme";

interface SectionHeaderProps {
  title: string;
  onSeeAll?: () => void;
}

export function SectionHeader({ title, onSeeAll }: SectionHeaderProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.container}>
      <ThemedText type="h3" style={styles.title}>
        {title}
      </ThemedText>
      {onSeeAll ? (
        <Pressable onPress={onSeeAll} style={styles.seeAllButton}>
          <ThemedText type="body" style={{ color: AppColors.onGrey }}>
            عرض الكل
          </ThemedText>
          <Feather
            name="chevron-left"
            size={18}
            color={AppColors.onGrey}
            style={styles.chevron}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  title: {
    textAlign: "right",
  },
  seeAllButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
  },
  chevron: {
    marginRight: Spacing.xs,
  },
});
