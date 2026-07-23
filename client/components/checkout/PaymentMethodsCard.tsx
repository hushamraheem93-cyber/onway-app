import React from "react";
import { View, StyleSheet } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { AppColors, BorderRadius, FontWeight, Shadows, Spacing } from "@/constants/theme";

interface Props {
  onlinePaymentEnabled: boolean;
}

export function PaymentMethodsCard({ onlinePaymentEnabled }: Props) {
  const { theme } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
      <View style={styles.methodsRow}>
        {/* Mastercard */}
        <View style={[styles.methodItem, !onlinePaymentEnabled && styles.disabled]}>
          <Svg width={44} height={28}>
            <Circle cx={15} cy={14} r={13} fill={AppColors.error} opacity={onlinePaymentEnabled ? 0.8 : 0.4} />
            <Circle cx={29} cy={14} r={13} fill={AppColors.warning} opacity={onlinePaymentEnabled ? 0.8 : 0.4} />
          </Svg>
          <ThemedText type="small" style={[styles.methodLabel, { color: onlinePaymentEnabled ? theme.text : theme.textSecondary }]}>
            ماستر كارد
          </ThemedText>
          {!onlinePaymentEnabled && <ComingSoonBadge />}
        </View>

        {/* Dinar Cash (always available) */}
        <View style={styles.methodItem}>
          <View style={styles.dinarIcon}>
            <ThemedText type="small" style={styles.dinarText}>IQD</ThemedText>
          </View>
          <ThemedText type="small" style={[styles.methodLabel, { color: theme.text }]}>
            الدينار كاش
          </ThemedText>
        </View>

        {/* Card */}
        <View style={[styles.methodItem, !onlinePaymentEnabled && styles.disabled]}>
          <View style={[styles.cardIcon, { borderColor: theme.border }]}>
            <Feather name="credit-card" size={20} color={onlinePaymentEnabled ? AppColors.primary : theme.textSecondary} />
          </View>
          <ThemedText type="small" style={[styles.methodLabel, { color: onlinePaymentEnabled ? theme.text : theme.textSecondary }]}>
            بواسطة البطاقة
          </ThemedText>
          {!onlinePaymentEnabled && <ComingSoonBadge />}
        </View>
      </View>

      <View style={[styles.cashNote, { backgroundColor: AppColors.primary + "10", borderColor: AppColors.primary + "30" }]}>
        <Feather name="check-circle" size={16} color={AppColors.primary} />
        <ThemedText type="small" style={{ color: AppColors.primary, fontWeight: FontWeight.semiBold, textAlign: "right" }}>
          الدفع نقداً عند الاستلام
        </ThemedText>
      </View>
    </View>
  );
}

function ComingSoonBadge() {
  return (
    <View style={styles.badge}>
      <ThemedText style={styles.badgeText}>قريباً</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  methodsRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-around",
    alignItems: "flex-start",
    marginBottom: Spacing.md,
  },
  methodItem: {
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  disabled: {
    opacity: 0.5,
  },
  methodLabel: {
    textAlign: "center",
    fontSize: 12,
    fontWeight: FontWeight.semiBold,
  },
  dinarIcon: {
    width: 44,
    height: 28,
    borderRadius: 6,
    backgroundColor: AppColors.success,
    alignItems: "center",
    justifyContent: "center",
  },
  dinarText: {
    color: AppColors.white,
    fontWeight: FontWeight.bold,
    fontSize: 13,
    letterSpacing: 0.5,
  },
  cardIcon: {
    width: 44,
    height: 28,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    backgroundColor: AppColors.gray100,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    color: AppColors.gray400,
    fontWeight: FontWeight.bold,
  },
  cashNote: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
  },
});
