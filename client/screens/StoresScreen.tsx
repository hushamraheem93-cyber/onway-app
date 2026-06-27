import React, { useState, useMemo } from "react";
import {
  StyleSheet,
  View,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Dimensions,
} from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, AppColors, BorderRadius, Shadows, FontWeight} from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { GradientBackground } from "@/components/GradientBackground";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { getApiUrl } from "@/lib/query-client";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const SCREEN_W = Dimensions.get("window").width;
const CARD_W = SCREEN_W - 32;
const COVER_H = 150;
const AVATAR_SIZE = 62;

interface WorkingHours {
  openTime: string;
  closeTime: string;
  openDays: number[];
}

interface VendorStore {
  id: string;
  storeName: string;
  businessType: string;
  address?: string;
  bio?: string;
  totalProducts?: number;
  approvedAt?: string;
  profileImageUrl?: string;
  coverImageUrl?: string;
  rating?: number;
  deliveryTime?: string;
  deliveryPrice?: number;
  workingHours?: WorkingHours | null;
}

const BUSINESS_CONFIG: Record<
  string,
  { label: string; icon: string; color: string; bg: string; gradient: [string, string] }
> = {
  restaurant: { label: "مطعم", icon: "food", color: AppColors.primary, bg: AppColors.warningLight, gradient: [AppColors.primary, AppColors.primaryLight] },
  supermarket: { label: "سوبرماركت", icon: "cart", color: AppColors.success, bg: AppColors.successLight, gradient: [AppColors.success, AppColors.success] },
  pharmacy: { label: "صيدلية", icon: "medical-bag", color: AppColors.vendorPurple, bg: AppColors.vendorPurpleLight, gradient: [AppColors.vendorPurple, AppColors.vendorPurple] },
  bakery: { label: "مخبز", icon: "bread-slice", color: AppColors.warning, bg: AppColors.warningLight, gradient: [AppColors.warning, AppColors.primaryLight] },
  other: { label: "متجر", icon: "store", color: AppColors.driverBlue, bg: AppColors.driverBlueLight, gradient: [AppColors.driverBlue, AppColors.info] },
};

const DAY_NAMES = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function isStoreOpen(wh: WorkingHours | null | undefined): boolean {
  if (!wh) return true;
  const now = new Date();
  const day = now.getDay();
  if (!wh.openDays?.includes(day)) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const [oh, om] = (wh.openTime || "00:00").split(":").map(Number);
  const [ch, cm] = (wh.closeTime || "23:59").split(":").map(Number);
  return cur >= oh * 60 + om && cur < ch * 60 + cm;
}

function resolveUrl(path?: string): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  try { return new URL(path, getApiUrl()).toString(); } catch { return null; }
}

function StarRating({ value }: { value: number }) {
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  return (
    <View style={rStyles.row}>
      {[1, 2, 3, 4, 5].map((i) => (
        <MaterialCommunityIcons
          key={i}
          name={i <= full ? "star" : half && i === full + 1 ? "star-half-full" : "star-outline"}
          size={13}
          color={AppColors.warning}
        />
      ))}
      <ThemedText style={rStyles.val}>{value.toFixed(1)}</ThemedText>
    </View>
  );
}
const rStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 2 },
  val: { fontFamily: "Cairo_700Bold", fontSize: 12, color: AppColors.warning, marginRight: 2 },
});

const FILTER_TABS = [
  { key: "", label: "الكل", icon: "view-grid" },
  { key: "restaurant", label: "مطاعم", icon: "food" },
  { key: "supermarket", label: "سوبرماركت", icon: "cart" },
  { key: "pharmacy", label: "صيدليات", icon: "medical-bag" },
  { key: "bakery", label: "مخابز", icon: "bread-slice" },
  { key: "other", label: "متاجر", icon: "store" },
];

function StoreCard({ store, onPress }: { store: VendorStore; onPress: () => void }) {
  const { theme } = useTheme();
  const cfg = BUSINESS_CONFIG[store.businessType] || BUSINESS_CONFIG.other;
  const avatarUrl = resolveUrl(store.profileImageUrl);
  const coverUrl = resolveUrl(store.coverImageUrl);
  const open = isStoreOpen(store.workingHours);
  const rating = store.rating ?? null;
  const deliveryTime = store.deliveryTime || "30-45";
  const deliveryPrice = store.deliveryPrice ?? 0;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        cardStyles.card,
        { backgroundColor: theme.backgroundDefault, opacity: pressed ? 0.93 : 1 },
        Shadows.md,
      ]}
      testID={`store-card-${store.id}`}
    >
      {/* ── Cover Photo ── */}
      <View style={cardStyles.coverWrapper}>
        {coverUrl ? (
          <Image
            source={{ uri: coverUrl }}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <LinearGradient
            colors={cfg.gradient}
            style={StyleSheet.absoluteFillObject}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
        )}

        {/* Gradient overlay for readability */}
        <LinearGradient
          colors={["transparent", AppColors.overlay]}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0, y: 0.3 }}
          end={{ x: 0, y: 1 }}
        />

        {/* Business type badge — top right */}
        <View style={[cardStyles.typeBadge, { backgroundColor: cfg.color + "EE" }]}>
          <MaterialCommunityIcons name={cfg.icon as any} size={12} color={AppColors.white} />
          <ThemedText style={cardStyles.typeBadgeText}>{cfg.label}</ThemedText>
        </View>

        {/* Open / Closed — top left */}
        <View style={[cardStyles.openBadge, { backgroundColor: open ? "#10B981EE" : "#EF4444EE" }]}>
          <View style={[cardStyles.openDot, { backgroundColor: open ? AppColors.white : AppColors.error }]} />
          <ThemedText style={cardStyles.openText}>{open ? "مفتوح" : "مغلق"}</ThemedText>
        </View>

        {/* Delivery info row — bottom of cover */}
        <View style={cardStyles.coverBottom}>
          <View style={cardStyles.deliveryPill}>
            <MaterialCommunityIcons name="clock-outline" size={12} color={AppColors.white} />
            <ThemedText style={cardStyles.deliveryText}>{deliveryTime} دقيقة</ThemedText>
          </View>
          <View style={cardStyles.deliveryPill}>
            <MaterialCommunityIcons name="moped" size={12} color={AppColors.white} />
            <ThemedText style={cardStyles.deliveryText}>
              {deliveryPrice === 0 ? "توصيل مجاني" : `${deliveryPrice.toLocaleString("ar-IQ")} د.ع`}
            </ThemedText>
          </View>
        </View>
      </View>

      {/* ── Card Body ── */}
      <View style={cardStyles.body}>
        {/* Avatar overlapping cover */}
        <View style={[cardStyles.avatarWrap, { borderColor: theme.backgroundDefault }]}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={cardStyles.avatar} contentFit="cover" />
          ) : (
            <LinearGradient colors={cfg.gradient} style={cardStyles.avatarFallback}>
              <ThemedText style={cardStyles.avatarLetter}>
                {store.storeName?.[0] || "م"}
              </ThemedText>
            </LinearGradient>
          )}
        </View>

        {/* Info */}
        <View style={cardStyles.info}>
          <ThemedText style={[cardStyles.storeName, { color: theme.text }]} numberOfLines={1}>
            {store.storeName}
          </ThemedText>

          {rating !== null ? <StarRating value={rating} /> : null}

          {store.address ? (
            <View style={cardStyles.addressRow}>
              <Feather name="map-pin" size={11} color={theme.textSecondary} />
              <ThemedText
                style={[cardStyles.addressText, { color: theme.textSecondary }]}
                numberOfLines={1}
              >
                {store.address}
              </ThemedText>
            </View>
          ) : null}
        </View>

        {/* Arrow */}
        <View style={[cardStyles.arrowWrap, { backgroundColor: cfg.color + "18" }]}>
          <Feather name="chevron-left" size={18} color={cfg.color} />
        </View>
      </View>
    </Pressable>
  );
}

const cardStyles = StyleSheet.create({
  card: { borderRadius: BorderRadius.xl, overflow: "hidden", marginBottom: 0 },

  // Cover
  coverWrapper: { width: "100%", height: COVER_H, position: "relative" },
  typeBadge: {
    position: "absolute", top: 10, right: 10,
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: 12,
  },
  typeBadgeText: { fontFamily: "Cairo_700Bold", fontSize: 11, color: AppColors.white },
  openBadge: {
    position: "absolute", top: 10, left: 10,
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: 12,
  },
  openDot: { width: 6, height: 6, borderRadius: 3 },
  openText: { fontFamily: "Cairo_700Bold", fontSize: 11, color: AppColors.white },
  coverBottom: {
    position: "absolute", bottom: 10, right: 10,
    flexDirection: "row", gap: 6,
  },
  deliveryPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: AppColors.overlay,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 10,
  },
  deliveryText: { fontFamily: "Cairo_700Bold", fontSize: 11, color: AppColors.white },

  // Body
  body: {
    flexDirection: "row-reverse", alignItems: "center",
    paddingLeft: 14, paddingRight: 10,
    paddingBottom: 14, paddingTop: 4,
    gap: 10,
  },
  avatarWrap: {
    width: AVATAR_SIZE, height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 3, overflow: "hidden",
    marginTop: -(AVATAR_SIZE / 2),
    elevation: 4,
    backgroundColor: AppColors.white,
  },
  avatar: { width: "100%", height: "100%" },
  avatarFallback: { width: "100%", height: "100%", justifyContent: "center", alignItems: "center" },
  avatarLetter: { fontFamily: "Cairo_700Bold", fontSize: 24, color: AppColors.white, lineHeight: 30 },

  info: { flex: 1, alignItems: "flex-end", gap: 4, paddingTop: AVATAR_SIZE / 2 - 4 },
  storeName: { fontFamily: "Cairo_700Bold", fontSize: 16, textAlign: "right" },
  addressRow: { flexDirection: "row-reverse", alignItems: "center", gap: 4 },
  addressText: { fontSize: 12, textAlign: "right", fontFamily: "Cairo_400Regular", maxWidth: CARD_W * 0.5 },

  arrowWrap: {
    width: 34, height: 34, borderRadius: 17,
    justifyContent: "center", alignItems: "center",
    alignSelf: "flex-end", marginBottom: 4,
  },
});

export default function StoresScreen() {
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const [activeFilter, setActiveFilter] = useState("");

  const { data, isLoading, isError, refetch, isRefetching } = useQuery<{
    stores: VendorStore[];
    total: number;
  }>({
    queryKey: ["/api/stores"],
  });

  const allStores = data?.stores ?? [];

  const filtered = useMemo(() => {
    if (!activeFilter) return allStores;
    return allStores.filter((s) => s.businessType === activeFilter);
  }, [allStores, activeFilter]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { "": allStores.length };
    for (const s of allStores) {
      map[s.businessType] = (map[s.businessType] || 0) + 1;
    }
    return map;
  }, [allStores]);

  const filterTabs = FILTER_TABS.filter((f) => f.key === "" || (counts[f.key] ?? 0) > 0);

  const handleStorePress = (store: VendorStore) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("StoreProducts", { storeId: store.id, storeName: store.storeName });
  };

  return (
    <View style={{ flex: 1 }}>
      <GradientBackground />

      {isLoading ? (
        <View style={[screenStyles.center, { paddingTop: headerHeight }]}>
          <ActivityIndicator size="large" color={AppColors.primary} />
        </View>
      ) : isError ? (
        <View style={[screenStyles.center, { paddingTop: headerHeight }]}>
          <Feather name="wifi-off" size={48} color={theme.textSecondary} />
          <ThemedText type="body" style={{ color: theme.textSecondary }}>تعذّر تحميل المتاجر</ThemedText>
          <Pressable onPress={() => refetch()} style={screenStyles.retryBtn}>
            <ThemedText type="body" style={{ color: AppColors.primary, fontWeight: FontWeight.semiBold }}>
              إعادة المحاولة
            </ThemedText>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingTop: headerHeight + Spacing.sm,
            paddingBottom: tabBarHeight + Spacing.xl,
            paddingHorizontal: 16,
          }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={AppColors.primary}
            />
          }
          ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
          scrollIndicatorInsets={{ bottom: tabBarHeight }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              {/* Filter chips */}
              {filterTabs.length > 1 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={screenStyles.filterRow}
                >
                  {filterTabs.map((f) => {
                    const active = activeFilter === f.key;
                    const cfg = BUSINESS_CONFIG[f.key];
                    const activeColor = cfg?.color ?? AppColors.primary;
                    return (
                      <Pressable
                        key={f.key}
                        style={[
                          screenStyles.filterChip,
                          active
                            ? { backgroundColor: activeColor, borderColor: activeColor }
                            : { backgroundColor: theme.backgroundDefault, borderColor: theme.border ?? AppColors.divider },
                        ]}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setActiveFilter(f.key);
                        }}
                      >
                        <MaterialCommunityIcons
                          name={f.icon as any}
                          size={14}
                          color={active ? AppColors.white : theme.textSecondary}
                        />
                        <ThemedText
                          style={[screenStyles.filterChipText, { color: active ? AppColors.white : theme.textSecondary }]}
                        >
                          {f.label}
                        </ThemedText>
                        {counts[f.key] !== undefined ? (
                          <View
                            style={[
                              screenStyles.filterCount,
                              { backgroundColor: active ? AppColors.white + "40" : activeColor + "18" },
                            ]}
                          >
                            <ThemedText
                              style={[screenStyles.filterCountText, { color: active ? AppColors.white : activeColor }]}
                            >
                              {counts[f.key]}
                            </ThemedText>
                          </View>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : null}

              {/* Section heading */}
              <View style={screenStyles.sectionHeader}>
                <ThemedText type="h3" style={{ textAlign: "right", color: theme.text }}>
                  {activeFilter ? (BUSINESS_CONFIG[activeFilter]?.label ?? "المتاجر") : "جميع المتاجر"}
                </ThemedText>
                <View style={[screenStyles.countBadge, { backgroundColor: AppColors.primary + "18" }]}>
                  <ThemedText style={[screenStyles.countText, { color: AppColors.primary }]}>
                    {filtered.length}
                  </ThemedText>
                </View>
              </View>
            </>
          }
          ListEmptyComponent={
            <View style={screenStyles.emptyContainer}>
              <MaterialCommunityIcons
                name="store-off"
                size={64}
                color={theme.textSecondary}
                style={{ opacity: 0.35 }}
              />
              <ThemedText type="h4" style={[{ textAlign: "center", color: theme.textSecondary }]}>
                لا توجد متاجر حالياً
              </ThemedText>
              <ThemedText type="small" style={{ textAlign: "center", color: theme.textSecondary }}>
                {activeFilter ? "لا توجد متاجر من هذا النوع" : "سيتم إضافة متاجر قريباً"}
              </ThemedText>
            </View>
          }
          renderItem={({ item }) => (
            <StoreCard store={item} onPress={() => handleStorePress(item)} />
          )}
        />
      )}
    </View>
  );
}

const screenStyles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: Spacing.md },
  retryBtn: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg },
  filterRow: { flexDirection: "row", gap: 8, paddingBottom: Spacing.md, paddingTop: Spacing.xs },
  filterChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1.5,
  },
  filterChipText: { fontFamily: "Cairo_700Bold", fontSize: 12 },
  filterCount: { borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  filterCountText: { fontFamily: "Cairo_700Bold", fontSize: 10 },
  sectionHeader: {
    flexDirection: "row-reverse", justifyContent: "space-between",
    alignItems: "center", marginBottom: Spacing.md,
  },
  countBadge: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 2 },
  countText: { fontFamily: "Cairo_700Bold", fontSize: 12 },
  emptyContainer: { alignItems: "center", paddingTop: 80, gap: Spacing.md },
});
