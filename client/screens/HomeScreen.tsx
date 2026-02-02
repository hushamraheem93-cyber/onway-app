import React, { useState, useMemo } from "react";
import { StyleSheet, View, FlatList, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, AppColors, BorderRadius } from "@/constants/theme";
import { CATEGORIES, PRODUCTS, Category } from "@/constants/categories";
import { ThemedText } from "@/components/ThemedText";
import { SearchBar } from "@/components/SearchBar";
import { BannerSlider } from "@/components/BannerSlider";
import { SectionHeader } from "@/components/SectionHeader";
import { CategoryCard } from "@/components/CategoryCard";
import { ProductCard } from "@/components/ProductCard";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const NUM_COLUMNS = 4;
const CARD_MARGIN = Spacing.xs;
const HORIZONTAL_PADDING = Spacing.lg;
const CARD_WIDTH = (SCREEN_WIDTH - HORIZONTAL_PADDING * 2 - CARD_MARGIN * (NUM_COLUMNS * 2)) / NUM_COLUMNS;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();

  const [searchQuery, setSearchQuery] = useState("");

  const featuredProducts = useMemo(() => {
    return PRODUCTS.slice(0, 4);
  }, []);

  const handleCategoryPress = (category: Category) => {
    navigation.navigate("Products", { categoryId: category.id, categoryName: category.name });
  };

  const handleSeeAllCategories = () => {
    navigation.navigate("Main", { screen: "CategoriesTab" } as any);
  };

  const handleSearch = () => {
    if (searchQuery.trim()) {
      navigation.navigate("Products", { searchQuery: searchQuery.trim(), categoryName: "نتائج البحث" });
    }
  };

  const renderCategoryRow = (startIndex: number, count: number) => {
    const rowCategories = CATEGORIES.slice(startIndex, startIndex + count);
    return (
      <View style={styles.categoryRow}>
        {rowCategories.map((category) => (
          <View key={category.id} style={[styles.categoryItem, { width: CARD_WIDTH }]}>
            <CategoryCard
              category={category}
              onPress={() => handleCategoryPress(category)}
              compact
            />
          </View>
        ))}
      </View>
    );
  };

  const renderContent = () => (
    <View>
      <SearchBar
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="ابحث عن منتجات..."
      />

      <BannerSlider />

      <SectionHeader title="تسوق حسب القسم" onSeeAll={handleSeeAllCategories} />
      
      <View style={styles.categoriesContainer}>
        {renderCategoryRow(0, 4)}
        {renderCategoryRow(4, 4)}
        {renderCategoryRow(8, 4)}
        {renderCategoryRow(12, 4)}
        {renderCategoryRow(16, 4)}
        {renderCategoryRow(20, 4)}
        {renderCategoryRow(24, 4)}
      </View>

      <SectionHeader title="منتجات مميزة" />
      {featuredProducts.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </View>
  );

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: tabBarHeight + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
      data={[{ key: "content" }]}
      renderItem={renderContent}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  categoriesContainer: {
    marginBottom: Spacing.xl,
  },
  categoryRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
  },
  categoryItem: {
    marginBottom: Spacing.xs,
  },
});
