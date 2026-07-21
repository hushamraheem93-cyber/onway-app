import React from "react";
import { View, Modal, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { AppColors, BorderRadius, Spacing } from "@/constants/theme";

interface Props {
  message: string | null;
  canRetry: boolean;
  onDismiss: () => void;
  onRetry: () => void;
}

export function ErrorModal({ message, canRetry, onDismiss, onRetry }: Props) {
  const { theme } = useTheme();
  return (
    <Modal
      visible={message !== null}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <Pressable style={styles.overlay} onPress={onDismiss}>
        <Pressable style={[styles.card, { backgroundColor: theme.backgroundDefault }]}>
          <View style={styles.iconRow}>
            <Feather name="alert-circle" size={28} color={AppColors.error} />
          </View>
          <ThemedText type="h4" style={styles.title}>تنبيه</ThemedText>
          <ThemedText type="body" style={[styles.body, { color: theme.textSecondary }]}>
            {message}
          </ThemedText>
          <View style={styles.actions}>
            <Pressable
              style={[styles.btn, styles.btnDismiss, { borderColor: theme.border }]}
              onPress={onDismiss}
              accessibilityRole="button"
              accessibilityLabel="إغلاق"
            >
              <ThemedText type="body">إغلاق</ThemedText>
            </Pressable>
            {canRetry && (
              <Pressable
                style={[styles.btn, styles.btnRetry]}
                onPress={onRetry}
                accessibilityRole="button"
                accessibilityLabel="إعادة المحاولة"
              >
                <ThemedText type="body" style={{ color: AppColors.white }}>إعادة المحاولة</ThemedText>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: AppColors.overlay,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  card: {
    width: "100%",
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: "center",
  },
  iconRow: {
    marginBottom: Spacing.md,
  },
  title: {
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  body: {
    textAlign: "center",
    lineHeight: 22,
    marginBottom: Spacing.xl,
  },
  actions: {
    flexDirection: "row-reverse",
    gap: Spacing.md,
    width: "100%",
  },
  btn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  btnDismiss: {
    borderWidth: 1.5,
  },
  btnRetry: {
    backgroundColor: AppColors.primary,
  },
});
