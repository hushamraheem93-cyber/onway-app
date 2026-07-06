import React, { useState, useEffect, useCallback, useRef } from "react";
import { io, Socket } from "socket.io-client";
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
import AsyncStorage from "@react-native-async-storage/async-storage";
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
import { AppColors, Spacing, BorderRadius, Shadows, FontWeight} from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";
import { playLoudAlert } from "@/lib/alertSound";
import { formatPrice } from "@/constants/currency";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

const COUNTDOWN_SECONDS = 30;
const RING_RADIUS = 42;
const RING_CIRC = 2 * Math.PI * RING_RADIUS;
const DRIVER_CACHE_KEY = "driver_home_cache_v1";

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
  serviceFee?: number;
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
  storeName?: string;
  storeAddress?: string;
  storePhone?: string;
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
  const [amountOwed, setAmountOwed] = useState(0);
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [issueModalVisible, setIssueModalVisible] = useState(false);
  const [issueSent, setIssueSent] = useState(false);
  const [issueSending, setIssueSending] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [issueOrderId, setIssueOrderId] = useState<string | null>(null);

  const [walletError, setWalletError] = useState("");
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevBatchIdRef = useRef<string | null>(null);
  const isInitialLoadRef = useRef(true);
  const isRejectingRef = useRef(false); // prevents double-rejection calls
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // ── Performance & auto-reconnect refs ──────────────────────────────────────
  // Tracks what the driver INTENDED (manual toggle) — used for auto-reconnect
  const isOnlineIntendedRef = useRef(false);
  // Tracks whether a toggle API call is in flight — prevents parallel reconnects
  const isTogglingRef = useRef(false);
  // Snapshot of last poll response — skips setState when nothing changed
  const lastPollKeyRef = useRef("");
  // Dynamic poll timeout handle
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // ── Load cached driver data on mount (shows UI before first API response) ───
  useEffect(() => {
    if (!phoneNumber) return;
    AsyncStorage.getItem(`${DRIVER_CACHE_KEY}_${phoneNumber}`)
      .then((raw) => {
        if (!raw) return;
        try {
          const cached = JSON.parse(raw);
          setDriverStatus(cached.driverStatus || "pending");
          setAmountOwed(cached.amountOwed || 0);
          setTodayEarnings(cached.todayEarnings || 0);
          setLoading(false); // show UI immediately from cache; real data will update silently
        } catch {}
      })
      .catch(() => {});
  }, [phoneNumber]);

  const triggerNewBatchAlert = useCallback((batch: CurrentBatch) => {
    Vibration.vibrate([0, 400, 200, 400, 200, 600]);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    playLoudAlert();
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

        // ── Auto-reconnect: driver intended to be online but server dropped them ──
        if (isOnlineIntendedRef.current && !data.isOnline && !isTogglingRef.current) {
          isTogglingRef.current = true;
          fetch(new URL("/api/driver/toggle-online", getApiUrl()).toString(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phoneNumber, goOnline: true }),
          })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?.isOnline) setQueuePosition(d.queuePosition ?? null); })
            .catch(() => {})
            .finally(() => { isTogglingRef.current = false; });
          return; // next poll will pick up the updated state
        }

        // ── Skip re-render when nothing meaningful changed ──────────────────────
        const newBatch: CurrentBatch | null = data.currentBatch || null;
        const pollKey = [
          data.isOnline ? 1 : 0,
          data.queuePosition ?? -1,
          newBatch?.id ?? "",
          newBatch?.status ?? "",
          newBatch?.completedOrders ?? 0,
          data.approvalStatus ?? "",
          data.amountOwed ?? 0,
          data.todayEarnings ?? 0,
        ].join("|");

        const isNew = pollKey !== lastPollKeyRef.current;
        lastPollKeyRef.current = pollKey;

        if (!isInitialLoadRef.current && newBatch && newBatch.id !== prevBatchIdRef.current) {
          triggerNewBatchAlert(newBatch);
        }
        prevBatchIdRef.current = newBatch ? newBatch.id : null;
        isInitialLoadRef.current = false;

        if (isNew) {
          setIsOnline(data.isOnline || false);
          setQueuePosition(data.queuePosition ?? null);
          setCurrentBatch(newBatch);
          currentBatchRef.current = newBatch;
          setDriverStatus(data.approvalStatus || "pending");
          setAmountOwed(data.amountOwed || 0);
          setTodayEarnings(data.todayEarnings || 0);
          // Persist basic driver info so next launch shows UI instantly
          if (phoneNumber) {
            AsyncStorage.setItem(`${DRIVER_CACHE_KEY}_${phoneNumber}`, JSON.stringify({
              driverStatus: data.approvalStatus || "pending",
              amountOwed: data.amountOwed || 0,
              todayEarnings: data.todayEarnings || 0,
            })).catch(() => {});
          }
        }
      }
    } catch (e) {
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
          return;
        }
        const tokenData = await Notifications.getExpoPushTokenAsync().catch(() => null);
        if (!tokenData?.data) {
          return;
        }
        await fetch(new URL("/api/driver/refresh-push-token", getApiUrl()).toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phoneNumber, pushToken: tokenData.data }),
        });
      } catch {
        // silent
      }
    })();
  }, [phoneNumber]);

  // ── Dynamic polling: 4s when online (fast batch detection), 10s when offline ──
  useEffect(() => {
    let cancelled = false;
    const schedule = async () => {
      if (cancelled) return;
      await fetchDriverStatus();
      if (cancelled) return;
      // Delay adapts: shorter when online so new batches arrive quickly
      const delay = isOnlineIntendedRef.current ? 4000 : 10000;
      pollTimeoutRef.current = setTimeout(schedule, delay);
    };
    schedule();
    return () => {
      cancelled = true;
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
  }, [fetchDriverStatus]);

  const gpsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentBatchRef = useRef<CurrentBatch | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const getLocationCoords = useCallback(async (): Promise<{ lat: number; lng: number } | null> => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== "granted") return null;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      return { lat: loc.coords.latitude, lng: loc.coords.longitude };
    } catch {
      return null;
    }
  }, []);

  const sendLocation = useCallback(async () => {
    if (!phoneNumber) return;
    const coords = await getLocationCoords();
    if (!coords) return;
    const { lat, lng } = coords;
    // Primary: socket.io (real-time, no HTTP overhead)
    if (socketRef.current?.connected) {
      socketRef.current.emit("driver:location", { phoneNumber, lat, lng });
      return;
    }
    // Fallback: HTTP POST (same endpoint as before)
    try {
      await fetch(new URL("/api/driver/location", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, lat, lng }),
      });
    } catch {}
  }, [phoneNumber, getLocationCoords]);

  useEffect(() => {
    if (isOnline) {
      (async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          sendLocation();
          const interval = currentBatchRef.current?.status === "in_progress" ? 5000 : 30000;
          gpsIntervalRef.current = setInterval(sendLocation, interval);
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

  // Adjust GPS send rate: 5s during active delivery batch, 30s when idle
  useEffect(() => {
    currentBatchRef.current = currentBatch;
    if (!isOnline || !gpsIntervalRef.current) return;
    const newRate = currentBatch?.status === "in_progress" ? 5000 : 30000;
    clearInterval(gpsIntervalRef.current);
    gpsIntervalRef.current = setInterval(sendLocation, newRate);
  }, [currentBatch?.id, currentBatch?.status, isOnline, sendLocation]);

  // Socket.io: connect when active batch is in_progress, disconnect when done
  useEffect(() => {
    const hasActiveBatch = isOnline && currentBatch?.status === "in_progress";

    if (hasActiveBatch && phoneNumber) {
      if (!socketRef.current || !socketRef.current.connected) {
        const baseUrl = getApiUrl();
        const sock = io(baseUrl, {
          transports: ["websocket", "polling"],
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 2000,
        });
        socketRef.current = sock;
      }
    } else {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    }

    return () => {
      // Only disconnect on unmount, not on every render
    };
  }, [isOnline, currentBatch?.status, phoneNumber]);

  // Disconnect socket when component unmounts
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  const handleToggleOnline = async () => {
    if (!phoneNumber || driverStatus !== "approved") return;
    if (isTogglingRef.current) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setWalletError("");

    const goOnline = !isOnline;
    // ── Optimistic update: flip UI immediately so button feels instant ──────────
    isTogglingRef.current = true;
    isOnlineIntendedRef.current = goOnline;
    setIsOnline(goOnline);
    lastPollKeyRef.current = ""; // force next poll to apply fresh data

    try {
      let pushToken: string | undefined;
      if (goOnline) {
        try {
          const tokenData = await Notifications.getExpoPushTokenAsync().catch(() => null);
          if (tokenData?.data) pushToken = tokenData.data;
        } catch (_e) {}
      }
      const res = await fetch(new URL("/api/driver/toggle-online", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, goOnline, pushToken }),
      });
      if (res.ok) {
        const data = await res.json();
        // Confirm with server truth
        setIsOnline(data.isOnline);
        isOnlineIntendedRef.current = data.isOnline;
        setQueuePosition(data.queuePosition ?? null);
      } else {
        // Revert optimistic update on error
        setIsOnline(!goOnline);
        isOnlineIntendedRef.current = !goOnline;
        const errorData = await res.json().catch(() => ({}));
        if (errorData.error) {
          setWalletError(errorData.error);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
      }
    } catch (e) {
      // Revert on network error
      setIsOnline(!goOnline);
      isOnlineIntendedRef.current = !goOnline;
    } finally {
      isTogglingRef.current = false;
    }
  };

  const handleAcceptBatch = async () => {
    if (!phoneNumber || !currentBatch || isAccepting) return;
    setIsAccepting(true);
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
      if (res.ok) {
        await fetchDriverStatus();
      } else {
        const err = await res.json().catch(() => ({}));
        console.error("accept batch failed:", res.status, err);
      }
    } catch (e) {
      console.error("accept batch error:", e);
    } finally {
      setIsAccepting(false);
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
    } finally {
      setIssueSending(false);
    }
  };

  const handleWhatsAppSupport = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const supportNumber = "9647702891104";
    const message = encodeURIComponent("مرحباً، أريد تسوية الحساب المالي في تطبيق OnWay");
    Linking.openURL(`https://wa.me/${supportNumber}?text=${message}`).catch(() => {
      Linking.openURL(`whatsapp://send?phone=${supportNumber}&text=${message}`).catch(() => {});
    });
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDriverStatus();
    setRefreshing(false);
  };

  if (loading) {
    const skeletonBg = isDark ? "#2a2a2a" : "#e8e8e8";
    const skeletonShine = isDark ? "#333333" : "#f0f0f0";
    const SkBox = ({ w, h, r = 8, mt = 0, mb = 0 }: { w: string | number; h: number; r?: number; mt?: number; mb?: number }) => (
      <View style={{ width: w as any, height: h, borderRadius: r, backgroundColor: skeletonBg, marginTop: mt, marginBottom: mb }} />
    );
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        {/* Header skeleton */}
        <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: AppColors.primary + "22" }}>
          <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 12 }}>
            <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: skeletonBg }} />
            <View style={{ flex: 1 }}>
              <SkBox w="55%" h={14} r={7} mb={6} />
              <SkBox w="35%" h={11} r={6} />
            </View>
            <SkBox w={80} h={36} r={18} />
          </View>
        </View>
        {/* Earnings strip skeleton */}
        <View style={{ backgroundColor: AppColors.primary + "15", paddingVertical: 14, paddingHorizontal: 16, flexDirection: "row-reverse", gap: 12, justifyContent: "space-around" }}>
          {[1, 2, 3].map(i => (
            <View key={i} style={{ alignItems: "center", gap: 6 }}>
              <SkBox w={60} h={11} r={6} />
              <SkBox w={80} h={18} r={8} />
            </View>
          ))}
        </View>
        {/* Toggle button skeleton */}
        <View style={{ margin: 16 }}>
          <SkBox w="100%" h={64} r={16} />
        </View>
        {/* Status card skeleton */}
        <View style={{ marginHorizontal: 16 }}>
          <SkBox w="100%" h={160} r={16} />
        </View>
        {/* Bottom hint */}
        <View style={{ alignItems: "center", marginTop: 24 }}>
          <ActivityIndicator size="small" color={AppColors.primary} />
        </View>
      </View>
    );
  }

  // ─── Earning ring color based on countdown ──────────────────────────────────
  const countdownProgress = countdown / COUNTDOWN_SECONDS;
  const ringColor = countdown > 15 ? AppColors.primary : countdown > 8 ? AppColors.warning : AppColors.error;
  const ringDashoffset = RING_CIRC * (1 - countdownProgress);

  // ────────────────────────────────────────────────────────────────────────────
  // RENDER SECTIONS
  // ────────────────────────────────────────────────────────────────────────────

  const renderStatusPending = () => (
    <View style={[styles.statusCard, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
      <View style={[styles.statusIconWrap, { backgroundColor: AppColors.secondary }]}>
        <Feather name="clock" size={36} color={AppColors.warning} />
      </View>
      <ThemedText type="h3" style={{ color: theme.text, marginTop: Spacing.md }}>قيد المراجعة</ThemedText>
      <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center", marginTop: Spacing.sm }}>
        حسابك قيد المراجعة من قبل الإدارة. سيتم إبلاغك عند الموافقة.
      </ThemedText>
    </View>
  );

  const renderStatusRejected = () => (
    <View style={[styles.statusCard, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
      <View style={[styles.statusIconWrap, { backgroundColor: AppColors.errorLight }]}>
        <Feather name="x-circle" size={36} color={AppColors.error} />
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
        <ThemedText type="small" style={styles.earningsStripLabel}>المستحق</ThemedText>
        <ThemedText type="h3" style={[styles.earningsStripValue,
          amountOwed >= 50000 ? { color: AppColors.errorLight } :
          amountOwed >= 40000 ? { color: AppColors.secondary } :
          amountOwed >= 30000 ? { color: AppColors.warningLight } : null]}>
          {formatPrice(amountOwed)}
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
        <Feather name="truck" size={44} color={isDark ? AppColors.gray500 : AppColors.gray300} />
      </View>
      <ThemedText type="h3" style={{ color: theme.text, marginTop: Spacing.lg }}>أنت غير متصل</ThemedText>
      <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center", marginTop: Spacing.sm, marginBottom: Spacing.xl }}>
        شغّل زر الاتصال لبدء استقبال الطلبات
      </ThemedText>
      {amountOwed >= 50000 ? (
        <View style={[styles.walletWarningBanner, { backgroundColor: AppColors.errorLight }]}>
          <Feather name="x-circle" size={14} color={AppColors.error} />
          <ThemedText type="small" style={{ color: AppColors.error, flex: 1, textAlign: "right", marginRight: 4 }}>
            الحساب موقوف — المستحق {formatPrice(amountOwed)} — تواصل مع الإدارة فوراً
          </ThemedText>
        </View>
      ) : amountOwed >= 40000 ? (
        <View style={[styles.walletWarningBanner, { backgroundColor: AppColors.secondary }]}>
          <Feather name="alert-triangle" size={14} color={AppColors.primary} />
          <ThemedText type="small" style={{ color: AppColors.primary, flex: 1, textAlign: "right", marginRight: 4 }}>
            المستحقات مرتفعة {formatPrice(amountOwed)} — سارع للتسوية
          </ThemedText>
        </View>
      ) : amountOwed >= 30000 ? (
        <View style={[styles.walletWarningBanner, { backgroundColor: AppColors.warningLight }]}>
          <Feather name="alert-circle" size={14} color={AppColors.warning} />
          <ThemedText type="small" style={{ color: AppColors.warning, flex: 1, textAlign: "right", marginRight: 4 }}>
            توجد مستحقات {formatPrice(amountOwed)} — يُطلب التسوية
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
          backgroundColor: isOnline ? AppColors.primary : (isDark ? theme.backgroundSecondary : AppColors.gray50),
          borderColor: isOnline ? AppColors.primary : theme.border,
        },
      ]}
      testID="button-toggle-online"
    >
      {isToggling ? (
        <ActivityIndicator size="small" color={isOnline ? AppColors.white : AppColors.primary} />
      ) : (
        <>
          <View style={[styles.toggleDot, { backgroundColor: isOnline ? AppColors.white : AppColors.gray300 }]} />
          <ThemedText type="h3" style={{ color: isOnline ? AppColors.white : theme.text, fontWeight: FontWeight.bold }}>
            {isOnline ? "متصل" : "غير متصل"}
          </ThemedText>
          <Feather name={isOnline ? "wifi" : "wifi-off"} size={22} color={isOnline ? AppColors.white : AppColors.gray300} />
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
          <ThemedText type="body" style={{ color: AppColors.primary, fontWeight: FontWeight.xBold, flex: 1, textAlign: "right" }}>
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
              <ThemedText type="h2" style={{ color: ringColor, fontWeight: FontWeight.xBold }}>{countdown}</ThemedText>
              <ThemedText style={{ fontSize: 9, color: theme.textSecondary }}>ثانية</ThemedText>
            </View>
          </View>

          {/* Order summary */}
          <View style={styles.incomingDetails}>
            <View style={styles.incomingStatRow}>
              <View style={[styles.incomingStatBadge, { backgroundColor: "#4CAF5018" }]}>
                <Feather name="package" size={14} color={AppColors.success} />
                <ThemedText type="small" style={{ color: AppColors.success, fontWeight: FontWeight.bold }}>
                  {currentBatch.totalOrders} طلبات
                </ThemedText>
              </View>
              <View style={[styles.incomingStatBadge, { backgroundColor: AppColors.primary + "18" }]}>
                <Feather name="dollar-sign" size={14} color={AppColors.primary} />
                <ThemedText type="small" style={{ color: AppColors.primary, fontWeight: FontWeight.bold }}>
                  {formatPrice(estimatedEarning)}
                </ThemedText>
              </View>
            </View>

            {currentBatch.orders.slice(0, 2).map((order, idx) => (
              <View key={order.id} style={[styles.incomingOrderRow, idx === 0 && { borderTopWidth: 0 }, { borderTopColor: theme.border }]}>
                <View style={[styles.seqDot, { backgroundColor: AppColors.primary }]}>
                  <ThemedText style={{ color: AppColors.white, fontSize: 10, fontWeight: FontWeight.xBold }}>{order.deliverySequence}</ThemedText>
                </View>
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <ThemedText type="body" style={{ color: theme.text, fontWeight: FontWeight.bold }} numberOfLines={1}>
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
            <Feather name="x" size={18} color={AppColors.error} />
            <ThemedText type="body" style={{ color: AppColors.error, fontWeight: FontWeight.bold }}>رفض</ThemedText>
          </Pressable>
          <Pressable
            style={[styles.acceptBtn, { opacity: isAccepting ? 0.75 : 1 }]}
            onPress={handleAcceptBatch}
            disabled={isAccepting}
            testID="button-accept-batch"
          >
            {isAccepting ? (
              <ActivityIndicator size="small" color={AppColors.white} />
            ) : (
              <>
                <Feather name="check" size={20} color={AppColors.white} />
                <ThemedText type="h4" style={{ color: AppColors.white, fontWeight: FontWeight.xBold }}>قبول الطلب</ThemedText>
              </>
            )}
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
            <View style={[styles.activePulse, { backgroundColor: AppColors.statusPurple }]} />
            <ThemedText type="small" style={{ color: AppColors.statusPurple, fontWeight: FontWeight.bold }}>جارٍ التوصيل</ThemedText>
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
              backgroundColor: AppColors.statusPurple,
            }]}
          />
        </View>

        {/* Orders mini list */}
        <View style={{ marginTop: Spacing.sm }}>
          {currentBatch.orders.slice(0, 3).map((order) => {
            const done = order.status === "delivered";
            const active = order.status === "in_delivery" || order.status === "picked_up";
            const dotColor = done ? AppColors.success : active ? AppColors.info : AppColors.gray300;
            return (
              <View key={order.id} style={styles.activeBatchOrderRow}>
                <View style={[styles.orderDot, { backgroundColor: dotColor }]}>
                  {done ? <Feather name="check" size={10} color={AppColors.white} /> : null}
                </View>
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <ThemedText type="body" style={{ color: done ? theme.textSecondary : theme.text, fontWeight: done ? "400" : "600", textDecorationLine: done ? "line-through" : "none" }} numberOfLines={1}>
                    {order.customerName || "زبون"}
                  </ThemedText>
                  <ThemedText type="small" style={{ color: theme.textSecondary }} numberOfLines={1}>
                    {order.region || order.address}
                  </ThemedText>
                </View>
                <ThemedText type="small" style={{ color: dotColor, fontWeight: FontWeight.bold }}>
                  {done ? "تم" : active ? "جارٍ" : "لاحقاً"}
                </ThemedText>
              </View>
            );
          })}
        </View>

        <Pressable
          style={[styles.manageBatchBtn, { backgroundColor: AppColors.statusPurple }]}
          onPress={() => navigation.navigate("DriverBatch", { batch: currentBatch })}
          testID="button-manage-batch"
        >
          <Feather name="navigation" size={18} color={AppColors.white} />
          <ThemedText type="h4" style={{ color: AppColors.white, fontWeight: FontWeight.bold }}>إدارة التوصيل</ThemedText>
          <Feather name="chevron-left" size={18} color={AppColors.white} />
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

  // ── Amount owed warning (shown while online) ─────────────────────────────────
  const renderWalletWarning = () => {
    if (amountOwed < 30000) return null;
    const isBlocked   = amountOwed >= 50000;
    const isHigh      = amountOwed >= 40000;
    const cardBg      = isBlocked ? AppColors.errorLight : isHigh ? AppColors.secondary : AppColors.warningLight;
    const textColor   = isBlocked ? AppColors.error : isHigh ? AppColors.primary : AppColors.warning;
    const iconName: keyof typeof Feather.glyphMap = isBlocked ? "x-circle" : isHigh ? "alert-triangle" : "alert-circle";
    const title       = isBlocked ? "الحساب موقوف" : isHigh ? "المستحقات مرتفعة" : "توجد مستحقات";
    const subtitle    = isBlocked
      ? `المستحق ${formatPrice(amountOwed)} — تواصل فوراً`
      : isHigh
      ? `${formatPrice(amountOwed)} — سارع للتسوية قبل الحجب`
      : `${formatPrice(amountOwed)} — يُطلب التسوية`;
    return (
      <View style={[styles.walletAlertCard, { backgroundColor: cardBg }, Shadows.sm]}>
        <View style={styles.walletAlertRow}>
          <Feather name={iconName} size={18} color={textColor} />
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <ThemedText type="body" style={{ color: textColor, fontWeight: FontWeight.bold }}>{title}</ThemedText>
            <ThemedText type="small" style={{ color: textColor }}>{subtitle}</ThemedText>
          </View>
        </View>
        <Pressable onPress={handleWhatsAppSupport} style={[styles.whatsappBtn, { backgroundColor: textColor }]} testID="button-whatsapp-support">
          <Feather name="message-circle" size={18} color={AppColors.white} />
          <ThemedText type="body" style={{ color: AppColors.white, fontWeight: FontWeight.bold }}>تواصل مع الإدارة عبر واتساب</ThemedText>
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
          <View style={[styles.onlineDot, { backgroundColor: isOnline ? AppColors.success : AppColors.gray500 }]} />
          <Image source={require("../assets/images/onway-header-logo-transparent.png")} style={styles.headerLogo} contentFit="contain" />
          <View style={styles.headerNameWrap}>
            <Feather name="user" size={13} color={AppColors.textOnBrandMuted} />
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
                <View style={[styles.statusIconWrap, { backgroundColor: AppColors.successLight }]}>
                  <Feather name="check-circle" size={36} color={AppColors.success} />
                </View>
                <ThemedText type="h4" style={{ color: AppColors.success, marginTop: Spacing.md }}>تم إرسال المشكلة</ThemedText>
              </View>
            ) : (
              <>
                <View style={styles.modalHeaderRow}>
                  <Feather name="alert-triangle" size={20} color={AppColors.primary} />
                  <ThemedText type="h4" style={{ color: theme.text, fontWeight: FontWeight.bold }}>إبلاغ عن مشكلة</ThemedText>
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
                    <ThemedText type="body" style={{ color: theme.text, fontWeight: FontWeight.semiBold, flex: 1, textAlign: "right" }}>
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
  headerLogo: { width: 130, height: 50 },
  onlineDot: { width: 10, height: 10, borderRadius: 5 },
  headerNameWrap: { flexDirection: "row", alignItems: "center", gap: 4, flex: 1, justifyContent: "flex-end" },
  headerName: { color: AppColors.textOnBrandSubtle, maxWidth: 110 },

  // Earnings strip
  earningsStrip: {
    flexDirection: "row-reverse",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  earningsStripItem: { flex: 1, alignItems: "center" },
  earningsStripLabel: { color: "rgba(255,255,255,0.75)", fontSize: 10, marginBottom: 2 },
  earningsStripValue: { color: AppColors.white, fontWeight: FontWeight.bold, fontSize: 15 },
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
    backgroundColor: AppColors.whatsapp,
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
    borderColor: AppColors.error,
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
    backgroundColor: AppColors.overlay,
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
