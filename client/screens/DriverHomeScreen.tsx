import React, { useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  View,
  Pressable,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
  Linking,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { AppColors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";
import { formatPrice } from "@/constants/currency";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

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
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [isOnline, setIsOnline] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<QueueOrder | null>(null);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [driverStatus, setDriverStatus] = useState<string>("pending");
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletError, setWalletError] = useState("");
  const [todayOrders, setTodayOrders] = useState(0);
  const [todayEarnings, setTodayEarnings] = useState(0);

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
        setWalletBalance(data.walletBalance || 0);
        setTodayOrders(data.todayOrders || 0);
        setTodayEarnings(data.todayEarnings || 0);
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
    setWalletError("");
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
      } else {
        const errorData = await res.json().catch(() => ({}));
        if (errorData.error) {
          setWalletError(errorData.error);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
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

  const handleWhatsAppSupport = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const supportNumber = "9647702891104";
    const message = encodeURIComponent("مرحباً، أحتاج شحن رصيد محفظتي في تطبيق OnWay");
    Linking.openURL(`https://wa.me/${supportNumber}?text=${message}`).catch(() => {
      Linking.openURL(`whatsapp://send?phone=${supportNumber}&text=${message}`).catch(console.error);
    });
  };

  const renderWalletCard = () => (
    <View style={[styles.walletCard, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
      <View style={styles.walletRow}>
        <View style={styles.walletInfo}>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>رصيد المحفظة</ThemedText>
          <ThemedText type="h2" style={{ color: walletBalance < 250 ? "#F44336" : AppColors.primary, fontWeight: "800" }}>
            {formatPrice(walletBalance)}
          </ThemedText>
        </View>
        <View style={[styles.walletIcon, { backgroundColor: walletBalance < 250 ? "#FFEBEE" : AppColors.primary + "15" }]}>
          <Feather name="credit-card" size={24} color={walletBalance < 250 ? "#F44336" : AppColors.primary} />
        </View>
      </View>
      <View style={styles.todayStatsRow}>
        <View style={[styles.todayStatItem, { backgroundColor: "#F0FDF4" }]}>
          <Feather name="package" size={18} color="#16A34A" />
          <ThemedText type="h3" style={{ color: "#16A34A", fontWeight: "800" }}>{todayOrders}</ThemedText>
          <ThemedText type="small" style={{ color: "#15803D" }}>طلبات اليوم</ThemedText>
        </View>
        <View style={[styles.todayStatItem, { backgroundColor: "#FFF7ED" }]}>
          <Feather name="trending-up" size={18} color={AppColors.primary} />
          <ThemedText type="h3" style={{ color: AppColors.primary, fontWeight: "800" }}>{formatPrice(todayEarnings)}</ThemedText>
          <ThemedText type="small" style={{ color: "#C2410C" }}>أرباح اليوم</ThemedText>
        </View>
      </View>
      {walletBalance < 250 ? (
        <>
          <View style={[styles.walletWarning, { backgroundColor: "#FFF3E0" }]}>
            <Feather name="alert-triangle" size={16} color="#FF9800" />
            <ThemedText type="small" style={{ color: "#E65100", flex: 1, textAlign: "right", marginRight: Spacing.xs }}>
              رصيدك غير كافٍ للعمل. تواصل مع الدعم لشحن الرصيد.
            </ThemedText>
          </View>
          <Pressable
            onPress={handleWhatsAppSupport}
            style={styles.whatsappButton}
            testID="button-whatsapp-support"
          >
            <Feather name="message-circle" size={20} color="#FFFFFF" />
            <ThemedText type="body" style={styles.whatsappText}>
              تواصل مع الدعم عبر واتساب
            </ThemedText>
          </Pressable>
        </>
      ) : null}
      {walletError.length > 0 ? (
        <View style={[styles.walletWarning, { backgroundColor: "#FFEBEE" }]}>
          <Feather name="x-circle" size={16} color="#F44336" />
          <ThemedText type="small" style={{ color: "#C62828", flex: 1, textAlign: "right", marginRight: Spacing.xs }}>
            {walletError}
          </ThemedText>
        </View>
      ) : null}
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

  const handleCallCustomer = () => {
    if (!currentOrder?.customerPhone) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const phoneUrl = Platform.OS === "android"
      ? `tel:${currentOrder.customerPhone}`
      : `telprompt:${currentOrder.customerPhone}`;
    Linking.openURL(phoneUrl).catch(() => {
      Linking.openURL(`tel:${currentOrder.customerPhone}`).catch(console.error);
    });
  };

  const handleViewOrderDetails = () => {
    if (!currentOrder) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("DriverOrderDetail", { order: currentOrder });
  };

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

        <View style={styles.quickActionsRow}>
          <Pressable
            style={[styles.quickActionBtn, { backgroundColor: "#4CAF5015" }]}
            onPress={handleCallCustomer}
            testID="button-call-customer"
          >
            <Feather name="phone" size={20} color="#4CAF50" />
            <ThemedText type="small" style={{ color: "#4CAF50", fontWeight: "600" }}>اتصال</ThemedText>
          </Pressable>
          <Pressable
            style={[styles.quickActionBtn, { backgroundColor: AppColors.primary + "15" }]}
            onPress={handleViewOrderDetails}
            testID="button-view-order-details"
          >
            <Feather name="eye" size={20} color={AppColors.primary} />
            <ThemedText type="small" style={{ color: AppColors.primary, fontWeight: "600" }}>التفاصيل</ThemedText>
          </Pressable>
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
                {renderWalletCard()}
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
  quickActionsRow: {
    flexDirection: "row-reverse",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  quickActionBtn: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  waitingCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing["3xl"],
    alignItems: "center",
  },
  walletCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  walletRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  walletInfo: {
    alignItems: "flex-end",
  },
  walletIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  walletWarning: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.md,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  todayStatsRow: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  todayStatItem: {
    flex: 1,
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: 4,
  },
  whatsappButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: "#25D366",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.md,
  },
  whatsappText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
});
