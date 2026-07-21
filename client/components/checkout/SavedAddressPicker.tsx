import React from "react";
import { View, ScrollView, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { AppColors, BorderRadius, FontWeight, Shadows, Spacing } from "@/constants/theme";

interface SavedAddress {
  id: string;
  title: string;
  region: string;
  address: string;
  isDefault?: boolean;
}

interface Props {
  addresses: SavedAddress[];
  activeAddress: string;
  onSelect: (address: SavedAddress) => void;
}

export function SavedAddressPicker({ addresses, activeAddress, onSelect }: Props) {
  const { theme } = useTheme();
  if (addresses.length === 0) return null;

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
      <ThemedText type="small" style={[styles.label, { color: theme.textSecondary }]}>
        العناوين المحفوظة
      </ThemedText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {addresses.map((a) => {
          const active = activeAddress === a.address;
          return (
            <Pressable
              key={a.id}
              onPress={() => onSelect(a)}
              accessibilityRole="button"
              accessibilityLabel={`استخدام العنوان: ${a.title}`}
              style={[
                styles.chip,
                { borderColor: active ? AppColors.primary : theme.border },
                active && { backgroundColor: AppColors.secondary },
              ]}
            >
              <View style={styles.chipHeader}>
                <Feather name="map-pin" size={13} color={AppColors.primary} />
                <ThemedText
                  type="small"
                  style={{ fontWeight: FontWeight.bold, color: AppColors.primary }}
                  numberOfLines={1}
                >
                  {a.title}
                </ThemedText>
              </View>
              <ThemedText
                type="small"
                style={{ color: theme.textSecondary, textAlign: "right", marginTop: 2 }}
                numberOfLines={1}
              >
                {a.address}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  label: {
    textAlign: "right",
    marginBottom: Spacing.sm,
  },
  scrollContent: {
    gap: Spacing.sm,
    flexDirection: "row-reverse",
  },
  chip: {
    borderWidth: 1.5,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    maxWidth: 220,
  },
  chipHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
  },
});
