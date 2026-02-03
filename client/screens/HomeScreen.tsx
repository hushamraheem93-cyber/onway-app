import React, { useState } from "react";
import { StyleSheet, View, FlatList, ScrollView, Dimensions, ActivityIndicator } from "react-native";
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
const GRID_GAP = DesignSystem.gridGap;
const HORIZONTAL_PADDING = DesignSystem.screenPadding;
const SLIDER_CARD_WIDTH = 100;

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
    navigation.navigate("AllCategories");
  };

  const handleSearch = () => {
    if (searchQuery.trim()) {
      navigation.navigate("Products", { searchQuery: searchQuery.trim(), categoryName: "نتائج البحث" });
    }
  };

  const firstRowCategories = categories.slice(0, Math.ceil(categories.length / 2));
  const secondRowCategories = categories.slice(Math.ceil(categories.length / 2));

  const renderCategorySlider = (rowCategories: Category[]) => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.sliderContent}
      style={styles.sliderRow}
    >
      {rowCategories.map((category) => (
        <View key={category.id} style={styles.sliderItem}>
          <CategoryCard
            category={category}
            onPress={() => handleCategoryPress(category)}
            compact
            sliderMode
          />
        </View>
      ))}
    </ScrollView>
  );

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
          {renderCategorySlider(firstRowCategories)}
          {renderCategorySlider(secondRowCategories)}
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
    marginHorizontal: -HORIZONTAL_PADDING,
  },
  sliderRow: {
    flexGrow: 0,
  },
  sliderContent: {
    paddingHorizontal: HORIZONTAL_PADDING,
    gap: GRID_GAP,
  },
  sliderItem: {
    width: SLIDER_CARD_WIDTH,
  },
  loadingContainer: {
    paddingVertical: Spacing.xl,
    alignItems: "center",
  },
});
