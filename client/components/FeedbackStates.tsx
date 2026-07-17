/**
 * Feedback state views — Error / Success / Loading — the design-system counterparts
 * to <EmptyState>. Same visual language (icon medallion, title, subtitle, optional
 * action) so full-screen states feel consistent across the app. Purely additive:
 * screens opt in; nothing existing changes. Dark-mode aware via useTheme.
 */
import React from "react";
import { StyleSheet, View, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { AppColors, FontWeight, Spacing, BorderRadius } from "@/constants/theme";

interface StateLayoutProps {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  tintSoft: string;
  title: string;
  subtitle?: string;
  actionText?: string;
  onAction?: () => void;
}

function StateLayout({ icon, tint, tintSoft, title, subtitle, actionText, onAction }: StateLayoutProps) {
  const { theme } = useTheme();
  const handle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onAction?.();
  };
  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <View style={[styles.medallion, { backgroundColor: tintSoft }]}>
        <Ionicons name={icon} size={56} color={tint} />
      </View>
      <ThemedText type="h2" style={styles.title}>{title}</ThemedText>
      {subtitle ? <ThemedText type="body" style={[styles.subtitle, { color: theme.textSecondary }]}>{subtitle}</ThemedText> : null}
      {actionText && onAction ? (
        <Pressable onPress={handle} style={[styles.action, { backgroundColor: tint }]} accessibilityRole="button">
          <ThemedText type="h4" style={styles.actionText}>{actionText}</ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Full-screen error with an optional retry action. */
export function ErrorState({
  title = "حدث خطأ",
  subtitle = "تعذّر تحميل البيانات. تحقّق من اتصالك وحاول مرة أخرى.",
  actionText,
  onRetry,
  icon = "alert-circle",
}: {
  title?: string;
  subtitle?: string;
  actionText?: string;
  onRetry?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const { theme } = useTheme();
  return (
    <StateLayout
      icon={icon}
      tint={theme.error}
      tintSoft={theme.errorLight}
      title={title}
      subtitle={subtitle}
      actionText={onRetry ? (actionText ?? "إعادة المحاولة") : undefined}
      onAction={onRetry}
    />
  );
}

/** Full-screen success confirmation with an optional continue action. */
export function SuccessState({
  title,
  subtitle,
  actionText,
  onAction,
  icon = "checkmark-circle",
}: {
  title: string;
  subtitle?: string;
  actionText?: string;
  onAction?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const { theme } = useTheme();
  return (
    <StateLayout
      icon={icon}
      tint={theme.success}
      tintSoft={theme.successLight}
      title={title}
      subtitle={subtitle}
      actionText={actionText}
      onAction={onAction}
    />
  );
}

/** Centered loading indicator with an optional message. */
export function LoadingState({ message }: { message?: string }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <ActivityIndicator size="large" color={theme.primary} />
      {message ? (
        <ThemedText type="body" style={[styles.subtitle, { color: theme.textSecondary, marginTop: Spacing.md }]}>
          {message}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 30,
  },
  medallion: {
    width: 112,
    height: 112,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: FontWeight.bold,
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 22,
  },
  action: {
    marginTop: 28,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: BorderRadius.full,
    alignItems: "center",
  },
  actionText: {
    color: AppColors.white,
    fontWeight: FontWeight.bold,
  },
});
