import React, { useState, useMemo } from "react";
import { StyleSheet, View, FlatList, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, AppColors, BorderRadius, Shadows } from "@/constants/theme";
import { CATEGORIES, PRODUCTS, Category } from "@/constants/categories";
import { ThemedText } from "@/components/ThemedText";
import { SearchBar } from "@/components/SearchBar";
import { BannerSlider } from "@/components/BannerSlider";
import { SectionHeader } from "@/components/SectionHeader";
import { CategoryCard } from "@/components/CategoryCard";
import { ProductCard } from "@/components/ProductCard";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

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

  const renderContent = () => (
    <View>
      <SearchBar
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="ابحث عن منتجات..."
      />

      <BannerSlider />

      <SectionHeader title="الأقسام" onSeeAll={handleSeeAllCategories} />
      <View style={styles.categoriesGrid}>
        {CATEGORIES.slice(0, 4).map((category) => (
          <View key={category.id} style={styles.categoryItem}>
            <CategoryCard
              category={category}
              onPress={() => handleCategoryPress(category)}
            />
          </View>
        ))}
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
  categoriesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -Spacing.xs,
    marginBottom: Spacing.xl,
  },
  categoryItem: {
    width: "50%",
  },
});
