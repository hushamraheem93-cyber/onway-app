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
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, AppColors, BorderRadius, Shadows } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { GradientBackground } from "@/components/GradientBackground";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { getApiUrl } from "@/lib/query-client";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const SCREEN_W = Dimensions.get("window").width;

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
}

const BUSINESS_CONFIG: Record<
  string,
  { label: string; icon: string; color: string; bg: string }
> = {
  restaurant: { label: "مطعم", icon: "food", color: "#E86520", bg: "#FFF4E0" },
  supermarket: { label: "سوبرماركت", icon: "cart", color: "#2E7D32", bg: "#E8F5E9" },
  pharmacy: { label: "صيدلية", icon: "medical-bag", color: "#7B1FA2", bg: "#F3E5F5" },
  bakery: { label: "مخبز", icon: "bread-slice", color: "#F57F17", bg: "#FFF8E1" },
  other: { label: "متجر", icon: "store", color: "#1565C0", bg: "#E3F2FD" },
};

const FILTER_TABS = [
  { key: "", label: "الكل", icon: "grid" },
  { key: "restaurant", label: "مطاعم", icon: "food" },
  { key: "supermarket", label: "سوبرماركت", icon: "cart" },
  { key: "pharmacy", label: "صيدليات", icon: "medical-bag" },
  { key: "bakery", label: "مخابز", icon: "bread-slice" },
  { key: "other", label: "متاجر", icon: "store" },
];

function resolveUrl(path?: string): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  try {
    return new URL(path, getApiUrl()).toString();
  } catch {
    return null;
  }
}

function StoreCard({
  store,
  onPress,
}: {
  store: VendorStore;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const cfg = BUSINESS_CONFIG[store.businessType] || BUSINESS_CONFIG.other;
  const avatarUrl = resolveUrl(store.profileImageUrl);
  const coverUrl = resolveUrl(store.coverImageUrl);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.backgroundDefault, opacity: pressed ? 0.92 : 1 },
        Shadows.md,
      ]}
      testID={`store-card-${store.id}`}
    >
      {/* Cover / top band */}
      <View style={[styles.cardCover, { backgroundColor: cfg.bg }]}>
        {coverUrl ? (
          <Image
            source={{ uri: coverUrl }}
            style={StyleSheet.absoluteFillObject}
            contentFit="cover"
          />
        ) : null}
        {/* Dark overlay when cover exists */}
        {coverUrl ? <View style={styles.coverOverlay} /> : null}

        {/* Business type badge */}
        <View style={[styles.typeBadge, { backgroundColor: cfg.color + "EE" }]}>
          <MaterialCommunityIcons name={cfg.icon as any} size={12} color="#fff" />
          <ThemedText style={styles.typeBadgeText}>{cfg.label}</ThemedText>
        </View>
      </View>

      {/* Bottom info section */}
      <View style={styles.cardBody}>
        {/* Avatar */}
        <View style={[styles.avatarWrap, { borderColor: theme.backgroundDefault }]}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatarFallback, { backgroundColor: cfg.color }]}>
              <ThemedText style={styles.avatarLetter}>
                {store.storeName?.[0] || "م"}
              </ThemedText>
            </View>
          )}
        </View>

        <View style={styles.cardInfo}>
          <ThemedText
            type="h4"
            style={[styles.storeName, { color: theme.textPrimary }]}
            numberOfLines={1}
          >
            {store.storeName}
          </ThemedText>

          {store.bio ? (
            <ThemedText
              type="small"
              style={[styles.bio, { color: theme.textSecondary }]}
              numberOfLines={1}
            >
              {store.bio}
            </ThemedText>
          ) : null}

          <View style={styles.metaRow}>
            {store.address ? (
              <View style={styles.metaItem}>
                <Feather name="map-pin" size={11} color={theme.textSecondary} />
                <ThemedText
                  type="small"
                  style={[styles.metaText, { color: theme.textSecondary }]}
                  numberOfLines={1}
                >
                  {store.address}
                </ThemedText>
              </View>
            ) : null}
            {store.totalProducts !== undefined && store.totalProducts > 0 ? (
              <View style={[styles.productsBadge, { backgroundColor: cfg.color + "18" }]}>
                <ThemedText style={[styles.productsText, { color: cfg.color }]}>
                  {store.totalProducts} منتج
                </ThemedText>
              </View>
            ) : null}
          </View>
        </View>

        <Feather name="chevron-left" size={18} color={theme.textSecondary} style={styles.chevron} />
      </View>
    </Pressable>
  );
}

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

  const handleStorePress = (store: VendorStore) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("StoreProducts", {
      storeId: store.id,
      storeName: store.storeName,
    });
  };

  const filterTabs = FILTER_TABS.filter(
    (f) => f.key === "" || (counts[f.key] ?? 0) > 0
  );

  return (
    <View style={{ flex: 1 }}>
      <GradientBackground />

      {isLoading ? (
        <View style={[styles.center, { paddingTop: headerHeight }]}>
          <ActivityIndicator size="large" color={AppColors.primary} />
        </View>
      ) : isError ? (
        <View style={[styles.center, { paddingTop: headerHeight }]}>
          <Feather name="wifi-off" size={48} color={theme.textSecondary} />
          <ThemedText
            type="body"
            style={[styles.emptyText, { color: theme.textSecondary }]}
          >
            تعذّر تحميل المتاجر
          </ThemedText>
          <Pressable onPress={() => refetch()} style={styles.retryBtn}>
            <ThemedText
              type="body"
              style={{ color: AppColors.primary, fontWeight: "600" }}
            >
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
            paddingHorizontal: Spacing.lg,
          }}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={AppColors.primary}
            />
          }
          ListHeaderComponent={
            <>
              {/* Filter chips */}
              {filterTabs.length > 1 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.filterRow}
                >
                  {filterTabs.map((f) => {
                    const active = activeFilter === f.key;
                    const cfg = BUSINESS_CONFIG[f.key] || { color: AppColors.primary, bg: "#EDE7F6" };
                    return (
                      <Pressable
                        key={f.key}
                        style={[
                          styles.filterChip,
                          active && {
                            backgroundColor: cfg.color || AppColors.primary,
                            borderColor: cfg.color || AppColors.primary,
                          },
                          !active && {
                            backgroundColor: theme.backgroundDefault,
                            borderColor: theme.border ?? "#E5E7EB",
                          },
                        ]}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setActiveFilter(f.key);
                        }}
                      >
                        <MaterialCommunityIcons
                          name={f.icon as any}
                          size={14}
                          color={active ? "#fff" : theme.textSecondary}
                        />
                        <ThemedText
                          style={[
                            styles.filterChipText,
                            { color: active ? "#fff" : theme.textSecondary },
                          ]}
                        >
                          {f.label}
                        </ThemedText>
                        {counts[f.key] !== undefined ? (
                          <View
                            style={[
                              styles.filterCount,
                              {
                                backgroundColor: active
                                  ? "rgba(255,255,255,0.25)"
                                  : (cfg.color || AppColors.primary) + "18",
                              },
                            ]}
                          >
                            <ThemedText
                              style={[
                                styles.filterCountText,
                                { color: active ? "#fff" : cfg.color || AppColors.primary },
                              ]}
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

              {/* Section title */}
              <View style={styles.sectionHeader}>
                <ThemedText
                  type="h3"
                  style={[styles.sectionTitle, { color: theme.textPrimary }]}
                >
                  {activeFilter
                    ? BUSINESS_CONFIG[activeFilter]?.label + "s" || "المتاجر"
                    : "جميع المتاجر"}
                </ThemedText>
                <ThemedText
                  type="small"
                  style={{ color: theme.textSecondary }}
                >
                  {filtered.length} متجر
                </ThemedText>
              </View>
            </>
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons
                name="store-off"
                size={64}
                color={theme.textSecondary}
                style={{ opacity: 0.4 }}
              />
              <ThemedText
                type="h4"
                style={[styles.emptyTitle, { color: theme.textSecondary }]}
              >
                لا توجد متاجر حالياً
              </ThemedText>
              <ThemedText
                type="small"
                style={[styles.emptyText, { color: theme.textSecondary }]}
              >
                {activeFilter
                  ? "لا توجد متاجر من هذا النوع"
                  : "سيتم إضافة متاجر قريباً"}
              </ThemedText>
            </View>
          }
          renderItem={({ item }) => (
            <StoreCard store={item} onPress={() => handleStorePress(item)} />
          )}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
          scrollIndicatorInsets={{ bottom: tabBarHeight }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },

  // Filter
  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingBottom: Spacing.md,
    paddingTop: Spacing.xs,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  filterChipText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 12,
  },
  filterCount: {
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  filterCountText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 10,
  },

  // Section header
  sectionHeader: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    textAlign: "right",
  },

  // Store card
  card: {
    borderRadius: BorderRadius.xl,
    overflow: "hidden",
  },
  cardCover: {
    height: 100,
    position: "relative",
    justifyContent: "flex-end",
    alignItems: "flex-end",
    padding: 8,
  },
  coverOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  typeBadgeText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 11,
    color: "#fff",
  },
  cardBody: {
    flexDirection: "row-reverse",
    alignItems: "center",
    padding: Spacing.md,
    paddingTop: 0,
    gap: Spacing.sm,
  },
  avatarWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    overflow: "hidden",
    marginTop: -28,
    elevation: 3,
    backgroundColor: "#fff",
  },
  avatar: {
    width: "100%",
    height: "100%",
  },
  avatarFallback: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarLetter: {
    fontFamily: "Cairo_700Bold",
    fontSize: 22,
    color: "#fff",
    lineHeight: 28,
  },
  cardInfo: {
    flex: 1,
    alignItems: "flex-end",
    paddingTop: Spacing.sm,
  },
  storeName: {
    textAlign: "right",
    marginBottom: 2,
  },
  bio: {
    textAlign: "right",
    marginBottom: 4,
    fontStyle: "italic",
  },
  metaRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  metaItem: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 3,
  },
  metaText: {
    textAlign: "right",
    maxWidth: SCREEN_W * 0.35,
  },
  productsBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  productsText: {
    fontWeight: "600",
    fontSize: 11,
    fontFamily: "Cairo_700Bold",
  },
  chevron: {
    alignSelf: "center",
    marginTop: Spacing.sm,
  },

  // Empty
  emptyContainer: {
    alignItems: "center",
    paddingTop: 80,
    gap: Spacing.md,
  },
  emptyTitle: {
    textAlign: "center",
  },
  emptyText: {
    textAlign: "center",
  },
  retryBtn: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
});
