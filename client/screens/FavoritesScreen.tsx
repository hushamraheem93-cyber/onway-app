import React, { useState } from "react";
import { StyleSheet, View, FlatList, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Image } from "expo-image";
import { MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, AppColors, BorderRadius, Shadows, FontWeight } from "@/constants/theme";
import { Product } from "@/constants/categories";
import { ProductCard } from "@/components/ProductCard";
import { EmptyState } from "@/components/EmptyState";
import { useFavorites } from "@/context/FavoritesContext";
import { useVendorFavorites, FavoriteVendor } from "@/context/VendorFavoritesContext";
import { GradientBackground } from "@/components/GradientBackground";
import { ThemedText } from "@/components/ThemedText";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { getApiUrl } from "@/lib/query-client";

type Nav = NativeStackNavigationProp<RootStackParamList>;

function resolveUrl(path?: string): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  try { return new URL(path, getApiUrl()).toString(); } catch { return null; }
}

function VendorFavCard({ vendor }: { vendor: FavoriteVendor }) {
  const { theme } = useTheme();
  const { toggleVendorFavorite } = useVendorFavorites();
  const navigation = useNavigation<Nav>();
  const avatarUrl = resolveUrl(vendor.profileImageUrl);

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        navigation.navigate("StoreProducts", { storeId: vendor.id, storeName: vendor.storeName });
      }}
      style={({ pressed }) => [
        styles.vendorCard,
        { backgroundColor: theme.backgroundDefault, opacity: pressed ? 0.92 : 1 },
        Shadows.sm,
      ]}
    >
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={styles.vendorAvatar} contentFit="cover" />
      ) : (
        <View style={[styles.vendorAvatarFallback, { backgroundColor: AppColors.primary + "20" }]}>
          <MaterialCommunityIcons name="store" size={28} color={AppColors.primary} />
        </View>
      )}

      <View style={styles.vendorInfo}>
        <ThemedText style={[styles.vendorName, { color: theme.text }]} numberOfLines={1}>
          {vendor.storeName}
        </ThemedText>
        {vendor.deliveryTime ? (
          <View style={styles.vendorMeta}>
            <Feather name="clock" size={12} color={theme.textSecondary} />
            <ThemedText style={[styles.vendorMetaText, { color: theme.textSecondary }]}>
              {vendor.deliveryTime} دقيقة
            </ThemedText>
          </View>
        ) : null}
        {vendor.rating != null ? (
          <View style={styles.vendorMeta}>
            <MaterialCommunityIcons name="star" size={13} color={AppColors.warning} />
            <ThemedText style={[styles.vendorMetaText, { color: AppColors.warning }]}>
              {(vendor.rating as number).toFixed(1)}
            </ThemedText>
          </View>
        ) : null}
      </View>

      <Pressable
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); toggleVendorFavorite(vendor); }}
        hitSlop={10}
        style={styles.heartBtn}
      >
        <MaterialCommunityIcons name="heart" size={22} color={AppColors.error} />
      </Pressable>
    </Pressable>
  );
}

export default function FavoritesScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const { favorites } = useFavorites();
  const { vendorFavorites } = useVendorFavorites();

  const [activeTab, setActiveTab] = useState<"products" | "stores">("products");

  const renderProduct = ({ item }: { item: Product }) => <ProductCard product={item} />;
  const renderVendor = ({ item }: { item: FavoriteVendor }) => <VendorFavCard vendor={item} />;

  return (
    <View style={{ flex: 1 }}>
      <GradientBackground />

      {/* Tab bar */}
      <View style={[styles.tabBar, { paddingTop: headerHeight + Spacing.sm, backgroundColor: "transparent" }]}>
        {(["products", "stores"] as const).map((tab) => {
          const isActive = activeTab === tab;
          const label = tab === "products" ? "المنتجات" : "المتاجر";
          const count = tab === "products" ? favorites.length : vendorFavorites.length;
          return (
            <Pressable
              key={tab}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveTab(tab); }}
              style={[
                styles.tab,
                {
                  borderBottomWidth: isActive ? 2 : 0,
                  borderBottomColor: AppColors.primary,
                  backgroundColor: isActive ? AppColors.primary + "10" : "transparent",
                },
              ]}
            >
              <ThemedText style={[styles.tabLabel, { color: isActive ? AppColors.primary : theme.textSecondary }]}>
                {label}
              </ThemedText>
              {count > 0 ? (
                <View style={[styles.tabBadge, { backgroundColor: isActive ? AppColors.primary : theme.textSecondary + "60" }]}>
                  <ThemedText style={styles.tabBadgeText}>{count}</ThemedText>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {activeTab === "products" ? (
        <FlatList
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingTop: Spacing.sm,
            paddingBottom: tabBarHeight,
            paddingHorizontal: Spacing.lg,
            flexGrow: 1,
          }}
          scrollIndicatorInsets={{ bottom: insets.bottom }}
          data={favorites}
          renderItem={renderProduct}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon="heart-outline"
              title="لا توجد منتجات مفضلة"
              subtitle="أضف منتجاتك المفضلة للوصول إليها بسهولة"
            />
          }
        />
      ) : (
        <FlatList
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingTop: Spacing.sm,
            paddingBottom: tabBarHeight,
            paddingHorizontal: Spacing.lg,
            flexGrow: 1,
            gap: 12,
          }}
          scrollIndicatorInsets={{ bottom: insets.bottom }}
          data={vendorFavorites}
          renderItem={renderVendor}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon="heart-outline"
              title="لا توجد متاجر مفضلة"
              subtitle="أضف متاجرك المفضلة للوصول إليها بسرعة"
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: "row-reverse",
    paddingHorizontal: Spacing.lg,
    gap: 4,
    marginBottom: 4,
  },
  tab: {
    flex: 1,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  tabLabel: { fontFamily: "Cairo_700Bold", fontSize: 14 },
  tabBadge: {
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 1,
    minWidth: 20,
    alignItems: "center",
  },
  tabBadgeText: { fontFamily: "Cairo_700Bold", fontSize: 11, color: AppColors.white },

  vendorCard: {
    flexDirection: "row-reverse",
    alignItems: "center",
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    gap: 12,
  },
  vendorAvatar: { width: 56, height: 56, borderRadius: 28 },
  vendorAvatarFallback: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: "center", justifyContent: "center",
  },
  vendorInfo: { flex: 1, gap: 4 },
  vendorName: { fontFamily: "Cairo_700Bold", fontSize: 15, textAlign: "right" },
  vendorMeta: { flexDirection: "row-reverse", alignItems: "center", gap: 4 },
  vendorMetaText: { fontFamily: "Cairo_400Regular", fontSize: 12 },
  heartBtn: { padding: 6 },
});
