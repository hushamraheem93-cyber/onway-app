import React from "react";
import { View, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { AppColors, Spacing, BorderRadius, FontWeight } from "@/constants/theme";
import { formatPrice } from "@/constants/currency";
import type { SettlementView } from "@/hooks/useSettlement";

/**
 * Reusable, always-visible settlement status indicator for the top of the driver
 * and vendor screens. One component, four states, driven purely by the shared
 * SettlementView so both account types render identically without duplicated code:
 *   • outstanding   → 🟠 amount due + "Request Settlement"
 *   • under_review  → 🟡 request pending admin review
 *   • settled       → 🟢 nothing due
 */
export function SettlementStatusBar({
  view,
  requesting,
  onRequest,
}: {
  view: SettlementView | null;
  requesting: boolean;
  onRequest: () => void;
}) {
  if (!view) return null;

  const isVendor = view.direction === "payout";
  const amountLabel = isVendor ? "المبلغ المستحق لك" : "المستحق للتسوية";

  const palette = {
    outstanding: { bg: "#FFF3E6", border: AppColors.warning, fg: "#9A5B00", dot: "🟠", label: "بانتظار التسوية" },
    under_review: { bg: "#FFF9E0", border: "#E0A800", fg: "#8A6D00", dot: "🟡", label: "طلب التسوية قيد المراجعة" },
    settled: { bg: "#E8F7EE", border: AppColors.success, fg: "#1B7A3D", dot: "🟢", label: "الحساب مسوّى" },
  }[view.status];

  return (
    <View style={[styles.card, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <View style={styles.row}>
        <View style={styles.left}>
          {view.status === "settled" ? (
            <ThemedText style={[styles.title, { color: palette.fg }]}>لا توجد مبالغ مستحقة</ThemedText>
          ) : (
            <>
              <ThemedText style={[styles.amountLabel, { color: palette.fg }]}>{amountLabel}</ThemedText>
              <ThemedText style={[styles.amount, { color: palette.fg }]}>{formatPrice(view.outstanding)}</ThemedText>
            </>
          )}
          <View style={styles.statusRow}>
            <ThemedText style={styles.dot}>{palette.dot}</ThemedText>
            <ThemedText style={[styles.statusText, { color: palette.fg }]}>{palette.label}</ThemedText>
          </View>
        </View>

        {view.status === "outstanding" ? (
          <Pressable
            onPress={onRequest}
            disabled={requesting}
            style={[styles.btn, { backgroundColor: palette.border, opacity: requesting ? 0.6 : 1 }]}
            testID="button-request-settlement"
          >
            {requesting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <MaterialCommunityIcons name="cash-check" size={18} color="#fff" />
                <ThemedText style={styles.btnText}>طلب تسوية</ThemedText>
              </>
            )}
          </Pressable>
        ) : view.status === "under_review" ? (
          <MaterialCommunityIcons name="clock-outline" size={28} color={palette.border} />
        ) : (
          <MaterialCommunityIcons name="check-decagram" size={28} color={palette.border} />
        )}
      </View>

      {view.status !== "settled" && view.pendingOrderCount > 0 ? (
        <ThemedText style={[styles.sub, { color: palette.fg }]}>
          {view.pendingOrderCount} طلب بانتظار التسوية
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg ?? 16,
    padding: Spacing.md ?? 14,
    marginHorizontal: Spacing.md ?? 16,
    marginTop: Spacing.md ?? 12,
    gap: 6,
  },
  row: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  left: { flex: 1, gap: 2, alignItems: "flex-end" },
  title: { fontSize: 16, fontWeight: FontWeight.bold as any, textAlign: "right" },
  amountLabel: { fontSize: 12, textAlign: "right" },
  amount: { fontSize: 22, fontWeight: FontWeight.bold as any, textAlign: "right" },
  statusRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6, marginTop: 2 },
  dot: { fontSize: 12 },
  statusText: { fontSize: 13, fontWeight: FontWeight.semiBold as any },
  btn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: BorderRadius.md ?? 12,
    minWidth: 110,
    justifyContent: "center",
  },
  btnText: { color: "#fff", fontWeight: FontWeight.bold as any, fontSize: 14 },
  sub: { fontSize: 12, textAlign: "right", opacity: 0.9 },
});
