import React, { useState, useEffect, useCallback, useRef } from "react";
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
  Vibration,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";

import { ThemedText } from "@/components/ThemedText";
import { GradientBackground } from "@/components/GradientBackground";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { AppColors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";
import { formatPrice } from "@/constants/currency";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready"
  | "picked_up"
  | "in_delivery"
  | "delivered"
  | "cancelled";

export type BatchStatus = "pending" | "in_progress" | "completed";

export interface BatchOrder {
  id: string;
  // Customer info
  customerName: string;
  customerPhone: string;
  customerId?: string;
  address: string;
  region: string;
  customerLat?: number;
  customerLng?: number;
  latitude?: number;
  longitude?: number;
  // Order details
  items: any[];
  total: number;
  totalPrice?: number;
  deliveryFee: number;
  status: OrderStatus;
  deliverySequence: number;
  distance?: number;
  estimatedTime?: string;
  notes?: string;
  // Timestamps
  pickedUpAt?: string;
  deliveredAt?: string;
  // Vendor / batch
  orderType?: string;
  vendorName?: string;
  vendorId?: string;
  batchId?: string;
  driverId?: string;
}

export interface CurrentBatch {
  id: string;
  driverId?: string;
  status: BatchStatus;
  totalOrders: number;
  completedOrders: number;
  totalDistance?: number;
  totalEarnings?: number;
  startTime?: string;
  endTime?: string;
  orders: BatchOrder[];
}

export interface DriverStats {
  activeOrdersCount: number;
  maxOrdersPerBatch: number;
  totalCompletedOrders: number;
  totalEarnings: number;
  currentBatchId?: string;
}

export default function DriverHomeScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme, isDark } = useTheme();
  const { phoneNumber } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [isOnline, setIsOnline] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [currentBatch, setCurrentBatch] = useState<CurrentBatch | null>(null);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [driverStatus, setDriverStatus] = useState<string>("pending");
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [walletBalance, setWalletBalance] = useState(0);
  const [issueModalVisible, setIssueModalVisible] = useState(false);
  const [issueSent, setIssueSent] = useState(false);
  const [issueSending, setIssueSending] = useState(false);
  const [issueOrderId, setIssueOrderId] = useState<string | null>(null);

  const prevBatchIdRef = useRef<string | null>(null);
  const isInitialLoadRef = useRef(true);

  const triggerNewBatchAlert = useCallback((batch: CurrentBatch) => {
    Vibration.vibrate([0, 400, 200, 400, 200, 600]);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    const firstOrder = batch.orders[0];
    Notifications.scheduleNotificationAsync({
      content: {
        title: `دفعة جديدة - ${batch.totalOrders} طلب`,
        body: firstOrder ? `${firstOrder.customerName || "زبون"} - ${firstOrder.region || firstOrder.address || ""}` : "",
        sound: true,
        priority: Notifications.AndroidNotificationPriority.MAX,
      },
      trigger: null,
    }).catch(() => {});
  }, []);

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
        const newBatch: CurrentBatch | null = data.currentBatch || null;
        if (!isInitialLoadRef.current) {
          if (newBatch && newBatch.id !== prevBatchIdRef.current) {
            triggerNewBatchAlert(newBatch);
          }
        }
        prevBatchIdRef.current = newBatch ? newBatch.id : null;
        isInitialLoadRef.current = false;
        setCurrentBatch(newBatch);
        setDriverStatus(data.approvalStatus || "pending");
        setWalletBalance(data.walletBalance || 0);
      }
    } catch (e) {
      console.error("Error fetching driver status:", e);
    } finally {
      setLoading(false);
    }
  }, [phoneNumber, triggerNewBatchAlert]);

  useEffect(() => {
    Notifications.requestPermissionsAsync().catch(() => {});
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  }, []);

  useEffect(() => {
    fetchDriverStatus();
    const interval = setInterval(fetchDriverStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchDriverStatus]);

  const gpsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sendLocation = useCallback(async () => {
    if (!phoneNumber) return;
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== "granted") return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await fetch(new URL("/api/driver/location", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, lat: loc.coords.latitude, lng: loc.coords.longitude }),
      });
    } catch (e) {}
  }, [phoneNumber]);

  useEffect(() => {
    if (isOnline) {
      (async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          sendLocation();
          gpsIntervalRef.current = setInterval(sendLocation, 30000);
        }
      })();
    } else {
      if (gpsIntervalRef.current) { clearInterval(gpsIntervalRef.current); gpsIntervalRef.current = null; }
    }
    return () => { if (gpsIntervalRef.current) { clearInterval(gpsIntervalRef.current); gpsIntervalRef.current = null; } };
  }, [isOnline, sendLocation]);

  const handleToggleOnline = async () => {
    if (!phoneNumber || driverStatus !== "approved") return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setWalletError("");
    setIsToggling(true);
    try {
      // Get push token to send to server when going online
      let pushToken: string | undefined;
      if (!isOnline) {
        try {
          const { status } = await Notifications.requestPermissionsAsync();
          if (status === "granted") {
            const tokenData = await Notifications.getExpoPushTokenAsync();
            pushToken = tokenData.data;
          }
        } catch (_e) {}
      }
      const res = await fetch(new URL("/api/driver/toggle-online", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, goOnline: !isOnline, pushToken }),
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

  const handleAcceptBatch = async () => {
    if (!phoneNumber || !currentBatch) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    try {
      const res = await fetch(new URL("/api/driver/batch/accept", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, batchId: currentBatch.id }),
      });
      if (res.ok) await fetchDriverStatus();
    } catch (e) {
      console.error("Error accepting batch:", e);
    }
  };

  const handleRejectBatch = async () => {
    if (!phoneNumber || !currentBatch) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const res = await fetch(new URL("/api/driver/reject-order", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, batchId: currentBatch.id }),
      });
      if (res.ok) {
        setCurrentBatch(null);
        await fetchDriverStatus();
      }
    } catch (e) {
      console.error("Error rejecting batch:", e);
    }
  };

  const ISSUE_OPTIONS = [
    { key: "no_answer", label: "الزبون ما يرد" },
    { key: "unclear_address", label: "العنوان غير واضح" },
    { key: "other", label: "مشكلة أخرى" },
  ];

  const handleOpenIssueModal = (orderId: string) => {
    setIssueOrderId(orderId);
    setIssueModalVisible(true);
  };

  const handleSelectIssue = async (issueType: string) => {
    if (!phoneNumber || !issueOrderId) return;
    setIssueSending(true);
    try {
      const res = await fetch(new URL("/api/driver/report-issue", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, orderId: issueOrderId, issueType }),
      });
      if (res.ok) {
        setIssueSent(true);
        setTimeout(() => {
          setIssueModalVisible(false);
          setIssueSent(false);
          setIssueOrderId(null);
          fetchDriverStatus();
        }, 1800);
      }
    } catch (e) {
      console.error("Error reporting issue:", e);
    } finally {
      setIssueSending(false);
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
      <ThemedText type="h3" style={[styles.statusTitle, { color: theme.text }]}>قيد المراجعة</ThemedText>
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
      <ThemedText type="h3" style={[styles.statusTitle, { color: theme.text }]}>تم رفض الطلب</ThemedText>
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
      {walletBalance < 250 ? (
        <>
          <View style={[styles.walletWarning, { backgroundColor: "#FFF3E0" }]}>
            <Feather name="alert-triangle" size={16} color="#FF9800" />
            <ThemedText type="small" style={{ color: "#E65100", flex: 1, textAlign: "right", marginRight: Spacing.xs }}>
              رصيدك غير كافٍ للعمل. تواصل مع الدعم لشحن الرصيد.
            </ThemedText>
          </View>
          <Pressable onPress={handleWhatsAppSupport} style={styles.whatsappButton} testID="button-whatsapp-support">
            <Feather name="message-circle" size={20} color="#FFFFFF" />
            <ThemedText type="body" style={styles.whatsappText}>تواصل مع الدعم عبر واتساب</ThemedText>
          </Pressable>
        </>
      ) : null}
    </View>
  );

  const renderOnlineToggle = () => (
    <View style={styles.toggleSection}>
      <Pressable
        onPress={handleToggleOnline}
        disabled={isToggling}
        style={[styles.toggleButton, {
          backgroundColor: isOnline ? "#4CAF50" : isDark ? theme.backgroundSecondary : "#F5F5F5",
          borderColor: isOnline ? "#4CAF50" : theme.border,
        }]}
        testID="button-toggle-online"
      >
        {isToggling ? (
          <ActivityIndicator size="small" color={isOnline ? "#FFFFFF" : AppColors.primary} />
        ) : (
          <>
            <View style={[styles.toggleDot, { backgroundColor: isOnline ? "#FFFFFF" : "#BDBDBD" }]} />
            <ThemedText type="h3" style={[styles.toggleText, { color: isOnline ? "#FFFFFF" : theme.text }]}>
              {isOnline ? "متصل" : "غير متصل"}
            </ThemedText>
            <Feather name={isOnline ? "wifi" : "wifi-off"} size={24} color={isOnline ? "#FFFFFF" : "#BDBDBD"} />
          </>
        )}
      </Pressable>
      {isOnline && queuePosition !== null ? (
        <View style={[styles.queueCard, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
          <View style={styles.queueRow}>
            <View style={[styles.queueBadge, { backgroundColor: AppColors.primary + "15" }]}>
              <ThemedText type="h2" style={{ color: AppColors.primary }}>{queuePosition}</ThemedText>
            </View>
            <View style={styles.queueInfo}>
              <ThemedText type="h4" style={{ color: theme.text }}>ترتيبك في الطابور</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {queuePosition === 1 ? "أنت التالي لاستلام دفعة" : `يوجد ${queuePosition - 1} سائق قبلك`}
              </ThemedText>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );

  const renderBatchCard = () => {
    if (!currentBatch) return null;
    const isPending = currentBatch.status === "pending";
    const isInProgress = currentBatch.status === "in_progress";
    const progress = currentBatch.completedOrders / Math.max(currentBatch.totalOrders, 1);

    const badgeColor = isPending ? AppColors.primary : "#8B5CF6";
    const badgeLabel = isPending ? "دفعة جديدة" : "جارٍ التوصيل";

    return (
      <View style={[styles.batchCard, { backgroundColor: theme.backgroundDefault }, Shadows.md]}>
        {/* Batch Header */}
        <View style={[styles.batchHeader, { borderBottomColor: theme.border }]}>
          <View style={[styles.newOrderBadge, { backgroundColor: badgeColor }]}>
            <ThemedText type="small" style={styles.newOrderText}>{badgeLabel}</ThemedText>
          </View>
          <View style={styles.batchMeta}>
            <Feather name="layers" size={16} color={theme.textSecondary} />
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {currentBatch.totalOrders} طلبات
            </ThemedText>
          </View>
        </View>

        {/* Progress Bar (for in_progress) */}
        {isInProgress ? (
          <View style={styles.progressSection}>
            <View style={styles.progressLabelRow}>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {currentBatch.completedOrders} / {currentBatch.totalOrders} تم التوصيل
              </ThemedText>
              <ThemedText type="small" style={{ color: AppColors.primary, fontWeight: "700" }}>
                {Math.round(progress * 100)}%
              </ThemedText>
            </View>
            <View style={[styles.progressBar, { backgroundColor: theme.border }]}>
              <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` as any, backgroundColor: AppColors.primary }]} />
            </View>
          </View>
        ) : null}

        {/* Order summary list */}
        <View style={styles.ordersSummary}>
          {currentBatch.orders.slice(0, 3).map((order, idx) => {
            const isDelivered = order.status === "delivered";
            const isPreparing = order.status === "preparing";
            const isDelivering = order.status === "in_delivery" || order.status === "picked_up";
            return (
              <View key={order.id} style={[styles.orderSummaryRow, idx < Math.min(currentBatch.orders.length, 3) - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                <View style={styles.orderSummaryLeft}>
                  <View style={[styles.seqBadge, {
                    backgroundColor: isDelivered ? "#4CAF5020" : isDelivering ? "#2196F320" : isPreparing ? "#8B5CF620" : AppColors.primary + "20",
                  }]}>
                    {isDelivered
                      ? <Feather name="check" size={12} color="#4CAF50" />
                      : <ThemedText type="small" style={{ color: AppColors.primary, fontWeight: "800", fontSize: 11 }}>{order.deliverySequence}</ThemedText>
                    }
                  </View>
                </View>
                <View style={styles.orderSummaryInfo}>
                  <ThemedText type="body" style={{ color: theme.text, fontWeight: "700" }} numberOfLines={1}>
                    {order.customerName || "زبون"}
                  </ThemedText>
                  <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4 }}>
                    <Feather name="map-pin" size={11} color={theme.textSecondary} />
                    <ThemedText type="small" style={{ color: theme.textSecondary }} numberOfLines={1}>
                      {order.region || order.address}
                    </ThemedText>
                  </View>
                  {order.items && order.items.length > 0 ? (
                    <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 2 }} numberOfLines={2}>
                      {order.items.map((it: any) => `${it.name} ×${it.quantity}`).join("، ")}
                    </ThemedText>
                  ) : null}
                </View>
                <ThemedText type="small" style={{ color: AppColors.primary, fontWeight: "700" }}>
                  {formatPrice(order.total + (order.deliveryFee || 0))}
                </ThemedText>
              </View>
            );
          })}
          {currentBatch.orders.length > 3 ? (
            <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "center", paddingTop: Spacing.xs }}>
              +{currentBatch.orders.length - 3} طلبات أخرى
            </ThemedText>
          ) : null}
        </View>

        {/* Actions */}
        {isPending ? (
          <View style={styles.batchActions}>
            <Pressable
              style={[styles.rejectButton, { borderColor: "#F44336" }]}
              onPress={handleRejectBatch}
              testID="button-reject-batch"
            >
              <ThemedText type="h4" style={{ color: "#F44336", fontWeight: "700" }}>رفض</ThemedText>
            </Pressable>
            <Pressable
              style={styles.acceptButton}
              onPress={handleAcceptBatch}
              testID="button-accept-batch"
            >
              <ThemedText type="h4" style={styles.acceptText}>قبول الدفعة</ThemedText>
              <Feather name="check" size={20} color="#FFFFFF" />
            </Pressable>
          </View>
        ) : null}

        {isInProgress ? (
          <Pressable
            style={[styles.manageBatchButton, { backgroundColor: "#8B5CF6" }]}
            onPress={() => navigation.navigate("DriverBatch", { batch: currentBatch })}
            testID="button-manage-batch"
          >
            <Feather name="list" size={20} color="#FFFFFF" />
            <ThemedText type="h4" style={styles.acceptText}>إدارة الدفعة</ThemedText>
            <Feather name="chevron-left" size={20} color="#FFFFFF" />
          </Pressable>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <GradientBackground />
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md, backgroundColor: AppColors.primary }]}>
        <ThemedText type="h2" style={styles.headerTitle}>ONWAY</ThemedText>
        <ThemedText type="small" style={styles.headerSubtitle}>لوحة السائق</ThemedText>
      </View>

      {/* Issue Report Modal */}
      <Modal
        visible={issueModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !issueSending && setIssueModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => !issueSending && setIssueModalVisible(false)}>
          <Pressable style={[styles.modalBox, { backgroundColor: theme.backgroundDefault }]} onPress={() => {}}>
            {issueSent ? (
              <View style={styles.modalSent}>
                <View style={[styles.modalSentIcon, { backgroundColor: "#E8F5E9" }]}>
                  <Feather name="check-circle" size={36} color="#4CAF50" />
                </View>
                <ThemedText type="h4" style={{ color: "#4CAF50", fontWeight: "700", marginTop: Spacing.md }}>
                  تم إرسال المشكلة
                </ThemedText>
              </View>
            ) : (
              <>
                <View style={styles.modalHeader}>
                  <Feather name="alert-triangle" size={22} color={AppColors.primary} />
                  <ThemedText type="h4" style={{ color: theme.text, fontWeight: "700" }}>إبلاغ عن مشكلة</ThemedText>
                </View>
                <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "center", marginBottom: Spacing.lg }}>
                  اختر نوع المشكلة
                </ThemedText>
                {ISSUE_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.key}
                    style={[styles.issueOption, { borderColor: theme.border }]}
                    onPress={() => handleSelectIssue(opt.key)}
                    disabled={issueSending}
                    testID={`button-issue-${opt.key}`}
                  >
                    {issueSending ? (
                      <ActivityIndicator size="small" color={AppColors.primary} />
                    ) : (
                      <Feather name="chevron-left" size={18} color={AppColors.primary} />
                    )}
                    <ThemedText type="body" style={{ color: theme.text, fontWeight: "600", flex: 1, textAlign: "right" }}>
                      {opt.label}
                    </ThemedText>
                  </Pressable>
                ))}
                <Pressable
                  style={styles.modalCancelBtn}
                  onPress={() => setIssueModalVisible(false)}
                  disabled={issueSending}
                >
                  <ThemedText type="small" style={{ color: theme.textSecondary }}>إلغاء</ThemedText>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

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
                {renderBatchCard()}
                {isOnline && !currentBatch ? (
                  <View style={[styles.waitingCard, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
                    <Feather name="coffee" size={40} color={theme.textSecondary} />
                    <ThemedText type="h4" style={{ color: theme.text, marginTop: Spacing.md }}>
                      بانتظار دفعات جديدة
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={AppColors.primary} />}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    alignItems: "center",
  },
  headerTitle: { color: "#FFFFFF", fontWeight: "800", fontSize: 19 },
  headerSubtitle: { color: "rgba(255,255,255,0.8)", marginTop: 2 },
  content: { padding: Spacing.lg },
  statusCard: { alignItems: "center", paddingVertical: Spacing["3xl"] },
  statusIcon: {
    width: 80, height: 80, borderRadius: 40,
    justifyContent: "center", alignItems: "center", marginBottom: Spacing.lg,
  },
  statusTitle: { textAlign: "center", marginBottom: Spacing.sm },
  statusSubtitle: { textAlign: "center", paddingHorizontal: Spacing.xl },
  toggleSection: { marginBottom: Spacing.lg },
  toggleButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: Spacing.md, paddingVertical: Spacing.xl,
    borderRadius: BorderRadius["2xl"], borderWidth: 2, marginBottom: Spacing.lg,
  },
  toggleDot: { width: 12, height: 12, borderRadius: 6 },
  toggleText: { fontWeight: "700" },
  queueCard: { borderRadius: BorderRadius.xl, padding: Spacing.lg },
  queueRow: { flexDirection: "row-reverse", alignItems: "center", gap: Spacing.md },
  queueBadge: { width: 60, height: 60, borderRadius: 30, justifyContent: "center", alignItems: "center" },
  queueInfo: { flex: 1, alignItems: "flex-end" },
  batchCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  batchHeader: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    marginBottom: Spacing.md,
  },
  batchMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  newOrderBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  newOrderText: { color: "#FFFFFF", fontWeight: "700", fontSize: 12 },
  progressSection: { marginBottom: Spacing.md },
  progressLabelRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  progressBar: { height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },
  ordersSummary: { marginBottom: Spacing.md, gap: Spacing.sm },
  orderSummaryRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  orderSummaryLeft: { alignItems: "center" },
  seqBadge: {
    width: 28, height: 28, borderRadius: 14,
    justifyContent: "center", alignItems: "center",
  },
  orderSummaryInfo: { flex: 1, alignItems: "flex-end" },
  batchActions: { flexDirection: "row-reverse", gap: Spacing.md },
  acceptButton: {
    flex: 1, backgroundColor: AppColors.primary,
    flexDirection: "row", justifyContent: "center", alignItems: "center",
    gap: Spacing.sm, paddingVertical: Spacing.md, borderRadius: BorderRadius.md,
  },
  acceptText: { color: "#FFFFFF", fontWeight: "700" },
  rejectButton: {
    flex: 1, borderWidth: 2, justifyContent: "center",
    alignItems: "center", paddingVertical: Spacing.md, borderRadius: BorderRadius.md,
  },
  manageBatchButton: {
    flexDirection: "row-reverse", justifyContent: "center", alignItems: "center",
    gap: Spacing.sm, paddingVertical: Spacing.md, borderRadius: BorderRadius.md,
  },
  waitingCard: {
    borderRadius: BorderRadius.xl, padding: Spacing["3xl"], alignItems: "center",
  },
  walletCard: { borderRadius: BorderRadius.xl, padding: Spacing.lg, marginBottom: Spacing.lg },
  walletRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  walletInfo: { alignItems: "flex-end" },
  walletIcon: { width: 48, height: 48, borderRadius: 24, justifyContent: "center", alignItems: "center" },
  walletWarning: {
    flexDirection: "row-reverse", alignItems: "center", gap: Spacing.xs,
    marginTop: Spacing.md, padding: Spacing.sm, borderRadius: BorderRadius.sm,
  },
  whatsappButton: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: Spacing.sm, backgroundColor: "#25D366",
    paddingVertical: Spacing.md, borderRadius: BorderRadius.lg, marginTop: Spacing.md,
  },
  whatsappText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center", alignItems: "center", padding: Spacing.xl,
  },
  modalBox: {
    width: "100%", borderRadius: BorderRadius.xl, padding: Spacing.xl,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 8,
  },
  modalHeader: {
    flexDirection: "row-reverse", alignItems: "center",
    gap: Spacing.sm, justifyContent: "center", marginBottom: Spacing.sm,
  },
  issueOption: {
    flexDirection: "row-reverse", alignItems: "center", gap: Spacing.sm,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg, borderWidth: 1, marginBottom: Spacing.sm,
  },
  modalCancelBtn: { alignItems: "center", paddingVertical: Spacing.sm, marginTop: Spacing.xs },
  modalSent: { alignItems: "center", paddingVertical: Spacing.xl },
  modalSentIcon: { width: 70, height: 70, borderRadius: 35, justifyContent: "center", alignItems: "center" },
});
