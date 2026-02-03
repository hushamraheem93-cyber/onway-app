import React, { useMemo } from "react";
import { StyleSheet, FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { RouteProp, useRoute } from "@react-navigation/native";

import { useTheme } from "@/hooks/useTheme";
import { Spacing } from "@/constants/theme";
import { PRODUCTS, Product } from "@/constants/categories";
import { ProductCard } from "@/components/ProductCard";
import { EmptyState } from "@/components/EmptyState";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

type ProductsRouteProp = RouteProp<RootStackParamList, "Products">;

export default function ProductsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const route = useRoute<ProductsRouteProp>();
  const { categoryId, searchQuery } = route.params;

  const products = useMemo(() => {
    if (searchQuery) {
      return PRODUCTS.filter(
        (product) =>
          product.name.includes(searchQuery) ||
          product.description.includes(searchQuery)
      );
    }
    if (categoryId) {
      return PRODUCTS.filter((product) => product.categoryId === categoryId);
    }
    return PRODUCTS;
  }, [categoryId, searchQuery]);

  const renderProduct = ({ item }: { item: Product }) => (
    <ProductCard product={item} />
  );

  const renderEmpty = () => (
    <EmptyState
      title="لا توجد منتجات"
      subtitle="لم نجد منتجات في هذا القسم"
    />
  );

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
    paddingHorizontal: Spacing.xs,
  },
});
