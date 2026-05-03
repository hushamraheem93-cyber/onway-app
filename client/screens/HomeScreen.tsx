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
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import tabCartImg from "../assets/images/tab-cart-groceries.png";
import tabBurgerImg from "../assets/images/tab-burger-meal.png";

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
import { resolveImageUrl } from "@/utils/imageUtils";
import { FloatingCartBar } from "@/components/FloatingCartBar";
import { getApiUrl } from "@/lib/query-client";

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

interface VendorStore {
  id: string;
  storeName: string;
  businessType: string;
  address?: string;
  bio?: string;
  totalProducts?: number;
  profileImageUrl?: string;
  coverImageUrl?: string;
}

interface VendorProduct {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
  unit: string;
  stock: number;
  vendorId: string;
  storeName: string;
  description: string;
  category: string;
}

const VENDOR_BIZ_CONFIG: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  restaurant: { label: "مطعم", icon: "food", color: "#E86520", bg: "#FFF4E0" },
  supermarket: { label: "سوبرماركت", icon: "cart", color: "#2E7D32", bg: "#E8F5E9" },
  pharmacy: { label: "صيدلية", icon: "medical-bag", color: "#7B1FA2", bg: "#F3E5F5" },
  bakery: { label: "مخبز", icon: "bread-slice", color: "#F57F17", bg: "#FFF8E1" },
  other: { label: "متجر", icon: "store", color: "#1565C0", bg: "#E3F2FD" },
};

function resolveStoreUrl(path?: string): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  try { return new URL(path, getApiUrl()).toString(); } catch { return null; }
}

const CATEGORY_3D_IMAGES: Record<string, string> = {
  restaurants: "/uploads/tab-icon-restaurants.png",
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

// ── Tab icon images (transparent PNG, no background) ─────────────────────────
function StoreTabIcon({ size = 48 }: { size?: number }) {
  return (
    <Image
      source={tabCartImg}
      style={{ width: size, height: size }}
      contentFit="contain"
    />
  );
}

function RestaurantTabIcon({ size = 48 }: { size?: number }) {
  return (
    <Image
      source={tabBurgerImg}
      style={{ width: size, height: size }}
      contentFit="contain"
    />
  );
}
// ─────────────────────────────────────────────────────────────────────────────

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
    ? `أهلاً ${userProfile.fullName.split(" ")[0]} 👋`
    : "أهلاً بك 👋";

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
    staleTime: 30 * 1000,
    refetchOnMount: true,
  });

  const { data: storesData, isLoading: storesLoading } = useQuery<{
    stores: VendorStore[];
    total: number;
  }>({
    queryKey: ["/api/stores"],
    staleTime: 30 * 1000,
    refetchOnMount: true,
  });
  const allVendorStores = storesData?.stores ?? [];

  const { data: productsPreviewData } = useQuery<{
    preview: Record<string, VendorProduct[]>;
  }>({
    queryKey: ["/api/stores/products-preview"],
  });
  const storeProductsPreview = productsPreviewData?.preview ?? {};

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

  // ── Vendor stores from registration system ──────────────────────────────
  const vendorRestaurants = useMemo(() =>
    allVendorStores.filter((s) => s.businessType === "restaurant"),
    [allVendorStores]
  );

  const vendorOtherStores = useMemo(() =>
    allVendorStores.filter((s) => s.businessType !== "restaurant"),
    [allVendorStores]
  );

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


  const get3DImage = (categoryId: string, fallbackImage: string) => {
    const path = CATEGORY_3D_IMAGES[categoryId];
    if (path) return resolveImageUrl(path);
    return resolveImageUrl(fallbackImage);
  };

  const CATEGORY_TO_BUSINESS_TYPE: Record<string, string> = {
    restaurants: "restaurant",
    pharmacy: "pharmacy",
  };

  const handleCategoryPress = (category: Category) => {
    if (category.id === "delivery") {
      navigation.navigate("CourierPickup");
    } else if (category.id === "international-shopping") {
      navigation.navigate("InternationalShopping");
    } else {
      const businessType = CATEGORY_TO_BUSINESS_TYPE[category.id];
      navigation.navigate("StoresList", {
        categoryId: category.id,
        categoryName: category.name,
        businessType,
      });
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
            source={{ uri: resolveImageUrl(product.image) }}
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
          source={{ uri: resolveImageUrl(vendor.image) }}
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
          {vendor.rating != null ? (
            <>
              <View style={styles.metaItem}>
                <Feather name="star" size={13} color="#F59E0B" />
                <ThemedText style={styles.metaText}>{vendor.rating.toFixed(1)}</ThemedText>
              </View>
              <View style={styles.metaDivider} />
            </>
          ) : null}
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

  const renderVendorStoreCard = (store: VendorStore) => {
    const cfg = VENDOR_BIZ_CONFIG[store.businessType] || VENDOR_BIZ_CONFIG.other;
    const avatarUrl = resolveStoreUrl(store.profileImageUrl);
    const coverUrl = resolveStoreUrl(store.coverImageUrl);
    const open = (() => {
      const wh = (store as any).workingHours;
      if (!wh) return true;
      const now = new Date();
      const day = now.getDay();
      if (!wh.openDays?.includes(day)) return false;
      const cur = now.getHours() * 60 + now.getMinutes();
      const [oh, om] = (wh.openTime || "00:00").split(":").map(Number);
      const [ch, cm] = (wh.closeTime || "23:59").split(":").map(Number);
      return cur >= oh * 60 + om && cur < ch * 60 + cm;
    })();
    const rating: number | null = (store as any).rating ?? null;
    const deliveryTime = (store as any).deliveryTime || "30-45";
    const deliveryPrice = (store as any).deliveryPrice ?? 0;
    return (
      <Pressable
        key={store.id}
        style={{
          backgroundColor: theme.backgroundDefault,
          borderRadius: 18,
          overflow: "hidden",
          marginBottom: 14,
          shadowColor: "#000",
          shadowOpacity: 0.08,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 3,
        }}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          navigation.navigate("StoreProducts", { storeId: store.id, storeName: store.storeName });
        }}
        testID={`vendor-store-card-${store.id}`}
      >
        {/* Cover */}
        <View style={{ width: "100%", height: 120, backgroundColor: cfg.bg }}>
          {coverUrl ? (
            <Image source={{ uri: coverUrl }} style={StyleSheet.absoluteFillObject as any} contentFit="cover" />
          ) : null}
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.5)"]}
            style={StyleSheet.absoluteFillObject as any}
            start={{ x: 0, y: 0.4 }}
            end={{ x: 0, y: 1 }}
          />
          {/* Open badge */}
          <View style={{
            position: "absolute", top: 10, left: 10,
            flexDirection: "row", alignItems: "center", gap: 5,
            paddingHorizontal: 9, paddingVertical: 4,
            borderRadius: 12,
            backgroundColor: open ? "#10B981EE" : "#EF4444EE",
          }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" }} />
            <ThemedText style={{ fontFamily: "Cairo_700Bold", fontSize: 11, color: "#fff" }}>
              {open ? "مفتوح" : "مغلق"}
            </ThemedText>
          </View>
          {/* Type badge */}
          <View style={{
            position: "absolute", top: 10, right: 10,
            flexDirection: "row", alignItems: "center", gap: 4,
            paddingHorizontal: 9, paddingVertical: 4,
            borderRadius: 12, backgroundColor: cfg.color + "EE",
          }}>
            <MaterialCommunityIcons name={cfg.icon as any} size={12} color="#fff" />
            <ThemedText style={{ fontFamily: "Cairo_700Bold", fontSize: 11, color: "#fff" }}>{cfg.label}</ThemedText>
          </View>
          {/* Delivery info */}
          <View style={{ position: "absolute", bottom: 10, right: 10, flexDirection: "row", gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.45)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>
              <MaterialCommunityIcons name="clock-outline" size={12} color="#fff" />
              <ThemedText style={{ fontFamily: "Cairo_700Bold", fontSize: 11, color: "#fff" }}>{deliveryTime} دقيقة</ThemedText>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.45)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>
              <MaterialCommunityIcons name="moped" size={12} color="#fff" />
              <ThemedText style={{ fontFamily: "Cairo_700Bold", fontSize: 11, color: "#fff" }}>
                {deliveryPrice === 0 ? "مجاني" : `${deliveryPrice.toLocaleString("ar-IQ")} د.ع`}
              </ThemedText>
            </View>
          </View>
        </View>
        {/* Body */}
        <View style={{ flexDirection: "row-reverse", alignItems: "center", paddingHorizontal: 14, paddingBottom: 14, paddingTop: 4, gap: 10 }}>
          <View style={{
            width: 56, height: 56, borderRadius: 28, borderWidth: 3,
            borderColor: theme.backgroundDefault, overflow: "hidden",
            marginTop: -28, elevation: 4, backgroundColor: "#fff",
          }}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
            ) : (
              <View style={{ flex: 1, backgroundColor: cfg.color, justifyContent: "center", alignItems: "center" }}>
                <ThemedText style={{ fontFamily: "Cairo_700Bold", fontSize: 20, color: "#fff", lineHeight: 26 }}>{store.storeName?.[0] || "م"}</ThemedText>
              </View>
            )}
          </View>
          <View style={{ flex: 1, alignItems: "flex-end", gap: 4, paddingTop: 24 }}>
            <ThemedText style={{ fontFamily: "Cairo_700Bold", fontSize: 15, color: theme.text, textAlign: "right" }} numberOfLines={1}>{store.storeName}</ThemedText>
            {rating !== null ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                {[1,2,3,4,5].map((i) => (
                  <MaterialCommunityIcons key={i} name={i <= Math.floor(rating) ? "star" : rating - Math.floor(rating) >= 0.5 && i === Math.floor(rating)+1 ? "star-half-full" : "star-outline"} size={13} color="#F59E0B" />
                ))}
                <ThemedText style={{ fontFamily: "Cairo_700Bold", fontSize: 12, color: "#F59E0B" }}> {rating.toFixed(1)}</ThemedText>
              </View>
            ) : null}
            {store.address ? (
              <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 3 }}>
                <Feather name="map-pin" size={11} color={theme.textSecondary ?? "#888"} />
                <ThemedText style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: theme.textSecondary ?? "#888" }} numberOfLines={1}>{store.address}</ThemedText>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
    );
  };

  // ── Vendor product mini-card ─────────────────────────────────────────────
  const renderVendorProductCard = (vp: VendorProduct, storeId: string, storeName: string) => {
    const imgUrl = resolveStoreUrl(vp.imageUrl);
    const cartProduct: Product = {
      id: vp.id,
      categoryId: "vendor-market",
      name: vp.name,
      price: vp.price,
      image: vp.imageUrl,
      description: vp.description,
      inStock: vp.stock > 0,
      restaurant: storeName,
    };
    const cartItem = items.find((i) => i.product.id === vp.id);
    const qty = cartItem ? cartItem.quantity : 0;

    return (
      <Pressable
        key={vp.id}
        style={vendorProdStyles.card}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          navigation.navigate("StoreProducts", { storeId, storeName });
        }}
        testID={`vp-card-${vp.id}`}
      >
        <View style={vendorProdStyles.imageBox}>
          {imgUrl ? (
            <Image
              source={{ uri: imgUrl }}
              style={vendorProdStyles.image}
              contentFit="cover"
              cachePolicy="disk"
              transition={200}
            />
          ) : (
            <View style={[vendorProdStyles.image, { backgroundColor: "#F3F4F6", justifyContent: "center", alignItems: "center" }]}>
              <MaterialCommunityIcons name="package-variant" size={30} color="#CBD5E1" />
            </View>
          )}
          {vp.stock === 0 ? (
            <View style={vendorProdStyles.outOfStock}>
              <ThemedText style={vendorProdStyles.outOfStockText}>نفد</ThemedText>
            </View>
          ) : null}
        </View>
        <View style={vendorProdStyles.info}>
          <ThemedText style={vendorProdStyles.name} numberOfLines={2}>{vp.name}</ThemedText>
          <View style={vendorProdStyles.bottomRow}>
            <ThemedText style={vendorProdStyles.price}>
              {formatPrice(vp.price)}
            </ThemedText>
            {qty > 0 ? (
              <View style={vendorProdStyles.qtyRow}>
                <Pressable
                  style={vendorProdStyles.qtyBtn}
                  onPress={(e) => {
                    e.stopPropagation();
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    updateQuantity(vp.id, qty - 1);
                  }}
                >
                  <Feather name="minus" size={12} color={AppColors.primary} />
                </Pressable>
                <ThemedText style={vendorProdStyles.qtyNum}>{qty}</ThemedText>
                <Pressable
                  style={vendorProdStyles.qtyBtn}
                  onPress={(e) => {
                    e.stopPropagation();
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    addToCart(cartProduct);
                  }}
                >
                  <Feather name="plus" size={12} color={AppColors.primary} />
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={[vendorProdStyles.addBtn, vp.stock === 0 && { opacity: 0.4 }]}
                disabled={vp.stock === 0}
                onPress={(e) => {
                  e.stopPropagation();
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  addToCart(cartProduct);
                }}
                testID={`btn-add-vp-${vp.id}`}
              >
                <Feather name="plus" size={14} color="#fff" />
              </Pressable>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  // ── Store section = card header + product strip ──────────────────────────
  const renderVendorStoreSectionWithProducts = (store: VendorStore) => {
    const products = storeProductsPreview[store.id] ?? [];
    return (
      <View key={store.id} style={vendorSectionStyles.wrapper}>
        {renderVendorStoreCard(store)}
        {products.length > 0 ? (
          <View style={vendorSectionStyles.productsBlock}>
            <View style={vendorSectionStyles.productsHeader}>
              <Pressable
                style={vendorSectionStyles.viewAllBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  navigation.navigate("StoreProducts", { storeId: store.id, storeName: store.storeName });
                }}
              >
                <ThemedText style={vendorSectionStyles.viewAllText}>عرض الكل</ThemedText>
                <Feather name="chevron-left" size={14} color={AppColors.primary} />
              </Pressable>
              <ThemedText style={vendorSectionStyles.productsTitle}>منتجات المتجر</ThemedText>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={vendorSectionStyles.scroll}
            >
              {products.map((vp) =>
                renderVendorProductCard(vp, store.id, store.storeName)
              )}
            </ScrollView>
          </View>
        ) : null}
      </View>
    );
  };

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
        <View style={styles.tabsBackground}>
          {/* زر المتاجر — يمين */}
          <Pressable
            style={[styles.tabBtn, activeTab === "stores" && styles.tabBtnActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab("stores");
              setSearchQuery("");
            }}
            testID="tab-stores"
          >
            {activeTab === "stores" ? (
              <LinearGradient
                colors={["#E86520", "#FF8C4B"]}
                style={styles.tabGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <StoreTabIcon size={52} />
                <ThemedText style={styles.tabTextActive}>متاجر</ThemedText>
              </LinearGradient>
            ) : (
              <>
                <StoreTabIcon size={52} />
                <ThemedText style={styles.tabText}>متاجر</ThemedText>
              </>
            )}
          </Pressable>

          {/* زر المطاعم — يسار */}
          <Pressable
            style={[styles.tabBtn, activeTab === "restaurants" && styles.tabBtnActive]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab("restaurants");
              setSearchQuery("");
            }}
            testID="tab-restaurants"
          >
            {activeTab === "restaurants" ? (
              <LinearGradient
                colors={["#E86520", "#FF8C4B"]}
                style={styles.tabGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <RestaurantTabIcon size={52} />
                <ThemedText style={styles.tabTextActive}>
                  {restaurantVendors.length > 0 ? `${restaurantVendors.length} مطاعم` : "مطاعم"}
                </ThemedText>
              </LinearGradient>
            ) : (
              <>
                <RestaurantTabIcon size={52} />
                <ThemedText style={styles.tabText}>مطاعم</ThemedText>
              </>
            )}
          </Pressable>
        </View>
      </View>

      {/* ── Search Bar ── */}
      <View style={[styles.searchBox, { backgroundColor: theme.backgroundSecondary }]}>
        <Pressable onPress={() => {}}>
          <Feather name="search" size={20} color="#9CA3AF" />
        </Pressable>
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder={
            activeTab === "restaurants" ? "ابحث عن مطعم أو نوع طعام..." : "ابحث عن منتج..."
          }
          placeholderTextColor="#95A5A6"
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
          {vendorsLoading || storesLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={AppColors.primary} />
            </View>
          ) : (
            <>
              {filteredRestaurants.length > 0 ? filteredRestaurants.map(renderRestaurantCard) : null}
              {vendorRestaurants.length > 0 ? (
                <>
                  {filteredRestaurants.length > 0 ? (
                    <View style={styles.sectionHeader}>
                      <ThemedText style={styles.sectionTitle}>مطاعم المتاجر</ThemedText>
                    </View>
                  ) : null}
                  {vendorRestaurants.map(renderVendorStoreSectionWithProducts)}
                </>
              ) : null}
              {filteredRestaurants.length === 0 && vendorRestaurants.length === 0 ? (
                <View style={styles.emptySearch}>
                  <Feather name="coffee" size={40} color="#CCCCCC" />
                  <ThemedText style={styles.emptySearchText}>
                    {searchQuery.trim().length > 0
                      ? `لا يوجد مطعم باسم "${searchQuery}"`
                      : "لا توجد مطاعم متاحة حالياً"}
                  </ThemedText>
                </View>
              ) : null}
            </>
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

              {/* Vendor Stores with product preview */}
              {vendorOtherStores.length > 0 ? (
                <>
                  <View style={styles.sectionHeader}>
                    <ThemedText style={styles.sectionTitle}>المتاجر المتاحة</ThemedText>
                  </View>
                  {vendorOtherStores.map(renderVendorStoreSectionWithProducts)}
                </>
              ) : null}

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
                source={{ uri: resolveImageUrl(selectedProduct.image) }}
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
          paddingTop: headerHeight,
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
    paddingTop: 4,
    marginTop: 4,
    paddingBottom: 12,
    width: "100%",
    alignItems: "flex-start",
  },
  greeting: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    lineHeight: 32,
    color: "#E86520",
    marginBottom: 2,
    textAlign: "right",
    writingDirection: "rtl",
    includeFontPadding: false,
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
    marginTop: 16,
    marginBottom: 14,
  },
  tabsBackground: {
    flexDirection: "row",
    backgroundColor: "#F8F9FA",
    borderRadius: 16,
    padding: 4,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    overflow: "hidden",
  },
  tabBtnActive: {
    ...Platform.select({
      ios: {
        shadowColor: AppColors.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
      },
      android: { elevation: 4 },
    }),
  },
  tabGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  tabText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 14,
    color: "#7F8C8D",
  },
  tabTextActive: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    color: "#FFFFFF",
  },
  tabIconImg: {
    width: 26,
    height: 26,
  },
  // ── Search ──
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: "#E8E8E8",
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

// ── Vendor product mini-card styles ──────────────────────────────────────────
const vendorProdStyles = StyleSheet.create({
  card: {
    width: 140,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    overflow: "hidden",
    marginLeft: 10,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 3 },
      default: { boxShadow: "0 3px 8px rgba(0,0,0,0.08)" },
    }),
  },
  imageBox: { width: "100%", height: 110, position: "relative" },
  image: { width: "100%", height: "100%" },
  outOfStock: {
    ...StyleSheet.absoluteFillObject as any,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
  },
  outOfStockText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#fff" },
  info: { padding: 8, gap: 4 },
  name: { fontFamily: "Cairo_600SemiBold", fontSize: 12, textAlign: "right", color: "#1F2937", lineHeight: 18 },
  bottomRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  price: { fontFamily: "Cairo_700Bold", fontSize: 11, color: AppColors.primary, textAlign: "right" },
  addBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: AppColors.primary,
    justifyContent: "center", alignItems: "center",
  },
  qtyRow: { flexDirection: "row-reverse", alignItems: "center", gap: 4 },
  qtyBtn: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 1.5, borderColor: AppColors.primary,
    justifyContent: "center", alignItems: "center",
  },
  qtyNum: { fontFamily: "Cairo_700Bold", fontSize: 13, color: AppColors.primary, minWidth: 18, textAlign: "center" },
});

// ── Vendor store section (card + products strip) styles ──────────────────────
const vendorSectionStyles = StyleSheet.create({
  wrapper: { marginBottom: 16 },
  productsBlock: { backgroundColor: "#FAFAFA", borderBottomLeftRadius: 18, borderBottomRightRadius: 18, paddingBottom: 14, marginTop: -4 },
  productsHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6,
  },
  productsTitle: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#374151", textAlign: "right" },
  viewAllBtn: { flexDirection: "row", alignItems: "center", gap: 2 },
  viewAllText: { fontFamily: "Cairo_600SemiBold", fontSize: 12, color: AppColors.primary },
  scroll: { paddingHorizontal: 14, paddingRight: 4 },
});
