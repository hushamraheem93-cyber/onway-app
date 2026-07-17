import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  ComponentProps,
} from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Image,
  Dimensions,
  Modal,
  TextInput,
} from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
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
import { AppColors } from "@/constants/theme";

const ORANGE = AppColors.primary;
const ORANGE_LIGHT = AppColors.secondary;
const ORANGE_BG = AppColors.secondary;
const POLL_INTERVAL_MS = 30_000;
const SCREEN_W = Dimensions.get("window").width;
const COVER_H = 190;
const AVATAR_SIZE = 88;

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

function notifColor(type: string): {
  bg: string;
  border: string;
  icon: MCIcon;
  iconColor: string;
} {
  if (type === "vendor_active")
    return { bg: AppColors.successLight, border: AppColors.success, icon: "check-circle", iconColor: AppColors.success };
  if (type === "vendor_rejected")
    return { bg: AppColors.errorLight, border: AppColors.error, icon: "close-circle", iconColor: AppColors.error };
  if (type === "vendor_suspended")
    return { bg: AppColors.warningLight, border: AppColors.warning, icon: "alert-circle", iconColor: AppColors.warning };
  if (type === "product_approved")
    return { bg: AppColors.successLight, border: AppColors.success, icon: "check-circle", iconColor: AppColors.success };
  if (type === "product_rejected")
    return { bg: AppColors.errorLight, border: AppColors.error, icon: "close-circle", iconColor: AppColors.error };
  return { bg: AppColors.secondary, border: AppColors.primaryLight, icon: "bell", iconColor: ORANGE };
}

export default function VendorHomeScreen({ navigation }: any) {
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { vendorProfile, vendorToken, logout, refreshVendorProfile } = useAuth();
  const { setUnreadCount } = useVendorNotifications();

  const handleNotificationTap = useCallback(() => {
    navigation.navigate("VendorOrdersTab");
  }, [navigation]);

  usePushNotifications(handleNotificationTap);

  const [orderStats, setOrderStats] = useState<OrderStats>({ totalOrders: 0, pendingOrders: 0, preparingOrders: 0, readyOrders: 0, totalRevenue: 0, rating: null, ratingCount: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<VendorNotification[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [bioModalVisible, setBioModalVisible] = useState(false);
  const [bioText, setBioText] = useState(vendorProfile?.bio || "");
  const [savingBio, setSavingBio] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Store settings modal
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [settDeliveryTime, setSettDeliveryTime] = useState(vendorProfile?.deliveryTime || "30-45");
  const [settDeliveryPrice, setSettDeliveryPrice] = useState(String(vendorProfile?.deliveryPrice ?? 0));
  const defaultWh = vendorProfile?.workingHours ?? { openTime: "09:00", closeTime: "22:00", openDays: [0, 1, 2, 3, 4, 5, 6] };
  const [settOpenTime, setSettOpenTime] = useState(defaultWh.openTime);
  const [settCloseTime, setSettCloseTime] = useState(defaultWh.closeTime);
  const [settOpenDays, setSettOpenDays] = useState<number[]>(defaultWh.openDays);
  const [settingsUseHours, setSettingsUseHours] = useState(!!vendorProfile?.workingHours);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    setDismissedIds(new Set());
    setNotifications([]);
  }, [vendorToken]);

  useEffect(() => {
    setBioText(vendorProfile?.bio || "");
  }, [vendorProfile?.bio]);

  const loadOrderStats = useCallback(async () => {
    if (!vendorToken) return;
    try {
      const res = await fetch(new URL("/api/vendor/stats", getApiUrl()).toString(), {
        headers: { Authorization: `Bearer ${vendorToken}` },
      });
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

  const loadNotifications = useCallback(async () => {
    if (!vendorToken) return;
    try {
      const res = await fetch(new URL("/api/vendor/notifications", getApiUrl()).toString(), {
        headers: { Authorization: `Bearer ${vendorToken}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const all: VendorNotification[] = data.notifications || [];
      const unread = all.filter((n) => n.status === "unread");
      setNotifications(unread);
      setUnreadCount(unread.length);
      const hasStatusChange = unread.some(
        (n: VendorNotification) =>
          n.type === "vendor_active" ||
          n.type === "vendor_rejected" ||
          n.type === "vendor_suspended"
      );
      if (hasStatusChange) refreshVendorProfile();
    } catch {}
  }, [vendorToken, refreshVendorProfile, setUnreadCount]);

  const markNotificationsRead = useCallback(
    async (ids: string[]) => {
      if (!vendorToken || ids.length === 0) return;
      try {
        await fetch(new URL("/api/vendor/notifications/mark-read", getApiUrl()).toString(), {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${vendorToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ids }),
        });
      } catch {}
    },
    [vendorToken]
  );

  const dismissNotification = useCallback(
    (notif: VendorNotification) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setDismissedIds((prev) => new Set([...prev, notif.id]));
      setUnreadCount((c) => Math.max(0, c - 1));
      markNotificationsRead([notif.id]);
    },
    [markNotificationsRead, setUnreadCount]
  );

  useFocusEffect(
    useCallback(() => {
      if (!vendorToken) return;
      Promise.all([loadOrderStats(), loadNotifications()]).finally(() => setLoading(false));
      pollRef.current = setInterval(() => {
        loadNotifications();
      }, POLL_INTERVAL_MS);
      return () => {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      };
    }, [vendorToken, loadOrderStats, loadNotifications])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadOrderStats(), loadNotifications(), refreshVendorProfile()]);
    setRefreshing(false);
  }, [loadOrderStats, loadNotifications, refreshVendorProfile]);

  const uploadImage = useCallback(
    async (type: "profileImage" | "coverImage") => {
      if (!vendorToken) return;
      const setter = type === "profileImage" ? setUploadingAvatar : setUploadingCover;
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
          }
        );
        if (res.ok) {
          await refreshVendorProfile();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } catch {} finally {
        setter(false);
      }
    },
    [vendorToken, refreshVendorProfile]
  );

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
    } catch {} finally {
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
          ? { openTime: settOpenTime, closeTime: settCloseTime, openDays: settOpenDays }
          : null,
      };
      await fetch(new URL("/api/vendor/profile", getApiUrl()).toString(), {
        method: "PATCH",
        headers: { Authorization: `Bearer ${vendorToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await refreshVendorProfile();
      setSettingsVisible(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {} finally {
      setSavingSettings(false);
    }
  };

  const isPending = vendorProfile?.status === "pending";
  const isRejected = vendorProfile?.status === "rejected";
  const isSuspended = vendorProfile?.status === "suspended";
  const visibleNotifications = notifications.filter((n) => !dismissedIds.has(n.id));

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

  const coverUrl = vendorProfile?.coverImageUrl
    ? new URL(vendorProfile.coverImageUrl, getApiUrl()).toString()
    : null;
  const avatarUrl = vendorProfile?.profileImageUrl
    ? new URL(vendorProfile.profileImageUrl, getApiUrl()).toString()
    : null;

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{
          paddingTop: headerHeight,
          paddingBottom: tabBarHeight + 24,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={ORANGE}
            progressViewOffset={headerHeight}
          />
        }
      >
        {/* ─── Cover + Avatar section ─── */}
        <View style={styles.profileHeader}>
          {/* Cover photo */}
          <View style={styles.coverWrapper}>
            {coverUrl ? (
              <Image source={{ uri: coverUrl }} style={styles.coverImg} resizeMode="cover" />
            ) : (
              <View style={styles.coverPlaceholder}>
                <MaterialCommunityIcons name="image-filter-hdr" size={36} color={AppColors.vendorPurpleLight} />
              </View>
            )}
            <Pressable
              style={styles.editCoverBtn}
              onPress={() => uploadImage("coverImage")}
              testID="button-edit-cover"
            >
              {uploadingCover ? (
                <ActivityIndicator size="small" color={AppColors.white} />
              ) : (
                <Feather name="camera" size={14} color={AppColors.white} />
              )}
            </Pressable>
          </View>

          {/* Avatar overlapping cover */}
          <View style={styles.avatarSection}>
            <View style={styles.avatarWrapper}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <ThemedText style={styles.avatarLetter}>
                    {vendorProfile?.storeName?.[0] || "م"}
                  </ThemedText>
                </View>
              )}
              <Pressable
                style={styles.editAvatarBtn}
                onPress={() => uploadImage("profileImage")}
                testID="button-edit-avatar"
              >
                {uploadingAvatar ? (
                  <ActivityIndicator size="small" color={AppColors.white} />
                ) : (
                  <Feather name="camera" size={12} color={AppColors.white} />
                )}
              </Pressable>
            </View>

            {/* Store info beside avatar */}
            <View style={styles.storeInfo}>
              <ThemedText style={styles.storeName} numberOfLines={1}>
                {vendorProfile?.storeName || "متجري"}
              </ThemedText>
              <ThemedText style={styles.businessType}>
                {BUSINESS_LABELS[vendorProfile?.businessType || ""] || "متجر"}
              </ThemedText>
              <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                <ThemedText style={[styles.statusText, { color: statusColor }]}>
                  {statusLabel}
                </ThemedText>
              </View>
            </View>
          </View>

          {/* Bio / description */}
          <View style={styles.bioRow}>
            {vendorProfile?.bio ? (
              <ThemedText style={styles.bioText}>{vendorProfile.bio}</ThemedText>
            ) : (
              <ThemedText style={styles.bioPlaceholder}>
                أضف وصفاً لمتجرك...
              </ThemedText>
            )}
            <Pressable onPress={() => setBioModalVisible(true)} style={styles.editBioBtn}>
              <Feather name="edit-2" size={13} color={ORANGE} />
            </Pressable>
          </View>

          {vendorProfile?.address ? (
            <View style={styles.addressRow}>
              <Feather name="map-pin" size={13} color={AppColors.gray400} />
              <ThemedText style={styles.addressText}>{vendorProfile.address}</ThemedText>
            </View>
          ) : null}
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        <View style={styles.body}>
          {/* Notification banners */}
          {visibleNotifications.length > 0 && (
            <View style={styles.notifContainer} testID="notifications-list">
              {visibleNotifications.map((notif) => {
                const theme = notifColor(notif.type);
                return (
                  <View
                    key={notif.id}
                    style={[
                      styles.notifBanner,
                      { backgroundColor: theme.bg, borderColor: theme.border },
                    ]}
                    testID={`notification-${notif.id}`}
                  >
                    <MaterialCommunityIcons
                      name={theme.icon}
                      size={22}
                      color={theme.iconColor}
                      style={styles.notifIcon}
                    />
                    <View style={styles.notifBody}>
                      <ThemedText style={[styles.notifTitle, { color: theme.iconColor }]}>
                        {notif.title}
                      </ThemedText>
                      <ThemedText style={styles.notifMessage}>{notif.message}</ThemedText>
                    </View>
                    <Pressable
                      onPress={() => dismissNotification(notif)}
                      style={styles.notifDismiss}
                      testID={`button-dismiss-notification-${notif.id}`}
                      hitSlop={8}
                    >
                      <Feather name="x" size={16} color={AppColors.gray400} />
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}

          {/* Pending notice */}
          {isPending ? (
            <View style={styles.pendingNotice}>
              <MaterialCommunityIcons name="clock-outline" size={20} color={AppColors.warning} />
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.pendingText}>حسابك قيد المراجعة من الإدارة</ThemedText>
                <ThemedText style={[styles.pendingText, { fontSize: 12, marginTop: 2 }]}>
                  يمكنك الآن إضافة منتجاتك — ستظهر للزبائن بعد تفعيل الحساب
                </ThemedText>
              </View>
            </View>
          ) : null}

          {/* Live order stats grid */}
          {loading ? (
            <View style={styles.statsGrid}>
              {[0,1,2,3].map(i => (
                <View key={i} style={[styles.statCard, { backgroundColor: AppColors.gray100 }]}>
                  <ActivityIndicator color={ORANGE} size="small" />
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.statsGrid} testID="stats-grid">
              {/* New orders */}
              <Pressable
                style={[styles.statCard, { backgroundColor: AppColors.warningLight }]}
                onPress={() => navigation.navigate("VendorOrdersTab")}
                testID="stat-pending"
              >
                <View style={[styles.statIconBox, { backgroundColor: AppColors.warningLight }]}>
                  <MaterialCommunityIcons name="bell-ring" size={22} color={AppColors.warning} />
                </View>
                <ThemedText style={[styles.statValue, { color: AppColors.warning }]}>
                  {orderStats.pendingOrders}
                </ThemedText>
                <ThemedText style={styles.statLabel}>طلبات جديدة</ThemedText>
                {orderStats.pendingOrders > 0 ? (
                  <View style={[styles.statDot, { backgroundColor: AppColors.warning }]} />
                ) : null}
              </Pressable>

              {/* Preparing */}
              <Pressable
                style={[styles.statCard, { backgroundColor: AppColors.vendorPurpleLight }]}
                onPress={() => navigation.navigate("VendorOrdersTab")}
                testID="stat-preparing"
              >
                <View style={[styles.statIconBox, { backgroundColor: AppColors.vendorPurpleLight }]}>
                  <MaterialCommunityIcons name="chef-hat" size={22} color={AppColors.statusPurple} />
                </View>
                <ThemedText style={[styles.statValue, { color: AppColors.statusPurple }]}>
                  {orderStats.preparingOrders}
                </ThemedText>
                <ThemedText style={styles.statLabel}>في التحضير</ThemedText>
              </Pressable>

              {/* Waiting for driver */}
              <Pressable
                style={[styles.statCard, { backgroundColor: AppColors.infoLight }]}
                onPress={() => navigation.navigate("VendorOrdersTab")}
                testID="stat-ready"
              >
                <View style={[styles.statIconBox, { backgroundColor: AppColors.infoLight }]}>
                  <MaterialCommunityIcons name="moped" size={22} color={AppColors.statusCyan} />
                </View>
                <ThemedText style={[styles.statValue, { color: AppColors.statusCyan }]}>
                  {orderStats.readyOrders}
                </ThemedText>
                <ThemedText style={styles.statLabel}>ينتظر السائق</ThemedText>
              </Pressable>

              {/* Store rating */}
              <View style={[styles.statCard, { backgroundColor: AppColors.warningLight }]} testID="stat-rating">
                <View style={[styles.statIconBox, { backgroundColor: AppColors.warningLight }]}>
                  <MaterialCommunityIcons name="star" size={22} color={AppColors.warning} />
                </View>
                <ThemedText style={[styles.statValue, { color: AppColors.warning }]}>
                  {orderStats.rating != null ? (orderStats.rating as number).toFixed(1) : "--"}
                </ThemedText>
                <ThemedText style={styles.statLabel}>تقييم المتجر</ThemedText>
              </View>
            </View>
          )}

          {/* Quick actions */}
          {!isRejected ? (
            <>
              <View style={styles.sectionTitleRow}>
                <View style={styles.sectionAccent} />
                <ThemedText style={styles.sectionTitle}>إجراءات سريعة</ThemedText>
              </View>
              <View style={styles.actionsRow}>
                <QuickAction
                  icon="plus-circle"
                  label="إضافة منتج"
                  color={ORANGE}
                  bg={ORANGE_LIGHT}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    navigation.navigate("VendorProductsTab", { screen: "VendorAddProduct" });
                  }}
                />
                <QuickAction
                  icon="view-list"
                  label="منتجاتي"
                  color={ORANGE}
                  bg={AppColors.secondary}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    navigation.navigate("VendorProductsTab", { screen: "VendorProducts" });
                  }}
                />
                <QuickAction
                  icon="cog"
                  label="إعدادات"
                  color={AppColors.gray500}
                  bg={AppColors.gray50}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setSettDeliveryTime(vendorProfile?.deliveryTime || "30-45");
                    setSettDeliveryPrice(String(vendorProfile?.deliveryPrice ?? 0));
                    const wh = vendorProfile?.workingHours;
                    setSettingsUseHours(!!wh);
                    setSettOpenTime(wh?.openTime || "09:00");
                    setSettCloseTime(wh?.closeTime || "22:00");
                    setSettOpenDays(wh?.openDays ?? [0, 1, 2, 3, 4, 5, 6]);
                    setSettingsVisible(true);
                  }}
                />
              </View>
            </>
          ) : null}

          {/* How it works */}
          <View style={styles.sectionTitleRow}>
            <View style={styles.sectionAccent} />
            <ThemedText style={styles.sectionTitle}>كيف يعمل النظام</ThemedText>
          </View>
          <View style={styles.stepsCard}>
            {[
              { n: "1", icon: "upload", title: "أضف منتجاتك", desc: "ارفع صورة واضحة وحدد السعر والتفاصيل", color: ORANGE },
              { n: "2", icon: "eye", title: "مراجعة الإدارة", desc: "يراجع الفريق منتجك خلال 24 ساعة", color: ORANGE },
              { n: "3", icon: "storefront", title: "يظهر للزبائن", desc: "بعد الموافقة يُعرض منتجك في التطبيق فوراً", color: AppColors.success },
            ].map((step, i) => (
              <View key={i} style={[styles.stepRow, i < 2 && styles.stepBorder]}>
                <View style={[styles.stepCircle, { backgroundColor: step.color + "20" }]}>
                  <ThemedText style={[styles.stepN, { color: step.color }]}>{step.n}</ThemedText>
                </View>
                <MaterialCommunityIcons
                  name={step.icon as any}
                  size={22}
                  color={step.color}
                  style={{ marginHorizontal: 12 }}
                />
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.stepTitle}>{step.title}</ThemedText>
                  <ThemedText style={styles.stepDesc}>{step.desc}</ThemedText>
                </View>
              </View>
            ))}
          </View>

          {/* Logout */}
          <Pressable style={styles.logoutBtn} onPress={logout} testID="button-logout">
            <Feather name="log-out" size={16} color={AppColors.error} />
            <ThemedText style={styles.logoutText}>تسجيل الخروج</ThemedText>
          </Pressable>
        </View>
      </ScrollView>

      {/* Bio edit modal */}
      <Modal transparent visible={bioModalVisible} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.bioModal}>
            <ThemedText style={styles.bioModalTitle}>وصف المتجر</ThemedText>
            <TextInput
              style={styles.bioInput}
              value={bioText}
              onChangeText={setBioText}
              placeholder="اكتب وصفاً مختصراً عن متجرك..."
              placeholderTextColor={AppColors.gray300}
              multiline
              maxLength={200}
              textAlign="right"
            />
            <ThemedText style={styles.bioCount}>{bioText.length}/200</ThemedText>
            <View style={styles.bioActions}>
              <Pressable style={styles.bioBtnSave} onPress={saveBio} disabled={savingBio}>
                {savingBio ? (
                  <ActivityIndicator color={AppColors.white} size="small" />
                ) : (
                  <ThemedText style={styles.bioBtnSaveText}>حفظ</ThemedText>
                )}
              </Pressable>
              <Pressable style={styles.bioBtnCancel} onPress={() => setBioModalVisible(false)}>
                <ThemedText style={styles.bioBtnCancelText}>إلغاء</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Store Settings Modal ── */}
      <Modal transparent visible={settingsVisible} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.bioModal, { maxHeight: "85%" }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <ThemedText style={styles.bioModalTitle}>إعدادات المتجر</ThemedText>

              {/* Delivery time */}
              <ThemedText style={settStyles.label}>وقت التوصيل المتوقع (دقائق)</ThemedText>
              <TextInput
                style={settStyles.input}
                value={settDeliveryTime}
                onChangeText={setSettDeliveryTime}
                placeholder="مثال: 20-30"
                placeholderTextColor={AppColors.gray300}
                textAlign="right"
                keyboardType="default"
              />

              {/* Delivery price */}
              <ThemedText style={settStyles.label}>سعر التوصيل (دينار عراقي)</ThemedText>
              <TextInput
                style={settStyles.input}
                value={settDeliveryPrice}
                onChangeText={setSettDeliveryPrice}
                placeholder="0 = توصيل مجاني"
                placeholderTextColor={AppColors.gray300}
                textAlign="right"
                keyboardType="numeric"
              />

              {/* Working hours toggle */}
              <View style={settStyles.row}>
                <Pressable
                  onPress={() => setSettingsUseHours(!settingsUseHours)}
                  style={[settStyles.toggle, { backgroundColor: settingsUseHours ? ORANGE : AppColors.divider }]}
                >
                  <View
                    style={[
                      settStyles.toggleThumb,
                      { transform: [{ translateX: settingsUseHours ? 18 : 2 }] },
                    ]}
                  />
                </Pressable>
                <ThemedText style={settStyles.toggleLabel}>تحديد ساعات العمل</ThemedText>
              </View>

              {settingsUseHours ? (
                <>
                  {/* Open time */}
                  <ThemedText style={settStyles.label}>وقت الفتح (تنسيق 24 ساعة، مثال: 09:00)</ThemedText>
                  <TextInput
                    style={settStyles.input}
                    value={settOpenTime}
                    onChangeText={setSettOpenTime}
                    placeholder="09:00"
                    placeholderTextColor={AppColors.gray300}
                    textAlign="right"
                    keyboardType="numbers-and-punctuation"
                  />

                  {/* Close time */}
                  <ThemedText style={settStyles.label}>وقت الإغلاق</ThemedText>
                  <TextInput
                    style={settStyles.input}
                    value={settCloseTime}
                    onChangeText={setSettCloseTime}
                    placeholder="22:00"
                    placeholderTextColor={AppColors.gray300}
                    textAlign="right"
                    keyboardType="numbers-and-punctuation"
                  />

                  {/* Open days */}
                  <ThemedText style={settStyles.label}>أيام العمل</ThemedText>
                  <View style={settStyles.daysRow}>
                    {["ح", "إ", "ث", "ر", "خ", "ج", "س"].map((d, i) => {
                      const active = settOpenDays.includes(i);
                      return (
                        <Pressable
                          key={i}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setSettOpenDays((prev) =>
                              active ? prev.filter((x) => x !== i) : [...prev, i]
                            );
                          }}
                          style={[
                            settStyles.dayBtn,
                            { backgroundColor: active ? ORANGE : AppColors.gray100, borderColor: active ? ORANGE : AppColors.divider },
                          ]}
                        >
                          <ThemedText
                            style={[settStyles.dayText, { color: active ? AppColors.white : AppColors.gray500 }]}
                          >
                            {d}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              ) : null}

              {/* Actions */}
              <View style={[styles.bioActions, { marginTop: 18 }]}>
                <Pressable style={styles.bioBtnSave} onPress={saveStoreSettings} disabled={savingSettings}>
                  {savingSettings ? (
                    <ActivityIndicator color={AppColors.white} size="small" />
                  ) : (
                    <ThemedText style={styles.bioBtnSaveText}>حفظ الإعدادات</ThemedText>
                  )}
                </Pressable>
                <Pressable style={styles.bioBtnCancel} onPress={() => setSettingsVisible(false)}>
                  <ThemedText style={styles.bioBtnCancelText}>إلغاء</ThemedText>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function QuickAction({ icon, label, color, bg, onPress }: any) {
  return (
    <Pressable
      style={({ pressed }) => [styles.quickAction, { backgroundColor: bg, opacity: pressed ? 0.8 : 1 }]}
      onPress={onPress}
    >
      <MaterialCommunityIcons name={icon} size={28} color={color} />
      <ThemedText style={[styles.quickLabel, { color }]}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: ORANGE_BG },

  // Profile header
  profileHeader: { backgroundColor: AppColors.white },
  coverWrapper: {
    width: SCREEN_W,
    height: COVER_H,
    backgroundColor: ORANGE_LIGHT,
    overflow: "hidden",
  },
  coverImg: { width: "100%", height: "100%" },
  coverPlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: ORANGE_LIGHT,
  },
  editCoverBtn: {
    position: "absolute",
    bottom: 10,
    right: 12,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: AppColors.overlay,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarSection: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingBottom: 14,
    marginTop: -(AVATAR_SIZE / 2),
  },
  avatarWrapper: {
    position: "relative",
    marginLeft: 8,
  },
  avatarImg: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 3,
    borderColor: AppColors.white,
  },
  avatarPlaceholder: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: ORANGE,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: AppColors.white,
  },
  avatarLetter: {
    fontFamily: "Cairo_700Bold",
    fontSize: 34,
    color: AppColors.white,
    lineHeight: 40,
  },
  editAvatarBtn: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: ORANGE,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: AppColors.white,
  },
  storeInfo: {
    flex: 1,
    paddingRight: 12,
    alignItems: "flex-end",
    paddingBottom: 4,
  },
  storeName: {
    fontFamily: "Cairo_700Bold",
    fontSize: 22,
    color: AppColors.black,
    textAlign: "right",
  },
  businessType: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: AppColors.gray500,
    textAlign: "right",
    marginBottom: 4,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontFamily: "Cairo_700Bold", fontSize: 11 },
  bioRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 6,
    gap: 8,
  },
  bioText: {
    flex: 1,
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: AppColors.gray500,
    textAlign: "right",
    lineHeight: 21,
  },
  bioPlaceholder: {
    flex: 1,
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: AppColors.gray300,
    textAlign: "right",
    fontStyle: "italic",
  },
  editBioBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: ORANGE_LIGHT,
    justifyContent: "center",
    alignItems: "center",
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 5,
  },
  addressText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    color: AppColors.gray400,
    textAlign: "right",
  },
  divider: { height: 8, backgroundColor: AppColors.secondary },

  // Body
  body: { paddingHorizontal: 16, paddingTop: 16 },

  // Notifications
  notifContainer: { marginBottom: 14, gap: 10 },
  notifBanner: {
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  notifIcon: { marginTop: 1, flexShrink: 0 },
  notifBody: { flex: 1 },
  notifTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    marginBottom: 3,
    textAlign: "right",
  },
  notifMessage: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    color: AppColors.gray700,
    textAlign: "right",
    lineHeight: 20,
  },
  notifDismiss: { paddingLeft: 4, marginTop: 2, flexShrink: 0 },

  // Pending
  pendingNotice: {
    backgroundColor: AppColors.warningLight,
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: AppColors.warning,
  },
  pendingText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: AppColors.primaryDark,
    flex: 1,
    textAlign: "right",
    lineHeight: 22,
  },

  // Stats
  sectionTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 18,
    color: AppColors.gray800,
    textAlign: "right",
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    marginTop: 4,
  },
  sectionAccent: {
    width: 4,
    height: 19,
    borderRadius: 2,
    backgroundColor: ORANGE,
  },

  // Live stats grid (2×2)
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    width: "47%",
    borderRadius: 20,
    padding: 15,
    alignItems: "center",
    gap: 6,
    shadowColor: AppColors.black,
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    position: "relative",
  },
  statIconBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  statValue: {
    fontFamily: "Cairo_700Bold",
    fontSize: 26,
    textAlign: "center",
  },
  statLabel: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    color: AppColors.gray500,
    textAlign: "center",
  },
  statDot: {
    position: "absolute",
    top: 10,
    left: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Quick actions
  actionsRow: { flexDirection: "row", gap: 12, marginBottom: 20 },
  quickAction: { flex: 1, borderRadius: 18, paddingVertical: 16, alignItems: "center", gap: 8 },
  quickLabel: { fontFamily: "Cairo_700Bold", fontSize: 13 },

  // Steps
  stepsCard: {
    backgroundColor: AppColors.white,
    borderRadius: 16,
    padding: 4,
    marginBottom: 20,
    elevation: 2,
  },
  stepRow: { flexDirection: "row", alignItems: "center", padding: 14 },
  stepBorder: { borderBottomWidth: 1, borderBottomColor: AppColors.gray100 },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  stepN: { fontFamily: "Cairo_700Bold", fontSize: 14 },
  stepTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    color: AppColors.black,
    textAlign: "right",
    marginBottom: 2,
  },
  stepDesc: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    color: AppColors.gray500,
    textAlign: "right",
    lineHeight: 18,
  },

  // Logout
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: AppColors.error,
    borderRadius: 14,
    backgroundColor: AppColors.errorLight,
    marginBottom: 8,
  },
  logoutText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: AppColors.error },

  // Bio modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  bioModal: {
    backgroundColor: AppColors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  bioModalTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    color: AppColors.black,
    textAlign: "center",
    marginBottom: 16,
  },
  bioInput: {
    borderWidth: 1.5,
    borderColor: AppColors.divider,
    borderRadius: 12,
    padding: 14,
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: AppColors.black,
    minHeight: 100,
    textAlignVertical: "top",
  },
  bioCount: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    color: AppColors.gray300,
    textAlign: "left",
    marginTop: 4,
    marginBottom: 16,
  },
  bioActions: { flexDirection: "row", gap: 12 },
  bioBtnSave: {
    flex: 1,
    backgroundColor: ORANGE,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  bioBtnSaveText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: AppColors.white },
  bioBtnCancel: {
    flex: 1,
    backgroundColor: AppColors.gray100,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  bioBtnCancelText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: AppColors.gray700 },
});

const settStyles = StyleSheet.create({
  label: { fontFamily: "Cairo_700Bold", fontSize: 13, color: AppColors.gray700, textAlign: "right", marginBottom: 6, marginTop: 14 },
  input: {
    borderWidth: 1.5, borderColor: AppColors.divider, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    fontFamily: "Cairo_400Regular", fontSize: 14, color: AppColors.black,
    textAlign: "right", backgroundColor: AppColors.gray50,
  },
  row: { flexDirection: "row-reverse", alignItems: "center", marginTop: 14, gap: 12 },
  toggle: { width: 44, height: 26, borderRadius: 13, justifyContent: "center" },
  toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: AppColors.white, shadowColor: AppColors.black, shadowOpacity: 0.15, shadowRadius: 3, elevation: 2 },
  toggleLabel: { fontFamily: "Cairo_700Bold", fontSize: 13, color: AppColors.gray700 },
  daysRow: { flexDirection: "row-reverse", gap: 6, flexWrap: "wrap", marginTop: 8 },
  dayBtn: { width: 38, height: 38, borderRadius: 19, justifyContent: "center", alignItems: "center", borderWidth: 1.5 },
  dayText: { fontFamily: "Cairo_700Bold", fontSize: 12 },
});
