import React from "react";
import { View, StyleSheet } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { AppColors, BorderRadius, FontWeight, Shadows, Spacing } from "@/constants/theme";

interface Props {
  // Kept so electronic payment can be switched back on later without touching this
  // component: when the backend flag onlinePaymentEnabled becomes true again, the
  // card/Mastercard options below re-appear. It defaults to false, so today the app
  // is cash-on-delivery only — no e-payment icons are shown. (Optional to keep
  // CheckoutScreen callers flexible.)
  onlinePaymentEnabled?: boolean;
}

export function PaymentMethodsCard({ onlinePaymentEnabled = false }: Props) {
  const { theme } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
      {/* Electronic payment (card / Mastercard) is intentionally removed from the UI.
          It only renders if the backend re-enables onlinePaymentEnabled in the future,
          keeping COD as the sole option today. */}
      {onlinePaymentEnabled ? (
        <View style={styles.methodsRow}>
          {/* Mastercard */}
          <View style={styles.methodItem}>
            <Svg width={44} height={28}>
              <Circle cx={15} cy={14} r={13} fill={AppColors.error} opacity={0.8} />
              <Circle cx={29} cy={14} r={13} fill={AppColors.warning} opacity={0.8} />
            </Svg>
            <ThemedText type="small" style={[styles.methodLabel, { color: theme.text }]}>
              ماستر كارد
            </ThemedText>
          </View>

          {/* Dinar Cash */}
          <View style={styles.methodItem}>
            <View style={styles.dinarIcon}>
              <ThemedText type="small" style={styles.dinarText}>IQD</ThemedText>
            </View>
            <ThemedText type="small" style={[styles.methodLabel, { color: theme.text }]}>
              الدينار كاش
            </ThemedText>
          </View>

          {/* Card */}
          <View style={styles.methodItem}>
            <View style={[styles.cardIcon, { borderColor: theme.border }]}>
              <Feather name="credit-card" size={20} color={AppColors.primary} />
            </View>
            <ThemedText type="small" style={[styles.methodLabel, { color: theme.text }]}>
              بواسطة البطاقة
            </ThemedText>
          </View>
        </View>
      ) : null}

      <View style={[styles.cashNote, { backgroundColor: AppColors.primary + "10", borderColor: AppColors.primary + "30" }]}>
        <Feather name="check-circle" size={16} color={AppColors.primary} />
        <ThemedText type="small" style={{ color: AppColors.primary, fontWeight: FontWeight.semiBold, textAlign: "right" }}>
          الدفع نقداً عند الاستلام
        </ThemedText>
      </View>
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
