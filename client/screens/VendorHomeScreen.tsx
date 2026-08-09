import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  ComponentProps,
} from "react";
import {
  Alert,
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Image,
  Modal,
  TextInput,
  Animated,
} from "react-native";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";

type MCIcon = ComponentProps<typeof MaterialCommunityIcons>["name"];

import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { BUSINESS_LABELS } from "@/constants/businessCategories";
import { useVendorNotifications } from "@/context/VendorNotificationsContext";
import { getApiUrl } from "@/lib/query-client";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { AppColors, Shadows, FontFamily } from "@/constants/theme";

const ORANGE = AppColors.primary;
const POLL_INTERVAL_MS = 30_000;

/**
 * The message the server sent with a failed response (H-30).
 * Falls back to a neutral retry hint when the body is not the usual { error }.
 */
async function serverError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: unknown } | null;
  return typeof data?.error === "string" && data.error.trim()
    ? data.error
    : "حاول مرة أخرى";
}

const CONNECTION_ERROR =
  "تعذّر الاتصال بالخادم، تحقّق من الإنترنت وحاول مجدداً";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrderStats {
  totalOrders: number;
  pendingOrders: number;
  preparingOrders: number;
  readyOrders: number;
  totalRevenue: number;
  rating: number | null;
  ratingCount: number;
}

interface VendorNotification {
  id: string;
  vendorId: string;
  type: string;
  title: string;
  message: string;
  status: "unread" | "read";
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function notifTheme(type: string): {
  bg: string;
  border: string;
  icon: MCIcon;
  iconColor: string;
} {
  if (type === "vendor_active")
    return {
      bg: AppColors.successLight,
      border: AppColors.success,
      icon: "check-circle",
      iconColor: AppColors.success,
    };
  if (type === "vendor_rejected")
    return {
      bg: AppColors.errorLight,
      border: AppColors.error,
      icon: "close-circle",
      iconColor: AppColors.error,
    };
  if (type === "vendor_suspended")
    return {
      bg: AppColors.warningLight,
      border: AppColors.warning,
      icon: "alert-circle",
      iconColor: AppColors.warning,
    };
  if (type === "product_approved")
    return {
      bg: AppColors.successLight,
      border: AppColors.success,
      icon: "check-circle",
      iconColor: AppColors.success,
    };
  if (type === "product_rejected")
    return {
      bg: AppColors.errorLight,
      border: AppColors.error,
      icon: "close-circle",
      iconColor: AppColors.error,
    };
  return {
    bg: AppColors.secondary,
    border: AppColors.primaryLight,
    icon: "bell",
    iconColor: ORANGE,
  };
}

function formatRevenue(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}م`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(0)}k`;
  return String(val);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const SectionHeader = React.memo(({ title }: { title: string }) => (
  <View style={sc.sectionHeader}>
    <View style={sc.accent} />
    <ThemedText style={sc.sectionTitle}>{title}</ThemedText>
  </View>
));

const StatCard = React.memo(
  ({
    icon,
    iconBg,
    iconColor,
    value,
    label,
    pulse,
    onPress,
    testID,
  }: {
    icon: MCIcon;
    iconBg: string;
    iconColor: string;
    value: string | number;
    label: string;
    pulse?: boolean;
    onPress?: () => void;
    testID?: string;
  }) => (
    <Pressable
      style={({ pressed }) => [sc.statCard, { opacity: pressed ? 0.85 : 1 }]}
      onPress={onPress}
      testID={testID}
    >
      <View style={[sc.statIconBox, { backgroundColor: iconBg }]}>
        <MaterialCommunityIcons name={icon} size={22} color={iconColor} />
      </View>
      <ThemedText style={[sc.statValue, { color: iconColor }]}>
        {value}
      </ThemedText>
      <ThemedText style={sc.statLabel}>{label}</ThemedText>
      {pulse && <View style={[sc.pulseDot, { backgroundColor: iconColor }]} />}
    </Pressable>
  ),
);

const QuickActionCard = React.memo(
  ({
    icon,
    label,
    sublabel,
    color,
    bg,
    onPress,
  }: {
    icon: MCIcon;
    label: string;
    sublabel?: string;
    color: string;
    bg: string;
    onPress: () => void;
  }) => (
    <Pressable
      style={({ pressed }) => [
        sc.quickCard,
        { backgroundColor: bg, opacity: pressed ? 0.82 : 1 },
      ]}
      onPress={onPress}
    >
      <View style={[sc.quickIconBox, { backgroundColor: color + "20" }]}>
        <MaterialCommunityIcons name={icon} size={26} color={color} />
      </View>
      <ThemedText style={[sc.quickLabel, { color }]}>{label}</ThemedText>
      {sublabel ? (
        <ThemedText style={sc.quickSublabel}>{sublabel}</ThemedText>
      ) : null}
    </Pressable>
  ),
);

const AvailabilityChip = React.memo(
  ({
    active,
    loading,
    label,
    activeLabel,
    icon,
    activeColor,
    onPress,
    testID,
  }: {
    active: boolean;
    loading: boolean;
    label: string;
    activeLabel: string;
    icon: MCIcon;
    activeColor: string;
    onPress: () => void;
    testID?: string;
  }) => (
    <Pressable
      onPress={onPress}
      disabled={loading}
      testID={testID}
      style={({ pressed }) => [
        sc.availChip,
        {
          backgroundColor: active ? activeColor + "15" : AppColors.gray50,
          borderColor: active ? activeColor : AppColors.gray200,
          opacity: pressed || loading ? 0.7 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={active ? activeColor : AppColors.gray400}
        />
      ) : (
        <MaterialCommunityIcons
          name={icon}
          size={18}
          color={active ? activeColor : AppColors.gray400}
        />
      )}
      <ThemedText
        style={[
          sc.availLabel,
          { color: active ? activeColor : AppColors.gray500 },
        ]}
      >
        {active ? activeLabel : label}
      </ThemedText>
      <View
        style={[
          sc.availDot,
          { backgroundColor: active ? activeColor : AppColors.gray300 },
        ]}
      />
    </Pressable>
  ),
);

const StatusBadge = React.memo(
  ({ label, color, bg }: { label: string; color: string; bg: string }) => (
    <View style={[sc.statusBadge, { backgroundColor: bg }]}>
      <View style={[sc.statusDot, { backgroundColor: color }]} />
      <ThemedText style={[sc.statusText, { color }]}>{label}</ThemedText>
    </View>
  ),
);

const SkeletonBox = ({ style }: { style?: any }) => {
  const anim = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0.4,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);
  return (
    <Animated.View
      style={[
        { borderRadius: 12, backgroundColor: AppColors.gray100 },
        style,
        { opacity: anim },
      ]}
    />
  );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function VendorHomeScreen({ navigation }: any) {
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const { vendorProfile, vendorToken, refreshVendorProfile } = useAuth();
  const { setUnreadCount } = useVendorNotifications();

  const handleNotificationTap = useCallback(() => {
    navigation.navigate("VendorOrdersTab");
  }, [navigation]);
  usePushNotifications(handleNotificationTap);

  // ── State ──────────────────────────────────────────────────────────────────
  const [orderStats, setOrderStats] = useState<OrderStats>({
    totalOrders: 0,
    pendingOrders: 0,
    preparingOrders: 0,
    readyOrders: 0,
    totalRevenue: 0,
    rating: null,
    ratingCount: 0,
  });
  const [analyticsData, setAnalyticsData] = useState<{
    todayOrders: number;
    todaySales: number;
    weekOrders: number;
    weekSales: number;
    bestSellers: { name: string; count: number }[];
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<VendorNotification[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [togglingAvailability, setTogglingAvailability] = useState(false);
  const [optimisticVacation, setOptimisticVacation] = useState<boolean | null>(
    null,
  );
  const [optimisticBusy, setOptimisticBusy] = useState<boolean | null>(null);

  // Bio modal (kept for profile editing from home)
  const [bioModalVisible, setBioModalVisible] = useState(false);
  const [bioText, setBioText] = useState(vendorProfile?.bio || "");
  const [savingBio, setSavingBio] = useState(false);

  // Store settings modal
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [settDeliveryTime, setSettDeliveryTime] = useState(
    vendorProfile?.deliveryTime || "30-45",
  );
  const [settDeliveryPrice, setSettDeliveryPrice] = useState(
    String(vendorProfile?.deliveryPrice ?? 0),
  );
  const defaultWh = vendorProfile?.workingHours ?? {
    openTime: "09:00",
    closeTime: "22:00",
    openDays: [0, 1, 2, 3, 4, 5, 6],
  };
  const [settOpenTime, setSettOpenTime] = useState(defaultWh.openTime);
  const [settCloseTime, setSettCloseTime] = useState(defaultWh.closeTime);
  const [settOpenDays, setSettOpenDays] = useState<number[]>(
    defaultWh.openDays,
  );
  const [settingsUseHours, setSettingsUseHours] = useState(
    !!vendorProfile?.workingHours,
  );
  const [savingSettings, setSavingSettings] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Sync ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    setDismissedIds(new Set());
    setNotifications([]);
  }, [vendorToken]);
  useEffect(() => {
    setBioText(vendorProfile?.bio || "");
  }, [vendorProfile?.bio]);

  // ── Data loaders ───────────────────────────────────────────────────────────
  const loadOrderStats = useCallback(async () => {
    if (!vendorToken) return;
    try {
      const res = await fetch(
        new URL("/api/vendor/stats", getApiUrl()).toString(),
        {
          headers: { Authorization: `Bearer ${vendorToken}` },
        },
      );
      if (!res.ok) return;
      const data = await res.json();
      setOrderStats({
        totalOrders: data.totalOrders ?? 0,
        pendingOrders: data.pendingOrders ?? 0,
        preparingOrders: data.preparingOrders ?? 0,
        readyOrders: data.readyOrders ?? 0,
        totalRevenue: data.totalRevenue ?? 0,
        rating: data.rating ?? null,
        ratingCount: data.ratingCount ?? 0,
      });
    } catch {}
  }, [vendorToken]);

  const loadAnalytics = useCallback(async () => {
    if (!vendorToken) return;
    try {
      const res = await fetch(
        new URL("/api/vendor/analytics", getApiUrl()).toString(),
        {
          headers: { Authorization: `Bearer ${vendorToken}` },
        },
      );
      if (!res.ok) return;
      const data = await res.json();
      setAnalyticsData(data);
    } catch {}
  }, [vendorToken]);

  const loadNotifications = useCallback(async () => {
    if (!vendorToken) return;
    try {
      const res = await fetch(
        new URL("/api/vendor/notifications", getApiUrl()).toString(),
        {
          headers: { Authorization: `Bearer ${vendorToken}` },
        },
      );
      if (!res.ok) return;
      const data = await res.json();
      const all: VendorNotification[] = data.notifications || [];
      const unread = all.filter((n) => n.status === "unread");
      setNotifications(unread);
      setUnreadCount(unread.length);
      const hasStatusChange = unread.some(
        (n) =>
          n.type === "vendor_active" ||
          n.type === "vendor_rejected" ||
          n.type === "vendor_suspended",
      );
      if (hasStatusChange) refreshVendorProfile();
    } catch {}
  }, [vendorToken, refreshVendorProfile, setUnreadCount]);

  const markNotificationsRead = useCallback(
    async (ids: string[]) => {
      if (!vendorToken || ids.length === 0) return;
      try {
        await fetch(
          new URL(
            "/api/vendor/notifications/mark-read",
            getApiUrl(),
          ).toString(),
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${vendorToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ ids }),
          },
        );
      } catch {}
    },
    [vendorToken],
  );

  const dismissNotification = useCallback(
    (notif: VendorNotification) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setDismissedIds((prev) => new Set([...prev, notif.id]));
      setUnreadCount((c) => Math.max(0, c - 1));
      markNotificationsRead([notif.id]);
    },
    [markNotificationsRead, setUnreadCount],
  );

  useFocusEffect(
    useCallback(() => {
      if (!vendorToken) return;
      refreshVendorProfile();
      Promise.all([
        loadOrderStats(),
        loadNotifications(),
        loadAnalytics(),
      ]).finally(() => setLoading(false));
      pollRef.current = setInterval(() => {
        loadNotifications();
      }, POLL_INTERVAL_MS);
      return () => {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      };
    }, [
      vendorToken,
      loadOrderStats,
      loadNotifications,
      loadAnalytics,
      refreshVendorProfile,
    ]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      loadOrderStats(),
      loadNotifications(),
      loadAnalytics(),
      refreshVendorProfile(),
    ]);
    setRefreshing(false);
  }, [loadOrderStats, loadNotifications, loadAnalytics, refreshVendorProfile]);

  // ── Image upload ───────────────────────────────────────────────────────────
  const uploadImage = useCallback(
    async (type: "profileImage" | "coverImage") => {
      if (!vendorToken) return;
      const setter = type === "profileImage" ? setUploadingAvatar : () => {};
      setter(true);
      try {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: "images",
          allowsEditing: true,
          aspect: type === "profileImage" ? [1, 1] : [3, 1],
          quality: 0.85,
        });
        if (result.canceled || !result.assets?.[0]) return;
        const asset = result.assets[0];
        const formData = new FormData();
        formData.append(type, {
          uri: asset.uri,
          type: "image/jpeg",
          name: `${type}.jpg`,
        } as any);
        const res = await fetch(
          new URL("/api/vendor/profile/images", getApiUrl()).toString(),
          {
            method: "POST",
            headers: { Authorization: `Bearer ${vendorToken}` },
            body: formData,
          },
        );
        if (res.ok) {
          await refreshVendorProfile();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } catch {
      } finally {
        setter(false);
      }
    },
    [vendorToken, refreshVendorProfile],
  );

  // ── Bio / Settings save ────────────────────────────────────────────────────
  const saveBio = async () => {
    if (!vendorToken) return;
    setSavingBio(true);
    try {
      await fetch(new URL("/api/vendor/profile", getApiUrl()).toString(), {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${vendorToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ bio: bioText }),
      });
      await refreshVendorProfile();
      setBioModalVisible(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
    } finally {
      setSavingBio(false);
    }
  };

  const saveStoreSettings = async () => {
    if (!vendorToken) return;
    setSavingSettings(true);
    try {
      const body: any = {
        deliveryTime: settDeliveryTime.trim(),
        deliveryPrice: Number(settDeliveryPrice) || 0,
        workingHours: settingsUseHours
          ? {
              openTime: settOpenTime,
              closeTime: settCloseTime,
              openDays: settOpenDays,
            }
          : null,
      };
      const res = await fetch(
        new URL("/api/vendor/profile", getApiUrl()).toString(),
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${vendorToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );
      // H-30: the response was never checked. An expired session (401), a
      // suspended store (403 — PATCH is not a pre-approval route) or a server
      // error all closed the modal with a success buzz while nothing was saved.
      // The modal deliberately stays open so the entered values are not lost.
      if (!res.ok) {
        Alert.alert("تعذّر حفظ الإعدادات", await serverError(res));
        return;
      }
      await refreshVendorProfile();
      setSettingsVisible(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("خطأ", CONNECTION_ERROR);
    } finally {
      setSavingSettings(false);
    }
  };

  const toggleAvailability = useCallback(
    async (field: "isVacation" | "isBusy", value: boolean) => {
      if (!vendorToken || togglingAvailability) return;
      if (field === "isVacation") setOptimisticVacation(value);
      else setOptimisticBusy(value);
      setTogglingAvailability(true);
      try {
        const res = await fetch(
          new URL("/api/vendor/availability", getApiUrl()).toString(),
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${vendorToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ [field]: value }),
          },
        );
        // H-30: a rejected toggle still buzzed "success". Vacation mode is what
        // POST /api/orders checks, so a silently-failed toggle leaves the store
        // taking orders it will not fulfil. `finally` already rolls the
        // optimistic switch back, so only the message is missing here.
        if (!res.ok) {
          Alert.alert(
            field === "isVacation"
              ? "تعذّر تغيير وضع الإجازة"
              : "تعذّر تغيير حالة الانشغال",
            await serverError(res),
          );
          return;
        }
        await refreshVendorProfile();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        Alert.alert("خطأ", CONNECTION_ERROR);
        if (field === "isVacation") setOptimisticVacation(null);
        else setOptimisticBusy(null);
      } finally {
        setTogglingAvailability(false);
        if (field === "isVacation") setOptimisticVacation(null);
        else setOptimisticBusy(null);
      }
    },
    [vendorToken, togglingAvailability, refreshVendorProfile],
  );

  // ── Derived ────────────────────────────────────────────────────────────────
  const isPending = vendorProfile?.status === "pending";
  const isRejected = vendorProfile?.status === "rejected";
  const isSuspended = vendorProfile?.status === "suspended";
  const visibleNotifications = notifications.filter(
    (n) => !dismissedIds.has(n.id),
  );

  const statusLabel = isPending
    ? "قيد المراجعة"
    : isRejected
      ? "مرفوض"
      : isSuspended
        ? "موقوف"
        : "نشط";
  const statusColor = isPending
    ? AppColors.warning
    : isRejected
      ? AppColors.error
      : isSuspended
        ? AppColors.warning
        : AppColors.success;
  const statusBg = isPending
    ? AppColors.warningLight
    : isRejected
      ? AppColors.errorLight
      : isSuspended
        ? AppColors.warningLight
        : AppColors.successLight;

  const avatarUrl = vendorProfile?.profileImageUrl
    ? new URL(vendorProfile.profileImageUrl, getApiUrl()).toString()
    : null;

  const isVacation =
    optimisticVacation !== null
      ? optimisticVacation
      : !!vendorProfile?.isVacation;
  const isBusy =
    optimisticBusy !== null ? optimisticBusy : !!vendorProfile?.isBusy;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <ScrollView
        style={sc.root}
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingBottom: tabBarHeight + 24,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={ORANGE}
            progressViewOffset={insets.top}
          />
        }
      >
        {/* ── HEADER ─────────────────────────────────────────────────────── */}
        <View style={sc.header}>
          {/* Avatar */}
          <Pressable
            onPress={() => uploadImage("profileImage")}
            style={sc.avatarWrap}
            testID="button-edit-avatar"
          >
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={sc.avatar} />
            ) : (
              <View style={sc.avatarPlaceholder}>
                <ThemedText style={sc.avatarLetter}>
                  {vendorProfile?.storeName?.[0] || "م"}
                </ThemedText>
              </View>
            )}
            {uploadingAvatar ? (
              <View style={sc.avatarOverlay}>
                <ActivityIndicator size="small" color={AppColors.white} />
              </View>
            ) : (
              <View style={sc.cameraChip}>
                <Feather name="camera" size={10} color={AppColors.white} />
              </View>
            )}
          </Pressable>

          {/* Store info */}
          <View style={sc.headerInfo}>
            <ThemedText
              style={sc.storeName}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {vendorProfile?.storeName || "متجري"}
            </ThemedText>
            <ThemedText style={sc.businessType}>
              {BUSINESS_LABELS[vendorProfile?.businessType || ""] || "متجر"}
            </ThemedText>
            <StatusBadge
              label={statusLabel}
              color={statusColor}
              bg={statusBg}
            />
          </View>

          {/* Actions */}
          <View style={sc.headerActions}>
            <Pressable
              style={sc.headerBtn}
              onPress={() => navigation.navigate("VendorOrdersTab")}
            >
              <Feather name="bell" size={20} color={AppColors.gray600} />
            </Pressable>
            <Pressable
              style={sc.headerBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSettDeliveryTime(vendorProfile?.deliveryTime || "30-45");
                setSettDeliveryPrice(String(vendorProfile?.deliveryPrice ?? 0));
                const wh = vendorProfile?.workingHours;
                setSettingsUseHours(!!wh);
                setSettOpenTime(wh?.openTime || "09:00");
                setSettCloseTime(wh?.closeTime || "22:00");
                setSettOpenDays(wh?.openDays ?? [0, 1, 2, 3, 4, 5, 6]);
                setSettingsVisible(true);
              }}
            >
              <Feather name="settings" size={20} color={AppColors.gray600} />
            </Pressable>
          </View>
        </View>

        <View style={sc.body}>
          {/* ── NOTIFICATION BANNERS ──────────────────────────────────────── */}
          {visibleNotifications.length > 0 && (
            <View
              style={{ gap: 10, marginBottom: 16 }}
              testID="notifications-list"
            >
              {visibleNotifications.map((notif) => {
                const t = notifTheme(notif.type);
                return (
                  <View
                    key={notif.id}
                    style={[
                      sc.notifBanner,
                      { backgroundColor: t.bg, borderColor: t.border },
                    ]}
                    testID={`notification-${notif.id}`}
                  >
                    <MaterialCommunityIcons
                      name={t.icon}
                      size={20}
                      color={t.iconColor}
                      style={{ marginTop: 1 }}
                    />
                    <View style={{ flex: 1 }}>
                      <ThemedText
                        style={[sc.notifTitle, { color: t.iconColor }]}
                      >
                        {notif.title}
                      </ThemedText>
                      <ThemedText style={sc.notifMsg}>
                        {notif.message}
                      </ThemedText>
                    </View>
                    <Pressable
                      onPress={() => dismissNotification(notif)}
                      hitSlop={10}
                      testID={`button-dismiss-notification-${notif.id}`}
                    >
                      <Feather name="x" size={16} color={AppColors.gray400} />
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}

          {/* ── PENDING NOTICE ────────────────────────────────────────────── */}
          {isPending && (
            <View style={sc.pendingBanner}>
              <MaterialCommunityIcons
                name="clock-outline"
                size={20}
                color={AppColors.warning}
              />
              <View style={{ flex: 1 }}>
                <ThemedText style={sc.pendingTitle}>
                  حسابك قيد المراجعة من الإدارة
                </ThemedText>
                <ThemedText style={sc.pendingBody}>
                  يمكنك الآن إضافة منتجاتك — ستظهر للزبائن بعد تفعيل الحساب
                </ThemedText>
              </View>
            </View>
          )}

          {/* ── SECTION 1: LIVE STATS ─────────────────────────────────────── */}
          <SectionHeader title="إحصائيات الآن" />
          {loading ? (
            <View style={sc.statsGrid}>
              {[0, 1, 2, 3].map((i) => (
                <SkeletonBox key={i} style={{ width: "47%", height: 110 }} />
              ))}
            </View>
          ) : (
            <View style={sc.statsGrid} testID="stats-grid">
              <StatCard
                icon="bell-ring"
                iconBg={AppColors.warningLight}
                iconColor={AppColors.warning}
                value={orderStats.pendingOrders}
                label="طلبات جديدة"
                pulse={orderStats.pendingOrders > 0}
                onPress={() => navigation.navigate("VendorOrdersTab")}
                testID="stat-pending"
              />
              <StatCard
                icon="chef-hat"
                iconBg={AppColors.primary + "18"}
                iconColor={AppColors.primary}
                value={orderStats.preparingOrders}
                label="في التحضير"
                onPress={() => navigation.navigate("VendorOrdersTab")}
                testID="stat-preparing"
              />
              <StatCard
                icon="moped"
                iconBg={AppColors.infoLight}
                iconColor={AppColors.info}
                value={orderStats.readyOrders}
                label="ينتظر السائق"
                onPress={() => navigation.navigate("VendorOrdersTab")}
                testID="stat-ready"
              />
              <StatCard
                icon="star"
                iconBg={AppColors.warningLight}
                iconColor={AppColors.warning}
                value={
                  orderStats.rating != null
                    ? (orderStats.rating as number).toFixed(1)
                    : "--"
                }
                label="تقييم المتجر"
                testID="stat-rating"
              />
            </View>
          )}

          {/* ── SECTION 2: QUICK ACTIONS ─────────────────────────────────── */}
          {!isRejected && (
            <>
              <SectionHeader title="إجراءات سريعة" />
              <View style={sc.quickGrid}>
                <QuickActionCard
                  icon="plus-circle"
                  label="إضافة منتج"
                  sublabel="أضف منتجاً جديداً"
                  color={ORANGE}
                  bg={AppColors.secondary}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    navigation.navigate("VendorProductsTab", {
                      screen: "VendorAddProduct",
                    });
                  }}
                />
                <QuickActionCard
                  icon="view-grid"
                  label="منتجاتي"
                  sublabel="عرض وإدارة"
                  color={AppColors.info}
                  bg={AppColors.infoLight}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    navigation.navigate("VendorProductsTab", {
                      screen: "VendorProducts",
                    });
                  }}
                />
                <QuickActionCard
                  icon="shopping-outline"
                  label="الطلبات"
                  sublabel="متابعة الطلبات"
                  color={AppColors.success}
                  bg={AppColors.successLight}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    navigation.navigate("VendorOrdersTab");
                  }}
                />
              </View>

              {/* ── Availability toggles ─────────────────────────────────── */}
              <View style={sc.availRow}>
                <AvailabilityChip
                  active={isVacation}
                  loading={togglingAvailability}
                  label="وضع الإجازة"
                  activeLabel="في إجازة"
                  icon="island"
                  activeColor={AppColors.info}
                  onPress={() => toggleAvailability("isVacation", !isVacation)}
                  testID="button-toggle-vacation"
                />
                <AvailabilityChip
                  active={isBusy}
                  loading={togglingAvailability}
                  label="وضع المشغول"
                  activeLabel="مشغول حالياً"
                  icon="timer-sand"
                  activeColor={AppColors.warning}
                  onPress={() => toggleAvailability("isBusy", !isBusy)}
                  testID="button-toggle-busy"
                />
              </View>
            </>
          )}

          {/* ── SECTION 3: TODAY'S SUMMARY ───────────────────────────────── */}
          {analyticsData && (
            <>
              <SectionHeader title="ملخص اليوم" />
              <View style={sc.summaryCard}>
                {/* Top row: today stats */}
                <View style={sc.summaryRow}>
                  <View
                    style={[
                      sc.summaryBox,
                      { backgroundColor: AppColors.primary + "10" },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="shopping-outline"
                      size={20}
                      color={AppColors.primary}
                    />
                    <ThemedText
                      style={[sc.summaryVal, { color: AppColors.primary }]}
                    >
                      {analyticsData.todayOrders}
                    </ThemedText>
                    <ThemedText style={sc.summaryLbl}>طلبات اليوم</ThemedText>
                  </View>
                  <View
                    style={[
                      sc.summaryBox,
                      { backgroundColor: AppColors.success + "10" },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="cash-multiple"
                      size={20}
                      color={AppColors.success}
                    />
                    <ThemedText
                      style={[sc.summaryVal, { color: AppColors.success }]}
                    >
                      {formatRevenue(analyticsData.todaySales)}
                    </ThemedText>
                    <ThemedText style={sc.summaryLbl}>
                      مبيعات اليوم (د.ع)
                    </ThemedText>
                  </View>
                  <View
                    style={[
                      sc.summaryBox,
                      { backgroundColor: AppColors.warning + "10" },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="chart-line"
                      size={20}
                      color={AppColors.warning}
                    />
                    <ThemedText
                      style={[sc.summaryVal, { color: AppColors.warning }]}
                    >
                      {analyticsData.weekOrders}
                    </ThemedText>
                    <ThemedText style={sc.summaryLbl}>طلبات الأسبوع</ThemedText>
                  </View>
                </View>

                {/* Divider */}
                <View style={sc.summaryDivider} />

                {/* Week revenue */}
                <View style={sc.weekRevenueRow}>
                  <ThemedText style={sc.weekRevenueLabel}>
                    إجمالي مبيعات الأسبوع
                  </ThemedText>
                  <ThemedText style={sc.weekRevenueVal}>
                    {analyticsData.weekSales.toLocaleString()} د.ع
                  </ThemedText>
                </View>
              </View>
            </>
          )}

          {/* ── Profile completion nudge ─────────────────────────────────── */}
          {!vendorProfile?.bio && (
            <Pressable
              style={sc.nudgeCard}
              onPress={() => setBioModalVisible(true)}
            >
              <MaterialCommunityIcons
                name="store-edit-outline"
                size={22}
                color={ORANGE}
              />
              <View style={{ flex: 1 }}>
                <ThemedText style={sc.nudgeTitle}>أكمل ملف متجرك</ThemedText>
                <ThemedText style={sc.nudgeBody}>
                  أضف وصفاً لمتجرك لجذب المزيد من الزبائن
                </ThemedText>
              </View>
              <Feather
                name="chevron-left"
                size={18}
                color={AppColors.gray400}
              />
            </Pressable>
          )}
        </View>
      </ScrollView>

      {/* ── Bio Modal ──────────────────────────────────────────────────────── */}
      <Modal transparent visible={bioModalVisible} animationType="slide">
        <View style={sc.modalOverlay}>
          <View style={sc.bottomSheet}>
            <View style={sc.sheetHandle} />
            <ThemedText style={sc.sheetTitle}>وصف المتجر</ThemedText>
            <TextInput
              style={sc.bioInput}
              value={bioText}
              onChangeText={setBioText}
              placeholder="اكتب وصفاً مختصراً عن متجرك..."
              placeholderTextColor={AppColors.gray300}
              multiline
              maxLength={200}
              textAlign="right"
            />
            <ThemedText style={sc.bioCount}>{bioText.length}/200</ThemedText>
            <View style={sc.sheetActions}>
              <Pressable
                style={sc.btnPrimary}
                onPress={saveBio}
                disabled={savingBio}
              >
                {savingBio ? (
                  <ActivityIndicator color={AppColors.white} size="small" />
                ) : (
                  <ThemedText style={sc.btnPrimaryText}>حفظ</ThemedText>
                )}
              </Pressable>
              <Pressable
                style={sc.btnSecondary}
                onPress={() => setBioModalVisible(false)}
              >
                <ThemedText style={sc.btnSecondaryText}>إلغاء</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Store Settings Modal ───────────────────────────────────────────── */}
      <Modal transparent visible={settingsVisible} animationType="slide">
        <View style={sc.modalOverlay}>
          <View style={[sc.bottomSheet, { maxHeight: "88%" }]}>
            <View style={sc.sheetHandle} />
            <ScrollView showsVerticalScrollIndicator={false}>
              <ThemedText style={sc.sheetTitle}>إعدادات المتجر</ThemedText>

              <ThemedText style={sc.settLabel}>
                وقت التوصيل المتوقع (دقائق)
              </ThemedText>
              <TextInput
                style={sc.settInput}
                value={settDeliveryTime}
                onChangeText={setSettDeliveryTime}
                placeholder="مثال: 20-30"
                placeholderTextColor={AppColors.gray300}
                textAlign="right"
              />

              <ThemedText style={sc.settLabel}>
                سعر التوصيل (دينار عراقي)
              </ThemedText>
              <TextInput
                style={sc.settInput}
                value={settDeliveryPrice}
                onChangeText={setSettDeliveryPrice}
                placeholder="0 = توصيل مجاني"
                placeholderTextColor={AppColors.gray300}
                textAlign="right"
                keyboardType="numeric"
              />

              <View style={sc.toggleRow}>
                <Pressable
                  onPress={() => setSettingsUseHours(!settingsUseHours)}
                  style={[
                    sc.toggle,
                    {
                      backgroundColor: settingsUseHours
                        ? ORANGE
                        : AppColors.divider,
                    },
                  ]}
                >
                  <View
                    style={[
                      sc.toggleThumb,
                      {
                        transform: [{ translateX: settingsUseHours ? 18 : 2 }],
                      },
                    ]}
                  />
                </Pressable>
                <ThemedText style={sc.toggleLabel}>
                  تحديد ساعات العمل
                </ThemedText>
              </View>

              {settingsUseHours && (
                <>
                  <ThemedText style={sc.settLabel}>
                    وقت الفتح (مثال: 09:00)
                  </ThemedText>
                  <TextInput
                    style={sc.settInput}
                    value={settOpenTime}
                    onChangeText={setSettOpenTime}
                    placeholder="09:00"
                    placeholderTextColor={AppColors.gray300}
                    textAlign="right"
                    keyboardType="numbers-and-punctuation"
                  />
                  <ThemedText style={sc.settLabel}>وقت الإغلاق</ThemedText>
                  <TextInput
                    style={sc.settInput}
                    value={settCloseTime}
                    onChangeText={setSettCloseTime}
                    placeholder="22:00"
                    placeholderTextColor={AppColors.gray300}
                    textAlign="right"
                    keyboardType="numbers-and-punctuation"
                  />
                  <ThemedText style={sc.settLabel}>أيام العمل</ThemedText>
                  <View style={sc.daysRow}>
                    {["ح", "إ", "ث", "ر", "خ", "ج", "س"].map((d, i) => {
                      const active = settOpenDays.includes(i);
                      return (
                        <Pressable
                          key={i}
                          onPress={() => {
                            Haptics.impactAsync(
                              Haptics.ImpactFeedbackStyle.Light,
                            );
                            setSettOpenDays((prev) =>
                              active
                                ? prev.filter((x) => x !== i)
                                : [...prev, i],
                            );
                          }}
                          style={[
                            sc.dayBtn,
                            {
                              backgroundColor: active
                                ? ORANGE
                                : AppColors.gray100,
                              borderColor: active ? ORANGE : AppColors.divider,
                            },
                          ]}
                        >
                          <ThemedText
                            style={[
                              sc.dayText,
                              {
                                color: active
                                  ? AppColors.white
                                  : AppColors.gray500,
                              },
                            ]}
                          >
                            {d}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              )}

              <View style={[sc.sheetActions, { marginTop: 18 }]}>
                <Pressable
                  style={sc.btnPrimary}
                  onPress={saveStoreSettings}
                  disabled={savingSettings}
                >
                  {savingSettings ? (
                    <ActivityIndicator color={AppColors.white} size="small" />
                  ) : (
                    <ThemedText style={sc.btnPrimaryText}>
                      حفظ الإعدادات
                    </ThemedText>
                  )}
                </Pressable>
                <Pressable
                  style={sc.btnSecondary}
                  onPress={() => setSettingsVisible(false)}
                >
                  <ThemedText style={sc.btnSecondaryText}>إلغاء</ThemedText>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const sc = StyleSheet.create({
  root: { flex: 1, backgroundColor: AppColors.background },
  body: { paddingHorizontal: 16, paddingTop: 4 },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
    backgroundColor: AppColors.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: AppColors.divider,
    ...Shadows.xs,
  },
  avatarWrap: { position: "relative" },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: AppColors.secondary,
  },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: ORANGE,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: AppColors.secondary,
  },
  avatarLetter: {
    fontFamily: FontFamily.cairoBold,
    fontSize: 22,
    color: AppColors.white,
    lineHeight: 28,
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 28,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  cameraChip: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: ORANGE,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: AppColors.white,
  },
  headerInfo: { flex: 1 },
  storeName: {
    fontFamily: FontFamily.cairoBold,
    fontSize: 16,
    color: AppColors.gray800,
    textAlign: "right",
    marginBottom: 1,
  },
  businessType: {
    fontFamily: FontFamily.tajawal,
    fontSize: 12,
    color: AppColors.gray500,
    textAlign: "right",
    marginBottom: 4,
  },
  headerActions: { flexDirection: "row", gap: 6 },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: AppColors.gray50,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: AppColors.gray100,
  },

  // Status badge
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: "flex-end",
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontFamily: FontFamily.cairoBold, fontSize: 11 },

  // Section header
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    marginTop: 20,
  },
  accent: { width: 4, height: 18, borderRadius: 2, backgroundColor: ORANGE },
  sectionTitle: {
    fontFamily: FontFamily.cairoBold,
    fontSize: 17,
    color: AppColors.gray800,
  },

  // Notifications
  notifBanner: {
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  notifTitle: {
    fontFamily: FontFamily.cairoBold,
    fontSize: 13,
    marginBottom: 2,
    textAlign: "right",
  },
  notifMsg: {
    fontFamily: FontFamily.tajawal,
    fontSize: 12,
    color: AppColors.gray700,
    textAlign: "right",
    lineHeight: 18,
  },

  // Pending
  pendingBanner: {
    backgroundColor: AppColors.warningLight,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: AppColors.warning,
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 4,
  },
  pendingTitle: {
    fontFamily: FontFamily.cairoBold,
    fontSize: 13,
    color: AppColors.gray800,
    textAlign: "right",
  },
  pendingBody: {
    fontFamily: FontFamily.tajawal,
    fontSize: 12,
    color: AppColors.gray600,
    textAlign: "right",
    marginTop: 2,
    lineHeight: 18,
  },

  // Stats 2x2
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  statCard: {
    width: "47%",
    backgroundColor: AppColors.white,
    borderRadius: 20,
    padding: 16,
    alignItems: "center",
    gap: 6,
    position: "relative",
    ...Shadows.sm,
  },
  statIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  statValue: {
    fontFamily: FontFamily.cairoBold,
    fontSize: 26,
    lineHeight: 34,
    textAlign: "center",
  },
  statLabel: {
    fontFamily: FontFamily.tajawal,
    fontSize: 12,
    color: AppColors.gray500,
    textAlign: "center",
  },
  pulseDot: {
    position: "absolute",
    top: 12,
    left: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Quick Actions
  quickGrid: { flexDirection: "row", gap: 10 },
  quickCard: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 8,
  },
  quickIconBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  quickLabel: {
    fontFamily: FontFamily.cairoBold,
    fontSize: 13,
    textAlign: "center",
  },
  quickSublabel: {
    fontFamily: FontFamily.tajawal,
    fontSize: 10,
    color: AppColors.gray400,
    textAlign: "center",
  },

  // Availability
  availRow: { flexDirection: "row", gap: 12, marginTop: 12 },
  availChip: {
    flex: 1,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  availLabel: {
    fontFamily: FontFamily.cairoMedium,
    fontSize: 12,
    flex: 1,
    textAlign: "center",
  },
  availDot: { width: 7, height: 7, borderRadius: 4 },

  // Summary
  summaryCard: {
    backgroundColor: AppColors.white,
    borderRadius: 20,
    padding: 16,
    ...Shadows.sm,
  },
  summaryRow: { flexDirection: "row-reverse", gap: 8 },
  summaryBox: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    gap: 4,
  },
  summaryVal: {
    fontFamily: FontFamily.cairoBold,
    fontSize: 20,
    lineHeight: 26,
  },
  summaryLbl: {
    fontFamily: FontFamily.tajawal,
    fontSize: 10,
    color: AppColors.gray500,
    textAlign: "center",
  },
  summaryDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: AppColors.divider,
    marginVertical: 12,
  },
  weekRevenueRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
  },
  weekRevenueLabel: {
    fontFamily: FontFamily.tajawal,
    fontSize: 13,
    color: AppColors.gray500,
  },
  weekRevenueVal: {
    fontFamily: FontFamily.cairoBold,
    fontSize: 15,
    color: AppColors.gray800,
  },

  // Nudge
  nudgeCard: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
    backgroundColor: AppColors.white,
    borderRadius: 16,
    padding: 14,
    marginTop: 16,
    borderWidth: 1.5,
    borderColor: AppColors.secondary,
    ...Shadows.xs,
  },
  nudgeTitle: {
    fontFamily: FontFamily.cairoBold,
    fontSize: 14,
    color: AppColors.gray800,
    textAlign: "right",
  },
  nudgeBody: {
    fontFamily: FontFamily.tajawal,
    fontSize: 12,
    color: AppColors.gray500,
    textAlign: "right",
    marginTop: 2,
  },

  // Modals / Bottom sheets
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  bottomSheet: {
    backgroundColor: AppColors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingTop: 12,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: AppColors.gray200,
    alignSelf: "center",
    marginBottom: 16,
  },
  sheetTitle: {
    fontFamily: FontFamily.cairoBold,
    fontSize: 17,
    color: AppColors.gray800,
    textAlign: "center",
    marginBottom: 18,
  },
  sheetActions: { flexDirection: "row", gap: 12 },

  bioInput: {
    borderWidth: 1.5,
    borderColor: AppColors.divider,
    borderRadius: 14,
    padding: 14,
    fontFamily: FontFamily.tajawal,
    fontSize: 14,
    color: AppColors.gray800,
    minHeight: 100,
    textAlignVertical: "top",
  },
  bioCount: {
    fontFamily: FontFamily.tajawal,
    fontSize: 11,
    color: AppColors.gray300,
    textAlign: "left",
    marginTop: 4,
    marginBottom: 16,
  },

  btnPrimary: {
    flex: 1,
    backgroundColor: ORANGE,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnPrimaryText: {
    fontFamily: FontFamily.cairoBold,
    fontSize: 14,
    color: AppColors.white,
  },
  btnSecondary: {
    flex: 1,
    backgroundColor: AppColors.gray100,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnSecondaryText: {
    fontFamily: FontFamily.cairoBold,
    fontSize: 14,
    color: AppColors.gray700,
  },

  // Settings
  settLabel: {
    fontFamily: FontFamily.cairoBold,
    fontSize: 13,
    color: AppColors.gray700,
    textAlign: "right",
    marginBottom: 6,
    marginTop: 14,
  },
  settInput: {
    borderWidth: 1.5,
    borderColor: AppColors.divider,
    borderRadius: 12,
    padding: 12,
    fontFamily: FontFamily.tajawal,
    fontSize: 14,
    color: AppColors.gray800,
    textAlign: "right",
  },
  toggleRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    marginTop: 16,
  },
  toggle: { width: 44, height: 26, borderRadius: 13, justifyContent: "center" },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: AppColors.white,
  },
  toggleLabel: {
    fontFamily: FontFamily.cairoMedium,
    fontSize: 13,
    color: AppColors.gray700,
  },
  daysRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  dayBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  dayText: { fontFamily: FontFamily.cairoBold, fontSize: 13 },
});
