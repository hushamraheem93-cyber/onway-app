import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { AppColors, BorderRadius, FontWeight, Shadows, Spacing } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";

interface PerformanceData {
  acceptanceRate: number | null;
  acceptedOffers: number;
  rejectedOffers: number;
  totalOffers: number;
  deliveryTimeMinutes: number | null;
  deliveryTimeSampleSize: number;
  rating: number | null;
  ratingCount: number;
  completedOrders: number;
  cancelledOrders: number;
  hasData: boolean;
  availability: {
    acceptanceRate: boolean;
    deliveryTime: boolean;
    rating: boolean;
    completedVsCancelled: boolean;
  };
}

function formatMinutes(value: number | null): string {
  if (value === null) return "غير متاح";
  if (value < 60) return `${value} دقيقة`;
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return minutes > 0 ? `${hours}س ${minutes}د` : `${hours} ساعة`;
}

function MetricCard({
  icon,
  title,
  value,
  helper,
  color,
  unavailable = false,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  value: string;
  helper: string;
  color: string;
  unavailable?: boolean;
}) {
  return (
    <View style={styles.metricCard}>
      <View style={[styles.metricIcon, { backgroundColor: `${color}18` }]}>
        <Feather name={icon} size={20} color={color} />
      </View>
      <ThemedText style={styles.metricTitle}>{title}</ThemedText>
      <ThemedText
        style={[styles.metricValue, unavailable && styles.unavailableValue]}
      >
        {value}
      </ThemedText>
      <ThemedText style={styles.metricHelper}>{helper}</ThemedText>
    </View>
  );
}

export default function DriverPerformanceScreen() {
  const { theme } = useTheme();
  const tabBarHeight = useBottomTabBarHeight();
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPerformance = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        new URL("/api/driver/performance", getApiUrl()).toString(),
      );
      if (!response.ok) throw new Error("performance_request_failed");
      const payload = (await response.json()) as PerformanceData;
      setData(payload);
    } catch {
      setError("تعذّر تحميل بيانات الأداء. حاول مرة أخرى.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadPerformance();
  }, [loadPerformance]);

  if (loading && !data) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.backgroundRoot }]}>
        <ActivityIndicator size="large" color={AppColors.primary} />
        <ThemedText style={styles.loadingText}>جاري تحميل الأداء...</ThemedText>
      </View>
    );
  }

  const noData = !data?.hasData;
  const acceptanceUnavailable = data?.acceptanceRate === null;
  const deliveryUnavailable = data?.deliveryTimeMinutes === null;
  const ratingUnavailable = data?.rating === null;

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <ScrollView
        contentContainerStyle={{
          padding: Spacing.lg,
          paddingTop: Spacing.xl,
          paddingBottom: tabBarHeight + Spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadPerformance(true)}
            tintColor={AppColors.primary}
            colors={[AppColors.primary]}
          />
        }
      >
        <View style={styles.header}>
          <View style={[styles.headerIcon, { backgroundColor: `${AppColors.primary}18` }]}>
            <Feather name="activity" size={24} color={AppColors.primary} />
          </View>
          <View style={styles.headerCopy}>
            <ThemedText type="h3" style={styles.title}>أدائي</ThemedText>
            <ThemedText style={styles.subtitle}>ملخص أدائك في التوصيل</ThemedText>
          </View>
        </View>

        {error ? (
          <View style={[styles.errorCard, { backgroundColor: theme.backgroundDefault }]}>
            <Feather name="alert-circle" size={22} color={AppColors.error} />
            <ThemedText style={styles.errorText}>{error}</ThemedText>
            <Pressable
              onPress={() => void loadPerformance()}
              style={styles.retryButton}
              accessibilityRole="button"
              accessibilityLabel="إعادة تحميل الأداء"
            >
              <ThemedText style={styles.retryText}>إعادة المحاولة</ThemedText>
            </Pressable>
          </View>
        ) : null}

        {noData ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.backgroundDefault }]}>
            <View style={styles.emptyIcon}>
              <Feather name="bar-chart-2" size={28} color={AppColors.primary} />
            </View>
            <ThemedText type="h4" style={styles.emptyTitle}>لا توجد بيانات أداء كافية حتى الآن</ThemedText>
            <ThemedText style={styles.emptyText}>
              ستظهر مؤشراتك بعد تنفيذ بعض الطلبات وتسجيل نشاطك.
            </ThemedText>
          </View>
        ) : (
          <>
            <View style={styles.grid}>
              <MetricCard
                icon="percent"
                title="نسبة القبول"
                value={
                  acceptanceUnavailable ? "غير متاح" : `${data?.acceptanceRate}%`
                }
                helper={
                  acceptanceUnavailable
                    ? "لا توجد عروض مسجلة"
                    : `${data?.acceptedOffers} مقبول · ${data?.rejectedOffers} مرفوض`
                }
                color={AppColors.primary}
                unavailable={acceptanceUnavailable}
              />
              <MetricCard
                icon="clock"
                title="زمن التوصيل"
                value={formatMinutes(data?.deliveryTimeMinutes ?? null)}
                helper={
                  deliveryUnavailable
                    ? "لا توجد توقيتات كافية"
                    : `متوسط ${data?.deliveryTimeSampleSize} طلب`
                }
                color="#2F80ED"
                unavailable={deliveryUnavailable}
              />
              <MetricCard
                icon="star"
                title="التقييم"
                value={ratingUnavailable ? "غير متاح" : `${data?.rating?.toFixed(1)} / 5`}
                helper={
                  ratingUnavailable
                    ? "لم يصل تقييم بعد"
                    : `${data?.ratingCount} تقييم`
                }
                color="#F2A900"
                unavailable={ratingUnavailable}
              />
              <MetricCard
                icon="check-circle"
                title="الطلبات المكتملة"
                value={String(data?.completedOrders ?? 0)}
                helper="طلبات تم توصيلها"
                color={AppColors.success}
              />
            </View>

            <View style={[styles.statusCard, { backgroundColor: theme.backgroundDefault }]}>
              <ThemedText type="h4" style={styles.statusTitle}>حالة الطلبات</ThemedText>
              <View style={styles.statusRow}>
                <View style={styles.statusItem}>
                  <View style={[styles.statusDot, { backgroundColor: AppColors.success }]} />
                  <ThemedText style={styles.statusLabel}>مكتملة</ThemedText>
                  <ThemedText style={[styles.statusValue, { color: AppColors.success }]}>
                    {data?.completedOrders ?? 0}
                  </ThemedText>
                </View>
                <View style={styles.statusDivider} />
                <View style={styles.statusItem}>
                  <View style={[styles.statusDot, { backgroundColor: AppColors.error }]} />
                  <ThemedText style={styles.statusLabel}>ملغاة</ThemedText>
                  <ThemedText style={[styles.statusValue, { color: AppColors.error }]}>
                    {data?.cancelledOrders ?? 0}
                  </ThemedText>
                </View>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { marginTop: Spacing.md, color: AppColors.gray500, fontFamily: "Cairo" },
  header: { flexDirection: "row", alignItems: "center", marginBottom: Spacing.lg },
  headerIcon: {
    width: 52,
    height: 52,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: Spacing.md,
  },
  headerCopy: { flex: 1, alignItems: "flex-end" },
  title: { fontFamily: "Cairo", fontWeight: FontWeight.bold, textAlign: "right" },
  subtitle: { marginTop: 2, color: AppColors.gray500, fontFamily: "Cairo", textAlign: "right" },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: Spacing.md },
  metricCard: {
    width: "47.5%",
    minHeight: 156,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: AppColors.white,
    alignItems: "flex-end",
    ...Shadows.sm,
  },
  metricIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", marginBottom: Spacing.sm },
  metricTitle: { width: "100%", color: AppColors.gray600, fontFamily: "Cairo", fontSize: 13, textAlign: "right" },
  metricValue: { width: "100%", marginTop: 5, color: AppColors.black, fontFamily: "Cairo", fontSize: 21, fontWeight: FontWeight.bold, textAlign: "right" },
  unavailableValue: { color: AppColors.gray400, fontSize: 16 },
  metricHelper: { width: "100%", marginTop: 4, color: AppColors.gray500, fontFamily: "Cairo", fontSize: 11, textAlign: "right" },
  statusCard: { marginTop: Spacing.lg, padding: Spacing.lg, borderRadius: BorderRadius.lg, ...Shadows.sm },
  statusTitle: { fontFamily: "Cairo", fontWeight: FontWeight.bold, textAlign: "right" },
  statusRow: { flexDirection: "row", alignItems: "center", marginTop: Spacing.lg },
  statusItem: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 7 },
  statusDot: { width: 9, height: 9, borderRadius: 5 },
  statusLabel: { color: AppColors.gray600, fontFamily: "Cairo", fontSize: 13 },
  statusValue: { fontFamily: "Cairo", fontSize: 22, fontWeight: FontWeight.bold },
  statusDivider: { width: 1, height: 32, backgroundColor: AppColors.gray200, marginHorizontal: Spacing.md },
  emptyCard: { padding: Spacing.xl, minHeight: 250, borderRadius: BorderRadius.lg, alignItems: "center", justifyContent: "center", ...Shadows.sm },
  emptyIcon: { width: 62, height: 62, borderRadius: 31, backgroundColor: `${AppColors.primary}18`, alignItems: "center", justifyContent: "center", marginBottom: Spacing.md },
  emptyTitle: { fontFamily: "Cairo", fontWeight: FontWeight.bold, textAlign: "center" },
  emptyText: { marginTop: Spacing.sm, color: AppColors.gray500, fontFamily: "Cairo", textAlign: "center", lineHeight: 22 },
  errorCard: { padding: Spacing.md, borderRadius: BorderRadius.lg, marginBottom: Spacing.md, alignItems: "center", ...Shadows.sm },
  errorText: { marginTop: Spacing.sm, color: AppColors.error, fontFamily: "Cairo", textAlign: "center" },
  retryButton: { marginTop: Spacing.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, backgroundColor: AppColors.primary },
  retryText: { color: AppColors.white, fontFamily: "Cairo", fontWeight: FontWeight.bold },
});
