import React, { useState, useMemo } from "react";
import {
  StyleSheet,
  View,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, AppColors, BorderRadius, Shadows } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { GradientBackground } from "@/components/GradientBackground";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { getApiUrl } from "@/lib/query-client";

type NavProp = NativeStackNavigationProp<RootStackParamList>;
type RouteType = RouteProp<RootStackParamList, "StoresList">;

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

type MCIcon = keyof typeof MaterialCommunityIcons.glyphMap;

interface BizConfig {
  label: string;
  icon: MCIcon;
  color: string;
  gradient: [string, string];
}

const BUSINESS_CONFIG: Record<string, BizConfig> = {
  restaurant: { label: "مطعم", icon: "food", color: AppColors.primary, gradient: [AppColors.primary, AppColors.primaryLight] },
  supermarket: { label: "سوبرماركت", icon: "cart", color: AppColors.success, gradient: [AppColors.success, AppColors.success] },
  pharmacy: { label: "صيدلية", icon: "medical-bag", color: AppColors.vendorPurple, gradient: [AppColors.vendorPurple, AppColors.vendorPurple] },
  bakery: { label: "مخبز", icon: "bread-slice", color: AppColors.warning, gradient: [AppColors.warning, AppColors.primaryLight] },
  other: { label: "متجر", icon: "store", color: AppColors.driverBlue, gradient: [AppColors.driverBlue, AppColors.info] },
};

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
  // Absolute URLs (http/https) and base64 data URIs → return as-is
  if (path.startsWith("http") || path.startsWith("data:")) return path;
  try { return new URL(path, getApiUrl()).toString(); } catch { return null; }
}

function StarRating({ value }: { value: number }) {
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  return (
    <View style={sStyles.starRow}>
      {[1, 2, 3, 4, 5].map((i) => (
        <MaterialCommunityIcons
          key={i}
          name={i <= full ? "star" : half && i === full + 1 ? "star-half-full" : "star-outline"}
          size={13}
          color={AppColors.warning}
        />
      ))}
      <ThemedText style={sStyles.starVal}>{value.toFixed(1)}</ThemedText>
    </View>
  );
}

const sStyles = StyleSheet.create({
  starRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  starVal: { fontFamily: "Cairo_700Bold", fontSize: 12, color: AppColors.warning, marginRight: 2 },
});

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
      accessibilityRole="button"
      accessibilityLabel={`متجر ${store.storeName}`}
      style={({ pressed }) => [
        cardStyles.card,
        { backgroundColor: theme.backgroundDefault, opacity: pressed ? 0.93 : 1 },
        Shadows.md,
      ]}
      testID={`store-list-card-${store.id}`}
    >
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
        <LinearGradient
          colors={["transparent", AppColors.overlay]}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0, y: 0.3 }}
          end={{ x: 0, y: 1 }}
        />
        <View style={[cardStyles.typeBadge, { backgroundColor: cfg.color + "EE" }]}>
          <MaterialCommunityIcons name={cfg.icon} size={12} color={AppColors.white} />
          <ThemedText style={cardStyles.typeBadgeText}>{cfg.label}</ThemedText>
        </View>
        <View style={[cardStyles.openBadge, { backgroundColor: open ? "#10B981EE" : "#EF4444EE" }]}>
          <View style={[cardStyles.openDot, { backgroundColor: open ? AppColors.white : AppColors.error }]} />
          <ThemedText style={cardStyles.openText}>{open ? "مفتوح" : "مغلق"}</ThemedText>
        </View>
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

      <View style={cardStyles.body}>
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
        <View style={cardStyles.info}>
          <ThemedText style={[cardStyles.storeName, { color: theme.text }]} numberOfLines={1}>
            {store.storeName}
          </ThemedText>
          {rating !== null ? <StarRating value={rating} /> : null}
          {store.address ? (
            <View style={cardStyles.addressRow}>
              <Feather name="map-pin" size={11} color={theme.textSecondary} />
              <ThemedText style={[cardStyles.addressText, { color: theme.textSecondary }]} numberOfLines={1}>
                {store.address}
              </ThemedText>
            </View>
          ) : null}
        </View>
        <View style={[cardStyles.arrowWrap, { backgroundColor: cfg.color + "18" }]}>
          <Feather name="chevron-left" size={18} color={cfg.color} />
        </View>
      </View>
    </Pressable>
  );
}

const cardStyles = StyleSheet.create({
  card: { borderRadius: BorderRadius.xl, overflow: "hidden", marginBottom: 0 },
  coverWrapper: { width: "100%", height: COVER_H, position: "relative" },
  typeBadge: {
    position: "absolute", top: 10, right: 10,
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12,
  },
  typeBadgeText: { fontFamily: "Cairo_700Bold", fontSize: 11, color: AppColors.white },
  openBadge: {
    position: "absolute", top: 10, left: 10,
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12,
  },
  openDot: { width: 6, height: 6, borderRadius: 3 },
  openText: { fontFamily: "Cairo_700Bold", fontSize: 11, color: AppColors.white },
  coverBottom: { position: "absolute", bottom: 10, right: 10, flexDirection: "row", gap: 6 },
  deliveryPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: AppColors.overlay,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
  },
  deliveryText: { fontFamily: "Cairo_700Bold", fontSize: 11, color: AppColors.white },
  body: {
    flexDirection: "row-reverse", alignItems: "center",
    paddingLeft: 14, paddingRight: 10, paddingBottom: 14, paddingTop: 4, gap: 10,
  },
  avatarWrap: {
    width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2,
    borderWidth: 3, overflow: "hidden", marginTop: -(AVATAR_SIZE / 2),
    elevation: 4, backgroundColor: AppColors.white,
  },
  avatar: { width: "100%", height: "100%" },
  avatarFallback: { width: "100%", height: "100%", justifyContent: "center", alignItems: "center" },
  avatarLetter: { fontFamily: "Cairo_700Bold", fontSize: 24, color: AppColors.white, lineHeight: 30 },
  info: { flex: 1, alignItems: "flex-end", gap: 4, paddingTop: AVATAR_SIZE / 2 - 4 },
  storeName: { fontFamily: "Cairo_700Bold", fontSize: 16, textAlign: "right" },
  addressRow: { flexDirection: "row-reverse", alignItems: "center", gap: 4 },
  addressText: { fontSize: 12, textAlign: "right", fontFamily: "Cairo_400Regular", maxWidth: 200 },
  arrowWrap: {
    width: 34, height: 34, borderRadius: 17,
    justifyContent: "center", alignItems: "center",
    alignSelf: "flex-end", marginBottom: 4,
  },
});

export default function StoresListScreen() {
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const { categoryId, categoryName, businessType } = route.params;
  const [searchQuery, setSearchQuery] = useState("");

  // Pass businessType if available (preferred filter), otherwise fall back to categoryId.
  // The server maps categoryId→businessType for common values, but sending businessType
  // directly is more reliable and works even for categories not yet in the server map.
  const apiUrl = (() => {
    const base = new URL("/api/stores", getApiUrl()).toString();
    const params = new URLSearchParams();
    if (businessType) {
      params.set("businessType", businessType);
    } else {
      params.set("categoryId", categoryId);
    }
    return `${base}?${params.toString()}`;
  })();

  const { data, isLoading, isError, refetch, isRefetching } = useQuery<{
    stores: VendorStore[];
    total: number;
  }>({
    queryKey: ["/api/stores", "category", categoryId],
    queryFn: () => fetch(apiUrl).then((r) => r.json()),
  });

  const allStores = data?.stores ?? [];

  const stores = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allStores;
    return allStores.filter((s) => (s.storeName || "").toLowerCase().includes(q));
  }, [allStores, searchQuery]);

  const handleStorePress = (store: VendorStore) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("StoreProducts", {
      storeId: store.id,
      storeName: store.storeName,
      initialCategoryFilter: categoryId,
    });
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1 }}>
        <GradientBackground />
        <View style={[styles.center, { paddingTop: headerHeight }]}>
          <ActivityIndicator size="large" color={AppColors.primary} />
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={{ flex: 1 }}>
        <GradientBackground />
        <View style={[styles.center, { paddingTop: headerHeight }]}>
          <Feather name="wifi-off" size={48} color={theme.textSecondary} />
          <ThemedText type="body" style={{ color: theme.textSecondary }}>تعذّر تحميل المتاجر</ThemedText>
          <Pressable
            onPress={() => refetch()}
            style={styles.retryBtn}
            accessibilityRole="button"
            accessibilityLabel="إعادة المحاولة"
          >
            <ThemedText type="body" style={{ color: AppColors.primary, fontFamily: "Cairo_700Bold" }}>
              إعادة المحاولة
            </ThemedText>
          </Pressable>
        </View>
      </View>
    );
  }

  if (allStores.length === 0) {
    return (
      <View style={{ flex: 1 }}>
        <GradientBackground />
        <View style={[styles.emptyRoot, { paddingTop: headerHeight }]}>
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <MaterialCommunityIcons name="store-clock" size={72} color={AppColors.primary} style={{ opacity: 0.7 }} />
            </View>
            <ThemedText style={styles.emptyTitle}>قريباً في OnWay الضلوعية!</ThemedText>
            <ThemedText style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
              نعمل حالياً على ضم أفضل المتاجر في قسم {categoryName}
            </ThemedText>
            <Pressable
              onPress={() => navigation.goBack()}
              style={[styles.backBtn, { backgroundColor: AppColors.primary }]}
              testID="button-back-coming-soon"
              accessibilityRole="button"
              accessibilityLabel="رجوع للرئيسية"
            >
              <Feather name="arrow-right" size={18} color={AppColors.white} />
              <ThemedText style={styles.backBtnText}>رجوع للرئيسية</ThemedText>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <GradientBackground />
      <FlatList
        data={stores}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.sm,
          paddingBottom: insets.bottom + Spacing.xl,
          paddingHorizontal: 16,
          gap: 14,
        }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={AppColors.primary}
          />
        }
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={{ gap: Spacing.sm }}>
            <View style={styles.sectionHeader}>
              <ThemedText type="h3" style={{ textAlign: "right", color: theme.text }}>
                {categoryName}
              </ThemedText>
              <View style={[styles.countBadge, { backgroundColor: AppColors.primary + "18" }]}>
                <ThemedText style={[styles.countText, { color: AppColors.primary }]}>
                  {stores.length}
                </ThemedText>
              </View>
            </View>
            <View style={[styles.searchBar, { backgroundColor: theme.backgroundDefault }]}>
              <Feather name="search" size={17} color={theme.textSecondary} />
              <TextInput
                style={[styles.searchInput, { color: theme.text }]}
                placeholder="ابحث عن متجر..."
                placeholderTextColor={theme.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                returnKeyType="search"
                textAlign="right"
                testID="input-store-search"
              />
              {searchQuery.length > 0 ? (
                <Pressable
                  onPress={() => setSearchQuery("")}
                  testID="button-clear-search"
                  accessibilityRole="button"
                  accessibilityLabel="مسح البحث"
                  hitSlop={8}
                >
                  <Feather name="x" size={16} color={theme.textSecondary} />
                </Pressable>
              ) : null}
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={[styles.searchEmptyWrap]}>
            <Feather name="search" size={48} color={theme.textSecondary} style={{ opacity: 0.4 }} />
            <ThemedText style={[styles.searchEmptyText, { color: theme.textSecondary }]}>
              لا توجد متاجر تطابق بحثك
            </ThemedText>
          </View>
        }
        renderItem={({ item }) => (
          <StoreCard store={item} onPress={() => handleStorePress(item)} />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: Spacing.md },
  retryBtn: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg },
  emptyRoot: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingHorizontal: 24,
  },
  emptyCard: {
    width: "100%", alignItems: "center", gap: Spacing.md,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 24, paddingVertical: 40, paddingHorizontal: 28,
  },
  emptyIconWrap: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: AppColors.primary + "12",
    justifyContent: "center", alignItems: "center",
    marginBottom: 8,
  },
  emptyTitle: {
    fontFamily: "Cairo_700Bold", fontSize: 22,
    color: AppColors.black, textAlign: "center",
  },
  emptySubtitle: {
    fontFamily: "Cairo_400Regular", fontSize: 15,
    textAlign: "center", lineHeight: 24,
  },
  backBtn: {
    flexDirection: "row-reverse", alignItems: "center", gap: 8,
    paddingHorizontal: 28, paddingVertical: 14,
    borderRadius: 16, marginTop: 8,
  },
  backBtnText: {
    fontFamily: "Cairo_700Bold", fontSize: 15, color: AppColors.white,
  },
  sectionHeader: {
    flexDirection: "row-reverse", justifyContent: "space-between",
    alignItems: "center",
  },
  countBadge: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 2 },
  countText: { fontFamily: "Cairo_700Bold", fontSize: 12 },
  searchBar: {
    flexDirection: "row-reverse", alignItems: "center", gap: 10,
    borderRadius: BorderRadius.lg, paddingHorizontal: 14, paddingVertical: 10,
    ...Shadows.sm,
  },
  searchInput: {
    flex: 1, fontFamily: "Cairo_400Regular", fontSize: 16,
    paddingVertical: 0,
  },
  searchEmptyWrap: {
    alignItems: "center", justifyContent: "center",
    paddingTop: 60, gap: Spacing.md,
  },
  searchEmptyText: {
    fontFamily: "Cairo_400Regular", fontSize: 15, textAlign: "center",
  },
});
