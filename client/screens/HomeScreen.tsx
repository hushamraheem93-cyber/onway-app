import React, { useMemo } from "react";
import { StyleSheet, View, FlatList, ScrollView, Dimensions, ActivityIndicator, Pressable, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
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
const CAT_CARD_W = (SCREEN_WIDTH - HORIZONTAL_PADDING * 2 - 10) / 2;

const CATEGORY_3D_IMAGES: Record<string, string> = {
  "restaurants": "/uploads/category-3d-restaurants.png",
  "fruits-vegetables": "/uploads/category-3d-vegetables.png",
  "meat-poultry": "/uploads/category-3d-meat.png",
  "dairy-eggs": "/uploads/category-3d-dairy.png",
  "cleaning-care": "/uploads/category-3d-cleaning.png",
  "beverages": "/uploads/category-3d-beverages.png",
  "snacks-sweets": "/uploads/category-3d-snacks.png",
  "tea-coffee": "/uploads/category-3d-coffee.png",
  "baby": "/uploads/category-3d-baby.png",
  "flowers": "/uploads/category-3d-flowers.png",
  "delivery": "/uploads/category-3d-delivery.png",
  "pharmacy": "/uploads/category-3d-pharmacy.png",
  "women-bags": "/uploads/category-3d-bags.png",
  "international-shopping": "/uploads/category-3d-international.png",
};

const CATEGORY_COLORS: Record<string, string> = {
  "restaurants": "#FFF4E0",
  "fruits-vegetables": "#E8F5E9",
  "meat-poultry": "#FFEBEE",
  "dairy-eggs": "#F3E5F5",
  "cleaning-care": "#E3F2FD",
  "beverages": "#E0F7FA",
  "snacks-sweets": "#FFF9C4",
  "tea-coffee": "#EFEBE9",
  "baby": "#FCE4EC",
  "flowers": "#FDF2F2",
  "delivery": "#FFFDE7",
  "pharmacy": "#E1F5FE",
  "women-bags": "#FCE4EC",
  "international-shopping": "#E8EAF6",
};

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

  const getImageUrl = (image: string) => {
    if (!image) return "";
    if (image.startsWith("data:image/")) return image;
    if (image.startsWith("http")) return image;
    return `${getApiUrl()}${image}`;
  };

  const get3DImage = (categoryId: string, fallbackImage: string) => {
    const path = CATEGORY_3D_IMAGES[categoryId];
    if (path) return getImageUrl(path);
    return getImageUrl(fallbackImage);
  };

  const renderCategoryCard = (category: Category) => {
    const gradientColor = CATEGORY_COLORS[category.id] || category.color || "#FFF3E0";
    return (
      <Pressable
        key={category.id}
        style={styles.catCardWrapper}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          handleCategoryPress(category);
        }}
        testID={`card-home-category-${category.id}`}
      >
        <LinearGradient
          colors={[gradientColor, "#FFFFFF"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.catCard}
        >
          <View style={styles.catImageContainer}>
            <Image
              source={{ uri: get3DImage(category.id, category.image) }}
              style={styles.catImage}
              contentFit="contain"
              transition={200}
            />
          </View>
          <ThemedText style={styles.catName} numberOfLines={2}>
            {category.name}
          </ThemedText>
        </LinearGradient>
      </Pressable>
    );
  };

  const firstRowCategories = categories.slice(0, Math.ceil(categories.length / 2));
  const secondRowCategories = categories.slice(Math.ceil(categories.length / 2));

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
        <View style={styles.catSliderContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.catSliderContent}
            style={styles.catSliderRow}
          >
            {firstRowCategories.map(renderCategoryCard)}
          </ScrollView>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.catSliderContent}
            style={styles.catSliderRow}
          >
            {secondRowCategories.map(renderCategoryCard)}
          </ScrollView>
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
      style={{ flex: 1, backgroundColor: "#FFFFFF" }}
      contentContainerStyle={{
        paddingTop: Math.max(headerHeight, insets.top + 44) + Spacing.xl,
        paddingBottom: tabBarHeight,
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
    marginTop: 4,
    paddingBottom: 12,
    width: "100%",
    alignItems: "flex-start",
  },
  greeting: {
    fontFamily: "Cairo_700Bold",
    fontSize: 20,
    color: "#F37335",
    marginBottom: 2,
    textAlign: "right",
    writingDirection: "rtl",
  },
  subGreeting: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 14,
    color: "#3A3A3A",
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
    fontSize: 17,
    color: "#2C3E50",
    textAlign: "right",
  },
  viewAll: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
    color: "#FF6B35",
  },
  catSliderContainer: {
    marginBottom: Spacing.xl,
    gap: 10,
    marginHorizontal: -HORIZONTAL_PADDING,
  },
  catSliderRow: {
    flexGrow: 0,
  },
  catSliderContent: {
    paddingHorizontal: HORIZONTAL_PADDING,
    gap: 10,
  },
  catCardWrapper: {
    width: 130,
    borderRadius: 20,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.07,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
      default: {
        boxShadow: "0 3px 8px rgba(0,0,0,0.07)",
      },
    }),
  },
  catCard: {
    width: 130,
    height: 130,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  catImageContainer: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  catImage: {
    width: 70,
    height: 70,
    backgroundColor: "transparent",
  },
  catName: {
    fontFamily: "Cairo_700Bold",
    fontSize: 12,
    fontWeight: "700",
    color: "#333333",
    textAlign: "center",
    marginTop: 4,
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
    paddingHorizontal: 18,
    gap: 12,
  },
  productCard: {
    width: PRODUCT_CARD_WIDTH,
    borderRadius: 15,
    overflow: "visible",
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  productImageContainer: {
    position: "relative",
    height: 120,
    backgroundColor: "#F7F9FC",
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
    overflow: "hidden",
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
    fontFamily: "Cairo_400Regular",
    fontSize: 15,
    color: "#555555",
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
