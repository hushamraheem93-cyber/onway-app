import React, { useEffect, useState, useCallback } from "react";
import { StyleSheet, View, ScrollView, ActivityIndicator, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
} from "react-native-reanimated";

import { useTheme } from "@/hooks/useTheme";
import { ThemedText } from "@/components/ThemedText";
import { Spacing, BorderRadius, AppColors, Shadows } from "@/constants/theme";
import { formatPrice } from "@/constants/currency";
import { Button } from "@/components/Button";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { useOrders, Order } from "@/context/OrderContext";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteProps = RouteProp<RootStackParamList, "OrderTracking">;

const STEPS: { key: Order["status"]; label: string; icon: keyof typeof Feather.glyphMap; description: string }[] = [
  { key: "pending", label: "قيد الانتظار", icon: "clock", description: "تم استلام طلبك وبانتظار التأكيد" },
  { key: "confirmed", label: "تم التأكيد", icon: "check-circle", description: "تم تأكيد طلبك من قبل المتجر" },
  { key: "preparing", label: "جاري التحضير", icon: "package", description: "يتم الآن تحضير طلبك" },
  { key: "delivering", label: "في الطريق", icon: "truck", description: "المندوب في طريقه إليك" },
  { key: "delivered", label: "تم التوصيل", icon: "home", description: "تم توصيل طلبك بنجاح!" },
];

const statusOrder: Order["status"][] = ["pending", "confirmed", "preparing", "delivering", "delivered"];

function getStepIndex(status: Order["status"]): number {
  if (status === "cancelled") return -1;
  return statusOrder.indexOf(status);
}

function PulsingDot() {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.3, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.pulsingDot, animatedStyle]}>
      <View style={styles.pulsingDotInner} />
    </Animated.View>
  );
}

export default function OrderTrackingScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { orders, refreshOrders } = useOrders();
  const [refreshing, setRefreshing] = useState(false);

  const orderId = route.params?.orderId;
  const order = orders.find((o) => o.id === orderId);

  useEffect(() => {
    const interval = setInterval(() => {
      refreshOrders();
    }, 10000);
    return () => clearInterval(interval);
  }, [refreshOrders]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshOrders();
    setRefreshing(false);
  }, [refreshOrders]);

  if (!order) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.backgroundRoot }]}>
        <ActivityIndicator size="large" color={AppColors.primary} />
        <ThemedText type="body" style={{ marginTop: Spacing.md }}>جاري تحميل بيانات الطلب...</ThemedText>
      </View>
    );
  }

  const currentStepIndex = getStepIndex(order.status);
  const isCancelled = order.status === "cancelled";

  const formatTime = (date: string) => {
    const d = new Date(date);
    const hours = d.getHours().toString().padStart(2, "0");
    const minutes = d.getMinutes().toString().padStart(2, "0");
    return `${hours}:${minutes}`;
  };

  const formatDate = (date: string) => {
    const d = new Date(date);
    const day = d.getDate().toString().padStart(2, "0");
    const month = (d.getMonth() + 1).toString().padStart(2, "0");
    return `${day}/${month}`;
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: insets.bottom + Spacing["3xl"],
        paddingHorizontal: Spacing.lg,
      }}
    >
      <View style={[styles.orderHeader, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
        <View style={styles.headerRow}>
          <View style={styles.headerInfo}>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>رقم الطلب</ThemedText>
            <ThemedText type="h4" style={{ marginTop: 2 }}>{order.id?.slice(-8) || order.id}</ThemedText>
          </View>
          <View style={[styles.statusChip, {
            backgroundColor: isCancelled ? "#FEE2E2" : currentStepIndex >= 4 ? "#D1FAE5" : AppColors.primary + "15",
          }]}>
            <ThemedText type="small" style={{
              color: isCancelled ? "#EF4444" : currentStepIndex >= 4 ? "#10B981" : AppColors.primary,
              fontWeight: "700",
            }}>
              {isCancelled ? "ملغي" : STEPS[Math.min(currentStepIndex, 4)]?.label}
            </ThemedText>
          </View>
        </View>

        <View style={[styles.headerDetails, { borderTopColor: theme.border }]}>
          <View style={styles.detailItem}>
            <Feather name="map-pin" size={14} color={theme.textSecondary} />
            <ThemedText type="small" style={{ color: theme.textSecondary, marginRight: 4 }}>
              {order.region}
            </ThemedText>
          </View>
          <View style={styles.detailItem}>
            <Feather name="calendar" size={14} color={theme.textSecondary} />
            <ThemedText type="small" style={{ color: theme.textSecondary, marginRight: 4 }}>
              {formatDate(order.createdAt)} - {formatTime(order.createdAt)}
            </ThemedText>
          </View>
          <View style={styles.detailItem}>
            <Feather name="shopping-bag" size={14} color={theme.textSecondary} />
            <ThemedText type="small" style={{ color: theme.textSecondary, marginRight: 4 }}>
              {formatPrice(order.total + order.deliveryFee)}
            </ThemedText>
          </View>
        </View>
      </View>

      {isCancelled ? (
        <View style={[styles.cancelledCard, Shadows.sm]}>
          <View style={styles.cancelledIcon}>
            <Feather name="x-circle" size={40} color="#EF4444" />
          </View>
          <ThemedText type="h3" style={styles.cancelledTitle}>تم إلغاء الطلب</ThemedText>
          <ThemedText type="body" style={styles.cancelledDesc}>
            نأسف لإعلامك أنه تم إلغاء هذا الطلب. يمكنك تقديم طلب جديد في أي وقت.
          </ThemedText>
        </View>
      ) : (
        <View style={[styles.timelineCard, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
          <ThemedText type="h4" style={styles.timelineTitle}>مراحل الطلب</ThemedText>

          {STEPS.map((step, index) => {
            const isCompleted = index <= currentStepIndex;
            const isCurrent = index === currentStepIndex;
            const isPending = index > currentStepIndex;
            const isLast = index === STEPS.length - 1;

            return (
              <View key={step.key} style={styles.stepRow}>
                <View style={styles.stepIndicator}>
                  {isCompleted ? (
                    <View style={[styles.stepCircle, styles.stepCompleted]}>
                      {isCurrent && currentStepIndex < 4 ? (
                        <PulsingDot />
                      ) : (
                        <Feather name="check" size={14} color="#FFFFFF" />
                      )}
                    </View>
                  ) : (
                    <View style={[styles.stepCircle, styles.stepPending, { borderColor: theme.border }]}>
                      <View style={[styles.stepDotInner, { backgroundColor: theme.border }]} />
                    </View>
                  )}
                  {!isLast ? (
                    <View style={[
                      styles.stepLine,
                      { backgroundColor: index < currentStepIndex ? AppColors.primary : theme.border },
                    ]} />
                  ) : null}
                </View>

                <View style={[styles.stepContent, !isLast && { paddingBottom: Spacing.xl }]}>
                  <View style={styles.stepHeader}>
                    <Feather
                      name={step.icon as any}
                      size={18}
                      color={isCompleted ? AppColors.primary : theme.textSecondary}
                    />
                    <ThemedText
                      type="body"
                      style={[
                        styles.stepLabel,
                        { color: isCompleted ? theme.text : theme.textSecondary },
                        isCurrent && { fontWeight: "700" },
                      ]}
                    >
                      {step.label}
                    </ThemedText>
                  </View>
                  <ThemedText
                    type="small"
                    style={[
                      styles.stepDesc,
                      { color: isCompleted ? theme.textSecondary : theme.border },
                    ]}
                  >
                    {step.description}
                  </ThemedText>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <View style={[styles.itemsCard, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
        <ThemedText type="h4" style={styles.itemsTitle}>المنتجات ({order.items.length})</ThemedText>
        {order.items.map((item, index) => (
          <View key={index} style={[styles.itemRow, index < order.items.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
            <ThemedText type="body" style={{ color: AppColors.primary, fontWeight: "600" }}>
              {formatPrice(item.price * item.quantity)}
            </ThemedText>
            <View style={styles.itemInfo}>
              <ThemedText type="body" style={{ fontWeight: "500" }}>{item.name}</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {item.quantity} × {formatPrice(item.price)}
              </ThemedText>
            </View>
          </View>
        ))}
        <View style={[styles.totalSection, { borderTopColor: theme.border }]}>
          <ThemedText type="body" style={{ color: theme.textSecondary }}>
            التوصيل: {formatPrice(order.deliveryFee)}
          </ThemedText>
          <ThemedText type="h3" style={{ color: AppColors.primary }}>
            {formatPrice(order.total + order.deliveryFee)}
          </ThemedText>
        </View>
      </View>

      <Pressable style={styles.refreshBtn} onPress={handleRefresh}>
        {refreshing ? (
          <ActivityIndicator size="small" color={AppColors.primary} />
        ) : (
          <Feather name="refresh-cw" size={16} color={AppColors.primary} />
        )}
        <ThemedText type="small" style={{ color: AppColors.primary, fontWeight: "600", marginRight: 6 }}>
          تحديث حالة الطلب
        </ThemedText>
      </Pressable>

      <Button onPress={() => navigation.navigate("MainTabs")} style={styles.homeButton}>
        العودة للرئيسية
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  orderHeader: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerInfo: {
    alignItems: "flex-end",
  },
  statusChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: 20,
  },
  headerDetails: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: Spacing.lg,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
  },
  detailItem: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
  },
  timelineCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  timelineTitle: {
    textAlign: "right",
    marginBottom: Spacing.xl,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  stepRow: {
    flexDirection: "row-reverse",
  },
  stepIndicator: {
    alignItems: "center",
    width: 32,
    marginLeft: Spacing.md,
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
  },
  stepCompleted: {
    backgroundColor: AppColors.primary,
  },
  stepPending: {
    backgroundColor: "transparent",
    borderWidth: 2,
  },
  stepDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stepLine: {
    width: 3,
    flex: 1,
    marginTop: -2,
    marginBottom: -2,
    borderRadius: 1.5,
  },
  stepContent: {
    flex: 1,
    paddingTop: 2,
  },
  stepHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.sm,
  },
  stepLabel: {
    fontSize: 15,
    fontWeight: "600",
  },
  stepDesc: {
    textAlign: "right",
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
  },
  pulsingDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  pulsingDotInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FFFFFF",
  },
  cancelledCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing["2xl"],
    marginBottom: Spacing.lg,
    backgroundColor: "#FEF2F2",
    alignItems: "center",
  },
  cancelledIcon: {
    marginBottom: Spacing.md,
  },
  cancelledTitle: {
    color: "#EF4444",
    marginBottom: Spacing.sm,
  },
  cancelledDesc: {
    color: "#B91C1C",
    textAlign: "center",
    lineHeight: 22,
  },
  itemsCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  itemsTitle: {
    textAlign: "right",
    marginBottom: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  itemInfo: {
    alignItems: "flex-end",
    gap: 2,
  },
  totalSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    marginTop: Spacing.sm,
    paddingTop: Spacing.lg,
  },
  refreshBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    marginBottom: Spacing.md,
  },
  homeButton: {
    marginBottom: Spacing.xl,
  },
});
