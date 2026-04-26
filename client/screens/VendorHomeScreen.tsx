import React, { useEffect, useState, useCallback, useRef, ComponentProps } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useFocusEffect } from "@react-navigation/native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

type MCIcon = ComponentProps<typeof MaterialCommunityIcons>["name"];

import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";

const PURPLE = "#673AB7";
const ORANGE = "#E86520";
const POLL_INTERVAL_MS = 30_000;

interface Stats {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
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

function notifColor(type: string): { bg: string; border: string; icon: MCIcon; iconColor: string } {
  if (type === "vendor_active") return { bg: "#F0FDF4", border: "#86EFAC", icon: "check-circle", iconColor: "#16A34A" };
  if (type === "vendor_rejected") return { bg: "#FFF5F5", border: "#FECACA", icon: "close-circle", iconColor: "#DC2626" };
  if (type === "vendor_suspended") return { bg: "#FFFBEB", border: "#FDE68A", icon: "alert-circle", iconColor: "#D97706" };
  if (type === "product_approved") return { bg: "#F0FDF4", border: "#86EFAC", icon: "check-circle", iconColor: "#16A34A" };
  if (type === "product_rejected") return { bg: "#FFF5F5", border: "#FECACA", icon: "close-circle", iconColor: "#DC2626" };
  return { bg: "#F0F9FF", border: "#BAE6FD", icon: "bell", iconColor: PURPLE };
}

export default function VendorHomeScreen({ navigation }: any) {
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { vendorProfile, vendorToken, logout, refreshVendorProfile } = useAuth();

  const [stats, setStats] = useState<Stats>({ total: 0, approved: 0, pending: 0, rejected: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<VendorNotification[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setDismissedIds(new Set());
    setNotifications([]);
  }, [vendorToken]);

  const loadStats = useCallback(async () => {
    if (!vendorToken) return;
    try {
      const res = await fetch(new URL("/api/vendor/products", getApiUrl()).toString(), {
        headers: { Authorization: `Bearer ${vendorToken}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const products = (data.products || []).filter((p: any) => p.status !== "deleted");
      setStats({
        total: products.length,
        approved: products.filter((p: any) => p.status === "approved").length,
        pending: products.filter((p: any) => p.status === "pending").length,
        rejected: products.filter((p: any) => p.status === "rejected").length,
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
      const unread = (data.notifications || []).filter((n: VendorNotification) => n.status === "unread");
      setNotifications(unread);

      const hasStatusChange = unread.some((n: VendorNotification) =>
        n.type === "vendor_active" || n.type === "vendor_rejected" || n.type === "vendor_suspended"
      );
      if (hasStatusChange) {
        refreshVendorProfile();
      }
    } catch {}
  }, [vendorToken, refreshVendorProfile]);

  const markNotificationsRead = useCallback(async (ids: string[]) => {
    if (!vendorToken || ids.length === 0) return;
    try {
      await fetch(new URL("/api/vendor/notifications/mark-read", getApiUrl()).toString(), {
        method: "PUT",
        headers: { Authorization: `Bearer ${vendorToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
    } catch {}
  }, [vendorToken]);

  const dismissNotification = useCallback((notif: VendorNotification) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDismissedIds((prev) => new Set([...prev, notif.id]));
    markNotificationsRead([notif.id]);
  }, [markNotificationsRead]);

  useFocusEffect(
    useCallback(() => {
      if (!vendorToken) return;
      Promise.all([loadStats(), loadNotifications()]).finally(() => setLoading(false));

      pollRef.current = setInterval(() => {
        loadNotifications();
      }, POLL_INTERVAL_MS);

      return () => {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      };
    }, [vendorToken, loadStats, loadNotifications])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadStats(), loadNotifications()]);
    setRefreshing(false);
  }, [loadStats, loadNotifications]);

  const isPending = vendorProfile?.status === "pending";
  const isRejected = vendorProfile?.status === "rejected";
  const isSuspended = vendorProfile?.status === "suspended";

  const visibleNotifications = notifications.filter((n) => !dismissedIds.has(n.id));

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingTop: headerHeight + 16,
        paddingBottom: tabBarHeight + 24,
        paddingHorizontal: 16,
      }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PURPLE} />}
    >
      {/* Welcome card */}
      <View style={styles.welcomeCard}>
        <View style={styles.welcomeLeft}>
          <View style={styles.storeAvatar}>
            <ThemedText style={styles.storeAvatarLetter}>
              {vendorProfile?.storeName?.[0] || "م"}
            </ThemedText>
          </View>
        </View>
        <View style={styles.welcomeRight}>
          <ThemedText style={styles.welcomeGreet}>مرحباً</ThemedText>
          <ThemedText style={styles.welcomeName}>{vendorProfile?.storeName || "متجري"}</ThemedText>
          <View style={[
            styles.statusBadge,
            isPending ? styles.badgePending : isRejected ? styles.badgeRejected : isSuspended ? styles.badgeSuspended : styles.badgeActive,
          ]}>
            <View style={[styles.statusDot, {
              backgroundColor: isPending ? "#F59E0B" : isRejected ? "#EF4444" : isSuspended ? "#F59E0B" : "#10B981",
            }]} />
            <ThemedText style={[styles.statusText, {
              color: isPending ? "#92400E" : isRejected ? "#991B1B" : isSuspended ? "#92400E" : "#065F46",
            }]}>
              {isPending ? "قيد المراجعة" : isRejected ? "مرفوض" : isSuspended ? "موقوف" : "نشط"}
            </ThemedText>
          </View>
        </View>
      </View>

      {/* Notification banners */}
      {visibleNotifications.length > 0 && (
        <View style={styles.notifContainer} testID="notifications-list">
          {visibleNotifications.map((notif) => {
            const theme = notifColor(notif.type);
            return (
              <View
                key={notif.id}
                style={[styles.notifBanner, { backgroundColor: theme.bg, borderColor: theme.border }]}
                testID={`notification-${notif.id}`}
              >
                <MaterialCommunityIcons
                  name={theme.icon}
                  size={22}
                  color={theme.iconColor}
                  style={styles.notifIcon}
                />
                <View style={styles.notifBody}>
                  <ThemedText style={[styles.notifTitle, { color: theme.iconColor }]}>{notif.title}</ThemedText>
                  <ThemedText style={styles.notifMessage}>{notif.message}</ThemedText>
                </View>
                <Pressable
                  onPress={() => dismissNotification(notif)}
                  style={styles.notifDismiss}
                  testID={`button-dismiss-notification-${notif.id}`}
                  hitSlop={8}
                >
                  <Feather name="x" size={16} color="#999" />
                </Pressable>
              </View>
            );
          })}
        </View>
      )}

      {/* Pending notice */}
      {isPending && (
        <View style={styles.pendingNotice}>
          <MaterialCommunityIcons name="clock-outline" size={20} color="#D97706" />
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.pendingText}>
              حسابك قيد المراجعة من الإدارة
            </ThemedText>
            <ThemedText style={[styles.pendingText, { fontSize: 12, marginTop: 2 }]}>
              يمكنك الآن إضافة منتجاتك وتجهيزها — ستظهر للزبائن بعد تفعيل الحساب
            </ThemedText>
          </View>
        </View>
      )}

      {/* Stats */}
      {loading ? (
        <ActivityIndicator color={PURPLE} style={{ marginTop: 24 }} />
      ) : (
        <View style={styles.statsGrid}>
          <StatCard icon="package-variant" label="كل المنتجات" value={stats.total} color={PURPLE} bg="#EDE7F6" />
          <StatCard icon="check-circle" label="معتمدة" value={stats.approved} color="#10B981" bg="#D1FAE5" />
          <StatCard icon="clock-outline" label="قيد المراجعة" value={stats.pending} color="#F59E0B" bg="#FEF3C7" />
          <StatCard icon="close-circle" label="مرفوضة" value={stats.rejected} color="#EF4444" bg="#FEE2E2" />
        </View>
      )}

      {/* How it works */}
      <ThemedText style={styles.sectionTitle}>كيف يعمل النظام</ThemedText>
      <View style={styles.stepsCard}>
        {[
          { n: "1", icon: "upload", title: "أضف منتجاتك", desc: "ارفع صورة واضحة وحدد السعر والتفاصيل", color: PURPLE },
          { n: "2", icon: "eye", title: "مراجعة الإدارة", desc: "يراجع الفريق منتجك خلال 24 ساعة", color: ORANGE },
          { n: "3", icon: "storefront", title: "يظهر للزبائن", desc: "بعد الموافقة يُعرض منتجك في التطبيق فوراً", color: "#10B981" },
        ].map((step, i) => (
          <View key={i} style={[styles.stepRow, i < 2 && styles.stepBorder]}>
            <View style={[styles.stepCircle, { backgroundColor: step.color + "20" }]}>
              <ThemedText style={[styles.stepN, { color: step.color }]}>{step.n}</ThemedText>
            </View>
            <MaterialCommunityIcons name={step.icon as any} size={22} color={step.color} style={{ marginHorizontal: 12 }} />
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.stepTitle}>{step.title}</ThemedText>
              <ThemedText style={styles.stepDesc}>{step.desc}</ThemedText>
            </View>
          </View>
        ))}
      </View>

      {/* Quick actions */}
      {!isPending && !isRejected && !isSuspended && (
        <>
          <ThemedText style={styles.sectionTitle}>إجراءات سريعة</ThemedText>
          <View style={styles.actionsRow}>
            <QuickAction
              icon="plus-circle"
              label="إضافة منتج"
              color={PURPLE}
              bg="#EDE7F6"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                navigation.navigate("VendorProductsTab", { screen: "VendorAddProduct" });
              }}
            />
            <QuickAction
              icon="view-list"
              label="منتجاتي"
              color={ORANGE}
              bg="#FFF3E0"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                navigation.navigate("VendorProductsTab", { screen: "VendorProducts" });
              }}
            />
          </View>
        </>
      )}

      {/* Logout */}
      <Pressable style={styles.logoutBtn} onPress={logout} testID="button-logout">
        <Feather name="log-out" size={16} color="#EF4444" />
        <ThemedText style={styles.logoutText}>تسجيل الخروج</ThemedText>
      </Pressable>
    </ScrollView>
  );
}

function StatCard({ icon, label, value, color, bg }: any) {
  return (
    <View style={[styles.statCard, { borderTopColor: color }]}>
      <View style={[styles.statIconWrap, { backgroundColor: bg }]}>
        <MaterialCommunityIcons name={icon} size={22} color={color} />
      </View>
      <ThemedText style={[styles.statValue, { color }]}>{value}</ThemedText>
      <ThemedText style={styles.statLabel}>{label}</ThemedText>
    </View>
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
  container: { flex: 1, backgroundColor: "#F8F7FF" },
  welcomeCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    shadowColor: "#673AB7",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  welcomeLeft: { marginLeft: 14 },
  storeAvatar: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: PURPLE,
    justifyContent: "center", alignItems: "center",
  },
  storeAvatarLetter: { fontFamily: "Cairo_700Bold", fontSize: 24, color: "#fff" },
  welcomeRight: { flex: 1 },
  welcomeGreet: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "#999", textAlign: "right" },
  welcomeName: { fontFamily: "Cairo_700Bold", fontSize: 18, color: "#222", textAlign: "right" },
  statusBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    alignSelf: "flex-end", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginTop: 4,
  },
  badgePending: { backgroundColor: "#FEF3C7" },
  badgeActive: { backgroundColor: "#D1FAE5" },
  badgeRejected: { backgroundColor: "#FEE2E2" },
  badgeSuspended: { backgroundColor: "#FEF3C7" },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontFamily: "Cairo_700Bold", fontSize: 11 },
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
  notifTitle: { fontFamily: "Cairo_700Bold", fontSize: 13, marginBottom: 3, textAlign: "right" },
  notifMessage: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "#444", textAlign: "right", lineHeight: 20 },
  notifDismiss: { paddingLeft: 4, marginTop: 2, flexShrink: 0 },
  pendingNotice: {
    backgroundColor: "#FFFBEB",
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  pendingText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: "#92400E", flex: 1, textAlign: "right", lineHeight: 22 },
  statsGrid: {
    flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20,
  },
  statCard: {
    width: "47.5%",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    borderTopWidth: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statIconWrap: { width: 42, height: 42, borderRadius: 12, justifyContent: "center", alignItems: "center", marginBottom: 8 },
  statValue: { fontFamily: "Cairo_700Bold", fontSize: 24 },
  statLabel: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "#777", textAlign: "center", marginTop: 2 },
  sectionTitle: {
    fontFamily: "Cairo_700Bold", fontSize: 15, color: "#333",
    textAlign: "right", marginBottom: 10, marginTop: 4,
  },
  stepsCard: {
    backgroundColor: "#fff", borderRadius: 16, padding: 4, marginBottom: 20,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  stepRow: { flexDirection: "row", alignItems: "center", padding: 14 },
  stepBorder: { borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  stepCircle: {
    width: 32, height: 32, borderRadius: 10,
    justifyContent: "center", alignItems: "center",
  },
  stepN: { fontFamily: "Cairo_700Bold", fontSize: 14 },
  stepTitle: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#222", textAlign: "right", marginBottom: 2 },
  stepDesc: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "#888", textAlign: "right", lineHeight: 18 },
  actionsRow: { flexDirection: "row", gap: 12, marginBottom: 20 },
  quickAction: {
    flex: 1, borderRadius: 14, paddingVertical: 16,
    alignItems: "center", gap: 8,
  },
  quickLabel: { fontFamily: "Cairo_700Bold", fontSize: 13 },
  logoutBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 14,
    borderWidth: 1.5, borderColor: "#FECACA", borderRadius: 14,
    backgroundColor: "#FFF5F5", marginBottom: 8,
  },
  logoutText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: "#EF4444" },
});
