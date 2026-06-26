import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  StyleSheet,
  View,
  Pressable,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Linking,
  Platform,
  Vibration,
  Modal,
  Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import Svg, { Circle } from "react-native-svg";
import { Image } from "expo-image";

import { ThemedText } from "@/components/ThemedText";
import { GradientBackground } from "@/components/GradientBackground";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { AppColors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";
import { formatPrice } from "@/constants/currency";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

const COUNTDOWN_SECONDS = 30;
const RING_RADIUS = 42;
const RING_CIRC = 2 * Math.PI * RING_RADIUS;

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
  customerName: string;
  customerPhone: string;
  customerId?: string;
  address: string;
  region: string;
  customerLat?: number;
  customerLng?: number;
  latitude?: number;
  longitude?: number;
  items: any[];
  total: number;
  totalPrice?: number;
  deliveryFee: number;
  status: OrderStatus;
  deliverySequence: number;
  distance?: number;
  estimatedTime?: string;
  notes?: string;
  pickedUpAt?: string;
  deliveredAt?: string;
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
  const { phoneNumber, userProfile } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [isOnline, setIsOnline] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [currentBatch, setCurrentBatch] = useState<CurrentBatch | null>(null);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [driverStatus, setDriverStatus] = useState<string>("pending");
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletError, setWalletError] = useState("");
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [issueModalVisible, setIssueModalVisible] = useState(false);
  const [issueSent, setIssueSent] = useState(false);
  const [issueSending, setIssueSending] = useState(false);
  const [issueOrderId, setIssueOrderId] = useState<string | null>(null);

  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevBatchIdRef = useRef<string | null>(null);
  const isInitialLoadRef = useRef(true);
  const isRejectingRef = useRef(false); // prevents double-rejection calls
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // ── Pulse animation for incoming order card ────────────────────────────────
  useEffect(() => {
    if (currentBatch?.status === "pending") {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.03, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [currentBatch?.status]);

  const triggerNewBatchAlert = useCallback((batch: CurrentBatch) => {
    Vibration.vibrate([0, 400, 200, 400, 200, 600]);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    const firstOrder = batch.orders[0];
    Notifications.scheduleNotificationAsync({
      content: {
        title: `طلب جديد - ${batch.totalOrders} طلب`,
        body: firstOrder
          ? `${firstOrder.customerName || "زبون"} - ${firstOrder.region || firstOrder.address || ""}`
          : "",
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
        setTodayEarnings(data.todayEarnings || 0);
      }
    } catch (e) {
      console.error("Error fetching driver status:", e);
    } finally {
      setLoading(false);
    }
  }, [phoneNumber, triggerNewBatchAlert]);

  // ── 30-second countdown for pending batch ─────────────────────────────────
  useEffect(() => {
    if (currentBatch?.status === "pending") {
      setCountdown(COUNTDOWN_SECONDS);
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownRef.current!);
            handleRejectBatch();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    }
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [currentBatch?.status, currentBatch?.id]);

  // Single sequential flow: handler → permissions → token → save to server
  useEffect(() => {
    if (!phoneNumber) return;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    // Sequential: request permission THEN get token THEN save
    (async () => {
      try {
        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("default", {
            name: "Onway",
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            sound: "default",
            enableVibrate: true,
          });
        }
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== "granted") {
          console.log("[PUSH] Permission not granted on iOS");
          return;
        }
        const tokenData = await Notifications.getExpoPushTokenAsync().catch(() => null);
        if (!tokenData?.data) {
          console.log("[PUSH] Could not get Expo push token");
          return;
        }
        console.log("[PUSH] Got token, saving to server:", tokenData.data.slice(-12));
        await fetch(new URL("/api/driver/refresh-push-token", getApiUrl()).toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phoneNumber, pushToken: tokenData.data }),
        });
        console.log("[PUSH] Token saved to server successfully");
      } catch (e) {
        console.log("[PUSH] Error in token setup:", e);
      }
    })();
  }, [phoneNumber]);

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
      if (gpsIntervalRef.current) {
        clearInterval(gpsIntervalRef.current);
        gpsIntervalRef.current = null;
      }
    }
    return () => {
      if (gpsIntervalRef.current) {
        clearInterval(gpsIntervalRef.current);
        gpsIntervalRef.current = null;
      }
    };
  }, [isOnline, sendLocation]);

  const handleToggleOnline = async () => {
    if (!phoneNumber || driverStatus !== "approved") return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setWalletError("");
    setIsToggling(true);
    try {
      let pushToken: string | undefined;
      if (!isOnline) {
        try {
          const tokenData = await Notifications.getExpoPushTokenAsync().catch(() => null);
          if (tokenData?.data) pushToken = tokenData.data;
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
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
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
    // Guard: prevent double rejection (from countdown + manual button)
    if (isRejectingRef.current) return;
    isRejectingRef.current = true;
    // Stop countdown immediately
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    const batchIdToReject = currentBatch.id;
    setCurrentBatch(null); // Clear UI immediately
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await fetch(new URL("/api/driver/reject-order", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, batchId: batchIdToReject }),
      });
      await fetchDriverStatus();
    } catch (e) {
      console.error("Error rejecting batch:", e);
    } finally {
      isRejectingRef.current = false;
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

  const handleWhatsAppSupport = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const supportNumber = "9647702891104";
    const message = encodeURIComponent("مرحباً، أحتاج شحن رصيد محفظتي في تطبيق OnWay");
    Linking.openURL(`https://wa.me/${supportNumber}?text=${message}`).catch(() => {
      Linking.openURL(`whatsapp://send?phone=${supportNumber}&text=${message}`).catch(console.error);
    });
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

  // ─── Earning ring color based on countdown ──────────────────────────────────
  const countdownProgress = countdown / COUNTDOWN_SECONDS;
  const ringColor = countdown > 15 ? AppColors.primary : countdown > 8 ? "#FF9800" : "#F44336";
  const ringDashoffset = RING_CIRC * (1 - countdownProgress);

  // ────────────────────────────────────────────────────────────────────────────
  // RENDER SECTIONS
  // ────────────────────────────────────────────────────────────────────────────

  const renderStatusPending = () => (
    <View style={[styles.statusCard, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
      <View style={[styles.statusIconWrap, { backgroundColor: "#FFF3E0" }]}>
        <Feather name="clock" size={36} color="#FF9800" />
      </View>
      <ThemedText type="h3" style={{ color: theme.text, marginTop: Spacing.md }}>قيد المراجعة</ThemedText>
      <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center", marginTop: Spacing.sm }}>
        حسابك قيد المراجعة من قبل الإدارة. سيتم إبلاغك عند الموافقة.
      </ThemedText>
    </View>
  );

  const renderStatusRejected = () => (
    <View style={[styles.statusCard, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
      <View style={[styles.statusIconWrap, { backgroundColor: "#FFEBEE" }]}>
        <Feather name="x-circle" size={36} color="#F44336" />
      </View>
      <ThemedText type="h3" style={{ color: theme.text, marginTop: Spacing.md }}>تم رفض الطلب</ThemedText>
      <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center", marginTop: Spacing.sm }}>
        للأسف تم رفض طلب التسجيل. تواصل مع الإدارة للمزيد من المعلومات.
      </ThemedText>
    </View>
  );

  // ── Today earnings strip ────────────────────────────────────────────────────
  const renderEarningsStrip = () => (
    <View style={[styles.earningsStrip, { backgroundColor: AppColors.primary }]}>
      <View style={styles.earningsStripItem}>
        <ThemedText type="small" style={styles.earningsStripLabel}>أرباح اليوم</ThemedText>
        <ThemedText type="h3" style={styles.earningsStripValue}>{formatPrice(todayEarnings)}</ThemedText>
      </View>
      <View style={styles.earningsStripDivider} />
      <View style={styles.earningsStripItem}>
        <ThemedText type="small" style={styles.earningsStripLabel}>المحفظة</ThemedText>
        <ThemedText type="h3" style={[styles.earningsStripValue, walletBalance < 250 ? { color: "#FFCDD2" } : null]}>
          {formatPrice(walletBalance)}
        </ThemedText>
      </View>
      <View style={styles.earningsStripDivider} />
      <View style={styles.earningsStripItem}>
        <ThemedText type="small" style={styles.earningsStripLabel}>ترتيبك</ThemedText>
        <ThemedText type="h3" style={styles.earningsStripValue}>
          {queuePosition !== null ? `#${queuePosition}` : "-"}
        </ThemedText>
      </View>
    </View>
  );

  // ── Offline hero ────────────────────────────────────────────────────────────
  const renderOfflineHero = () => (
    <View style={[styles.offlineHero, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
      <View style={[styles.offlineIconCircle, { backgroundColor: theme.backgroundRoot }]}>
        <Feather name="truck" size={44} color={isDark ? "#555" : "#BDBDBD"} />
      </View>
      <ThemedText type="h3" style={{ color: theme.text, marginTop: Spacing.lg }}>أنت غير متصل</ThemedText>
      <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center", marginTop: Spacing.sm, marginBottom: Spacing.xl }}>
        شغّل زر الاتصال لبدء استقبال الطلبات
      </ThemedText>
      {walletBalance < 250 ? (
        <View style={[styles.walletWarningBanner, { backgroundColor: "#FFF3E0" }]}>
          <Feather name="alert-triangle" size={14} color="#E65100" />
          <ThemedText type="small" style={{ color: "#E65100", flex: 1, textAlign: "right", marginRight: 4 }}>
            رصيدك غير كافٍ ({formatPrice(walletBalance)}) — يجب على الأقل {formatPrice(250)} للعمل
          </ThemedText>
        </View>
      ) : null}
      {walletError ? (
        <View style={[styles.walletWarningBanner, { backgroundColor: "#FFEBEE" }]}>
          <Feather name="alert-circle" size={14} color="#C62828" />
          <ThemedText type="small" style={{ color: "#C62828", flex: 1, textAlign: "right", marginRight: 4 }}>
            {walletError}
          </ThemedText>
        </View>
      ) : null}
    </View>
  );

  // ── Online toggle ───────────────────────────────────────────────────────────
  const renderToggle = () => (
    <Pressable
      onPress={handleToggleOnline}
      disabled={isToggling}
      style={[
        styles.toggleButton,
        {
          backgroundColor: isOnline ? AppColors.primary : (isDark ? theme.backgroundSecondary : "#F5F5F5"),
          borderColor: isOnline ? AppColors.primary : theme.border,
        },
      ]}
      testID="button-toggle-online"
    >
      {isToggling ? (
        <ActivityIndicator size="small" color={isOnline ? "#fff" : AppColors.primary} />
      ) : (
        <>
          <View style={[styles.toggleDot, { backgroundColor: isOnline ? "#fff" : "#BDBDBD" }]} />
          <ThemedText type="h3" style={{ color: isOnline ? "#fff" : theme.text, fontWeight: "700" }}>
            {isOnline ? "متصل" : "غير متصل"}
          </ThemedText>
          <Feather name={isOnline ? "wifi" : "wifi-off"} size={22} color={isOnline ? "#fff" : "#BDBDBD"} />
        </>
      )}
    </Pressable>
  );

  // ── Incoming order card with countdown ──────────────────────────────────────
  const renderIncomingOrder = () => {
    if (!currentBatch || currentBatch.status !== "pending") return null;
    const estimatedEarning = currentBatch.orders.reduce((sum, o) => {
      const isRestaurant = o.orderType === "restaurant";
      return sum + (isRestaurant ? 750 : 2000);
    }, 0);

    return (
      <Animated.View style={[styles.incomingCard, { backgroundColor: theme.backgroundDefault, transform: [{ scale: pulseAnim }] }, Shadows.lg]}>
        {/* Card top: "طلب جديد" badge */}
        <View style={[styles.incomingBadgeRow, { backgroundColor: AppColors.primary + "15" }]}>
          <View style={[styles.incomingDot]} />
          <ThemedText type="body" style={{ color: AppColors.primary, fontWeight: "800", flex: 1, textAlign: "right" }}>
            طلب جديد وصل!
          </ThemedText>
        </View>

        <View style={styles.incomingBody}>
          {/* Countdown ring */}
          <View style={styles.countdownWrap}>
            <Svg width={100} height={100}>
              <Circle cx={50} cy={50} r={RING_RADIUS} stroke={theme.border} strokeWidth={7} fill="none" />
              <Circle
                cx={50} cy={50} r={RING_RADIUS}
                stroke={ringColor}
                strokeWidth={7}
                fill="none"
                strokeDasharray={RING_CIRC}
                strokeDashoffset={ringDashoffset}
                strokeLinecap="round"
                rotation="-90"
                origin="50,50"
              />
            </Svg>
            <View style={styles.countdownCenter}>
              <ThemedText type="h2" style={{ color: ringColor, fontWeight: "800" }}>{countdown}</ThemedText>
              <ThemedText style={{ fontSize: 9, color: theme.textSecondary }}>ثانية</ThemedText>
            </View>
          </View>

          {/* Order summary */}
          <View style={styles.incomingDetails}>
            <View style={styles.incomingStatRow}>
              <View style={[styles.incomingStatBadge, { backgroundColor: "#4CAF5018" }]}>
                <Feather name="package" size={14} color="#4CAF50" />
                <ThemedText type="small" style={{ color: "#4CAF50", fontWeight: "700" }}>
                  {currentBatch.totalOrders} طلبات
                </ThemedText>
              </View>
              <View style={[styles.incomingStatBadge, { backgroundColor: AppColors.primary + "18" }]}>
                <Feather name="dollar-sign" size={14} color={AppColors.primary} />
                <ThemedText type="small" style={{ color: AppColors.primary, fontWeight: "700" }}>
                  {formatPrice(estimatedEarning)}
                </ThemedText>
              </View>
            </View>

            {currentBatch.orders.slice(0, 2).map((order, idx) => (
              <View key={order.id} style={[styles.incomingOrderRow, idx === 0 && { borderTopWidth: 0 }, { borderTopColor: theme.border }]}>
                <View style={[styles.seqDot, { backgroundColor: AppColors.primary }]}>
                  <ThemedText style={{ color: "#fff", fontSize: 10, fontWeight: "800" }}>{order.deliverySequence}</ThemedText>
                </View>
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <ThemedText type="body" style={{ color: theme.text, fontWeight: "700" }} numberOfLines={1}>
                    {order.customerName || "زبون"}
                  </ThemedText>
                  <ThemedText type="small" style={{ color: theme.textSecondary }} numberOfLines={1}>
                    {order.region || order.address}
                  </ThemedText>
                </View>
              </View>
            ))}
            {currentBatch.orders.length > 2 ? (
              <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "center", marginTop: 4 }}>
                +{currentBatch.orders.length - 2} طلبات أخرى
              </ThemedText>
            ) : null}
          </View>
        </View>

        {/* Accept / Reject */}
        <View style={styles.incomingActions}>
          <Pressable style={styles.rejectBtn} onPress={handleRejectBatch} testID="button-reject-batch">
            <Feather name="x" size={18} color="#F44336" />
            <ThemedText type="body" style={{ color: "#F44336", fontWeight: "700" }}>رفض</ThemedText>
          </Pressable>
          <Pressable style={styles.acceptBtn} onPress={handleAcceptBatch} testID="button-accept-batch">
            <Feather name="check" size={20} color="#fff" />
            <ThemedText type="h4" style={{ color: "#fff", fontWeight: "800" }}>قبول الطلب</ThemedText>
          </Pressable>
        </View>
      </Animated.View>
    );
  };

  // ── Active batch card ────────────────────────────────────────────────────────
  const renderActiveBatch = () => {
    if (!currentBatch || currentBatch.status !== "in_progress") return null;
    const progress = currentBatch.completedOrders / Math.max(currentBatch.totalOrders, 1);

    return (
      <View style={[styles.activeBatchCard, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
        <View style={styles.activeBatchHeader}>
          <View style={[styles.activeBadge, { backgroundColor: "#8B5CF620" }]}>
            <View style={[styles.activePulse, { backgroundColor: "#8B5CF6" }]} />
            <ThemedText type="small" style={{ color: "#8B5CF6", fontWeight: "700" }}>جارٍ التوصيل</ThemedText>
          </View>
          <View style={styles.activeBatchMeta}>
            <Feather name="layers" size={14} color={theme.textSecondary} />
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {currentBatch.completedOrders}/{currentBatch.totalOrders} طلب
            </ThemedText>
          </View>
        </View>

        {/* Progress bar */}
        <View style={[styles.progressBar, { backgroundColor: theme.border }]}>
          <View
            style={[styles.progressFill, {
              width: `${Math.round(progress * 100)}%` as any,
              backgroundColor: "#8B5CF6",
            }]}
          />
        </View>

        {/* Orders mini list */}
        <View style={{ marginTop: Spacing.sm }}>
          {currentBatch.orders.slice(0, 3).map((order) => {
            const done = order.status === "delivered";
            const active = order.status === "in_delivery" || order.status === "picked_up";
            const dotColor = done ? "#4CAF50" : active ? "#2196F3" : "#BDBDBD";
            return (
              <View key={order.id} style={styles.activeBatchOrderRow}>
                <View style={[styles.orderDot, { backgroundColor: dotColor }]}>
                  {done ? <Feather name="check" size={10} color="#fff" /> : null}
                </View>
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <ThemedText type="body" style={{ color: done ? theme.textSecondary : theme.text, fontWeight: done ? "400" : "600", textDecorationLine: done ? "line-through" : "none" }} numberOfLines={1}>
                    {order.customerName || "زبون"}
                  </ThemedText>
                  <ThemedText type="small" style={{ color: theme.textSecondary }} numberOfLines={1}>
                    {order.region || order.address}
                  </ThemedText>
                </View>
                <ThemedText type="small" style={{ color: dotColor, fontWeight: "700" }}>
                  {done ? "تم" : active ? "جارٍ" : "لاحقاً"}
                </ThemedText>
              </View>
            );
          })}
        </View>

        <Pressable
          style={[styles.manageBatchBtn, { backgroundColor: "#8B5CF6" }]}
          onPress={() => navigation.navigate("DriverBatch", { batch: currentBatch })}
          testID="button-manage-batch"
        >
          <Feather name="navigation" size={18} color="#fff" />
          <ThemedText type="h4" style={{ color: "#fff", fontWeight: "700" }}>إدارة التوصيل</ThemedText>
          <Feather name="chevron-left" size={18} color="#fff" />
        </Pressable>
      </View>
    );
  };

  // ── Waiting state ────────────────────────────────────────────────────────────
  const renderWaiting = () => (
    <View style={[styles.waitingCard, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
      <ActivityIndicator size="small" color={AppColors.primary} style={{ marginBottom: Spacing.md }} />
      <ThemedText type="h4" style={{ color: theme.text }}>في انتظار الطلبات</ThemedText>
      <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: Spacing.xs, textAlign: "center" }}>
        {queuePosition === 1 ? "أنت التالي لاستلام دفعة" : queuePosition && queuePosition > 1 ? `يوجد ${queuePosition - 1} سائق قبلك` : "ستصلك الطلبات تلقائياً"}
      </ThemedText>
    </View>
  );

  // ── Wallet low warning ───────────────────────────────────────────────────────
  const renderWalletWarning = () => {
    if (walletBalance >= 250) return null;
    return (
      <View style={[styles.walletAlertCard, { backgroundColor: "#FFF3E0" }, Shadows.sm]}>
        <View style={styles.walletAlertRow}>
          <Feather name="alert-triangle" size={18} color="#E65100" />
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <ThemedText type="body" style={{ color: "#E65100", fontWeight: "700" }}>رصيد المحفظة منخفض</ThemedText>
            <ThemedText type="small" style={{ color: "#BF360C" }}>
              {formatPrice(walletBalance)} — الحد الأدنى {formatPrice(250)}
            </ThemedText>
          </View>
        </View>
        <Pressable onPress={handleWhatsAppSupport} style={styles.whatsappBtn} testID="button-whatsapp-support">
          <Feather name="message-circle" size={18} color="#fff" />
          <ThemedText type="body" style={{ color: "#fff", fontWeight: "700" }}>شحن الرصيد عبر واتساب</ThemedText>
        </Pressable>
      </View>
    );
  };

  // ────────────────────────────────────────────────────────────────────────────
  // MAIN RENDER
  // ────────────────────────────────────────────────────────────────────────────

  const driverName = userProfile?.fullName || "السائق";

  return (
    <View style={styles.container}>
      <GradientBackground />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 4, backgroundColor: AppColors.primary }]}>
        <View style={styles.headerRow}>
          <View style={[styles.onlineDot, { backgroundColor: isOnline ? "#4CAF50" : "#78909C" }]} />
          <Image source={require("../assets/images/onway-header-logo-transparent.png")} style={styles.headerLogo} contentFit="contain" />
          <View style={styles.headerNameWrap}>
            <Feather name="user" size={13} color="rgba(255,255,255,0.8)" />
            <ThemedText type="small" style={styles.headerName} numberOfLines={1}>{driverName}</ThemedText>
          </View>
        </View>
      </View>

      {/* Earnings strip — only when online */}
      {isOnline && driverStatus === "approved" ? renderEarningsStrip() : null}

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
              <View style={{ alignItems: "center", paddingVertical: Spacing.xl }}>
                <View style={[styles.statusIconWrap, { backgroundColor: "#E8F5E9" }]}>
                  <Feather name="check-circle" size={36} color="#4CAF50" />
                </View>
                <ThemedText type="h4" style={{ color: "#4CAF50", marginTop: Spacing.md }}>تم إرسال المشكلة</ThemedText>
              </View>
            ) : (
              <>
                <View style={styles.modalHeaderRow}>
                  <Feather name="alert-triangle" size={20} color={AppColors.primary} />
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
                <Pressable style={{ alignItems: "center", paddingVertical: Spacing.sm, marginTop: Spacing.xs }} onPress={() => setIssueModalVisible(false)} disabled={issueSending}>
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
            {driverStatus === "pending" ? renderStatusPending() : null}
            {driverStatus === "rejected" ? renderStatusRejected() : null}
            {driverStatus === "approved" ? (
              <>
                {/* Online/Offline Toggle */}
                {renderToggle()}

                {/* Offline hero */}
                {!isOnline ? renderOfflineHero() : null}

                {/* Wallet warning (when online) */}
                {isOnline ? renderWalletWarning() : null}

                {/* Incoming order with countdown */}
                {isOnline ? renderIncomingOrder() : null}

                {/* Active batch */}
                {isOnline ? renderActiveBatch() : null}

                {/* Waiting state */}
                {isOnline && !currentBatch ? renderWaiting() : null}
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

  // Header
  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLogo: { width: 90, height: 30 },
  onlineDot: { width: 10, height: 10, borderRadius: 5 },
  headerNameWrap: { flexDirection: "row", alignItems: "center", gap: 4, flex: 1, justifyContent: "flex-end" },
  headerName: { color: "rgba(255,255,255,0.85)", maxWidth: 110 },

  // Earnings strip
  earningsStrip: {
    flexDirection: "row-reverse",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  earningsStripItem: { flex: 1, alignItems: "center" },
  earningsStripLabel: { color: "rgba(255,255,255,0.75)", fontSize: 10, marginBottom: 2 },
  earningsStripValue: { color: "#fff", fontWeight: "700", fontSize: 15 },
  earningsStripDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.25)", marginVertical: 2 },

  // Content
  content: { padding: Spacing.lg, gap: Spacing.md },

  // Status cards (pending/rejected)
  statusCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: "center",
    marginTop: Spacing.xl,
  },
  statusIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
  },

  // Toggle
  toggleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius["2xl"],
    borderWidth: 2,
  },
  toggleDot: { width: 10, height: 10, borderRadius: 5 },

  // Offline hero
  offlineHero: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: "center",
  },
  offlineIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  walletWarningBanner: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
    width: "100%",
  },

  // Wallet alert (online)
  walletAlertCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
  },
  walletAlertRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  whatsappBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: "#25D366",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
  },

  // Incoming order card
  incomingCard: {
    borderRadius: BorderRadius.xl,
    overflow: "hidden",
  },
  incomingBadgeRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  incomingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: AppColors.primary,
  },
  incomingBody: {
    flexDirection: "row-reverse",
    padding: Spacing.lg,
    gap: Spacing.md,
    alignItems: "flex-start",
  },
  countdownWrap: {
    position: "relative",
    width: 100,
    height: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  countdownCenter: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  incomingDetails: { flex: 1 },
  incomingStatRow: { flexDirection: "row-reverse", gap: Spacing.sm, marginBottom: Spacing.sm },
  incomingStatBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  incomingOrderRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: 6,
    borderTopWidth: 1,
  },
  seqDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  incomingActions: {
    flexDirection: "row-reverse",
    gap: Spacing.md,
    padding: Spacing.lg,
    paddingTop: 0,
  },
  rejectBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: "#F44336",
  },
  acceptBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    backgroundColor: AppColors.primary,
  },

  // Active batch
  activeBatchCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
  },
  activeBatchHeader: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  activeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  activePulse: { width: 8, height: 8, borderRadius: 4 },
  activeBatchMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  progressBar: { height: 5, borderRadius: 3, overflow: "hidden", marginBottom: Spacing.md },
  progressFill: { height: "100%" },
  activeBatchOrderRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: 6,
  },
  orderDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  manageBatchBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.md,
  },

  // Waiting
  waitingCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing["3xl"],
    alignItems: "center",
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  modalBox: {
    width: "100%",
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
  },
  modalHeaderRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.sm,
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  issueOption: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
});
