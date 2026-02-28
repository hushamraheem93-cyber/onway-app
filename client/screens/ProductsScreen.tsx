import React, { useMemo } from "react";
import { StyleSheet, FlatList, View, ActivityIndicator, Pressable, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { RouteProp, useRoute, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, AppColors } from "@/constants/theme";
import { Product } from "@/constants/categories";
import { ProductCard } from "@/components/ProductCard";
import { EmptyState } from "@/components/EmptyState";
import { ThemedText } from "@/components/ThemedText";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

type ProductsRouteProp = RouteProp<RootStackParamList, "Products">;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const RESTAURANT_ICONS: Record<string, string> = {
  "يلا ايت": "coffee",
  "مطعم المشويات": "sun",
  "مطعم الأسماك": "anchor",
  "مطعم الدجاج": "feather",
  "مطعم اللحوم": "award",
};

const RESTAURANT_COLORS: string[] = [
  "#FF7622",
  "#E53935",
  "#1E88E5",
  "#FFA726",
  "#43A047",
  "#8E24AA",
  "#00ACC1",
];

export default function ProductsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const route = useRoute<ProductsRouteProp>();
  const navigation = useNavigation<NavigationProp>();
  const { categoryId, searchQuery, restaurant } = route.params;

  const { data: allProducts = [], isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const isRestaurantsCategory = categoryId === "restaurants" && !restaurant && !searchQuery;

  const restaurants = useMemo(() => {
    if (!isRestaurantsCategory) return [];
    const restProducts = allProducts.filter(p => p.categoryId === "restaurants" && p.restaurant);
    const restMap = new Map<string, number>();
    restProducts.forEach(p => {
      restMap.set(p.restaurant!, (restMap.get(p.restaurant!) || 0) + 1);
    });
    return Array.from(restMap.entries()).map(([name, count]) => ({ name, count }));
  }, [isRestaurantsCategory, allProducts]);

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

  const renderProduct = ({ item }: { item: Product }) => (
    <ProductCard product={item} />
  );

  const renderEmpty = () => (
    <EmptyState
      title="لا توجد منتجات"
      subtitle="لم نجد منتجات في هذا القسم"
    />
  );

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.backgroundRoot, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (isRestaurantsCategory) {
    return (
      <FlatList
        style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.lg,
          paddingBottom: insets.bottom + Spacing.xl,
          paddingHorizontal: Spacing.md,
          flexGrow: 1,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        data={restaurants}
        renderItem={({ item, index }) => (
          <Pressable
            testID={`restaurant-card-${index}`}
            style={[styles.restaurantCard, { backgroundColor: theme.backgroundSecondary }]}
            onPress={() => navigation.navigate("Products", { categoryId: "restaurants", categoryName: item.name, restaurant: item.name })}
          >
            <View style={[styles.restaurantIcon, { backgroundColor: RESTAURANT_COLORS[index % RESTAURANT_COLORS.length] + "15" }]}>
              <Feather
                name={(RESTAURANT_ICONS[item.name] || "shopping-bag") as any}
                size={28}
                color={RESTAURANT_COLORS[index % RESTAURANT_COLORS.length]}
              />
            </View>
            <View style={styles.restaurantInfo}>
              <ThemedText type="h4" style={{ color: theme.text, textAlign: "right" }}>{item.name}</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "right" }}>
                {item.count} وجبة
              </ThemedText>
            </View>
            <Feather name="chevron-left" size={22} color={theme.textSecondary} />
          </Pressable>
        )}
        keyExtractor={(item) => item.name}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={() => (
          <EmptyState title="لا توجد مطاعم" subtitle="لم يتم إضافة مطاعم بعد" />
        )}
      />
    );
  }

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.md,
        flexGrow: 1,
      }}
      columnWrapperStyle={styles.columnWrapper}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
      data={products}
      renderItem={renderProduct}
      keyExtractor={(item) => item.id}
      numColumns={2}
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={renderEmpty}
    />
  );
}

const styles = StyleSheet.create({
  columnWrapper: {
    justifyContent: "space-between",
    flexDirection: "row-reverse",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  restaurantCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.xl,
    marginBottom: Spacing.md,
  },
  restaurantIcon: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.lg,
    justifyContent: "center",
    alignItems: "center",
  },
  restaurantInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
});
