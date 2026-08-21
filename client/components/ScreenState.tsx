import React from "react";
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { AppColors, BorderRadius, FontFamily, FontWeight, Spacing } from "@/constants/theme";

export function LoadingState({
  label = "جاري التحميل...",
  compact = false,
  style,
}: {
  label?: string;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[styles.loading, compact && styles.loadingCompact, style]}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
    >
      <ActivityIndicator size={compact ? "small" : "large"} color={AppColors.primary} />
      <ThemedText style={styles.loadingText}>{label}</ThemedText>
    </View>
  );
}

export function ErrorState({
  title = "تعذّر تحميل البيانات",
  message = "حدث خطأ أثناء الاتصال بالخادم. حاول مرة أخرى.",
  onRetry,
  style,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.error, style]} accessibilityRole="alert">
      <View style={styles.errorIcon}>
        <Feather name="alert-circle" size={26} color={AppColors.error} />
      </View>
      <ThemedText style={styles.errorTitle}>{title}</ThemedText>
      <ThemedText style={styles.errorMessage}>{message}</ThemedText>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          style={styles.retry}
          accessibilityRole="button"
          accessibilityLabel="إعادة المحاولة"
        >
          <Feather name="refresh-cw" size={15} color={AppColors.white} />
          <ThemedText style={styles.retryText}>إعادة المحاولة</ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
  },
  loadingCompact: {
    minHeight: 86,
    paddingVertical: Spacing.lg,
  },
  loadingText: {
    marginTop: Spacing.sm,
    color: AppColors.gray500,
    fontFamily: FontFamily.cairo,
    textAlign: "center",
  },
  error: {
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
    borderRadius: BorderRadius.lg,
    backgroundColor: AppColors.errorLight,
  },
  errorIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: AppColors.white,
    marginBottom: Spacing.sm,
  },
  errorTitle: {
    color: AppColors.error,
    fontFamily: FontFamily.cairoBold,
    fontWeight: FontWeight.bold,
    textAlign: "center",
  },
  errorMessage: {
    marginTop: Spacing.xs,
    color: AppColors.gray600,
    fontFamily: FontFamily.tajawal,
    textAlign: "center",
    lineHeight: 21,
  },
  retry: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: AppColors.primary,
  },
  retryText: {
    color: AppColors.white,
    fontFamily: FontFamily.cairoBold,
    fontWeight: FontWeight.bold,
  },
});
