import React, { useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  View,
  Pressable,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { AppColors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";
import { formatPrice } from "@/constants/currency";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface QueueOrder {
  id: string;
  customerName: string;
  customerPhone: string;
  address: string;
  region: string;
  items: any[];
  total: number;
  deliveryFee: number;
  status: string;
  createdAt: string;
}

export default function DriverHomeScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme, isDark } = useTheme();
  const { phoneNumber } = useAuth();

  const [isOnline, setIsOnline] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<QueueOrder | null>(null);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [driverStatus, setDriverStatus] = useState<string>("pending");
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchDriverStatus = useCallback(async () => {
    if (!phoneNumber) return;
    try {
      const res = await fetch(
        new URL(`/api/driver/status?phoneNumber=${encodeURIComponent(phoneNumber)}`, getApiUrl()).toString()
      );
      if (res.ok) {
        const data = await res.json();
        setIsOnline(data.isOnline || false);
        setQueuePosition(data.queuePosition);
        setCurrentOrder(data.currentOrder || null);
        setDriverStatus(data.approvalStatus || "pending");
      }
    } catch (e) {
      console.error("Error fetching driver status:", e);
    } finally {
      setLoading(false);
    }
  }, [phoneNumber]);

  useEffect(() => {
    fetchDriverStatus();
    const interval = setInterval(fetchDriverStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchDriverStatus]);

  const handleToggleOnline = async () => {
    if (!phoneNumber || driverStatus !== "approved") return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsToggling(true);
    try {
      const res = await fetch(new URL("/api/driver/toggle-online", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, goOnline: !isOnline }),
      });
      if (res.ok) {
        const data = await res.json();
        setIsOnline(data.isOnline);
        setQueuePosition(data.queuePosition);
      }
    } catch (e) {
      console.error("Error toggling online:", e);
    } finally {
      setIsToggling(false);
    }
  };

  const handleAcceptOrder = async () => {
    if (!phoneNumber || !currentOrder) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      const res = await fetch(new URL("/api/driver/accept-order", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, orderId: currentOrder.id }),
      });
      if (res.ok) {
        await fetchDriverStatus();
      }
    } catch (e) {
      console.error("Error accepting order:", e);
    }
  };

  const handleRejectOrder = async () => {
    if (!phoneNumber || !currentOrder) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const res = await fetch(new URL("/api/driver/reject-order", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, orderId: currentOrder.id }),
      });
      if (res.ok) {
        setCurrentOrder(null);
        await fetchDriverStatus();
      }
    } catch (e) {
      console.error("Error rejecting order:", e);
    }
  };

  const handleCompleteOrder = async () => {
    if (!phoneNumber || !currentOrder) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      const res = await fetch(new URL("/api/driver/complete-order", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, orderId: currentOrder.id }),
      });
      if (res.ok) {
        setCurrentOrder(null);
        await fetchDriverStatus();
      }
    } catch (e) {
      console.error("Error completing order:", e);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDriverStatus();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot, justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={AppColors.primary} />
      </View>
    );
  }

  const renderPendingApproval = () => (
    <View style={styles.statusCard}>
      <View style={[styles.statusIcon, { backgroundColor: "#FFF3E0" }]}>
        <Feather name="clock" size={40} color="#FF9800" />
      </View>
      <ThemedText type="h3" style={[styles.statusTitle, { color: theme.text }]}>
        قيد المراجعة
      </ThemedText>
      <ThemedText type="body" style={[styles.statusSubtitle, { color: theme.textSecondary }]}>
        حسابك قيد المراجعة من قبل الإدارة. سيتم إبلاغك عند الموافقة.
      </ThemedText>
    </View>
  );

  const renderRejected = () => (
    <View style={styles.statusCard}>
      <View style={[styles.statusIcon, { backgroundColor: "#FFEBEE" }]}>
        <Feather name="x-circle" size={40} color="#F44336" />
      </View>
      <ThemedText type="h3" style={[styles.statusTitle, { color: theme.text }]}>
        تم رفض الطلب
      </ThemedText>
      <ThemedText type="body" style={[styles.statusSubtitle, { color: theme.textSecondary }]}>
        للأسف تم رفض طلب التسجيل. تواصل مع الإدارة للمزيد من المعلومات.
      </ThemedText>
    </View>
  );

  const renderOnlineToggle = () => (
    <View style={styles.toggleSection}>
      <Pressable
        onPress={handleToggleOnline}
        disabled={isToggling}
        style={[
          styles.toggleButton,
          {
            backgroundColor: isOnline ? "#4CAF50" : isDark ? theme.backgroundSecondary : "#F5F5F5",
            borderColor: isOnline ? "#4CAF50" : theme.border,
          },
        ]}
        testID="button-toggle-online"
      >
        {isToggling ? (
          <ActivityIndicator size="small" color={isOnline ? "#FFFFFF" : AppColors.primary} />
        ) : (
          <>
            <View style={[styles.toggleDot, { backgroundColor: isOnline ? "#FFFFFF" : "#BDBDBD" }]} />
            <ThemedText
              type="h3"
              style={[styles.toggleText, { color: isOnline ? "#FFFFFF" : theme.text }]}
            >
              {isOnline ? "متصل" : "غير متصل"}
            </ThemedText>
            <Feather
              name={isOnline ? "wifi" : "wifi-off"}
              size={24}
              color={isOnline ? "#FFFFFF" : "#BDBDBD"}
            />
          </>
        )}
      </Pressable>

      {isOnline && queuePosition !== null ? (
        <View style={[styles.queueCard, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
          <View style={styles.queueRow}>
            <View style={[styles.queueBadge, { backgroundColor: AppColors.primary + "15" }]}>
              <ThemedText type="h2" style={{ color: AppColors.primary }}>
                {queuePosition}
              </ThemedText>
            </View>
            <View style={styles.queueInfo}>
              <ThemedText type="h4" style={{ color: theme.text }}>ترتيبك في الطابور</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {queuePosition === 1 ? "أنت التالي لاستلام طلب" : `يوجد ${queuePosition - 1} سائق قبلك`}
              </ThemedText>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );

  const renderCurrentOrder = () => {
    if (!currentOrder) return null;
    const isDelivering = currentOrder.status === "delivering";

    return (
      <View style={[styles.orderCard, { backgroundColor: theme.backgroundDefault }, Shadows.md]}>
        <View style={[styles.orderHeader, { borderBottomColor: theme.border }]}>
          <View style={[styles.newOrderBadge, { backgroundColor: isDelivering ? "#2196F3" : AppColors.primary }]}>
            <ThemedText type="small" style={styles.newOrderText}>
              {isDelivering ? "جاري التوصيل" : "طلب جديد"}
            </ThemedText>
          </View>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            #{currentOrder.id?.slice(-6)}
          </ThemedText>
        </View>

        <View style={styles.orderDetails}>
          <View style={styles.orderDetailRow}>
            <ThemedText type="body" style={{ color: theme.text }}>{currentOrder.customerName || "زبون"}</ThemedText>
            <Feather name="user" size={18} color={theme.textSecondary} />
          </View>
          <View style={styles.orderDetailRow}>
            <ThemedText type="body" style={{ color: theme.text }}>{currentOrder.region || currentOrder.address}</ThemedText>
            <Feather name="map-pin" size={18} color={theme.textSecondary} />
          </View>
          <View style={styles.orderDetailRow}>
            <ThemedText type="body" style={{ color: AppColors.primary, fontWeight: "700" }}>
              {formatPrice(currentOrder.total + (currentOrder.deliveryFee || 0))}
            </ThemedText>
            <Feather name="dollar-sign" size={18} color={AppColors.primary} />
          </View>
          <View style={styles.orderDetailRow}>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {currentOrder.items?.length || 0} منتج
            </ThemedText>
            <Feather name="shopping-bag" size={18} color={theme.textSecondary} />
          </View>
        </View>

        {isDelivering ? (
          <Pressable
            style={[styles.acceptButton, { backgroundColor: "#4CAF50" }]}
            onPress={handleCompleteOrder}
            testID="button-complete-order"
          >
            <ThemedText type="h4" style={styles.acceptText}>تم التوصيل</ThemedText>
            <Feather name="check-circle" size={20} color="#FFFFFF" />
          </Pressable>
        ) : (
          <View style={styles.orderActions}>
            <Pressable
              style={[styles.rejectButton, { borderColor: "#F44336" }]}
              onPress={handleRejectOrder}
              testID="button-reject-order"
            >
              <ThemedText type="h4" style={[styles.rejectText, { color: "#F44336" }]}>رفض</ThemedText>
            </Pressable>
            <Pressable
              style={styles.acceptButton}
              onPress={handleAcceptOrder}
              testID="button-accept-order"
            >
              <ThemedText type="h4" style={styles.acceptText}>قبول</ThemedText>
              <Feather name="check" size={20} color="#FFFFFF" />
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md, backgroundColor: AppColors.primary }]}>
        <ThemedText type="h2" style={styles.headerTitle}>ONWAY</ThemedText>
        <ThemedText type="small" style={styles.headerSubtitle}>لوحة السائق</ThemedText>
      </View>

      <FlatList
        data={[1]}
        renderItem={() => (
          <View style={styles.content}>
            {driverStatus === "pending" ? renderPendingApproval() : null}
            {driverStatus === "rejected" ? renderRejected() : null}
            {driverStatus === "approved" ? (
              <>
                {renderOnlineToggle()}
                {renderCurrentOrder()}
                {isOnline && !currentOrder ? (
                  <View style={[styles.waitingCard, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
                    <Feather name="coffee" size={40} color={theme.textSecondary} />
                    <ThemedText type="h4" style={{ color: theme.text, marginTop: Spacing.md }}>
                      بانتظار طلبات جديدة
                    </ThemedText>
                    <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: Spacing.xs }}>
                      ستصلك الطلبات تلقائياً حسب ترتيبك في الطابور
                    </ThemedText>
                  </View>
                ) : null}
              </>
            ) : null}
          </View>
        )}
        keyExtractor={() => "main"}
        contentContainerStyle={{ paddingBottom: tabBarHeight + Spacing.xl }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={AppColors.primary} />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    alignItems: "center",
  },
  headerTitle: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 24,
  },
  headerSubtitle: {
    color: "rgba(255,255,255,0.8)",
    marginTop: 2,
  },
  content: {
    padding: Spacing.lg,
  },
  statusCard: {
    alignItems: "center",
    paddingVertical: Spacing["3xl"],
  },
  statusIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  statusTitle: {
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  statusSubtitle: {
    textAlign: "center",
    paddingHorizontal: Spacing.xl,
  },
  toggleSection: {
    marginBottom: Spacing.lg,
  },
  toggleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.xl,
    borderRadius: BorderRadius["2xl"],
    borderWidth: 2,
    marginBottom: Spacing.lg,
  },
  toggleDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  toggleText: {
    fontWeight: "700",
  },
  queueCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
  },
  queueRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.md,
  },
  queueBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
  },
  queueInfo: {
    flex: 1,
    alignItems: "flex-end",
  },
  orderCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  orderHeader: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    marginBottom: Spacing.md,
  },
  newOrderBadge: {
    backgroundColor: AppColors.primary,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  newOrderText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 12,
  },
  orderDetails: {
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  orderDetailRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.sm,
  },
  orderActions: {
    flexDirection: "row-reverse",
    gap: Spacing.md,
  },
  acceptButton: {
    flex: 1,
    backgroundColor: AppColors.primary,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  acceptText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  rejectButton: {
    flex: 1,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  rejectText: {
    fontWeight: "700",
  },
  waitingCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing["3xl"],
    alignItems: "center",
  },
});
