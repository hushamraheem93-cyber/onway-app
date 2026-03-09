import React, { useMemo, useState, useCallback } from "react";
import { StyleSheet, View, FlatList, ScrollView, Dimensions, ActivityIndicator, Pressable, Platform, Modal } from "react-native";
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
const PRODUCT_CARD_WIDTH = 160;
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

  const { items, addToCart, updateQuantity } = useCart();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { userProfile } = useAuth();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

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
    const cartItem = items.find((item) => item.product.id === product.id);
    const quantity = cartItem ? cartItem.quantity : 0;
    
    const handleAddToCart = () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      addToCart(product);
    };

    const handleIncrement = () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      updateQuantity(product.id, quantity + 1);
    };

    const handleDecrement = () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      updateQuantity(product.id, quantity - 1);
    };

    const handleToggleFavorite = () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      toggleFavorite(product);
    };

    return (
      <Pressable
        key={product.id}
        style={styles.productCard}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setSelectedProduct(product);
        }}
        testID={`card-product-${product.id}`}
      >
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
            <Feather name="heart" size={15} color={isFav ? "#E53935" : "#BBBBBB"} />
          </Pressable>
        </View>
        <View style={styles.productInfo}>
          <ThemedText type="body" numberOfLines={1} style={styles.productName}>{product.name}</ThemedText>
          <View style={styles.productFooter}>
            <ThemedText style={styles.productPrice}>
              {formatPrice(product.price)}
            </ThemedText>
            {quantity > 0 ? (
              <View style={styles.quantityRow}>
                <Pressable onPress={handleDecrement} style={styles.qtyBtn} testID={`btn-minus-${product.id}`}>
                  <Feather name="minus" size={14} color="#D94523" />
                </Pressable>
                <ThemedText style={styles.qtyText}>{quantity}</ThemedText>
                <Pressable onPress={handleIncrement} style={styles.qtyBtn} testID={`btn-plus-${product.id}`}>
                  <Feather name="plus" size={14} color="#D94523" />
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={handleAddToCart} style={styles.addButton} testID={`btn-add-${product.id}`}>
                <Feather name="plus" size={16} color="#FFFFFF" />
              </Pressable>
            )}
          </View>
        </View>
      </Pressable>
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

  const renderProductModal = () => {
    if (!selectedProduct) return null;
    const isFav = isFavorite(selectedProduct.id);
    const cartItem = items.find((item) => item.product.id === selectedProduct.id);
    const qty = cartItem ? cartItem.quantity : 0;

    return (
      <Modal
        visible={selectedProduct !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedProduct(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setSelectedProduct(null)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <View style={styles.modalImageContainer}>
              <Image
                source={{ uri: getImageUrl(selectedProduct.image) }}
                style={styles.modalImage}
                contentFit="contain"
                transition={300}
              />
              {selectedProduct.discount ? (
                <View style={styles.modalDiscountBadge}>
                  <ThemedText style={styles.discountText}>{selectedProduct.discount}%</ThemedText>
                </View>
              ) : null}
              <Pressable
                style={styles.modalFavBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  toggleFavorite(selectedProduct);
                }}
              >
                <Feather name="heart" size={22} color={isFav ? "#E53935" : "#CCCCCC"} />
              </Pressable>
            </View>
            <View style={styles.modalInfo}>
              <ThemedText style={styles.modalName}>{selectedProduct.name}</ThemedText>
              {selectedProduct.description ? (
                <ThemedText style={styles.modalDesc}>{selectedProduct.description}</ThemedText>
              ) : null}
              <View style={styles.modalPriceRow}>
                <ThemedText style={styles.modalPrice}>{formatPrice(selectedProduct.price)}</ThemedText>
                {selectedProduct.originalPrice ? (
                  <ThemedText style={styles.modalOrigPrice}>{formatPrice(selectedProduct.originalPrice)}</ThemedText>
                ) : null}
              </View>
              <View style={styles.modalActions}>
                {qty > 0 ? (
                  <View style={styles.modalQtyRow}>
                    <Pressable
                      style={styles.modalQtyBtn}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        updateQuantity(selectedProduct.id, qty - 1);
                        if (qty === 1) setSelectedProduct(null);
                      }}
                    >
                      <Feather name="minus" size={20} color="#D94523" />
                    </Pressable>
                    <ThemedText style={styles.modalQtyText}>{qty}</ThemedText>
                    <Pressable
                      style={styles.modalQtyBtn}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        updateQuantity(selectedProduct.id, qty + 1);
                      }}
                    >
                      <Feather name="plus" size={20} color="#D94523" />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    style={styles.modalAddBtn}
                    onPress={() => {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      addToCart(selectedProduct);
                    }}
                    testID="btn-modal-add"
                  >
                    <Feather name="shopping-cart" size={18} color="#FFFFFF" />
                    <ThemedText style={styles.modalAddText}>أضف إلى السلة</ThemedText>
                  </Pressable>
                )}
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
      <FlatList
        style={{ flex: 1 }}
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
      {renderProductModal()}
    </View>
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
    color: "#D94523",
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
    color: "#D94523",
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
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.04,
        shadowRadius: 10,
      },
      android: {
        elevation: 3,
      },
      default: {
        boxShadow: "0 4px 10px rgba(0,0,0,0.04)",
      },
    }),
  },
  productImageContainer: {
    position: "relative",
    height: 120,
    backgroundColor: "#F5F5F5",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  productImage: {
    width: PRODUCT_CARD_WIDTH,
    height: 120,
  },
  productFavoriteBtn: {
    position: "absolute",
    top: 8,
    left: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  discountBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "#D94523",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    zIndex: 10,
  },
  discountText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 11,
    color: "#FFFFFF",
  },
  productInfo: {
    padding: 10,
  },
  productName: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 14,
    color: "#1A1A1A",
    textAlign: "right",
    marginBottom: 5,
  },
  productFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  productPrice: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    color: "#D94523",
  },
  addButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#D94523",
    justifyContent: "center",
    alignItems: "center",
  },
  quantityRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF3ED",
    borderRadius: 14,
    paddingHorizontal: 2,
    paddingVertical: 2,
    gap: 4,
  },
  qtyBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 2,
      },
      android: { elevation: 1 },
      default: { boxShadow: "0 1px 2px rgba(0,0,0,0.08)" },
    }),
  },
  qtyText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    color: "#D94523",
    minWidth: 18,
    textAlign: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 40,
    maxHeight: SCREEN_WIDTH * 1.6,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#DDDDDD",
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 8,
  },
  modalImageContainer: {
    height: 220,
    backgroundColor: "#F8F8F8",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  modalImage: {
    width: "80%",
    height: "90%",
  },
  modalDiscountBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: "#D94523",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  modalFavBtn: {
    position: "absolute",
    top: 12,
    left: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalInfo: {
    padding: 20,
  },
  modalName: {
    fontFamily: "Cairo_700Bold",
    fontSize: 22,
    color: "#1A1A1A",
    textAlign: "right",
    marginBottom: 6,
  },
  modalDesc: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: "#777777",
    textAlign: "right",
    marginBottom: 12,
  },
  modalPriceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 10,
    marginBottom: 20,
  },
  modalPrice: {
    fontFamily: "Cairo_700Bold",
    fontSize: 22,
    color: "#D94523",
  },
  modalOrigPrice: {
    fontFamily: "Cairo_400Regular",
    fontSize: 16,
    color: "#AAAAAA",
    textDecorationLine: "line-through",
  },
  modalActions: {
    alignItems: "center",
  },
  modalAddBtn: {
    flexDirection: "row",
    backgroundColor: "#D94523",
    borderRadius: 16,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    width: "100%",
  },
  modalAddText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    color: "#FFFFFF",
  },
  modalQtyRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF3ED",
    borderRadius: 16,
    paddingHorizontal: 6,
    paddingVertical: 6,
    gap: 16,
  },
  modalQtyBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
      },
      android: { elevation: 2 },
      default: { boxShadow: "0 1px 3px rgba(0,0,0,0.1)" },
    }),
  },
  modalQtyText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 22,
    color: "#D94523",
    minWidth: 30,
    textAlign: "center",
  },
});
