import React, { useMemo, useState, useEffect } from "react";
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
import {
  Spacing,
  AppColors,
  FontWeight,
  DesignSystem,
} from "@/constants/theme";
import { Category, Banner, Product } from "@/constants/categories";
import {
  categoryImageFallbackSource,
  categoryImageSource,
} from "@/constants/categoryImages";
import { ThemedText } from "@/components/ThemedText";
import { CategoryIcon } from "@/components/CategoryIcon";
import { LocationBar } from "@/components/LocationBar";
import { BannerSlider } from "@/components/BannerSlider";
import { OfferBanner } from "@/components/OfferBanner";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { useCart } from "@/context/CartContext";
import { useFavorites } from "@/context/FavoritesContext";
import { useAuth } from "@/context/AuthContext";
import { formatPrice } from "@/constants/currency";
import { resolveImageUrl, getProductThumb } from "@/utils/imageUtils";
import { FloatingCartBar } from "@/components/FloatingCartBar";
import { HeaderTitle, HEADER_BAR_HEIGHT } from "@/components/HeaderTitle";
import { getApiUrl } from "@/lib/query-client";
import { isStoreOpenNow } from "@shared/storeHours";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const { width: SCREEN_WIDTH } = Dimensions.get("window");
// Read from the design system rather than restated here: BannerSlider and
// OfferBanner size themselves against the same token, and a second copy of the
// number is what let the two drift apart by 4px.
const HORIZONTAL_PADDING = DesignSystem.screenPadding;
const PRODUCT_CARD_WIDTH = 160;

// C-20: how many 160pt cards flexWrap fits per row inside the padded content
// width, with the 12pt gap between them. Computing it keeps the search grid
// adaptive exactly as `flexWrap: "wrap"` was, instead of hard-coding columns.
const SEARCH_GRID_GAP = 12;
const SEARCH_GRID_COLUMNS = Math.max(
  2,
  Math.floor(
    (SCREEN_WIDTH - 2 * HORIZONTAL_PADDING + SEARCH_GRID_GAP) /
      (PRODUCT_CARD_WIDTH + SEARCH_GRID_GAP),
  ),
);
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
  imageThumbs?: string[];
  imageUrls?: string[];
  unit: string;
  stock: number;
  vendorId: string;
  storeName: string;
  description: string;
  category: string;
}

const VENDOR_BIZ_CONFIG: Record<
  string,
  { label: string; icon: string; color: string; bg: string }
> = {
  restaurant: {
    label: "مطعم",
    icon: "food",
    color: AppColors.primary,
    bg: AppColors.warningLight,
  },
  supermarket: {
    label: "سوبرماركت",
    icon: "cart",
    color: AppColors.success,
    bg: AppColors.successLight,
  },
  pharmacy: {
    label: "صيدلية",
    icon: "medical-bag",
    color: AppColors.vendorPurple,
    bg: AppColors.vendorPurpleLight,
  },
  bakery: {
    label: "مخبز",
    icon: "bread-slice",
    color: AppColors.warning,
    bg: AppColors.warningLight,
  },
  other: {
    label: "متجر",
    icon: "store",
    color: AppColors.driverBlue,
    bg: AppColors.driverBlueLight,
  },
};

function resolveStoreUrl(path?: string): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  try {
    return new URL(path, getApiUrl()).toString();
  } catch {
    return null;
  }
}


const CATEGORY_COLORS: Record<string, string> = {
  restaurants: AppColors.warningLight,
  "fruits-vegetables": AppColors.successLight,
  "meat-poultry": AppColors.errorLight,
  "dairy-eggs": AppColors.vendorPurpleLight,
  "cleaning-care": AppColors.driverBlueLight,
  beverages: AppColors.infoLight,
  "snacks-sweets": AppColors.warningLight,
  "tea-coffee": AppColors.gray100,
  baby: AppColors.errorLight,
  flowers: AppColors.errorLight,
  delivery: AppColors.warningLight,
  pharmacy: AppColors.infoLight,
  "women-bags": AppColors.errorLight,
  "international-shopping": AppColors.infoLight,
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
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();

  const { items, addToCart, updateQuantity } = useCart();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { userProfile } = useAuth();

  const [activeTab, setActiveTab] = useState<"restaurants" | "stores">(
    "restaurants",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const welcomeMessage = userProfile?.fullName
    ? `أهلاً ${userProfile.fullName.split(" ")[0]} 👋`
    : "أهلاً بك 👋";

  const { data: categories = [], isLoading: categoriesLoading } = useQuery<
    Category[]
  >({
    queryKey: ["/api/categories"],
  });

  const { data: allBanners = [] } = useQuery<Banner[]>({
    queryKey: ["/api/banners"],
  });

  const { data: allProducts = [], isLoading: productsLoading } = useQuery<
    Product[]
  >({
    queryKey: ["/api/products"],
  });

  const { data: allVendors = [], isLoading: vendorsLoading } = useQuery<
    Vendor[]
  >({
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
      (v) => !v.categoryType || v.categoryType === "restaurant",
    );
  }, [allVendors]);

  const filteredRestaurants = useMemo(() => {
    if (!searchQuery.trim()) return restaurantVendors;
    const q = searchQuery.trim().toLowerCase();
    return restaurantVendors.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        (v.cuisine || "").toLowerCase().includes(q),
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
      (p) => p.categoryId !== "restaurants" && p.name.toLowerCase().includes(q),
    );
  }, [allProducts, searchQuery]);

  const firstRowCategories = storeCategories.slice(
    0,
    Math.ceil(storeCategories.length / 2),
  );
  const secondRowCategories = storeCategories.slice(
    Math.ceil(storeCategories.length / 2),
  );

  // ── Vendor stores from registration system ──────────────────────────────
  const vendorRestaurants = useMemo(
    () => allVendorStores.filter((s) => s.businessType === "restaurant"),
    [allVendorStores],
  );

  const vendorOtherStores = useMemo(
    () => allVendorStores.filter((s) => s.businessType !== "restaurant"),
    [allVendorStores],
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
    return allProducts.filter((p) => (p.discount || 0) > 0).slice(0, 6);
  }, [allProducts, promotionalSections]);

  // Prefetch visible catalog product images when data first loads
  useEffect(() => {
    allProducts.slice(0, 10).forEach((p) => {
      const url = resolveImageUrl(p.image ?? "");
      if (url) Image.prefetch(url).catch(() => {});
    });
  }, [allProducts]);

  const offerBanner = allBanners.find((b) => b.type === "offer");
  const sliderBanners = allBanners.filter((b) => b.type === "slider");



  const CATEGORY_TO_BUSINESS_TYPE: Record<string, string> = {
    restaurants: "restaurant",
    restaurant: "restaurant",
    pharmacy: "pharmacy",
    supermarket: "supermarket",
    bakery: "bakery",
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
    const gradientColor =
      CATEGORY_COLORS[category.id] || category.color || AppColors.secondary;
    return (
      <Pressable
        key={category.id}
        style={styles.catCardWrapper}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          handleCategoryPress(category);
        }}
        testID={`card-home-category-${category.id}`}
        accessibilityRole="button"
        accessibilityLabel={`قسم ${category.name}`}
      >
        <LinearGradient
          colors={[gradientColor, AppColors.white]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.catCard}
        >
          <View style={styles.catImageContainer}>
            <CategoryIcon
              uri={categoryImageSource(category.id, category.image)}
              fallbackUri={categoryImageFallbackSource(category.id)}
              size={92}
            />
          </View>
          {/* One line, down to 0.85 of the size and no further.
              The card leaves 118px inside its padding, so a 0.85 floor fits any
              name up to 138.8px measured at 13px in Cairo_700Bold. Thirteen of
              the fourteen clear that easily — the widest, "سناكس ومقرمشات", is
              115px, and "الخضروات والفواكه" is 110px. Only
              "الشراء من المواقع العالمية" (157px) cannot, and it takes a second
              line instead of being shrunk to an unreadable size; at two lines it
              stays at the full 13px. The longest name that does fit one line is
              17 characters against that one's 26, so 20 sits in a clean gap. */}
          <ThemedText
            style={styles.catName}
            numberOfLines={category.name.length > 20 ? 2 : 1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
          >
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
        accessibilityRole="button"
        accessibilityLabel={`${product.name}، ${formatPrice(product.price)}`}
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
            accessibilityRole="button"
            accessibilityLabel={
              isFav ? "إزالة من المفضلة" : "إضافة إلى المفضلة"
            }
            accessibilityState={{ selected: isFav }}
          >
            <Feather
              name="heart"
              size={15}
              color={isFav ? AppColors.error : AppColors.gray300}
            />
          </Pressable>
        </View>
        <View style={styles.productInfo}>
          <ThemedText type="body" numberOfLines={1} style={styles.productName}>
            {product.name}
          </ThemedText>
          <View style={styles.productFooter}>
            <ThemedText style={styles.productPrice}>
              {formatPrice(product.price)}
            </ThemedText>
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
                  <Feather name="minus" size={14} color={AppColors.primary} />
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
                  <Feather name="plus" size={14} color={AppColors.primary} />
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => {
                  Haptics.notificationAsync(
                    Haptics.NotificationFeedbackType.Success,
                  );
                  addToCart(product);
                }}
                style={styles.addButton}
                testID={`btn-add-${product.id}`}
                accessibilityRole="button"
                accessibilityLabel={`أضف ${product.name} إلى السلة`}
              >
                <Feather name="plus" size={16} color={AppColors.white} />
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
      accessibilityRole="button"
      accessibilityLabel={`مطعم ${vendor.name}${vendor.isOpen ? "، مفتوح" : "، مغلق"}`}
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
          colors={["transparent", AppColors.overlay]}
          style={styles.restaurantGradient}
        />
        <View
          style={[
            styles.openBadge,
            {
              backgroundColor: vendor.isOpen
                ? AppColors.success
                : AppColors.error,
            },
          ]}
        >
          <View style={styles.openDot} />
          <ThemedText style={styles.openText}>
            {vendor.isOpen ? "مفتوح" : "مغلق"}
          </ThemedText>
        </View>
        <View style={styles.deliveryPill}>
          <Feather name="clock" size={12} color={AppColors.primary} />
          <ThemedText style={styles.deliveryPillText}>
            {vendor.deliveryTime} دقيقة
          </ThemedText>
        </View>
      </View>
      <View style={styles.restaurantInfo}>
        <View style={styles.restaurantTopRow}>
          <ThemedText style={styles.restaurantName} numberOfLines={1}>
            {vendor.name}
          </ThemedText>
          {vendor.rating != null ? (
            <View style={styles.ratingPill}>
              <Feather name="star" size={12} color={AppColors.white} />
              <ThemedText style={styles.ratingPillText}>
                {vendor.rating.toFixed(1)}
              </ThemedText>
            </View>
          ) : null}
        </View>
        <ThemedText style={styles.restaurantMetaText} numberOfLines={1}>
          {[vendor.cuisine, vendor.location || "الضلوعية"]
            .filter(Boolean)
            .join("   ·   ")}
        </ThemedText>
      </View>
    </Pressable>
  );

  const renderVendorStoreCard = (store: VendorStore) => {
    const cfg =
      VENDOR_BIZ_CONFIG[store.businessType] || VENDOR_BIZ_CONFIG.other;
    const avatarUrl = resolveStoreUrl(store.profileImageUrl);
    const coverUrl = resolveStoreUrl(store.coverImageUrl);
    // D-6: the same predicate the stores list uses, from the shared module. These
    // two screens each carried their own copy of this arithmetic.
    const open = isStoreOpenNow((store as any).workingHours);
    const rating: number | null = (store as any).rating ?? null;
    const deliveryTime = (store as any).deliveryTime || "30-45";
    // D-3: see StoresListScreen — the vendor-set `deliveryPrice` is not what the
    // customer is charged. Only a store's own `deliveryFee` override is a real
    // price; otherwise the fee depends on the delivery area chosen at checkout.
    const deliveryOverride: number | null =
      typeof (store as any).deliveryFee === "number"
        ? (store as any).deliveryFee
        : null;
    return (
      <Pressable
        key={store.id}
        style={{
          backgroundColor: theme.backgroundDefault,
          borderRadius: 18,
          overflow: "hidden",
          marginBottom: 14,
          shadowColor: AppColors.black,
          shadowOpacity: 0.08,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 3,
        }}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          navigation.navigate("StoreProducts", {
            storeId: store.id,
            storeName: store.storeName,
          });
        }}
        testID={`vendor-store-card-${store.id}`}
      >
        {/* Cover */}
        <View style={{ width: "100%", height: 120, backgroundColor: cfg.bg }}>
          {coverUrl ? (
            <Image
              source={{ uri: coverUrl }}
              style={StyleSheet.absoluteFillObject as any}
              contentFit="cover"
            />
          ) : null}
          <LinearGradient
            colors={["transparent", AppColors.overlay]}
            style={StyleSheet.absoluteFillObject as any}
            start={{ x: 0, y: 0.4 }}
            end={{ x: 0, y: 1 }}
          />
          {/* Open badge */}
          <View
            style={{
              position: "absolute",
              top: 10,
              left: 10,
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              paddingHorizontal: 9,
              paddingVertical: 4,
              borderRadius: 12,
              backgroundColor: open ? "#10B981EE" : "#EF4444EE",
            }}
          >
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: AppColors.white,
              }}
            />
            <ThemedText
              style={{
                fontFamily: "Cairo_700Bold",
                fontSize: 11,
                color: AppColors.white,
              }}
            >
              {open ? "مفتوح" : "مغلق"}
            </ThemedText>
          </View>
          {/* Type badge */}
          <View
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 9,
              paddingVertical: 4,
              borderRadius: 12,
              backgroundColor: cfg.color + "EE",
            }}
          >
            <MaterialCommunityIcons
              name={cfg.icon as any}
              size={12}
              color={AppColors.white}
            />
            <ThemedText
              style={{
                fontFamily: "Cairo_700Bold",
                fontSize: 11,
                color: AppColors.white,
              }}
            >
              {cfg.label}
            </ThemedText>
          </View>
          {/* Delivery info */}
          <View
            style={{
              position: "absolute",
              bottom: 10,
              right: 10,
              flexDirection: "row",
              gap: 6,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                backgroundColor: AppColors.overlay,
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 10,
              }}
            >
              <MaterialCommunityIcons
                name="clock-outline"
                size={12}
                color={AppColors.white}
              />
              <ThemedText
                style={{
                  fontFamily: "Cairo_700Bold",
                  fontSize: 11,
                  color: AppColors.white,
                }}
              >
                {deliveryTime} دقيقة
              </ThemedText>
            </View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                backgroundColor: AppColors.overlay,
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 10,
              }}
            >
              <MaterialCommunityIcons
                name="moped"
                size={12}
                color={AppColors.white}
              />
              <ThemedText
                style={{
                  fontFamily: "Cairo_700Bold",
                  fontSize: 11,
                  color: AppColors.white,
                }}
              >
                {deliveryOverride == null
                  ? "حسب المنطقة"
                  : deliveryOverride === 0
                    ? "مجاني"
                    : `${deliveryOverride.toLocaleString("ar-IQ")} د.ع`}
              </ThemedText>
            </View>
          </View>
        </View>
        {/* Body */}
        <View
          style={{
            flexDirection: "row-reverse",
            alignItems: "center",
            paddingHorizontal: 14,
            paddingBottom: 14,
            paddingTop: 4,
            gap: 10,
          }}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              borderWidth: 3,
              borderColor: theme.backgroundDefault,
              overflow: "hidden",
              marginTop: -28,
              elevation: 4,
              backgroundColor: AppColors.white,
            }}
          >
            {avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
              />
            ) : (
              <View
                style={{
                  flex: 1,
                  backgroundColor: cfg.color,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <ThemedText
                  style={{
                    fontFamily: "Cairo_700Bold",
                    fontSize: 20,
                    color: AppColors.white,
                    lineHeight: 26,
                  }}
                >
                  {store.storeName?.[0] || "م"}
                </ThemedText>
              </View>
            )}
          </View>
          <View
            style={{ flex: 1, alignItems: "flex-end", gap: 4, paddingTop: 24 }}
          >
            <ThemedText
              style={{
                fontFamily: "Cairo_700Bold",
                fontSize: 15,
                color: theme.text,
                textAlign: "right",
              }}
              numberOfLines={1}
            >
              {store.storeName}
            </ThemedText>
            {rating !== null ? (
              <View
                style={{
                  flexDirection: "row-reverse",
                  alignItems: "center",
                  gap: 4,
                  backgroundColor: AppColors.success,
                  paddingHorizontal: 9,
                  paddingVertical: 4,
                  borderRadius: 999,
                }}
              >
                <Feather name="star" size={12} color={AppColors.white} />
                <ThemedText
                  style={{
                    fontFamily: "Cairo_700Bold",
                    fontSize: 12,
                    color: AppColors.white,
                    includeFontPadding: false,
                  }}
                >
                  {rating.toFixed(1)}
                </ThemedText>
              </View>
            ) : null}
            {store.address ? (
              <View
                style={{
                  flexDirection: "row-reverse",
                  alignItems: "center",
                  gap: 3,
                }}
              >
                <Feather
                  name="map-pin"
                  size={11}
                  color={theme.textSecondary ?? AppColors.gray500}
                />
                <ThemedText
                  style={{
                    fontFamily: "Cairo_400Regular",
                    fontSize: 12,
                    color: theme.textSecondary ?? AppColors.gray500,
                  }}
                  numberOfLines={1}
                >
                  {store.address}
                </ThemedText>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
    );
  };

  // ── Vendor product mini-card ─────────────────────────────────────────────
  const renderVendorProductCard = (
    vp: VendorProduct,
    storeId: string,
    storeName: string,
  ) => {
    const imgUrl = resolveImageUrl(getProductThumb(vp));
    const cartProduct: Product = {
      id: vp.id,
      categoryId: "vendor-market",
      name: vp.name,
      price: vp.price,
      image: vp.imageUrl,
      description: vp.description,
      inStock: vp.stock > 0,
      restaurant: storeName,
      vendorId: vp.vendorId || storeId,
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
            <View
              style={[
                vendorProdStyles.image,
                {
                  backgroundColor: AppColors.gray100,
                  justifyContent: "center",
                  alignItems: "center",
                },
              ]}
            >
              <MaterialCommunityIcons
                name="package-variant"
                size={30}
                color={AppColors.gray300}
              />
            </View>
          )}
          {vp.stock === 0 ? (
            <View style={vendorProdStyles.outOfStock}>
              <ThemedText style={vendorProdStyles.outOfStockText}>
                نفد
              </ThemedText>
            </View>
          ) : null}
        </View>
        <View style={vendorProdStyles.info}>
          <ThemedText style={vendorProdStyles.name} numberOfLines={2}>
            {vp.name}
          </ThemedText>
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
                style={[
                  vendorProdStyles.addBtn,
                  vp.stock === 0 && { opacity: 0.4 },
                ]}
                disabled={vp.stock === 0}
                onPress={(e) => {
                  e.stopPropagation();
                  Haptics.notificationAsync(
                    Haptics.NotificationFeedbackType.Success,
                  );
                  addToCart(cartProduct);
                }}
                testID={`btn-add-vp-${vp.id}`}
              >
                <Feather name="plus" size={14} color={AppColors.white} />
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
                  navigation.navigate("StoreProducts", {
                    storeId: store.id,
                    storeName: store.storeName,
                  });
                }}
              >
                <ThemedText style={vendorSectionStyles.viewAllText}>
                  عرض الكل
                </ThemedText>
                <Feather
                  name="chevron-left"
                  size={14}
                  color={AppColors.primary}
                />
              </Pressable>
              <ThemedText style={vendorSectionStyles.productsTitle}>
                منتجات المتجر
              </ThemedText>
            </View>
            <FlatList
              horizontal
              data={products}
              renderItem={({ item: vp }) =>
                renderVendorProductCard(vp, store.id, store.storeName)
              }
              keyExtractor={(vp) => vp.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={vendorSectionStyles.scroll}
              initialNumToRender={4}
              windowSize={5}
              removeClippedSubviews
            />
          </View>
        ) : null}
      </View>
    );
  };

  const renderSearchResults = () => {
    if (filteredStoreProducts.length === 0) {
      return (
        <View style={styles.emptySearch}>
          <Feather name="search" size={40} color={AppColors.gray300} />
          <ThemedText style={styles.emptySearchText}>
            لا توجد نتائج لـ "{searchQuery}"
          </ThemedText>
        </View>
      );
    }
    // C-20: this grid mounted EVERY match at once — a one-character query pulls
    // most of the catalogue, since filteredStoreProducts is uncapped. It is now
    // windowed. numColumns + a space-between column wrapper reproduces what
    // `flexDirection: row / flexWrap: wrap / justifyContent: space-between`
    // produced, including a partial last row, and the column count comes from the
    // same geometry rather than being fixed.
    return (
      <FlatList
        data={filteredStoreProducts}
        renderItem={({ item: p }) => renderProductCard(p)}
        keyExtractor={(p) => p.id}
        numColumns={SEARCH_GRID_COLUMNS}
        columnWrapperStyle={styles.searchResultsRow}
        contentContainerStyle={styles.searchResultsGridContent}
        scrollEnabled={false}
        initialNumToRender={SEARCH_GRID_COLUMNS * 3}
        maxToRenderPerBatch={SEARCH_GRID_COLUMNS * 2}
        windowSize={5}
        removeClippedSubviews
      />
    );
  };

  // Section title with the signature brand accent bar (RTL reading-start).
  const renderSectionTitle = (title: string) => (
    <View style={styles.sectionTitleRow}>
      <View style={styles.sectionAccent} />
      <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
    </View>
  );

  // ── Main content ────────────────────────────────────────────────────────
  // ── C-20: real virtualization ────────────────────────────────────────────
  //
  // The screen used to render as `<FlatList data={[{ key: "content" }]}
  // renderItem={renderContent} />` — a ONE-ITEM list whose single item was the
  // entire page. That is a ScrollView with extra bookkeeping: nothing windows,
  // and every restaurant card, store section, product card and image mounts at
  // once and stays mounted.
  //
  // The page is now described as a list of sections, and — this is the part that
  // actually matters — each entry of an UNBOUNDED collection becomes its OWN
  // list item rather than being .map()ed inside one. So FlatList can window the
  // things that actually grow: restaurant cards, and the per-store sections.
  //
  // Every section below renders the SAME JSX it rendered before, moved but not
  // rewritten. Order, styles, handlers, RTL and navigation are untouched.
  type HomeSection =
    | { type: "location" }
    | { type: "greeting" }
    | { type: "banners" }
    | { type: "tabs" }
    | { type: "search" }
    | { type: "restaurantsLoading" }
    | { type: "restaurantCard"; vendor: Vendor }
    | { type: "vendorRestaurantsHeader" }
    | { type: "vendorStoreSection"; store: VendorStore }
    | { type: "restaurantsEmpty" }
    | { type: "searchResults" }
    | { type: "categoriesHeader" }
    | { type: "categoriesLoading" }
    | { type: "categoriesRows" }
    | { type: "storesHeader" }
    | { type: "bestSellersHeader" }
    | { type: "bestSellersLoading" }
    | { type: "bestSellersEmpty" }
    | { type: "bestSellersRow" }
    | { type: "featuredHeader" }
    | { type: "featuredLoading" }
    | { type: "featuredEmpty" }
    | { type: "featuredRow" }
    | { type: "discountsHeader" }
    | { type: "discountsRow" }
    | { type: "tabBottomPad" };

  const buildSections = (): HomeSection[] => {
    const out: HomeSection[] = [
      { type: "location" },
      { type: "greeting" },
    ];
    if (sliderBanners.length > 0 || offerBanner) out.push({ type: "banners" });
    out.push({ type: "tabs" }, { type: "search" });

    if (activeTab === "restaurants") {
      if (vendorsLoading || storesLoading) {
        out.push({ type: "restaurantsLoading" });
      } else {
        // One item per restaurant — this is what FlatList can now window.
        for (const vendor of filteredRestaurants) out.push({ type: "restaurantCard", vendor });
        if (vendorRestaurants.length > 0) {
          if (filteredRestaurants.length > 0) out.push({ type: "vendorRestaurantsHeader" });
          for (const store of vendorRestaurants) out.push({ type: "vendorStoreSection", store });
        }
        if (filteredRestaurants.length === 0 && vendorRestaurants.length === 0) {
          out.push({ type: "restaurantsEmpty" });
        }
      }
    } else if (searchQuery.trim().length > 0) {
      out.push({ type: "searchResults" });
    } else {
      out.push({ type: "categoriesHeader" });
      out.push(categoriesLoading ? { type: "categoriesLoading" } : { type: "categoriesRows" });
      if (vendorOtherStores.length > 0) {
        out.push({ type: "storesHeader" });
        for (const store of vendorOtherStores) out.push({ type: "vendorStoreSection", store });
      }
      out.push({ type: "bestSellersHeader" });
      out.push(
        productsLoading ? { type: "bestSellersLoading" }
        : bestSellerProducts.length === 0 ? { type: "bestSellersEmpty" }
        : { type: "bestSellersRow" },
      );
      out.push({ type: "featuredHeader" });
      out.push(
        productsLoading ? { type: "featuredLoading" }
        : featuredProducts.length === 0 ? { type: "featuredEmpty" }
        : { type: "featuredRow" },
      );
      if (discountProducts.length > 0) {
        out.push({ type: "discountsHeader" }, { type: "discountsRow" });
      }
    }
    // styles.tabContent was only `paddingBottom: 8` around the whole tab block;
    // reproduced here so the gap above the tab bar is unchanged.
    out.push({ type: "tabBottomPad" });
    return out;
  };

  const sectionKey = (item: HomeSection, index: number) =>
    item.type === "restaurantCard" ? `restaurant:${item.vendor.id}`
    : item.type === "vendorStoreSection" ? `store:${item.store.id}`
    : `${item.type}:${index}`;

  const renderSection = ({ item }: { item: HomeSection }) => {
    switch (item.type) {
      case "location":
        return <LocationBar />;

      case "greeting":
        return (
          <View style={styles.greetingContainer}>
            <ThemedText style={styles.greeting}>{welcomeMessage}</ThemedText>
            <ThemedText style={styles.subGreeting}>
              طلباتك صارت أسهل ويانا
            </ThemedText>
          </View>
        );

      case "banners":
        return (
          <View>
{/* Banners */}
        {sliderBanners.length > 0 || offerBanner ? (
          <View style={styles.bannersSection}>
            {offerBanner ? <OfferBanner banner={offerBanner} /> : null}
            {sliderBanners.length > 0 ? (
              <BannerSlider banners={sliderBanners} />
            ) : null}
          </View>
        ) : null}
          </View>
        );

      case "tabs":
        return (
          <View>
{/* ── Toggle Tabs ── */}
        <View style={styles.tabsWrapper}>
          <View style={styles.tabsBackground}>
            {/* زر المتاجر — يمين */}
            <Pressable
              style={[
                styles.tabBtn,
                activeTab === "stores" && styles.tabBtnActive,
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setActiveTab("stores");
                setSearchQuery("");
              }}
              testID="tab-stores"
              accessibilityRole="tab"
              accessibilityLabel="متاجر"
              accessibilityState={{ selected: activeTab === "stores" }}
            >
              {activeTab === "stores" ? (
                <LinearGradient
                  colors={[AppColors.primary, AppColors.primaryLight]}
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
              style={[
                styles.tabBtn,
                activeTab === "restaurants" && styles.tabBtnActive,
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setActiveTab("restaurants");
                setSearchQuery("");
              }}
              testID="tab-restaurants"
              accessibilityRole="tab"
              accessibilityLabel="مطاعم"
              accessibilityState={{ selected: activeTab === "restaurants" }}
            >
              {activeTab === "restaurants" ? (
                <LinearGradient
                  colors={[AppColors.primary, AppColors.primaryLight]}
                  style={styles.tabGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <RestaurantTabIcon size={52} />
                  <ThemedText style={styles.tabTextActive}>
                    {restaurantVendors.length > 0
                      ? `${restaurantVendors.length} مطاعم`
                      : "مطاعم"}
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
          </View>
        );

      case "search":
        return (
          <View>
{/* ── Search Bar ── */}
        <View
          style={[
            styles.searchBox,
            { backgroundColor: theme.backgroundSecondary },
          ]}
        >
          <Pressable onPress={() => {}}>
            <Feather name="search" size={20} color={AppColors.gray400} />
          </Pressable>
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder={
              activeTab === "restaurants"
                ? "ابحث عن مطعم أو نوع طعام..."
                : "ابحث عن منتج..."
            }
            placeholderTextColor={AppColors.gray400}
            value={searchQuery}
            onChangeText={setSearchQuery}
            testID="input-home-search"
          />
          {searchQuery.length > 0 ? (
            <Pressable
              onPress={() => setSearchQuery("")}
              accessibilityRole="button"
              accessibilityLabel="مسح البحث"
              hitSlop={8}
            >
              <Feather name="x" size={16} color={AppColors.gray400} />
            </Pressable>
          ) : null}
        </View>
          </View>
        );

      case "restaurantsLoading":
      case "bestSellersLoading":
      case "featuredLoading":
        return (
          <View style={styles.loadingContainer}>
            <ActivityIndicator
              size={item.type === "restaurantsLoading" ? "large" : "small"}
              color={AppColors.primary}
            />
          </View>
        );

      case "restaurantCard":
        return renderRestaurantCard(item.vendor);

      case "vendorRestaurantsHeader":
        return (
          <View style={styles.sectionHeader}>
            {renderSectionTitle("مطاعم المتاجر")}
          </View>
        );

      case "vendorStoreSection":
        return renderVendorStoreSectionWithProducts(item.store);

      case "restaurantsEmpty":
        return (
          <View style={styles.emptySearch}>
            <Feather name="coffee" size={40} color={AppColors.gray300} />
            <ThemedText style={styles.emptySearchText}>
              {searchQuery.trim().length > 0
                ? `لا يوجد مطعم باسم "${searchQuery}"`
                : "لا توجد مطاعم متاحة حالياً"}
            </ThemedText>
          </View>
        );

      case "searchResults":
        return <View>{renderSearchResults()}</View>;

      case "categoriesHeader":
        return (
          <View style={styles.sectionHeader}>
            {renderSectionTitle("الأقسام الرئيسية")}
            <Pressable
              onPress={() => navigation.navigate("AllCategories")}
              accessibilityRole="button"
              accessibilityLabel="عرض كل الأقسام"
            >
              <ThemedText style={styles.viewAll}>عرض الكل</ThemedText>
            </Pressable>
          </View>
        );

      case "categoriesLoading":
        return (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={AppColors.primary} />
          </View>
        );

      case "categoriesRows":
        return (
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
        );

      case "storesHeader":
        return (
          <View style={styles.sectionHeader}>
            {renderSectionTitle("المتاجر المتاحة")}
          </View>
        );

      case "bestSellersHeader":
        return (
          <View style={styles.sectionHeader}>
            {renderSectionTitle("الأكثر مبيعاً")}
            <Pressable
              onPress={() => navigation.navigate("AllCategories")}
              accessibilityRole="button"
              accessibilityLabel="عرض كل المنتجات الأكثر مبيعاً"
            >
              <ThemedText style={styles.viewAll}>عرض الكل</ThemedText>
            </Pressable>
          </View>
        );

      case "bestSellersEmpty":
        return (
          <View style={styles.emptySection}>
            <ThemedText type="small" style={styles.emptySectionText}>
              لا توجد منتجات حالياً
            </ThemedText>
          </View>
        );

      case "bestSellersRow":
        return (
          <FlatList
            horizontal
            data={bestSellerProducts}
            renderItem={({ item: p }) => renderProductCard(p)}
            keyExtractor={(p) => p.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.bestSellersContainer}
            style={styles.productsSlider}
            initialNumToRender={4}
            windowSize={5}
            removeClippedSubviews
          />
        );

      case "featuredHeader":
        return (
          <View style={styles.sectionHeader}>
            {renderSectionTitle("المنتجات المميزة")}
            <Pressable
              onPress={() => navigation.navigate("AllCategories")}
              accessibilityRole="button"
              accessibilityLabel="عرض كل المنتجات المميزة"
            >
              <ThemedText style={styles.viewAll}>عرض الكل</ThemedText>
            </Pressable>
          </View>
        );

      case "featuredEmpty":
        return (
          <View style={styles.emptySection}>
            <ThemedText type="small" style={styles.emptySectionText}>
              لا توجد منتجات مميزة حالياً
            </ThemedText>
          </View>
        );

      case "featuredRow":
        return (
          <FlatList
            horizontal
            data={featuredProducts}
            renderItem={({ item: p }) => renderProductCard(p)}
            keyExtractor={(p) => p.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.bestSellersContainer}
            style={styles.productsSlider}
            initialNumToRender={4}
            windowSize={5}
            removeClippedSubviews
          />
        );

      case "discountsHeader":
        return (
          <View style={styles.sectionHeader}>
            {renderSectionTitle("التخفيضات المميزة")}
            <Pressable
              onPress={() => navigation.navigate("AllCategories")}
              accessibilityRole="button"
              accessibilityLabel="عرض كل التخفيضات"
            >
              <ThemedText style={styles.viewAll}>عرض الكل</ThemedText>
            </Pressable>
          </View>
        );

      case "discountsRow":
        return (
          <FlatList
            horizontal
            data={discountProducts}
            renderItem={({ item: p }) => renderProductCard(p)}
            keyExtractor={(p) => p.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.bestSellersContainer}
            style={styles.productsSlider}
            initialNumToRender={4}
            windowSize={5}
            removeClippedSubviews
          />
        );

      case "tabBottomPad":
        return <View style={styles.tabContent} />;

      default:
        return null;
    }
  };

  // ── Product Modal ────────────────────────────────────────────────────────
  const renderProductModal = () => {
    if (!selectedProduct) return null;
    const isFav = isFavorite(selectedProduct.id);
    const cartItem = items.find(
      (item) => item.product.id === selectedProduct.id,
    );
    const qty = cartItem ? cartItem.quantity : 0;

    return (
      <Modal
        visible={selectedProduct !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedProduct(null)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setSelectedProduct(null)}
        >
          <Pressable
            style={styles.modalSheet}
            onPress={(e) => e.stopPropagation()}
          >
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
                  <ThemedText style={styles.discountText}>
                    {selectedProduct.discount}%
                  </ThemedText>
                </View>
              ) : null}
              <Pressable
                style={styles.modalFavBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  toggleFavorite(selectedProduct);
                }}
              >
                <Feather
                  name="heart"
                  size={22}
                  color={isFav ? AppColors.error : AppColors.gray300}
                />
              </Pressable>
            </View>
            <View style={styles.modalInfo}>
              <ThemedText style={styles.modalName}>
                {selectedProduct.name}
              </ThemedText>
              {selectedProduct.description ? (
                <ThemedText style={styles.modalDesc}>
                  {selectedProduct.description}
                </ThemedText>
              ) : null}
              <View style={styles.modalPriceRow}>
                <ThemedText style={styles.modalPrice}>
                  {formatPrice(selectedProduct.price)}
                </ThemedText>
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
                      <Feather
                        name="minus"
                        size={20}
                        color={AppColors.primary}
                      />
                    </Pressable>
                    <ThemedText style={styles.modalQtyText}>{qty}</ThemedText>
                    <Pressable
                      style={styles.modalQtyBtn}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        updateQuantity(selectedProduct.id, qty + 1);
                      }}
                    >
                      <Feather
                        name="plus"
                        size={20}
                        color={AppColors.primary}
                      />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    style={styles.modalAddBtn}
                    onPress={() => {
                      Haptics.notificationAsync(
                        Haptics.NotificationFeedbackType.Success,
                      );
                      addToCart(selectedProduct);
                    }}
                    testID="btn-modal-add"
                    accessibilityRole="button"
                    accessibilityLabel="أضف إلى السلة"
                  >
                    <Feather
                      name="shopping-cart"
                      size={18}
                      color={AppColors.white}
                    />
                    <ThemedText style={styles.modalAddText}>
                      أضف إلى السلة
                    </ThemedText>
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
    <View style={{ flex: 1, backgroundColor: AppColors.white }}>
      <LinearGradient
        colors={[
          AppColors.secondary,
          AppColors.secondary,
          AppColors.secondary,
          AppColors.white,
        ]}
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
          paddingTop: insets.top + HEADER_BAR_HEIGHT,
          paddingBottom:
            tabBarHeight + Spacing.xl + (items.length > 0 ? 70 : 0),
          paddingHorizontal: HORIZONTAL_PADDING,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        data={buildSections()}
        renderItem={renderSection}
        keyExtractor={sectionKey}
        showsVerticalScrollIndicator={false}
        // C-20: the windowing that the one-item list made impossible. The header
        // block (location → search) is five cheap sections, so rendering them up
        // front keeps the screen looking identical on first paint while the
        // restaurant cards and store sections below stream in.
        initialNumToRender={8}
        maxToRenderPerBatch={6}
        windowSize={7}
        removeClippedSubviews
      />
      {/* Fixed top bar rendered in-screen (native-stack header is disabled for Home
          because its Android Toolbar clipped the full-width custom title). */}
      <View
        style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 }}
        pointerEvents="box-none"
      >
        <HeaderTitle />
      </View>
      <FloatingCartBar bottomOffset={tabBarHeight + 8} />
      {renderProductModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  greetingContainer: {
    paddingHorizontal: 0,
    paddingTop: 0,
    marginTop: 0,
    paddingBottom: 6,
    width: "100%",
    alignItems: "flex-start",
  },
  greeting: {
    fontFamily: "Cairo_700Bold",
    // 28 -> 25 (-10.7%). lineHeight follows at the same 1.43 ratio so the block
    // keeps its proportions instead of sitting in an oversized line box.
    fontSize: 21,
    lineHeight: 30,
    color: AppColors.primary,
    marginBottom: 0,
    textAlign: "right",
    writingDirection: "rtl",
    includeFontPadding: false,
  },
  subGreeting: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 14,
    color: AppColors.gray700,
    textAlign: "right",
    writingDirection: "rtl",
    marginTop: 2,
  },
  bannersSection: {
    marginVertical: 8,
  },
  // ── Tabs ──
  tabsWrapper: {
    marginTop: 10,
    marginBottom: 10,
  },
  tabsBackground: {
    flexDirection: "row",
    backgroundColor: AppColors.gray50,
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
    color: AppColors.gray500,
  },
  tabTextActive: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    color: AppColors.white,
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
    paddingVertical: 12,
    borderRadius: 18,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: AppColors.backgroundTertiary,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Cairo_400Regular",
    fontSize: 16,
    textAlign: "right",
    writingDirection: "rtl",
  },
  tabContent: {
    paddingBottom: 8,
  },
  // ── Restaurant Card ──
  restaurantCard: {
    backgroundColor: AppColors.white,
    borderRadius: 24,
    marginBottom: 16,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: AppColors.black,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: { elevation: 4 },
      default: { boxShadow: "0 4px 12px rgba(0,0,0,0.08)" },
    }),
  },
  restaurantImageWrapper: {
    height: 180,
    position: "relative",
  },
  restaurantImage: {
    width: "100%",
    height: 180,
  },
  restaurantGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 90,
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
    backgroundColor: AppColors.textOnBrandSubtle,
  },
  openText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 12,
    color: AppColors.white,
  },
  restaurantInfo: {
    padding: 14,
  },
  restaurantTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 6,
  },
  restaurantName: {
    fontFamily: "Cairo_700Bold",
    fontSize: 17,
    color: AppColors.black,
    flex: 1,
    textAlign: "right",
  },
  // Talabat-style rating badge: a single compact green pill instead of a
  // rainbow of chips — keeps the card calm and the rating unmistakable.
  ratingPill: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    backgroundColor: AppColors.success,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  ratingPillText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 12,
    color: AppColors.white,
    includeFontPadding: false,
  },
  // Quiet, dot-separated meta line (cuisine · area) in muted gray.
  restaurantMetaText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
    color: AppColors.gray500,
    textAlign: "right",
  },
  // White time pill overlaid on the photo, like Talabat's delivery-time chip.
  deliveryPill: {
    position: "absolute",
    bottom: 12,
    left: 12,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 5,
    backgroundColor: AppColors.white,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    ...Platform.select({
      ios: {
        shadowColor: AppColors.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
      },
      android: { elevation: 3 },
      default: { boxShadow: "0 2px 6px rgba(0,0,0,0.15)" },
    }),
  },
  deliveryPillText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 12,
    color: AppColors.gray800,
    includeFontPadding: false,
  },
  // ── Search empty ──
  emptySection: {
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  emptySectionText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: AppColors.gray400,
    textAlign: "center",
  },
  emptySearch: {
    paddingVertical: 48,
    alignItems: "center",
    gap: 12,
  },
  emptySearchText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    color: AppColors.gray400,
    textAlign: "center",
  },
  // C-20: the wrapped grid became a windowed FlatList. The row wrapper carries the
  // horizontal rule the old container had (space-between), and the content
  // container carries the vertical gap that `gap: 12` used to provide between rows.
  searchResultsRow: {
    justifyContent: "space-between",
    gap: SEARCH_GRID_GAP,
  },
  searchResultsGridContent: {
    gap: SEARCH_GRID_GAP,
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
    fontSize: 18,
    color: AppColors.gray800,
    textAlign: "right",
  },
  // Signature: short rounded brand accent bar at the reading-start (RTL) of every
  // section title — gives the home a consistent, premium section rhythm.
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionAccent: {
    width: 4,
    height: 20,
    borderRadius: 2,
    backgroundColor: AppColors.primary,
  },
  viewAll: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 14,
    color: AppColors.primary,
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
        shadowColor: AppColors.black,
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
    height: 164,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  catImageContainer: {
    width: "100%",
    height: 102,
    flexGrow: 0,
    flexShrink: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  catName: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    fontWeight: FontWeight.bold,
    color: AppColors.gray800,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 18,
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
    backgroundColor: AppColors.white,
    ...Platform.select({
      ios: {
        shadowColor: AppColors.black,
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
    backgroundColor: AppColors.gray50,
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
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  discountBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: AppColors.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    zIndex: 10,
  },
  discountText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 11,
    color: AppColors.white,
  },
  productInfo: {
    padding: 10,
  },
  productName: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 14,
    color: AppColors.black,
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
    fontSize: 15,
    color: AppColors.primary,
  },
  addButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: AppColors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  quantityRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: AppColors.secondary,
    borderRadius: 14,
    paddingHorizontal: 2,
    paddingVertical: 2,
    gap: 4,
  },
  qtyBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: AppColors.white,
    justifyContent: "center",
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: AppColors.black,
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
    color: AppColors.primary,
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
    backgroundColor: AppColors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 40,
    maxHeight: SCREEN_WIDTH * 1.6,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: AppColors.gray300,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 8,
  },
  modalImageContainer: {
    height: 220,
    backgroundColor: AppColors.gray50,
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
    backgroundColor: AppColors.primary,
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
    color: AppColors.black,
    textAlign: "right",
    marginBottom: 6,
  },
  modalDesc: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: AppColors.gray500,
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
    color: AppColors.primary,
  },
  modalOrigPrice: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: AppColors.gray400,
    textDecorationLine: "line-through",
  },
  modalActions: {
    alignItems: "center",
  },
  modalAddBtn: {
    flexDirection: "row",
    backgroundColor: AppColors.primary,
    borderRadius: 16,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    width: "100%",
  },
  modalAddText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 15,
    color: AppColors.white,
  },
  modalQtyRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: AppColors.secondary,
    borderRadius: 16,
    paddingHorizontal: 6,
    paddingVertical: 6,
    gap: 16,
  },
  modalQtyBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: AppColors.white,
    justifyContent: "center",
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: AppColors.black,
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
    color: AppColors.primary,
    minWidth: 30,
    textAlign: "center",
  },
});

// ── Vendor product mini-card styles ──────────────────────────────────────────
const vendorProdStyles = StyleSheet.create({
  card: {
    width: 140,
    backgroundColor: AppColors.white,
    borderRadius: 14,
    overflow: "hidden",
    marginLeft: 10,
    ...Platform.select({
      ios: {
        shadowColor: AppColors.black,
        shadowOpacity: 0.08,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
      },
      android: { elevation: 3 },
      default: { boxShadow: "0 3px 8px rgba(0,0,0,0.08)" },
    }),
  },
  imageBox: { width: "100%", height: 110, position: "relative" },
  image: { width: "100%", height: "100%" },
  outOfStock: {
    ...(StyleSheet.absoluteFillObject as any),
    backgroundColor: AppColors.overlay,
    justifyContent: "center",
    alignItems: "center",
  },
  outOfStockText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    color: AppColors.white,
  },
  info: { padding: 8, gap: 4 },
  name: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12,
    textAlign: "right",
    color: AppColors.gray800,
    lineHeight: 18,
  },
  bottomRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  price: {
    fontFamily: "Cairo_700Bold",
    fontSize: 11,
    color: AppColors.primary,
    textAlign: "right",
  },
  addBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: AppColors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  qtyRow: { flexDirection: "row-reverse", alignItems: "center", gap: 4 },
  qtyBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: AppColors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  qtyNum: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    color: AppColors.primary,
    minWidth: 18,
    textAlign: "center",
  },
});

// ── Vendor store section (card + products strip) styles ──────────────────────
const vendorSectionStyles = StyleSheet.create({
  wrapper: { marginBottom: 16 },
  productsBlock: {
    backgroundColor: AppColors.gray50,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    paddingBottom: 14,
    marginTop: -4,
  },
  productsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
  },
  productsTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    color: AppColors.gray700,
    textAlign: "right",
  },
  viewAllBtn: { flexDirection: "row", alignItems: "center", gap: 2 },
  viewAllText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12,
    color: AppColors.primary,
  },
  scroll: { paddingHorizontal: 14, paddingRight: 4 },
});
