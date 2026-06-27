import React, { useMemo, useContext } from "react";
import { StyleSheet, FlatList, View, ActivityIndicator, Pressable, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { RouteProp, useRoute, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, AppColors } from "@/constants/theme";
import { Product } from "@/constants/categories";
import { ProductCard } from "@/components/ProductCard";
import { EmptyState } from "@/components/EmptyState";
import { ThemedText } from "@/components/ThemedText";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { resolveImageUrl } from "@/utils/imageUtils";
import { FloatingCartBar } from "@/components/FloatingCartBar";
import { GradientBackground } from "@/components/GradientBackground";
import { useCart } from "@/context/CartContext";

type ProductsRouteProp = RouteProp<RootStackParamList, "Products">;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface Vendor {
  id: string;
  name: string;
  location: string;
  whatsappNumber: string;
  commissionPercent: number;
  image: string;
  rating: number | null;
  deliveryTime: string;
  isOpen: boolean;
}


export default function ProductsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const { theme } = useTheme();
  const route = useRoute<ProductsRouteProp>();
  const navigation = useNavigation<NavigationProp>();
  const { categoryId, searchQuery, restaurant } = route.params;
  const { items } = useCart();

  const { data: allProducts = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const { data: vendors = [], isLoading: vendorsLoading } = useQuery<Vendor[]>({
    queryKey: ["/api/vendors"],
    staleTime: 30 * 1000,
    refetchOnMount: true,
  });

  const isRestaurantsCategory = categoryId === "restaurants" && !restaurant && !searchQuery;

  const restaurantList = useMemo(() => {
    if (!isRestaurantsCategory) return [];
    if (vendors.length > 0) return vendors;
    const restProducts = allProducts.filter(p => p.categoryId === "restaurants" && p.restaurant);
    const restMap = new Map<string, number>();
    restProducts.forEach(p => {
      restMap.set(p.restaurant!, (restMap.get(p.restaurant!) || 0) + 1);
    });
    return Array.from(restMap.entries()).map(([name, count]) => ({
      id: name, name, location: "", whatsappNumber: "", commissionPercent: 10,
      image: "", rating: null, deliveryTime: "30-45", isOpen: true,
    } as Vendor));
  }, [isRestaurantsCategory, allProducts, vendors]);

  const products = useMemo(() => {
    if (isRestaurantsCategory) return [];
    if (searchQuery) {
      return allProducts.filter(
        (product) =>
          product.name.includes(searchQuery) ||
          product.description.includes(searchQuery)
      );
    }
    if (categoryId === "restaurants" && restaurant) {
      return allProducts.filter(
        (product) => product.categoryId === "restaurants" && product.restaurant === restaurant
      );
    }
    if (categoryId) {
      return allProducts.filter((product) => product.categoryId === categoryId);
    }
    return allProducts;
  }, [categoryId, searchQuery, restaurant, allProducts, isRestaurantsCategory]);

  const isLoading = productsLoading || (isRestaurantsCategory && vendorsLoading);

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.backgroundRoot, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (isRestaurantsCategory) {
    return (
      <View style={{ flex: 1 }}>
        <GradientBackground />
        <FlatList
          key="restaurants-list"
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingTop: headerHeight + Spacing.lg,
            paddingBottom: tabBarHeight + Spacing.xl + (items.length > 0 ? 70 : 0),
            paddingHorizontal: Spacing.md,
            flexGrow: 1,
          }}
          scrollIndicatorInsets={{ bottom: insets.bottom }}
          data={restaurantList}
          renderItem={({ item }) => (
            <VendorCard
              vendor={item}
              theme={theme}
              onPress={() => navigation.navigate("Products", {
                categoryId: "restaurants",
                categoryName: item.name,
                restaurant: item.name,
              })}
            />
          )}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          initialNumToRender={8}
          windowSize={5}
          maxToRenderPerBatch={6}
          removeClippedSubviews={true}
          ListEmptyComponent={() => (
            <EmptyState title="لا توجد مطاعم" subtitle="لم يتم إضافة مطاعم بعد" />
          )}
        />
        <FloatingCartBar bottomOffset={tabBarHeight + 8} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <GradientBackground />
      <FlatList
        key="products-grid"
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.lg,
          paddingBottom: tabBarHeight + Spacing.xl + (items.length > 0 ? 70 : 0),
          paddingHorizontal: Spacing.md,
          flexGrow: 1,
        }}
        columnWrapperStyle={styles.columnWrapper}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        data={products}
        renderItem={({ item }) => <ProductCard product={item} />}
        keyExtractor={(item) => item.id}
        numColumns={2}
        showsVerticalScrollIndicator={false}
        initialNumToRender={10}
        windowSize={7}
        maxToRenderPerBatch={8}
        removeClippedSubviews={true}
        ListEmptyComponent={() => (
          <EmptyState title="لا توجد منتجات" subtitle="لم نجد منتجات في هذا القسم" />
        )}
      />
      <FloatingCartBar bottomOffset={tabBarHeight + 8} />
    </View>
  );
}

function VendorCard({ vendor, theme, onPress }: { vendor: Vendor; theme: any; onPress: () => void }) {
  return (
    <Pressable
      testID={`restaurant-card-${vendor.id}`}
      style={[styles.vendorCard, { backgroundColor: theme.backgroundSecondary }]}
      onPress={onPress}
    >
      <View style={styles.vendorImageContainer}>
        {vendor.image ? (
          <Image
            source={{ uri: resolveImageUrl(vendor.image) }}
            style={styles.vendorImage}
            contentFit="cover"
            cachePolicy="disk"
            transition={200}
          />
        ) : (
          <LinearGradient
            colors={[AppColors.primary, AppColors.error]}
            style={styles.vendorImageFallback}
          >
            <Feather name="coffee" size={36} color={AppColors.white} />
          </LinearGradient>
        )}
        <View style={[
          styles.openBadge,
          { backgroundColor: vendor.isOpen ? AppColors.success : AppColors.error },
        ]}>
          <ThemedText style={styles.openBadgeText}>
            {vendor.isOpen ? "مفتوح" : "مغلق"}
          </ThemedText>
        </View>
      </View>

      <View style={styles.vendorBody}>
        <View style={styles.vendorHeader}>
          <ThemedText type="h4" style={{ color: theme.text, flex: 1, textAlign: "right" }} numberOfLines={1}>
            {vendor.name}
          </ThemedText>
          <Feather name="chevron-left" size={18} color={theme.textSecondary} />
        </View>

        {vendor.location ? (
          <View style={styles.vendorRow}>
            <ThemedText type="small" style={{ color: theme.textSecondary, flex: 1, textAlign: "right" }} numberOfLines={1}>
              {vendor.location}
            </ThemedText>
            <Feather name="map-pin" size={12} color={theme.textSecondary} style={{ marginLeft: 4 }} />
          </View>
        ) : null}

        <View style={styles.vendorMeta}>
          <View style={styles.metaItem}>
            <ThemedText style={[styles.metaValue, { color: theme.text }]}>
              {vendor.deliveryTime} د
            </ThemedText>
            <Feather name="clock" size={12} color={AppColors.primary} />
          </View>
          {vendor.rating !== null ? (
            <>
              <View style={styles.metaDivider} />
              <View style={styles.metaItem}>
                <ThemedText style={[styles.metaValue, { color: theme.text }]}>
                  {vendor.rating}
                </ThemedText>
                <Feather name="star" size={12} color={AppColors.warning} />
              </View>
            </>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  columnWrapper: {
    justifyContent: "space-between",
    flexDirection: "row-reverse",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  vendorCard: {
    borderRadius: BorderRadius.xl,
    marginBottom: Spacing.md,
    overflow: "hidden",
  },
  vendorImageContainer: {
    position: "relative",
    width: "100%",
    height: 160,
  },
  vendorImage: {
    width: "100%",
    height: "100%",
  },
  vendorImageFallback: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  openBadge: {
    position: "absolute",
    top: Spacing.sm,
    right: Spacing.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  openBadgeText: {
    color: AppColors.white,
    fontSize: 11,
    fontWeight: "700",
  },
  vendorBody: {
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  vendorHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  vendorRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  vendorMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaValue: {
    fontSize: 12,
    fontWeight: "600",
  },
  metaDivider: {
    width: 1,
    height: 14,
    backgroundColor: AppColors.divider,
  },
});
