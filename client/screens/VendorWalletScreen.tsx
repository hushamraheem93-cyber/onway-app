import React, { useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Alert,
} from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";

import { useTheme } from "@/hooks/useTheme";
import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import { formatPrice } from "@/constants/currency";
import { AppColors } from "@/constants/theme";
import { SettlementStatusBar } from "@/components/SettlementStatusBar";
import { SettlementHistoryList } from "@/components/SettlementHistoryList";
import { useSettlement } from "@/hooks/useSettlement";

const PURPLE = AppColors.vendorPurple;
const LIGHT_PURPLE = AppColors.vendorPurpleLight;
const { width: SCREEN_W } = Dimensions.get("window");

type Period = "today" | "week" | "month" | "all";

interface DaySale { date: string; revenue: number }
interface RecentSale {
  id: string; date: string; subtotal: number;
  status: string; customerPhone: string; itemCount: number;
}
interface WalletData {
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  dailySales: DaySale[];
  recentSales: RecentSale[];
  period: string;
}

const PERIOD_LABELS: Record<Period, string> = {
  today: "اليوم",
  week: "الأسبوع",
  month: "الشهر",
  all: "الكل",
};

const STATUS_LABELS: Record<string, string> = {
  delivered: "تم التوصيل",
  picked_up: "استُلم",
  delivering: "في الطريق",
};

function formatShortDate(iso: string) {
  try {
    const d = new Date(iso);
    return `${d.getDate()}/${d.getMonth() + 1}`;
  } catch { return iso; }
}

function formatFullDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("ar-IQ", { year: "numeric", month: "short", day: "numeric" });
  } catch { return iso; }
}

// Simple bar chart using View bars
function BarChart({ data }: { data: DaySale[] }) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.revenue), 1);
  const barW = Math.max(24, Math.min(36, (SCREEN_W - 56) / data.length - 6));
  return (
    <View style={chartStyles.container}>
      <View style={chartStyles.barsRow}>
        {data.map((d, i) => {
          const h = Math.max(4, (d.revenue / max) * 110);
          return (
            <View key={i} style={chartStyles.barCol}>
              <View style={[chartStyles.bar, { height: h, width: barW }]} />
              <ThemedText style={chartStyles.barLabel} numberOfLines={1}>
                {formatShortDate(d.date)}
              </ThemedText>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const chartStyles = StyleSheet.create({
  container: { marginTop: 8, paddingBottom: 4 },
  barsRow: { flexDirection: "row-reverse", alignItems: "flex-end", gap: 4, paddingHorizontal: 4 },
  barCol: { alignItems: "center", gap: 4 },
  bar: { borderRadius: 6, backgroundColor: PURPLE, opacity: 0.8, minWidth: 10 },
  barLabel: { fontFamily: "Cairo_400Regular", fontSize: 9, color: AppColors.gray500, textAlign: "center" },
});

export default function VendorWalletScreen() {
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { vendorToken } = useAuth();
  const settlement = useSettlement("vendor");
  const handleRequestSettlement = useCallback(() => {
    Alert.alert(
      "طلب تسوية",
      `سيتم إرسال طلب تسوية بالمبلغ ${formatPrice(settlement.view?.outstanding || 0)} إلى الإدارة.`,
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "إرسال",
          onPress: async () => {
            const r = await settlement.requestSettlement();
            if (!r.ok) Alert.alert("تعذّر الطلب", r.error || "حاول مرة أخرى");
          },
        },
      ],
    );
  }, [settlement]);
  const { theme } = useTheme();
  const [period, setPeriod] = useState<Period>("month");

  const { data, isLoading, refetch, isRefetching } = useQuery<WalletData>({
    queryKey: ["/api/vendor/wallet", period],
    queryFn: async () => {
      const url = new URL("/api/vendor/wallet", getApiUrl());
      url.searchParams.set("period", period);
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${vendorToken}` },
      });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    enabled: !!vendorToken,
  });

  const handleRefresh = useCallback(() => { refetch(); }, [refetch]);

  const totalRevenue = data?.totalRevenue ?? 0;
  const totalOrders = data?.totalOrders ?? 0;
  const avgOrder = data?.avgOrderValue ?? 0;
  const dailySales = data?.dailySales ?? [];
  const recentSales = data?.recentSales ?? [];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + 16,
        paddingBottom: tabBarHeight + 24,
        paddingHorizontal: 16,
        gap: 16,
      }}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} tintColor={PURPLE} />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* Always-visible settlement status indicator (top of screen) */}
      <SettlementStatusBar
        view={settlement.view}
        requesting={settlement.requesting}
        onRequest={handleRequestSettlement}
        containerStyle={{ marginHorizontal: 0, marginTop: 0 }}
      />
      <SettlementHistoryList history={settlement.history} />

      {/* Period filter */}
      <View style={styles.periodRow}>
        {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
          <Pressable
            key={p}
            style={[styles.periodBtn, period === p && styles.periodBtnActive]}
            onPress={() => setPeriod(p)}
            testID={`btn-period-${p}`}
          >
            <ThemedText style={[styles.periodText, period === p && styles.periodTextActive]}>
              {PERIOD_LABELS[p]}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={PURPLE} />
        </View>
      ) : (
        <>
          {/* Main revenue card */}
          <View style={[styles.revenueCard, { backgroundColor: PURPLE }]}>
            <MaterialCommunityIcons name="wallet-outline" size={32} color={AppColors.textOnBrandSubtle} />
            <ThemedText style={styles.revenueLabel}>إجمالي المبيعات</ThemedText>
            <ThemedText style={styles.revenueValue}>{formatPrice(totalRevenue)}</ThemedText>
            <ThemedText style={styles.revenuePeriod}>{PERIOD_LABELS[period]}</ThemedText>
          </View>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: theme.backgroundDefault }]}>
              <MaterialCommunityIcons name="clipboard-check-outline" size={22} color={PURPLE} />
              <ThemedText style={styles.statValue}>{totalOrders}</ThemedText>
              <ThemedText style={styles.statLabel}>طلب مكتمل</ThemedText>
            </View>
            <View style={[styles.statCard, { backgroundColor: theme.backgroundDefault }]}>
              <MaterialCommunityIcons name="chart-line" size={22} color={AppColors.success} />
              <ThemedText style={[styles.statValue, { color: AppColors.success }]}>{formatPrice(avgOrder)}</ThemedText>
              <ThemedText style={styles.statLabel}>متوسط الطلب</ThemedText>
            </View>
          </View>

          {/* Bar chart */}
          {dailySales.length > 0 ? (
            <View style={[styles.section, { backgroundColor: theme.backgroundDefault }]}>
              <View style={styles.sectionHeader}>
                <Feather name="bar-chart-2" size={16} color={PURPLE} />
                <ThemedText style={styles.sectionTitle}>المبيعات اليومية</ThemedText>
              </View>
              <BarChart data={dailySales} />
            </View>
          ) : null}

          {/* Recent sales */}
          {recentSales.length > 0 ? (
            <View style={[styles.section, { backgroundColor: theme.backgroundDefault }]}>
              <View style={styles.sectionHeader}>
                <Feather name="list" size={16} color={PURPLE} />
                <ThemedText style={styles.sectionTitle}>آخر المبيعات</ThemedText>
              </View>
              {recentSales.map((sale, i) => (
                <View
                  key={sale.id}
                  style={[
                    styles.saleRow,
                    i < recentSales.length - 1 && styles.saleRowBorder,
                    { borderBottomColor: theme.border ?? AppColors.gray100 },
                  ]}
                >
                  <View style={styles.saleLeft}>
                    <ThemedText style={styles.saleAmount}>{formatPrice(sale.subtotal)}</ThemedText>
                    <View style={[styles.saleBadge, { backgroundColor: LIGHT_PURPLE }]}>
                      <ThemedText style={[styles.saleBadgeText, { color: PURPLE }]}>
                        {STATUS_LABELS[sale.status] || sale.status}
                      </ThemedText>
                    </View>
                  </View>
                  <View style={styles.saleRight}>
                    <ThemedText style={styles.saleDate}>{formatFullDate(sale.date)}</ThemedText>
                    <ThemedText style={styles.saleMeta}>
                      {sale.itemCount} منتج · {sale.customerPhone.slice(-4).padStart(sale.customerPhone.length, "*")}
                    </ThemedText>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="wallet-outline" size={52} color={PURPLE} style={{ opacity: 0.25 }} />
              <ThemedText style={[styles.emptyTitle, { color: theme.text }]}>لا توجد مبيعات بعد</ThemedText>
              <ThemedText style={[styles.emptySub, { color: theme.textSecondary }]}>
                ستظهر هنا مبيعاتك بعد اكتمال أول طلب
              </ThemedText>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loader: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 },
  periodRow: {
    flexDirection: "row-reverse", gap: 8, backgroundColor: AppColors.gray100,
    borderRadius: 14, padding: 4,
  },
  periodBtn: {
    flex: 1, paddingVertical: 9, borderRadius: 10,
    alignItems: "center",
  },
  periodBtnActive: { backgroundColor: PURPLE },
  periodText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: AppColors.gray500 },
  periodTextActive: { color: AppColors.white },
  revenueCard: {
    borderRadius: 20, padding: 24, alignItems: "center", gap: 6,
  },
  revenueLabel: { fontFamily: "Cairo_400Regular", fontSize: 14, color: AppColors.textOnBrandMuted, textAlign: "center" },
  revenueValue: { fontFamily: "Cairo_700Bold", fontSize: 30, lineHeight: 42, includeFontPadding: true, color: AppColors.white, textAlign: "center" },
  revenuePeriod: { fontFamily: "Cairo_400Regular", fontSize: 12, color: AppColors.iconOnBrand, textAlign: "center" },
  statsRow: { flexDirection: "row-reverse", gap: 10 },
  statCard: {
    flex: 1, borderRadius: 20, padding: 16, alignItems: "center", gap: 6,
    shadowColor: AppColors.black, shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  statValue: { fontFamily: "Cairo_700Bold", fontSize: 20, lineHeight: 30, includeFontPadding: true, color: PURPLE, textAlign: "center" },
  statLabel: { fontFamily: "Cairo_400Regular", fontSize: 12, color: AppColors.gray500, textAlign: "center" },
  section: {
    borderRadius: 20, padding: 16,
    shadowColor: AppColors.black, shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  sectionHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 12 },
  sectionTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, color: AppColors.gray800 },
  saleRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingVertical: 10 },
  saleRowBorder: { borderBottomWidth: 1 },
  saleLeft: { alignItems: "flex-end", gap: 4 },
  saleRight: { alignItems: "flex-start", gap: 2 },
  saleAmount: { fontFamily: "Cairo_700Bold", fontSize: 15, color: PURPLE, textAlign: "right" },
  saleBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  saleBadgeText: { fontFamily: "Cairo_700Bold", fontSize: 10 },
  saleDate: { fontFamily: "Cairo_700Bold", fontSize: 12, color: AppColors.gray700 },
  saleMeta: { fontFamily: "Cairo_400Regular", fontSize: 11, color: AppColors.gray400 },
  emptyState: { alignItems: "center", justifyContent: "center", paddingVertical: 48, gap: 10 },
  emptyTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, textAlign: "center" },
  emptySub: { fontFamily: "Cairo_400Regular", fontSize: 13, textAlign: "center" },
});
