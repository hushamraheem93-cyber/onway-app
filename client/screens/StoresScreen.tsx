import React from "react";
import {
  StyleSheet,
  View,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, AppColors, BorderRadius, Shadows } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { GradientBackground } from "@/components/GradientBackground";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface VendorStore {
  id: string;
  storeName: string;
  businessType: string;
  ownerName: string;
  address?: string;
  totalProducts?: number;
  approvedAt?: string;
}

const BUSINESS_TYPE_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  food: "coffee",
  grocery: "shopping-cart",
  fashion: "tag",
  electronics: "cpu",
  pharmacy: "activity",
  flowers: "feather",
  bakery: "sun",
  other: "package",
};

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  food: "مطعم وأكل",
  grocery: "بقالة ومواد غذائية",
  fashion: "أزياء وملابس",
  electronics: "إلكترونيات",
  pharmacy: "صيدلية",
  flowers: "ورود وهدايا",
  bakery: "مخبوزات وحلويات",
  other: "متجر متنوع",
};

const BUSINESS_TYPE_COLORS: Record<string, string> = {
  food: "#FFF4E0",
  grocery: "#E8F5E9",
  fashion: "#FCE4EC",
  electronics: "#E3F2FD",
  pharmacy: "#F3E5F5",
  flowers: "#FDE8E8",
  bakery: "#FFF8E1",
  other: "#F0F0F0",
};

function StoreCard({
  store,
  onPress,
}: {
  store: VendorStore;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const iconName = BUSINESS_TYPE_ICONS[store.businessType] || "package";
  const bgColor = BUSINESS_TYPE_COLORS[store.businessType] || "#F0F0F0";
  const typeLabel = BUSINESS_TYPE_LABELS[store.businessType] || store.businessType;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.backgroundDefault, opacity: pressed ? 0.9 : 1 },
        Shadows.md,
      ]}
      testID={`store-card-${store.id}`}
    >
      <View style={[styles.iconContainer, { backgroundColor: bgColor }]}>
        <Feather name={iconName} size={32} color={AppColors.primary} />
      </View>
      <View style={styles.cardInfo}>
        <ThemedText type="h4" style={styles.storeName} numberOfLines={1}>
          {store.storeName}
        </ThemedText>
        <ThemedText type="small" style={[styles.storeType, { color: theme.textSecondary }]} numberOfLines={1}>
          {typeLabel}
        </ThemedText>
        {store.address ? (
          <View style={styles.addressRow}>
            <Feather name="map-pin" size={11} color={theme.textSecondary} />
            <ThemedText type="small" style={[styles.addressText, { color: theme.textSecondary }]} numberOfLines={1}>
              {store.address}
            </ThemedText>
          </View>
        ) : null}
        {store.totalProducts !== undefined && store.totalProducts > 0 ? (
          <View style={styles.productsBadge}>
            <ThemedText type="small" style={styles.productsText}>
              {store.totalProducts} منتج
            </ThemedText>
          </View>
        ) : null}
      </View>
      <Feather name="chevron-left" size={20} color={theme.textSecondary} />
    </Pressable>
  );
}

export default function StoresScreen() {
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();

  const { data, isLoading, isError, refetch, isRefetching } = useQuery<{
    stores: VendorStore[];
    total: number;
  }>({
    queryKey: ["/api/stores"],
  });

  const stores = data?.stores ?? [];

  const handleStorePress = (store: VendorStore) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("StoreProducts", {
      storeId: store.id,
      storeName: store.storeName,
    });
  };

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
          <ThemedText type="body" style={[styles.emptyText, { color: theme.textSecondary }]}>
            تعذّر تحميل المتاجر
          </ThemedText>
          <Pressable onPress={() => refetch()} style={styles.retryBtn}>
            <ThemedText type="body" style={{ color: AppColors.primary, fontWeight: "600" }}>
              إعادة المحاولة
            </ThemedText>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={stores}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingTop: headerHeight + Spacing.lg,
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
            <View style={styles.listHeader}>
              <ThemedText type="h3" style={styles.headerTitle}>
                المتاجر المتاحة
              </ThemedText>
              <ThemedText type="small" style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
                اختر متجراً وتصفح منتجاته
              </ThemedText>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Feather name="shopping-bag" size={64} color={theme.textSecondary} style={{ opacity: 0.4 }} />
              <ThemedText type="h4" style={[styles.emptyTitle, { color: theme.textSecondary }]}>
                لا توجد متاجر حالياً
              </ThemedText>
              <ThemedText type="small" style={[styles.emptyText, { color: theme.textSecondary }]}>
                سيتم إضافة متاجر قريباً
              </ThemedText>
            </View>
          }
          renderItem={({ item }) => (
            <StoreCard
              store={item}
              onPress={() => handleStorePress(item)}
            />
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
  listHeader: {
    marginBottom: Spacing.lg,
  },
  headerTitle: {
    textAlign: "right",
  },
  headerSubtitle: {
    textAlign: "right",
    marginTop: Spacing.xs,
  },
  card: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.md,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  cardInfo: {
    flex: 1,
    alignItems: "flex-end",
    gap: Spacing.xs,
  },
  storeName: {
    textAlign: "right",
  },
  storeType: {
    textAlign: "right",
  },
  addressRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
  },
  addressText: {
    textAlign: "right",
  },
  productsBadge: {
    backgroundColor: AppColors.secondary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    alignSelf: "flex-end",
  },
  productsText: {
    color: AppColors.primary,
    fontWeight: "600",
    fontSize: 11,
  },
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
