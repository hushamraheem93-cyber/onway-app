import React, { useState } from "react";
import { StyleSheet, View, FlatList, Dimensions, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, AppColors, DesignSystem } from "@/constants/theme";
import { Category, Banner } from "@/constants/categories";
import { ThemedText } from "@/components/ThemedText";
import { SearchBar } from "@/components/SearchBar";
import { BannerSlider } from "@/components/BannerSlider";
import { OfferBanner } from "@/components/OfferBanner";
import { SectionHeader } from "@/components/SectionHeader";
import { CategoryCard } from "@/components/CategoryCard";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const NUM_COLUMNS = 3;
const GRID_GAP = DesignSystem.gridGap;
const HORIZONTAL_PADDING = DesignSystem.screenPadding;
const CARD_WIDTH = (SCREEN_WIDTH - HORIZONTAL_PADDING * 2 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();

  const [searchQuery, setSearchQuery] = useState("");

  const { data: categories = [], isLoading: categoriesLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const { data: allBanners = [], isLoading: bannersLoading } = useQuery<Banner[]>({
    queryKey: ["/api/banners"],
  });

  const offerBanner = allBanners.find(b => b.type === "offer");
  const sliderBanners = allBanners.filter(b => b.type === "slider");

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
    const rowCategories = categories.slice(startIndex, startIndex + count);
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
        onSubmitEditing={handleSearch}
      />

      {bannersLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={AppColors.primary} />
        </View>
      ) : (
        <>
          {offerBanner ? <OfferBanner banner={offerBanner} /> : null}
          {sliderBanners.length > 0 ? <BannerSlider banners={sliderBanners} /> : null}
        </>
      )}

      <SectionHeader title="الأقسام الرئيسية" onSeeAll={handleSeeAllCategories} />
      
      {categoriesLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={AppColors.primary} />
        </View>
      ) : (
        <View style={styles.categoriesContainer}>
          {renderCategoryRow(0, 3)}
          {renderCategoryRow(3, 3)}
          {renderCategoryRow(6, 3)}
          {categories.length > 9 ? renderCategoryRow(9, 3) : null}
        </View>
      )}
    </View>
  );

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: tabBarHeight + Spacing.xl,
        paddingHorizontal: HORIZONTAL_PADDING,
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
    gap: GRID_GAP,
  },
  categoryRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    gap: GRID_GAP,
  },
  categoryItem: {},
  loadingContainer: {
    paddingVertical: Spacing.xl,
    alignItems: "center",
  },
});
