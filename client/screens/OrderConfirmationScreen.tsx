import React, { useEffect, useState, useRef } from "react";
import { StyleSheet, View, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { ThemedText } from "@/components/ThemedText";
import { Spacing, BorderRadius, AppColors, Shadows } from "@/constants/theme";
import { formatPrice } from "@/constants/currency";
import { Button } from "@/components/Button";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { Order } from "@/context/OrderContext";
import { GradientBackground } from "@/components/GradientBackground";
import { getApiUrl } from "@/lib/query-client";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteProps = RouteProp<RootStackParamList, "OrderConfirmation">;

const CANCEL_WINDOW_SECS = 60;

export default function OrderConfirmationScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const order = route.params?.order;

  const [secsLeft, setSecsLeft]         = useState(CANCEL_WINDOW_SECS);
  const [cancelling, setCancelling]     = useState(false);
  const [cancelled, setCancelled]       = useState(false);
  const [cancelError, setCancelError]   = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  useEffect(() => {
    if (!order) return;
    intervalRef.current = setInterval(() => {
      setSecsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [order?.id]);

  if (!order || !order.items) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.backgroundRoot, justifyContent: "center", alignItems: "center" }}>
        <ThemedText type="body">جاري التحميل...</ThemedText>
      </View>
    );
  }

  const formatOrderTime = (date: Date) => {
    const d = new Date(date);
    const hours = d.getHours().toString().padStart(2, "0");
    const minutes = d.getMinutes().toString().padStart(2, "0");
    const day = d.getDate().toString().padStart(2, "0");
    const month = (d.getMonth() + 1).toString().padStart(2, "0");
    const year = d.getFullYear();
    return `${hours}:${minutes} - ${day}/${month}/${year}`;
  };

  const handleCancel = async () => {
    if (secsLeft <= 0 || cancelling || cancelled) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const res = await fetch(`${getApiUrl()}/api/orders/${order.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الإلغاء");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setCancelled(true);
      if (intervalRef.current) clearInterval(intervalRef.current);
    } catch (e: any) {
      setCancelError(e.message);
    } finally {
      setCancelling(false);
    }
  };

  const goHome = () => {
    navigation.navigate("MainTabs");
  };

  const progressPct = secsLeft / CANCEL_WINDOW_SECS;

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: "قيد الانتظار",
      confirmed: "تم التأكيد",
      preparing: "جاري التحضير",
      delivering: "جاري التوصيل",
      delivered: "تم التوصيل",
      cancelled: "ملغي",
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: "#F59E0B",
      confirmed: "#3B82F6",
      preparing: "#8B5CF6",
      delivering: "#06B6D4",
      delivered: "#10B981",
      cancelled: "#EF4444",
    };
    return colors[status] || "#6B7280";
  };

  return (
    <View style={{ flex: 1 }}>
      <GradientBackground />
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
    >
      <View style={styles.successIcon}>
        <View style={[styles.iconCircle, { backgroundColor: AppColors.success }]}>
          <Feather name="check" size={48} color="#FFFFFF" />
        </View>
      </View>

      <ThemedText type="h2" style={styles.title}>
        تم تأكيد طلبك بنجاح!
      </ThemedText>

      <ThemedText type="body" style={[styles.subtitle, { color: theme.textSecondary }]}>
        رقم الطلب: {order.id}
      </ThemedText>

      <View style={[styles.card, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
        <ThemedText type="h4" style={styles.cardTitle}>
          تفاصيل الطلب
        </ThemedText>

        <View style={styles.detailRow}>
          <ThemedText type="body">{order.phoneNumber}</ThemedText>
          <ThemedText type="body" style={{ color: theme.textSecondary }}>الهاتف</ThemedText>
        </View>

        <View style={styles.detailRow}>
          <ThemedText type="body">{order.region}</ThemedText>
          <ThemedText type="body" style={{ color: theme.textSecondary }}>المنطقة</ThemedText>
        </View>

        <View style={styles.detailRow}>
          <ThemedText type="body" style={{ flex: 1, textAlign: "left" }}>{order.address}</ThemedText>
          <ThemedText type="body" style={{ color: theme.textSecondary }}>العنوان</ThemedText>
        </View>

        <View style={[styles.detailRow, styles.divider]}>
          <ThemedText type="body">{order.items.length} منتج</ThemedText>
          <ThemedText type="body" style={{ color: theme.textSecondary }}>المنتجات</ThemedText>
        </View>

        {order.items.map((item, index) => (
          <View key={index} style={styles.itemRow}>
            <ThemedText type="small" style={{ color: AppColors.primary }}>
              {formatPrice(item.price * item.quantity)}
            </ThemedText>
            <ThemedText type="small" style={{ flex: 1, textAlign: "right" }}>
              {item.name} × {item.quantity}
            </ThemedText>
          </View>
        ))}

        <View style={styles.detailRow}>
          <ThemedText type="body" style={{ color: theme.textSecondary }}>
            {formatPrice(order.deliveryFee)}
          </ThemedText>
          <ThemedText type="body" style={{ color: theme.textSecondary }}>أجور التوصيل</ThemedText>
        </View>

        <View style={[styles.detailRow, styles.totalRow]}>
          <ThemedText type="h3" style={{ color: AppColors.primary }}>
            {formatPrice(order.total + order.deliveryFee)}
          </ThemedText>
          <ThemedText type="h4">المجموع الكلي</ThemedText>
        </View>

        <ThemedText type="small" style={[styles.timeText, { color: theme.textSecondary }]}>
          وقت الطلب: {formatOrderTime(new Date(order.createdAt))}
        </ThemedText>
      </View>

      <View style={[styles.statusCard, { backgroundColor: getStatusColor(order.status) + "15" }]}>
        <View style={[styles.statusIcon, { backgroundColor: getStatusColor(order.status) }]}>
          <Feather name="clock" size={24} color="#FFFFFF" />
        </View>
        <View style={styles.statusContent}>
          <ThemedText type="body" style={{ fontWeight: "600" }}>
            حالة الطلب
          </ThemedText>
          <ThemedText type="h4" style={{ color: getStatusColor(order.status) }}>
            {getStatusLabel(order.status)}
          </ThemedText>
        </View>
      </View>

      <View style={[styles.infoCard, { backgroundColor: theme.backgroundSecondary }]}>
        <Feather name="info" size={20} color={AppColors.primary} />
        <ThemedText type="small" style={{ flex: 1, textAlign: "right", color: theme.textSecondary }}>
          تم إرسال طلبك بنجاح وسيتم مراجعته من قبل الإدارة. يمكنك تتبع حالة طلبك مباشرة.
        </ThemedText>
      </View>

      {/* ── Cancel within 1 minute ─────────────────────────── */}
      {cancelled ? (
        <View style={styles.cancelledBox}>
          <Feather name="x-circle" size={22} color="#EF4444" />
          <ThemedText style={styles.cancelledText}>تم إلغاء الطلب بنجاح</ThemedText>
        </View>
      ) : secsLeft > 0 ? (
        <View style={[styles.cancelCard, { backgroundColor: theme.backgroundSecondary }]}>
          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPct * 100}%` as any }]} />
          </View>

          <View style={styles.cancelRow}>
            <View style={styles.timerBadge}>
              <Feather name="clock" size={13} color="#EF4444" />
              <ThemedText style={styles.timerText}>{secsLeft}ث</ThemedText>
            </View>
            <ThemedText style={[styles.cancelHint, { color: theme.textSecondary }]}>
              يمكنك إلغاء الطلب خلال دقيقة واحدة
            </ThemedText>
          </View>

          {cancelError !== null ? (
            <ThemedText style={styles.cancelErrorText}>{cancelError}</ThemedText>
          ) : null}

          <Pressable
            style={[styles.cancelBtn, cancelling && { opacity: 0.65 }]}
            onPress={handleCancel}
            disabled={cancelling}
            testID="button-cancel-order"
          >
            {cancelling ? (
              <ActivityIndicator color="#EF4444" size="small" />
            ) : (
              <Feather name="x" size={16} color="#EF4444" />
            )}
            <ThemedText style={styles.cancelBtnText}>
              {cancelling ? "جاري الإلغاء..." : "إلغاء الطلب"}
            </ThemedText>
          </Pressable>
        </View>
      ) : null}

      <Button
        onPress={() => navigation.navigate("OrderTracking", { orderId: order.id })}
        style={styles.trackButton}
      >
        تتبع الطلب
      </Button>

      <Pressable onPress={goHome} style={styles.homeLink}>
        <ThemedText type="body" style={{ color: theme.textSecondary }}>العودة للرئيسية</ThemedText>
      </Pressable>
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  successIcon: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  subtitle: {
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  card: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  cardTitle: {
    textAlign: "right",
    marginBottom: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
    marginTop: Spacing.sm,
    paddingTop: Spacing.md,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
    marginTop: Spacing.md,
    paddingTop: Spacing.lg,
  },
  timeText: {
    textAlign: "center",
    marginTop: Spacing.md,
  },
  statusCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    flexDirection: "row-reverse",
    alignItems: "center",
  },
  statusIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: Spacing.md,
  },
  statusContent: {
    flex: 1,
    alignItems: "flex-end",
    gap: Spacing.xs,
  },
  infoCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.md,
  },
  trackButton: {
    marginBottom: Spacing.md,
  },
  homeLink: {
    alignItems: "center",
    paddingVertical: Spacing.md,
    marginBottom: Spacing.xl,
  },
  cancelCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.2)",
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(239,68,68,0.15)",
    overflow: "hidden",
  },
  progressFill: {
    height: 3,
    backgroundColor: "#EF4444",
    borderRadius: 2,
  },
  cancelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  timerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(239,68,68,0.1)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  timerText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    color: "#EF4444",
  },
  cancelHint: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    textAlign: "right",
  },
  cancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: "#EF4444",
    backgroundColor: "rgba(239,68,68,0.06)",
  },
  cancelBtnText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    color: "#EF4444",
  },
  cancelErrorText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    color: "#EF4444",
    textAlign: "center",
  },
  cancelledBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: "rgba(239,68,68,0.08)",
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.2)",
  },
  cancelledText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 15,
    color: "#EF4444",
  },
});
