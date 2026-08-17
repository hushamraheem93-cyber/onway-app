import React from "react";
import { View, StyleSheet } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { AppColors, BorderRadius, Shadows, Spacing } from "@/constants/theme";
import { formatPrice } from "@/constants/currency";

interface Props {
  itemCount: number;
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  promoDiscount: number;
  /** True once the delivery fee is known (an area is picked, or the store overrides it). */
  feeResolved: boolean;
}

export function OrderSummaryCard({
  itemCount,
  subtotal,
  deliveryFee,
  serviceFee,
  promoDiscount,
  feeResolved,
}: Props) {
  const { theme } = useTheme();
  const total = subtotal + deliveryFee + serviceFee - promoDiscount;

  // D-3: this used to print a literal 1000 for restaurant baskets — a fourth copy
  // of the old flat restaurant fee, and the one the customer actually reads. There
  // is no per-kind fee any more: the delivery fee is the selected area's fee, or
  // the store's own override, and both arrive here already resolved.
  const deliveryLabel = feeResolved ? formatPrice(deliveryFee) : "اختر المنطقة";

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.backgroundDefault },
        Shadows.sm,
      ]}
    >
      <Row label="عدد المنتجات" value={`${itemCount} منتج`} />
      <Row label="المجموع الفرعي" value={formatPrice(subtotal)} />
      <Row
        label="أجور التوصيل"
        value={deliveryLabel}
        valueColor={deliveryFee > 0 ? AppColors.primary : AppColors.success}
      />
      <Row
        label="نسبة الخدمة"
        value={formatPrice(serviceFee)}
        valueColor={AppColors.primary}
      />
      {promoDiscount > 0 && (
        <Row
          label="الخصم"
          value={`- ${formatPrice(promoDiscount)}`}
          valueColor={AppColors.success}
        />
      )}
      <View style={[styles.row, styles.totalRow]}>
        <ThemedText type="h4">المجموع الكلي</ThemedText>
        <ThemedText type="h2" style={{ color: AppColors.primary }}>
          {formatPrice(total)}
        </ThemedText>
      </View>
    </View>
  );
}

function Row({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.row}>
      <ThemedText type="body" style={{ color: theme.textSecondary }}>
        {label}
      </ThemedText>
      <ThemedText
        type="body"
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  row: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: AppColors.border,
    marginTop: Spacing.sm,
    paddingTop: Spacing.lg,
  },
});
