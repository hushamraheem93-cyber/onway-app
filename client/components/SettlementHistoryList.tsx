import React from "react";
import { View, StyleSheet } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { AppColors, Spacing, BorderRadius, FontWeight } from "@/constants/theme";
import { formatPrice } from "@/constants/currency";
import type { SettlementHistory } from "@/hooks/useSettlement";

/** Reusable settlement history for the driver and vendor screens — a compact list of
 *  the account's past settlement requests and their outcome. Renders nothing when
 *  there is no history, so it is safe to always mount below the status bar. */
export function SettlementHistoryList({ history }: { history: SettlementHistory }) {
  const requests = history?.requests ?? [];
  if (requests.length === 0) return null;

  const statusOf = (s: string) =>
    s === "completed" ? { txt: "🟢 تمت التسوية", fg: "#1B7A3D" }
    : s === "partially_completed" ? { txt: "🟡 تسوية جزئية", fg: "#8A6D00" }
    : s === "cancelled" ? { txt: "⚪ ملغى", fg: "#6B7280" }
    : { txt: "🟡 قيد المراجعة", fg: "#8A6D00" };

  const dateOf = (ts: any) => {
    const d = ts?.toDate?.() ? ts.toDate() : ts?._seconds ? new Date(ts._seconds * 1000) : null;
    return d ? d.toLocaleDateString("ar-IQ") : "";
  };

  return (
    <View style={styles.wrap}>
      <ThemedText style={styles.title}>سجلّ التسويات</ThemedText>
      {requests.slice(0, 20).map((r: any) => {
        const st = statusOf(r.status);
        return (
          <View key={r.id} style={styles.row}>
            <ThemedText style={styles.amount}>{formatPrice(r.settledAmount ?? r.outstandingSnapshot ?? 0)}</ThemedText>
            <View style={styles.right}>
              <ThemedText style={[styles.status, { color: st.fg }]}>{st.txt}</ThemedText>
              <ThemedText style={styles.date}>{dateOf(r.createdAt)}</ThemedText>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: Spacing.md ?? 16,
    marginTop: Spacing.md ?? 12,
    padding: Spacing.md ?? 14,
    borderRadius: BorderRadius.lg ?? 16,
    backgroundColor: "rgba(0,0,0,0.03)",
    gap: 6,
  },
  title: { fontSize: 14, fontWeight: FontWeight.bold as any, textAlign: "right", color: AppColors.textPrimary },
  row: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  right: { alignItems: "flex-start", gap: 2 },
  amount: { fontSize: 14, fontWeight: FontWeight.bold as any, color: AppColors.primary },
  status: { fontSize: 12 },
  date: { fontSize: 11, color: AppColors.textSecondary },
});
