import React, { useMemo } from "react";
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
import { LocationBar } from "@/components/LocationBar";
import { BannerSlider } from "@/components/BannerSlider";
import { OfferBanner } from "@/components/OfferBanner";
import { SectionHeader } from "@/components/SectionHeader";
import { CategoryCard } from "@/components/CategoryCard";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { useCart } from "@/context/CartContext";
import { useFavorites } from "@/context/FavoritesContext";
import { useAuth } from "@/context/AuthContext";
import { formatPrice } from "@/constants/currency";
import { getApiUrl } from "@/lib/query-client";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRID_GAP = 10;
const HORIZONTAL_PADDING = 18;
const CATEGORY_CARD_WIDTH = (SCREEN_WIDTH - 48) / 4;
const PRODUCT_CARD_WIDTH = 150;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();

  const { addToCart } = useCart();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { userProfile } = useAuth();

  const welcomeMessage = userProfile?.fullName 
    ? `أهلاً ${userProfile.fullName.split(' ')[0]}` 
    : "أهلاً بك";

  const { data: categories = [], isLoading: categoriesLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const { data: allBanners = [], isLoading: bannersLoading } = useQuery<Banner[]>({
    queryKey: ["/api/banners"],
  });

  const { data: allProducts = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  interface PromotionalSection {
    type: string;
    productIds: string[];
    isActive: boolean;
  }

  const { data: promotionalSections = [] } = useQuery<PromotionalSection[]>({
    queryKey: ["/api/promotional-sections"],
  });

  const bestSellerProducts = useMemo(() => {
    const section = promotionalSections.find(s => s.type === "bestSellers");
    if (section && section.productIds.length > 0) {
      return section.productIds.map(id => allProducts.find(p => p.id === id)).filter(Boolean) as Product[];
    }
    if (allProducts.length === 0) return [];
    const shuffled = [...allProducts].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 8);
  }, [allProducts, promotionalSections]);

  const featuredProducts = useMemo(() => {
    const section = promotionalSections.find(s => s.type === "featured");
    if (section && section.productIds.length > 0) {
      return section.productIds.map(id => allProducts.find(p => p.id === id)).filter(Boolean) as Product[];
    }
    if (allProducts.length === 0) return [];
    const shuffled = [...allProducts].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 6);
  }, [allProducts, promotionalSections]);

  const discountProducts = useMemo(() => {
    const section = promotionalSections.find(s => s.type === "discounts");
    if (section && section.productIds.length > 0) {
      return section.productIds.map(id => allProducts.find(p => p.id === id)).filter(Boolean) as Product[];
    }
    if (allProducts.length === 0) return [];
    const shuffled = [...allProducts].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 6);
  }, [allProducts, promotionalSections]);

  const offerBanner = allBanners.find(b => b.type === "offer");
  const sliderBanners = allBanners.filter(b => b.type === "slider");

  const handleCategoryPress = (category: Category) => {
    if (category.id === "delivery") {
      navigation.navigate("CourierPickup");
    } else if (category.id === "international-shopping") {
      navigation.navigate("InternationalShopping");
    } else {
      navigation.navigate("Products", { categoryId: category.id, categoryName: category.name });
    }
  };

  const handleSeeAllCategories = () => {
    navigation.navigate("AllCategories");
  };

  const firstRowCategories = categories.slice(0, Math.ceil(categories.length / 2));
  const secondRowCategories = categories.slice(Math.ceil(categories.length / 2));

  const getImageUrl = (image: string) => {
    if (!image) return "";
    if (image.startsWith("data:image/")) return image;
    if (image.startsWith("http")) return image;
    return `${getApiUrl()}${image}`;
  };

  const renderCategorySlider = (rowCategories: Category[]) => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.categorySliderContent}
      style={styles.categorySliderRow}
    >
      {rowCategories.map((category) => (
        <Pressable
          key={category.id}
          style={styles.categoryCard}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            handleCategoryPress(category);
          }}
        >
          <View style={[styles.categoryIconContainer, { backgroundColor: category.color || "#FFF2EC" }]}>
            <Image
              source={{ uri: getImageUrl(category.image) }}
              style={styles.categoryImage}
              contentFit="contain"
              transition={200}
            />
          </View>
          <ThemedText style={styles.categoryName} numberOfLines={2}>
            {category.name}
          </ThemedText>
        </Pressable>
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
      <View key={product.id} style={[styles.productCard, { backgroundColor: theme.backgroundDefault }]}>
        {product.discount ? (
          <View style={styles.discountBadge}>
            <ThemedText type="small" style={styles.discountText}>{product.discount}%</ThemedText>
          </View>
        ) : null}
        <View style={styles.productImageContainer}>
          <Image
            source={{ uri: getImageUrl(product.image) }}
            style={styles.productImage}
            contentFit="cover"
            transition={200}
          />
          <Pressable onPress={handleToggleFavorite} style={styles.productFavoriteBtn}>
            <Feather name="heart" size={16} color={isFav ? "#E53935" : "#999"} />
          </Pressable>
        </View>
        <View style={styles.productInfo}>
          <ThemedText type="body" numberOfLines={1} style={styles.productName}>{product.name}</ThemedText>
          <View style={styles.productFooter}>
            <ThemedText style={styles.productPrice}>
              {formatPrice(product.price)}
            </ThemedText>
            <Pressable onPress={handleAddToCart} style={styles.addButton}>
              <ThemedText style={styles.addIcon}>+</ThemedText>
            </Pressable>
          </View>
        </View>
      </View>
    );
  };

  const renderContent = () => (
    <View>
      <View style={styles.greetingContainer}>
        <ThemedText style={styles.greeting}>
          {welcomeMessage}
        </ThemedText>
        <ThemedText style={styles.subGreeting}>
          طلباتك صارت أسهل ويانا
        </ThemedText>
      </View>

      <LocationBar />

      <View style={styles.bannersSection}>
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
      </View>

      <View style={styles.sectionHeader}>
        <ThemedText style={styles.sectionTitle}>الأقسام الرئيسية</ThemedText>
        <Pressable onPress={handleSeeAllCategories}>
          <ThemedText style={styles.viewAll}>عرض الكل</ThemedText>
        </Pressable>
      </View>
      
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

      <View style={styles.sectionHeader}>
        <ThemedText style={styles.sectionTitle}>الأكثر مبيعاً</ThemedText>
        <Pressable onPress={handleSeeAllCategories}>
          <ThemedText style={styles.viewAll}>عرض الكل</ThemedText>
        </Pressable>
      </View>
      
      {productsLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={AppColors.primary} />
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.bestSellersContainer}
          style={styles.productsSlider}
        >
          {bestSellerProducts.map(renderProductCard)}
        </ScrollView>
      )}

      <View style={styles.sectionHeader}>
        <ThemedText style={styles.sectionTitle}>المنتجات المميزة</ThemedText>
        <Pressable onPress={handleSeeAllCategories}>
          <ThemedText style={styles.viewAll}>عرض الكل</ThemedText>
        </Pressable>
      </View>
      
      {productsLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={AppColors.primary} />
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.bestSellersContainer}
          style={styles.productsSlider}
        >
          {featuredProducts.map(renderProductCard)}
        </ScrollView>
      )}

      <View style={styles.sectionHeader}>
        <ThemedText style={styles.sectionTitle}>التخفيضات المميزة</ThemedText>
        <Pressable onPress={handleSeeAllCategories}>
          <ThemedText style={styles.viewAll}>عرض الكل</ThemedText>
        </Pressable>
      </View>
      
      {productsLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={AppColors.primary} />
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.bestSellersContainer}
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
        paddingTop: Math.max(headerHeight, insets.top + 44) + Spacing.xl,
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
  greetingContainer: {
    paddingHorizontal: 0,
    marginTop: 50,
    paddingBottom: 12,
    width: "100%",
    alignItems: "flex-start",
  },
  greeting: {
    fontFamily: "Cairo_700Bold",
    fontSize: 18,
    color: "#F37335",
    marginBottom: 2,
    textAlign: "right",
    writingDirection: "rtl",
  },
  subGreeting: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: "#666",
    textAlign: "right",
    writingDirection: "rtl",
    marginTop: 8,
  },
  bannersSection: {
    marginVertical: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    color: "#2C3E50",
    textAlign: "right",
  },
  viewAll: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
    color: "#FF6B35",
  },
  categoriesContainer: {
    marginBottom: Spacing.xl,
    gap: GRID_GAP,
    marginHorizontal: -HORIZONTAL_PADDING,
  },
  categorySliderRow: {
    flexGrow: 0,
  },
  categorySliderContent: {
    paddingHorizontal: HORIZONTAL_PADDING,
    gap: GRID_GAP,
  },
  categoryCard: {
    width: 75,
    alignItems: "center",
    marginHorizontal: 0,
  },
  categoryIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  categoryImage: {
    width: 40,
    height: 40,
  },
  categoryName: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 11,
    color: "#2C3E50",
    textAlign: "center",
    lineHeight: 16,
  },
  loadingContainer: {
    paddingVertical: Spacing.xl,
    alignItems: "center",
  },
  productsSlider: {
    marginHorizontal: -HORIZONTAL_PADDING,
    marginBottom: Spacing.xl,
  },
  bestSellersContainer: {
    paddingHorizontal: 20,
    gap: 12,
  },
  productCard: {
    width: PRODUCT_CARD_WIDTH,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  productImageContainer: {
    position: "relative",
    height: 120,
    backgroundColor: "#F8F9FA",
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
    top: 8,
    right: 8,
    backgroundColor: "#FF6B35",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    zIndex: 10,
  },
  discountText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 11,
    color: "#FFFFFF",
  },
  productInfo: {
    padding: 12,
  },
  productName: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 14,
    color: "#2C3E50",
    textAlign: "right",
    marginBottom: 8,
  },
  productFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  productPrice: {
    fontFamily: "Cairo_700Bold",
    fontSize: 15,
    color: "#FF6B35",
  },
  addButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#FF6B35",
    justifyContent: "center",
    alignItems: "center",
  },
  addIcon: {
    fontSize: 18,
    color: "#FFFFFF",
    fontWeight: "bold",
  },
});
