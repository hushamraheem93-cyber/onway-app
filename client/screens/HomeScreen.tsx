import React, { useMemo, useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  FlatList,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  Pressable,
  Platform,
  Modal,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Feather, MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, AppColors, DesignSystem, BorderRadius } from "@/constants/theme";
import { Category, Banner, Product } from "@/constants/categories";
import { ThemedText } from "@/components/ThemedText";
import { LocationBar } from "@/components/LocationBar";
import { BannerSlider } from "@/components/BannerSlider";
import { OfferBanner } from "@/components/OfferBanner";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { useCart } from "@/context/CartContext";
import { useFavorites } from "@/context/FavoritesContext";
import { useAuth } from "@/context/AuthContext";
import { formatPrice } from "@/constants/currency";
import { getApiUrl } from "@/lib/query-client";
import { FloatingCartBar } from "@/components/FloatingCartBar";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const HORIZONTAL_PADDING = 18;
const PRODUCT_CARD_WIDTH = 160;

interface Vendor {
  id: string;
  name: string;
  image: string;
  rating: number;
  deliveryTime: string;
  isOpen: boolean;
  location: string;
  cuisine?: string;
  categoryType?: "restaurant" | "store";
}

const CATEGORY_3D_IMAGES: Record<string, string> = {
  restaurants: "/uploads/category-3d-restaurants.png",
  "fruits-vegetables": "/uploads/category-3d-vegetables.png",
  "meat-poultry": "/uploads/category-3d-meat.png",
  "dairy-eggs": "/uploads/category-3d-dairy.png",
  "cleaning-care": "/uploads/category-3d-cleaning.png",
  beverages: "/uploads/category-3d-beverages.png",
  "snacks-sweets": "/uploads/category-3d-snacks.png",
  "tea-coffee": "/uploads/category-3d-coffee.png",
  baby: "/uploads/category-3d-baby.png",
  flowers: "/uploads/category-3d-flowers.png",
  delivery: "/uploads/category-3d-delivery.png",
  pharmacy: "/uploads/category-3d-pharmacy.png",
  "women-bags": "/uploads/category-3d-bags.png",
  "international-shopping": "/uploads/category-3d-international.png",
};

const CATEGORY_COLORS: Record<string, string> = {
  restaurants: "#FFF4E0",
  "fruits-vegetables": "#E8F5E9",
  "meat-poultry": "#FFEBEE",
  "dairy-eggs": "#F3E5F5",
  "cleaning-care": "#E3F2FD",
  beverages: "#E0F7FA",
  "snacks-sweets": "#FFF9C4",
  "tea-coffee": "#EFEBE9",
  baby: "#FCE4EC",
  flowers: "#FDF2F2",
  delivery: "#FFFDE7",
  pharmacy: "#E1F5FE",
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

  const [activeTab, setActiveTab] = useState<"restaurants" | "stores">("restaurants");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const welcomeMessage = userProfile?.fullName
    ? `أهلاً ${userProfile.fullName.split(" ")[0]}`
    : "أهلاً بك";

  const { data: categories = [], isLoading: categoriesLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const { data: allBanners = [] } = useQuery<Banner[]>({
    queryKey: ["/api/banners"],
  });

  const { data: allProducts = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const { data: allVendors = [], isLoading: vendorsLoading } = useQuery<Vendor[]>({
    queryKey: ["/api/vendors"],
  });

  interface PromotionalSection {
    type: string;
    productIds: string[];
    isActive: boolean;
  }

  const { data: promotionalSections = [] } = useQuery<PromotionalSection[]>({
    queryKey: ["/api/promotional-sections"],
  });

  // ── Vendors filtered by tab + search ──────────────────────────────────
  const restaurantVendors = useMemo(() => {
    return allVendors.filter(
      (v) => !v.categoryType || v.categoryType === "restaurant"
    );
  }, [allVendors]);

  const storeVendors = useMemo(() => {
    return allVendors.filter((v) => v.categoryType === "store");
  }, [allVendors]);

  const filteredRestaurants = useMemo(() => {
    if (!searchQuery.trim()) return restaurantVendors;
    const q = searchQuery.trim().toLowerCase();
    return restaurantVendors.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        (v.cuisine || "").toLowerCase().includes(q)
    );
  }, [restaurantVendors, searchQuery]);

  // ── Stores: non-restaurant categories ──────────────────────────────────
  const storeCategories = useMemo(() => {
    return categories.filter((c) => c.id !== "restaurants");
  }, [categories]);

  const filteredStoreProducts = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.trim().toLowerCase();
    return allProducts.filter(
      (p) =>
        p.categoryId !== "restaurants" &&
        p.name.toLowerCase().includes(q)
    );
  }, [allProducts, searchQuery]);

  // ── Promotional sections ────────────────────────────────────────────────
  const bestSellerProducts = useMemo(() => {
    const section = promotionalSections.find((s) => s.type === "bestSellers");
    if (section && section.productIds.length > 0) {
      return section.productIds
        .map((id) => allProducts.find((p) => p.id === id))
        .filter(Boolean) as Product[];
    }
    if (allProducts.length === 0) return [];
    return [...allProducts]
      .filter((p) => p.categoryId !== "restaurants")
      .sort(() => Math.random() - 0.5)
      .slice(0, 8);
  }, [allProducts, promotionalSections]);

  const featuredProducts = useMemo(() => {
    const section = promotionalSections.find((s) => s.type === "featured");
    if (section && section.productIds.length > 0) {
      return section.productIds
        .map((id) => allProducts.find((p) => p.id === id))
        .filter(Boolean) as Product[];
    }
    if (allProducts.length === 0) return [];
    return [...allProducts]
      .filter((p) => p.categoryId !== "restaurants")
      .sort(() => Math.random() - 0.5)
      .slice(0, 6);
  }, [allProducts, promotionalSections]);

  const discountProducts = useMemo(() => {
    const section = promotionalSections.find((s) => s.type === "discounts");
    if (section && section.productIds.length > 0) {
      return section.productIds
        .map((id) => allProducts.find((p) => p.id === id))
        .filter(Boolean) as Product[];
    }
    return allProducts
      .filter((p) => (p.discount || 0) > 0)
      .slice(0, 6);
  }, [allProducts, promotionalSections]);

  const offerBanner = allBanners.find((b) => b.type === "offer");
  const sliderBanners = allBanners.filter((b) => b.type === "slider");

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

  const handleCategoryPress = (category: Category) => {
    if (category.id === "delivery") {
      navigation.navigate("CourierPickup");
    } else if (category.id === "international-shopping") {
      navigation.navigate("InternationalShopping");
    } else {
      navigation.navigate("Products", { categoryId: category.id, categoryName: category.name });
    }
  };

  // ── Render helpers ──────────────────────────────────────────────────────

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
              cachePolicy="disk"
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

  const renderProductCard = (product: Product) => {
    const isFav = isFavorite(product.id);
    const cartItem = items.find((item) => item.product.id === product.id);
    const quantity = cartItem ? cartItem.quantity : 0;

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
            <ThemedText type="small" style={styles.discountText}>
              {product.discount}%
            </ThemedText>
          </View>
        ) : null}
        <View style={styles.productImageContainer}>
          <Image
            source={{ uri: getImageUrl(product.image) }}
            style={styles.productImage}
            contentFit="cover"
            cachePolicy="disk"
            transition={200}
          />
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              toggleFavorite(product);
            }}
            style={styles.productFavoriteBtn}
          >
            <Feather name="heart" size={15} color={isFav ? "#E53935" : "#BBBBBB"} />
          </Pressable>
        </View>
        <View style={styles.productInfo}>
          <ThemedText type="body" numberOfLines={1} style={styles.productName}>
            {product.name}
          </ThemedText>
          <View style={styles.productFooter}>
            <ThemedText style={styles.productPrice}>{formatPrice(product.price)}</ThemedText>
            {quantity > 0 ? (
              <View style={styles.quantityRow}>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    updateQuantity(product.id, quantity - 1);
                  }}
                  style={styles.qtyBtn}
                  testID={`btn-minus-${product.id}`}
                >
                  <Feather name="minus" size={14} color="#E86520" />
                </Pressable>
                <ThemedText style={styles.qtyText}>{quantity}</ThemedText>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    updateQuantity(product.id, quantity + 1);
                  }}
                  style={styles.qtyBtn}
                  testID={`btn-plus-${product.id}`}
                >
                  <Feather name="plus" size={14} color="#E86520" />
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  addToCart(product);
                }}
                style={styles.addButton}
                testID={`btn-add-${product.id}`}
              >
                <Feather name="plus" size={16} color="#FFFFFF" />
              </Pressable>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  const renderRestaurantCard = (vendor: Vendor) => (
    <Pressable
      key={vendor.id}
      style={styles.restaurantCard}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        navigation.navigate("Products", {
          categoryId: "restaurants",
          categoryName: vendor.name,
          restaurant: vendor.name,
        });
      }}
      testID={`restaurant-card-${vendor.id}`}
    >
      <View style={styles.restaurantImageWrapper}>
        <Image
          source={{ uri: getImageUrl(vendor.image) }}
          style={styles.restaurantImage}
          contentFit="cover"
          cachePolicy="disk"
          transition={300}
        />
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.65)"]}
          style={styles.restaurantGradient}
        />
        <View style={[styles.openBadge, { backgroundColor: vendor.isOpen ? "#10B981" : "#EF4444" }]}>
          <View style={styles.openDot} />
          <ThemedText style={styles.openText}>{vendor.isOpen ? "مفتوح" : "مغلق"}</ThemedText>
        </View>
      </View>
      <View style={styles.restaurantInfo}>
        <View style={styles.restaurantTopRow}>
          <ThemedText style={styles.restaurantName} numberOfLines={1}>
            {vendor.name}
          </ThemedText>
          {vendor.cuisine ? (
            <View style={styles.cuisineTag}>
              <ThemedText style={styles.cuisineText}>{vendor.cuisine}</ThemedText>
            </View>
          ) : null}
        </View>
        <View style={styles.restaurantMeta}>
          <View style={styles.metaItem}>
            <Feather name="star" size={13} color="#F59E0B" />
            <ThemedText style={styles.metaText}>{vendor.rating?.toFixed(1) || "4.5"}</ThemedText>
          </View>
          <View style={styles.metaDivider} />
          <View style={styles.metaItem}>
            <Feather name="clock" size={13} color="#6B7280" />
            <ThemedText style={styles.metaText}>{vendor.deliveryTime} دقيقة</ThemedText>
          </View>
          <View style={styles.metaDivider} />
          <View style={styles.metaItem}>
            <Feather name="map-pin" size={13} color="#6B7280" />
            <ThemedText style={styles.metaText} numberOfLines={1}>
              {vendor.location || "الضلوعية"}
            </ThemedText>
          </View>
        </View>
      </View>
    </Pressable>
  );

  const renderSearchResults = () => {
    if (filteredStoreProducts.length === 0) {
      return (
        <View style={styles.emptySearch}>
          <Feather name="search" size={40} color="#CCCCCC" />
          <ThemedText style={styles.emptySearchText}>لا توجد نتائج لـ "{searchQuery}"</ThemedText>
        </View>
      );
    }
    return (
      <View style={styles.searchResultsGrid}>
        {filteredStoreProducts.map(renderProductCard)}
      </View>
    );
  };

  const firstRowCategories = storeCategories.slice(0, Math.ceil(storeCategories.length / 2));
  const secondRowCategories = storeCategories.slice(Math.ceil(storeCategories.length / 2));

  // ── Main content ────────────────────────────────────────────────────────
  const renderContent = () => (
    <View>
      <LocationBar />

      {/* Greeting */}
      <View style={styles.greetingContainer}>
        <ThemedText style={styles.greeting}>{welcomeMessage}</ThemedText>
        <ThemedText style={styles.subGreeting}>طلباتك صارت أسهل ويانا</ThemedText>
      </View>

      {/* Banners */}
      {sliderBanners.length > 0 || offerBanner ? (
        <View style={styles.bannersSection}>
          {offerBanner ? <OfferBanner banner={offerBanner} /> : null}
          {sliderBanners.length > 0 ? <BannerSlider banners={sliderBanners} /> : null}
        </View>
      ) : null}

      {/* ── Toggle Tabs ── */}
      <View style={styles.tabsWrapper}>
        <Pressable
          style={[styles.tabBtn, activeTab === "restaurants" && styles.tabBtnActive]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setActiveTab("restaurants");
            setSearchQuery("");
          }}
          testID="tab-restaurants"
        >
          <MaterialIcons
            name="restaurant"
            size={20}
            color={activeTab === "restaurants" ? "#FFFFFF" : "#9CA3AF"}
          />
          <ThemedText
            style={[styles.tabText, activeTab === "restaurants" && styles.tabTextActive]}
          >
            مطاعم
          </ThemedText>
        </Pressable>
        <Pressable
          style={[styles.tabBtn, activeTab === "stores" && styles.tabBtnActive]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setActiveTab("stores");
            setSearchQuery("");
          }}
          testID="tab-stores"
        >
          <MaterialIcons
            name="local-grocery-store"
            size={20}
            color={activeTab === "stores" ? "#FFFFFF" : "#9CA3AF"}
          />
          <ThemedText
            style={[styles.tabText, activeTab === "stores" && styles.tabTextActive]}
          >
            متاجر
          </ThemedText>
        </Pressable>
      </View>

      {/* ── Search Bar ── */}
      <View style={[styles.searchBox, { backgroundColor: theme.backgroundSecondary }]}>
        <Feather name="search" size={18} color="#9CA3AF" />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder={
            activeTab === "restaurants" ? "ابحث عن مطعم أو نوع طعام..." : "ابحث عن منتج..."
          }
          placeholderTextColor="#B0B0B0"
          value={searchQuery}
          onChangeText={setSearchQuery}
          testID="input-home-search"
        />
        {searchQuery.length > 0 ? (
          <Pressable onPress={() => setSearchQuery("")}>
            <Feather name="x" size={16} color="#9CA3AF" />
          </Pressable>
        ) : null}
      </View>

      {/* ── RESTAURANTS TAB ── */}
      {activeTab === "restaurants" ? (
        <View style={styles.tabContent}>
          {vendorsLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={AppColors.primary} />
            </View>
          ) : filteredRestaurants.length > 0 ? (
            filteredRestaurants.map(renderRestaurantCard)
          ) : (
            <View style={styles.emptySearch}>
              <Feather name="coffee" size={40} color="#CCCCCC" />
              <ThemedText style={styles.emptySearchText}>
                {searchQuery.trim().length > 0
                  ? `لا يوجد مطعم باسم "${searchQuery}"`
                  : "لا توجد مطاعم متاحة حالياً"}
              </ThemedText>
            </View>
          )}
        </View>
      ) : (
        // ── STORES TAB ──
        <View style={styles.tabContent}>
          {searchQuery.trim().length > 0 ? (
            renderSearchResults()
          ) : (
            <>
              {/* Categories */}
              <View style={styles.sectionHeader}>
                <ThemedText style={styles.sectionTitle}>الأقسام الرئيسية</ThemedText>
                <Pressable
                  onPress={() => navigation.navigate("AllCategories")}
                >
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

              {/* Best Sellers */}
              <View style={styles.sectionHeader}>
                <ThemedText style={styles.sectionTitle}>الأكثر مبيعاً</ThemedText>
                <Pressable onPress={() => navigation.navigate("AllCategories")}>
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

              {/* Featured */}
              <View style={styles.sectionHeader}>
                <ThemedText style={styles.sectionTitle}>المنتجات المميزة</ThemedText>
                <Pressable onPress={() => navigation.navigate("AllCategories")}>
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

              {/* Discounts */}
              {discountProducts.length > 0 ? (
                <>
                  <View style={styles.sectionHeader}>
                    <ThemedText style={styles.sectionTitle}>التخفيضات المميزة</ThemedText>
                    <Pressable onPress={() => navigation.navigate("AllCategories")}>
                      <ThemedText style={styles.viewAll}>عرض الكل</ThemedText>
                    </Pressable>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.bestSellersContainer}
                    style={styles.productsSlider}
                  >
                    {discountProducts.map(renderProductCard)}
                  </ScrollView>
                </>
              ) : null}
            </>
          )}
        </View>
      )}
    </View>
  );

  // ── Product Modal ────────────────────────────────────────────────────────
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
                cachePolicy="disk"
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
                  <ThemedText style={styles.modalOrigPrice}>
                    {formatPrice(selectedProduct.originalPrice)}
                  </ThemedText>
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
                      <Feather name="minus" size={20} color="#E86520" />
                    </Pressable>
                    <ThemedText style={styles.modalQtyText}>{qty}</ThemedText>
                    <Pressable
                      style={styles.modalQtyBtn}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        updateQuantity(selectedProduct.id, qty + 1);
                      }}
                    >
                      <Feather name="plus" size={20} color="#E86520" />
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
      <LinearGradient
        colors={["#FFE5D9", "#FFF0E6", "#FFF8F3", "#FFFFFF"]}
        locations={[0, 0.2, 0.5, 1]}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 0,
        }}
      />
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: Math.max(headerHeight, insets.top + 44) + Spacing.xl,
          paddingBottom: tabBarHeight + Spacing.xl + (items.length > 0 ? 70 : 0),
          paddingHorizontal: HORIZONTAL_PADDING,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        data={[{ key: "content" }]}
        renderItem={renderContent}
        showsVerticalScrollIndicator={false}
      />
      <FloatingCartBar bottomOffset={tabBarHeight + 8} />
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
    fontSize: 16,
    color: "#E86520",
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
    marginVertical: 12,
  },
  // ── Tabs ──
  tabsWrapper: {
    flexDirection: "row",
    backgroundColor: "#F3F4F6",
    borderRadius: 16,
    padding: 4,
    marginTop: 16,
    marginBottom: 14,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 13,
  },
  tabBtnActive: {
    backgroundColor: AppColors.primary,
    ...Platform.select({
      ios: {
        shadowColor: AppColors.primary,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
      default: { boxShadow: `0 3px 8px ${AppColors.primary}55` },
    }),
  },
  tabText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 15,
    color: "#9CA3AF",
  },
  tabTextActive: {
    color: "#FFFFFF",
  },
  // ── Search ──
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    textAlign: "right",
    writingDirection: "rtl",
  },
  tabContent: {
    paddingBottom: 8,
  },
  // ── Restaurant Card ──
  restaurantCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    marginBottom: 14,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: { elevation: 4 },
      default: { boxShadow: "0 4px 12px rgba(0,0,0,0.08)" },
    }),
  },
  restaurantImageWrapper: {
    height: 160,
    position: "relative",
  },
  restaurantImage: {
    width: "100%",
    height: 160,
  },
  restaurantGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
  },
  openBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  openDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.85)",
  },
  openText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 12,
    color: "#FFFFFF",
  },
  restaurantInfo: {
    padding: 14,
  },
  restaurantTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  restaurantName: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    color: "#1A1A1A",
    flex: 1,
    textAlign: "right",
  },
  cuisineTag: {
    backgroundColor: "#FFF4E0",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: 8,
  },
  cuisineText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 11,
    color: "#E86520",
  },
  restaurantMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    justifyContent: "flex-end",
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    color: "#6B7280",
  },
  metaDivider: {
    width: 1,
    height: 12,
    backgroundColor: "#E5E7EB",
  },
  // ── Search empty ──
  emptySearch: {
    paddingVertical: 48,
    alignItems: "center",
    gap: 12,
  },
  emptySearchText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    color: "#9CA3AF",
    textAlign: "center",
  },
  searchResultsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
  },
  // ── Section ──
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    color: "#2C3E50",
    textAlign: "right",
  },
  viewAll: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
    color: "#E86520",
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
      android: { elevation: 3 },
      default: { boxShadow: "0 3px 8px rgba(0,0,0,0.07)" },
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
  // ── Product Card ──
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
      android: { elevation: 3 },
      default: { boxShadow: "0 4px 10px rgba(0,0,0,0.04)" },
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
    backgroundColor: "#E86520",
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
    color: "#E86520",
  },
  addButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#E86520",
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
    color: "#E86520",
    minWidth: 18,
    textAlign: "center",
  },
  // ── Modal ──
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
    backgroundColor: "#E86520",
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
    fontSize: 17,
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
    fontSize: 17,
    color: "#E86520",
  },
  modalOrigPrice: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: "#AAAAAA",
    textDecorationLine: "line-through",
  },
  modalActions: {
    alignItems: "center",
  },
  modalAddBtn: {
    flexDirection: "row",
    backgroundColor: "#E86520",
    borderRadius: 16,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    width: "100%",
  },
  modalAddText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
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
    fontSize: 17,
    color: "#E86520",
    minWidth: 30,
    textAlign: "center",
  },
});
