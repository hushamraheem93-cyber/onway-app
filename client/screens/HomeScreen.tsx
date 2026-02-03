import React, { useState, useMemo } from "react";
import { StyleSheet, View, FlatList, ScrollView, Dimensions, ActivityIndicator, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, AppColors, DesignSystem, BorderRadius, Shadows } from "@/constants/theme";
import { Category, Banner, Product } from "@/constants/categories";
import { ThemedText } from "@/components/ThemedText";
import { SearchBar } from "@/components/SearchBar";
import { BannerSlider } from "@/components/BannerSlider";
import { OfferBanner } from "@/components/OfferBanner";
import { SectionHeader } from "@/components/SectionHeader";
import { CategoryCard } from "@/components/CategoryCard";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { useCart } from "@/context/CartContext";
import { useFavorites } from "@/context/FavoritesContext";
import { formatPrice } from "@/constants/currency";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRID_GAP = DesignSystem.gridGap;
const HORIZONTAL_PADDING = DesignSystem.screenPadding;
const SLIDER_CARD_WIDTH = 100;
const PRODUCT_CARD_WIDTH = 150;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();

  const [searchQuery, setSearchQuery] = useState("");
  const { addToCart } = useCart();
  const { isFavorite, toggleFavorite } = useFavorites();

  const { data: categories = [], isLoading: categoriesLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const { data: allBanners = [], isLoading: bannersLoading } = useQuery<Banner[]>({
    queryKey: ["/api/banners"],
  });

  const { data: allProducts = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const bestSellerProducts = useMemo(() => {
    if (allProducts.length === 0) return [];
    const shuffled = [...allProducts].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 8);
  }, [allProducts]);

  const featuredProducts = useMemo(() => {
    if (allProducts.length === 0) return [];
    const shuffled = [...allProducts].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 6);
  }, [allProducts]);

  const discountProducts = useMemo(() => {
    if (allProducts.length === 0) return [];
    const shuffled = [...allProducts].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 6);
  }, [allProducts]);

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

  const renderProductCard = (product: Product) => {
    const isFav = isFavorite(product.id);
    
    const handleAddToCart = () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      addToCart(product);
    };

    const handleToggleFavorite = () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      toggleFavorite(product);
    };

    return (
      <View key={product.id} style={[styles.productCard, { backgroundColor: theme.backgroundDefault }, Shadows.md]}>
        <View style={styles.productImageContainer}>
          <Image
            source={{ uri: product.image }}
            style={styles.productImage}
            contentFit="cover"
            transition={200}
          />
          <Pressable onPress={handleToggleFavorite} style={styles.productFavoriteBtn}>
            <Feather name="heart" size={16} color={isFav ? "#E53935" : "#999"} />
          </Pressable>
          {product.discount ? (
            <View style={styles.discountBadge}>
              <ThemedText type="small" style={styles.discountText}>-{product.discount}%</ThemedText>
            </View>
          ) : null}
        </View>
        <View style={styles.productInfo}>
          <ThemedText type="body" numberOfLines={1} style={styles.productName}>{product.name}</ThemedText>
          <ThemedText type="small" numberOfLines={1} style={[styles.productDesc, { color: theme.textSecondary }]}>
            {product.description}
          </ThemedText>
          <View style={styles.productFooter}>
            <ThemedText type="h4" style={[styles.productPrice, { color: AppColors.primary }]}>
              {formatPrice(product.price)}
            </ThemedText>
            <Pressable onPress={handleAddToCart} style={[styles.productAddBtn, { backgroundColor: AppColors.primary }]}>
              <Feather name="plus" size={16} color="#FFF" />
            </Pressable>
          </View>
        </View>
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
          {renderCategorySlider(firstRowCategories)}
          {renderCategorySlider(secondRowCategories)}
        </View>
      )}

      <SectionHeader title="الأكثر مبيعاً" />
      
      {productsLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={AppColors.primary} />
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.productsSliderContent}
          style={styles.productsSlider}
        >
          {bestSellerProducts.map(renderProductCard)}
        </ScrollView>
      )}

      <SectionHeader title="المنتجات المميزة" />
      
      {productsLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={AppColors.primary} />
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.productsSliderContent}
          style={styles.productsSlider}
        >
          {featuredProducts.map(renderProductCard)}
        </ScrollView>
      )}

      <SectionHeader title="التخفيضات المميزة" />
      
      {productsLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={AppColors.primary} />
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.productsSliderContent}
          style={styles.productsSlider}
        >
          {discountProducts.map(renderProductCard)}
        </ScrollView>
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
  productsSlider: {
    marginHorizontal: -HORIZONTAL_PADDING,
    marginBottom: Spacing.xl,
  },
  productsSliderContent: {
    paddingHorizontal: HORIZONTAL_PADDING,
    gap: GRID_GAP,
  },
  productCard: {
    width: PRODUCT_CARD_WIDTH,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  productImageContainer: {
    position: "relative",
  },
  productImage: {
    width: PRODUCT_CARD_WIDTH,
    height: 120,
  },
  productFavoriteBtn: {
    position: "absolute",
    top: 6,
    left: 6,
    width: 26,
    height: 26,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  discountBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "#E53935",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  discountText: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 10,
  },
  productInfo: {
    padding: Spacing.sm,
  },
  productName: {
    textAlign: "right",
    fontWeight: "600",
  },
  productDesc: {
    textAlign: "right",
    marginTop: 2,
  },
  productFooter: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.sm,
  },
  productPrice: {
    fontWeight: "700",
  },
  productAddBtn: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
});
