import React from "react";
import { StyleSheet, View, FlatList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, DesignSystem } from "@/constants/theme";
import { Product } from "@/constants/categories";
import { ProductCard } from "@/components/ProductCard";
import { EmptyState } from "@/components/EmptyState";
import { useFavorites } from "@/context/FavoritesContext";
import { GradientBackground } from "@/components/GradientBackground";

export default function FavoritesScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const { favorites } = useFavorites();

  const renderProduct = ({ item }: { item: Product }) => (
    <ProductCard product={item} />
  );

  return (
    <View style={{ flex: 1 }}>
      <GradientBackground />
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: tabBarHeight,
        paddingHorizontal: DesignSystem.screenPadding,
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
    </View>
  );
}

const styles = StyleSheet.create({});
