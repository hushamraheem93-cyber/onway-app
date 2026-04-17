import React, { useEffect, useState, useCallback } from "react";
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
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";

const PURPLE = "#673AB7";
const ORANGE = "#E86520";

interface Stats {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
}

export default function VendorHomeScreen({ navigation }: any) {
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { vendorProfile, vendorToken, logout } = useAuth();

  const [stats, setStats] = useState<Stats>({ total: 0, approved: 0, pending: 0, rejected: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    loadStats().finally(() => setLoading(false));
  }, [loadStats]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  }, [loadStats]);

  const isPending = vendorProfile?.status === "pending";

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
          <View style={[styles.statusBadge, isPending ? styles.badgePending : styles.badgeActive]}>
            <View style={[styles.statusDot, { backgroundColor: isPending ? "#F59E0B" : "#10B981" }]} />
            <ThemedText style={[styles.statusText, { color: isPending ? "#92400E" : "#065F46" }]}>
              {isPending ? "قيد المراجعة" : "نشط"}
            </ThemedText>
          </View>
        </View>
      </View>

      {/* Pending notice */}
      {isPending && (
        <View style={styles.pendingNotice}>
          <MaterialCommunityIcons name="clock-outline" size={20} color="#D97706" />
          <ThemedText style={styles.pendingText}>
            حسابك قيد المراجعة — ستتمكن من إضافة منتجاتك بعد موافقة الإدارة
          </ThemedText>
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
      {!isPending && (
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
                navigation.navigate("VendorAddProduct");
              }}
            />
            <QuickAction
              icon="view-list"
              label="منتجاتي"
              color={ORANGE}
              bg="#FFF3E0"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                navigation.navigate("VendorProducts");
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
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontFamily: "Cairo_700Bold", fontSize: 11 },
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
