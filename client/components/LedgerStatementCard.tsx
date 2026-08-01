import React, { useState } from "react";
import { View, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { getApiUrl } from "@/lib/query-client";
import { AppColors, FontFamily } from "@/constants/theme";

// Bank-style ledger statement (financial system phase 3), shared by the vendor
// wallet and driver earnings screens. Collapsible; loads on first open. Reads the
// append-only /api/{vendor,driver}/statement endpoint — movements + running balance.
const TYPE_LABELS: Record<string, string> = {
  order_sale: "بيع طلب",
  delivery_fee: "أجرة توصيل",
  platform_commission: "عمولة التطبيق",
  cash_collected: "استلام نقد",
  settlement: "تسوية",
  adjustment: "تعديل",
  refund: "استرجاع",
  bonus: "مكافأة",
  penalty: "غرامة",
  subscription: "اشتراك",
  deposit: "إيداع",
  withdrawal: "سحب",
};

interface LedgerEntry {
  id: string;
  type: string;
  debit: number;
  credit: number;
  balanceAfter: number;
  orderId?: string | null;
  settlementRef?: string | null;
  createdAt?: { _seconds?: number };
}

export function LedgerStatementCard({
  endpoint,
  authHeader,
}: {
  endpoint: string; // e.g. "/api/vendor/statement" or "/api/driver/statement"
  authHeader?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [balance, setBalance] = useState(0);
  const [error, setError] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(new URL(endpoint, getApiUrl()).toString(), {
        headers: authHeader,
      });
      const data = await res.json();
      setEntries(Array.isArray(data.entries) ? data.entries : []);
      setBalance(data.balance || 0);
      setLoaded(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !loaded) load();
  };

  return (
    <View style={s.card}>
      <Pressable style={s.header} onPress={toggle} accessibilityRole="button">
        <View style={s.headerLeft}>
          <Feather name="book-open" size={16} color={AppColors.primary} />
          <ThemedText style={s.title}>كشف الحساب البنكي</ThemedText>
        </View>
        <Feather name={open ? "chevron-up" : "chevron-down"} size={18} color={AppColors.gray400} />
      </Pressable>

      {open ? (
        <View style={s.body}>
          {loading ? (
            <ActivityIndicator color={AppColors.primary} style={{ paddingVertical: 20 }} />
          ) : error ? (
            <ThemedText style={s.empty}>تعذّر تحميل الكشف — حاول مجدداً</ThemedText>
          ) : entries.length === 0 ? (
            <ThemedText style={s.empty}>لا توجد حركات مالية بعد</ThemedText>
          ) : (
            <>
              <View style={s.balanceRow}>
                <ThemedText style={s.balanceLabel}>الرصيد الحالي</ThemedText>
                <ThemedText style={s.balanceValue}>{balance.toLocaleString("ar-IQ")} د.ع</ThemedText>
              </View>
              {entries.map((e) => {
                const secs = e.createdAt?._seconds;
                const date = secs ? new Date(secs * 1000).toLocaleDateString("ar-IQ") : "—";
                const ref = e.orderId ? `#${String(e.orderId).slice(-6).toUpperCase()}` : e.settlementRef || "";
                const isCredit = (e.credit || 0) > 0;
                const amount = isCredit ? e.credit : e.debit;
                return (
                  <View key={e.id} style={s.row}>
                    <View style={s.rowInfo}>
                      <ThemedText style={s.rowType}>{TYPE_LABELS[e.type] || e.type}</ThemedText>
                      <ThemedText style={s.rowMeta}>
                        {date}
                        {ref ? ` · ${ref}` : ""}
                      </ThemedText>
                    </View>
                    <View style={s.rowAmounts}>
                      <ThemedText style={[s.rowAmount, { color: isCredit ? AppColors.success : AppColors.error }]}>
                        {isCredit ? "+" : "−"}
                        {(amount || 0).toLocaleString("ar-IQ")}
                      </ThemedText>
                      <ThemedText style={s.rowBalance}>{(e.balanceAfter || 0).toLocaleString("ar-IQ")}</ThemedText>
                    </View>
                  </View>
                );
              })}
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: AppColors.white,
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: AppColors.divider,
  },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
  },
  headerLeft: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  title: { fontFamily: FontFamily.cairoBold, fontSize: 14, color: AppColors.gray800 },
  body: { paddingHorizontal: 14, paddingBottom: 12 },
  empty: {
    fontFamily: FontFamily.tajawal,
    fontSize: 13,
    color: AppColors.gray400,
    textAlign: "center",
    paddingVertical: 20,
  },
  balanceRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: AppColors.secondary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  balanceLabel: { fontFamily: FontFamily.cairoMedium, fontSize: 12, color: AppColors.gray600 },
  balanceValue: { fontFamily: FontFamily.cairoBold, fontSize: 15, color: AppColors.primary },
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: AppColors.divider,
  },
  rowInfo: { flex: 1 },
  rowType: { fontFamily: FontFamily.cairoBold, fontSize: 13, color: AppColors.gray800, textAlign: "right" },
  rowMeta: { fontFamily: FontFamily.tajawal, fontSize: 11, color: AppColors.gray400, textAlign: "right", marginTop: 2 },
  rowAmounts: { alignItems: "flex-start", minWidth: 90 },
  rowAmount: { fontFamily: FontFamily.cairoBold, fontSize: 13 },
  rowBalance: { fontFamily: FontFamily.tajawal, fontSize: 11, color: AppColors.gray500, marginTop: 2 },
});
