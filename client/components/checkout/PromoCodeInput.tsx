import React from "react";
import { View, TextInput, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { AppColors, BorderRadius, FontWeight, Shadows, Spacing } from "@/constants/theme";

interface Props {
  code: string;
  onChangeCode: (v: string) => void;
  onApply: () => void;
  isApplying: boolean;
  error: string;
  success: string;
}

export function PromoCodeInput({ code, onChangeCode, onApply, isApplying, error, success }: Props) {
  const { theme } = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
      <ThemedText type="small" style={[styles.label, { color: theme.textSecondary }]}>
        كود الخصم (اختياري)
      </ThemedText>
      <View style={styles.row}>
        <Pressable
          onPress={onApply}
          disabled={isApplying}
          accessibilityRole="button"
          accessibilityLabel="تطبيق كود الخصم"
          accessibilityState={{ disabled: isApplying, busy: isApplying }}
          style={styles.applyBtn}
        >
          {isApplying ? (
            <ActivityIndicator size="small" color={AppColors.white} />
          ) : (
            <ThemedText type="body" style={styles.applyBtnText}>تطبيق</ThemedText>
          )}
        </Pressable>
        <TextInput
          value={code}
          onChangeText={onChangeCode}
          placeholder="أدخل كود الخصم"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text }]}
        />
      </View>
      {error ? (
        <ThemedText type="small" style={[styles.feedback, { color: AppColors.error }]}>
          {error}
        </ThemedText>
      ) : null}
      {success ? (
        <ThemedText type="small" style={[styles.feedback, { color: AppColors.success }]}>
          {success}
        </ThemedText>
      ) : null}
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
  row: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  applyBtn: {
    backgroundColor: AppColors.primary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    justifyContent: "center",
  },
  applyBtnText: {
    color: AppColors.white,
    fontWeight: FontWeight.semiBold,
  },
  input: {
    flex: 1,
    fontSize: 16,
    textAlign: "right",
    paddingVertical: Spacing.sm,
  },
  feedback: {
    textAlign: "right",
    marginTop: Spacing.sm,
  },
});
