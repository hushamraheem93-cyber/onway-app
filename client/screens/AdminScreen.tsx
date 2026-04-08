import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
  Switch,
  Modal,
} from "react-native";
import { WebView } from "react-native-webview";
import * as Notifications from "expo-notifications";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";

import * as Haptics from "expo-haptics";
import { useTheme } from "@/hooks/useTheme";
import { ThemedText } from "@/components/ThemedText";
import { Spacing, BorderRadius, AppColors } from "@/constants/theme";
import { Banner, Category } from "@/constants/categories";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { resolveImageUrl } from "@/utils/imageUtils";
import { formatPrice } from "@/constants/currency";
import { compressAndConvertToBase64, processAndUploadImage, isBase64Image, ImageSize } from "@/lib/imageUtils";

type TabType = "banners" | "categories" | "products" | "areas" | "orders" | "drivers" | "promoCodes" | "notifications" | "users" | "reports";

interface AdminUser {
  id: string;
  phoneNumber: string;
  fullName: string;
  gender?: string;
  region?: string;
  address?: string;
  createdAt?: any;
  pushToken?: string;
}
type BannerType = "offer" | "slider";
type OrderStatus = "pending" | "confirmed" | "preparing" | "ready" | "picked_up" | "in_delivery" | "delivering" | "delivered" | "cancelled" | "issue";

interface AdminOrder {
  id: string;
  phoneNumber: string;
  items: { productId: string; name: string; price: number; quantity: number; image: string }[];
  total: number;
  deliveryFee: number;
  address: string;
  region: string;
  status: OrderStatus;
  driverPhone?: string;
  createdAt: string;
  updatedAt: string;
}

interface Product {
  id: string;
  categoryId: string;
  name: string;
  price: number;
  originalPrice?: number;
  discount?: number;
  image: string;
  description: string;
  inStock: boolean;
}

interface DeliveryArea {
  id: string;
  name: string;
  fee: number;
  isActive: boolean;
}

interface PromoCode {
  id: string;
  code: string;
  type: "fixed" | "percentage";
  value: number;
  expiryDate: string;
  isActive: boolean;
  createdAt: string;
}

interface Driver {
  id: string;
  phoneNumber: string;
  fullName: string;
  firstName: string;
  secondName: string;
  thirdName: string;
  fourthName: string;
  nationalIdImage: string;
  driverLicenseImage?: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  updatedAt: string;
}

export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabType>("reports");
  const [isEditing, setIsEditing] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [hasCategoryChanges, setHasCategoryChanges] = useState(false);
  const [isSavingCategories, setIsSavingCategories] = useState(false);
  
  const [bannerForm, setBannerForm] = useState({
    title: "",
    type: "slider" as BannerType,
    imageUri: "",
    imageUrl: "",
  });

  const [categoryForm, setCategoryForm] = useState({
    name: "",
    imageUri: "",
    imageUrl: "",
  });

  const [productForm, setProductForm] = useState({
    name: "",
    categoryId: "",
    price: "",
    originalPrice: "",
    discount: "",
    description: "",
    inStock: true,
    imageUri: "",
    imageUrl: "",
    restaurant: "",
  });

  const [areaForm, setAreaForm] = useState({
    name: "",
    fee: "",
  });

  const [promoForm, setPromoForm] = useState({
    code: "",
    type: "fixed" as "fixed" | "percentage",
    value: "",
    expiryDate: "",
  });

  const [isSavingProduct, setIsSavingProduct] = useState(false);

  const [notifForm, setNotifForm] = useState({ title: "", body: "" });
  const [isSendingNotif, setIsSendingNotif] = useState(false);
  const [notifResult, setNotifResult] = useState<{ sent: number; total: number } | null>(null);
  const [notifError, setNotifError] = useState<string | null>(null);

  const [usersSearch, setUsersSearch] = useState("");
  const [ordersSearch, setOrdersSearch] = useState("");
  const [ordersStatusFilter, setOrdersStatusFilter] = useState<OrderStatus | "all">("all");

  // Register admin push token so server can send new-order notifications
  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS === "web") return;
        const { status: existing } = await Notifications.getPermissionsAsync();
        let finalStatus = existing;
        if (existing !== "granted") {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== "granted") return;
        const tokenData = await Notifications.getExpoPushTokenAsync();
        const pushToken = tokenData.data;
        if (pushToken?.startsWith("ExponentPushToken")) {
          await fetch(`${getApiUrl()}/api/admin/push-token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pushToken }),
          });
        }
      } catch (_) {}
    })();
  }, []);

  const { data: adminUsers = [], isLoading: usersLoading, refetch: refetchUsers } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: banners = [], isLoading: bannersLoading } = useQuery<Banner[]>({
    queryKey: ["/api/admin/banners"],
  });

  const { data: categories = [], isLoading: categoriesLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const { data: products = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ["/api/admin/products"],
  });

  const { data: deliveryAreas = [], isLoading: areasLoading } = useQuery<DeliveryArea[]>({
    queryKey: ["/api/admin/delivery-areas"],
  });

  const { data: adminOrders = [], isLoading: ordersLoading } = useQuery<AdminOrder[]>({
    queryKey: ["/api/admin/orders"],
    refetchInterval: 6000,
  });

  const { data: drivers = [], isLoading: driversLoading } = useQuery<Driver[]>({
    queryKey: ["/api/admin/drivers"],
  });

  const { data: promoCodes = [], isLoading: promoCodesLoading } = useQuery<PromoCode[]>({
    queryKey: ["/api/admin/promo-codes"],
  });

  const { data: ownerEarnings } = useQuery<{
    totalOwnerEarnings: number;
    totalDriverEarnings: number;
    totalDeliveryFees: number;
    ordersWithEarnings: number;
    totalDeliveredOrders: number;
  }>({
    queryKey: ["/api/admin/owner-earnings"],
    refetchInterval: 30000,
  });

  const { data: driverStatsData } = useQuery<{
    stats: Record<string, { todayOrders: number; todayEarnings: number; totalOrders: number; totalEarnings: number; walletBalance: number }>;
  }>({
    queryKey: ["/api/admin/driver-stats"],
    refetchInterval: 30000,
  });

  const [rechargeDriver, setRechargeDriver] = useState<string | null>(null);
  const [rechargeAmount, setRechargeAmount] = useState("");

  // Manual driver assignment
  const [assigningOrderId, setAssigningOrderId] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);

  // Driver tracking modal
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null);
  const [trackingMapHtml, setTrackingMapHtml] = useState<string | null>(null);
  const [trackingDriverName, setTrackingDriverName] = useState<string>("");
  const trackingWebViewRef = useRef<any>(null);
  const trackingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const assignDriverMutation = useMutation({
    mutationFn: async ({ orderId, driverPhone }: { orderId: string; driverPhone: string }) => {
      const res = await fetch(`${getApiUrl()}/api/admin/orders/${orderId}/assign-driver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverPhone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل التعيين");
      return data;
    },
    onSuccess: () => {
      setAssigningOrderId(null);
      setAssignError(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
    },
    onError: (err: Error) => {
      setAssignError(err.message);
    },
  });

  const updateDriverStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "pending" | "approved" | "rejected" }) => {
      await apiRequest("PUT", `/api/admin/drivers/${id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/drivers"] });
    },
  });

  const rechargeWalletMutation = useMutation({
    mutationFn: async ({ phoneNumber, amount }: { phoneNumber: string; amount: number }) => {
      const res = await fetch(`${getApiUrl()}/api/admin/driver-wallet/recharge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, amount }),
      });
      if (!res.ok) throw new Error("فشل في شحن الرصيد");
      return res.json();
    },
    onSuccess: () => {
      setRechargeDriver(null);
      setRechargeAmount("");
    },
  });

  const updateOrderStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: OrderStatus }) => {
      await fetch(`${getApiUrl()}/api/admin/orders/${id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
    },
  });

  const deleteBanner = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/banners/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/banners"] });
      queryClient.invalidateQueries({ queryKey: ["/api/banners"] });
    },
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/categories/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/categories"] });
      setHasCategoryChanges(true);
    },
  });

  const deleteProduct = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/products/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    },
  });

  const deleteArea = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/delivery-areas/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/delivery-areas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-areas"] });
    },
  });

  const deletePromoCode = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/promo-codes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promo-codes"] });
    },
  });

  const pickImage = async (setter: (uri: string) => void) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setter(result.assets[0].uri);
    }
  };

  const saveBanner = async () => {
    try {
      let imageUrl = bannerForm.imageUrl;
      
      if (bannerForm.imageUri) {
        imageUrl = await processAndUploadImage(bannerForm.imageUri, "banner");
      }

      const body = {
        title: bannerForm.title,
        type: bannerForm.type,
        isActive: true,
        image: imageUrl,
      };

      const url = editItem ? `/api/admin/banners/${editItem.id}` : "/api/admin/banners";
      const method = editItem ? "PUT" : "POST";

      await fetch(`${getApiUrl()}${url}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      queryClient.invalidateQueries({ queryKey: ["/api/admin/banners"] });
      queryClient.invalidateQueries({ queryKey: ["/api/banners"] });
      resetForm();
    } catch (error) {
      console.error("Error saving banner:", error);
      Alert.alert("خطأ", "فشل في حفظ البانر");
    }
  };

  const saveCategory = async () => {
    try {
      let imageUrl = categoryForm.imageUrl;
      
      if (categoryForm.imageUri) {
        imageUrl = await processAndUploadImage(categoryForm.imageUri, "category");
      }

      const body = {
        name: categoryForm.name,
        image: imageUrl,
      };

      const url = editItem ? `/api/admin/categories/${editItem.id}` : "/api/admin/categories";
      const method = editItem ? "PUT" : "POST";

      await fetch(`${getApiUrl()}${url}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/categories"] });
      setHasCategoryChanges(true);
      resetForm();
    } catch (error) {
      console.error("Error saving category:", error);
      Alert.alert("خطأ", "فشل في حفظ القسم");
    }
  };

  const saveProduct = async () => {
    if (isSavingProduct) return;
    
    const url = editItem ? `/api/admin/products/${editItem.id}` : "/api/admin/products";
    const fullUrl = `${getApiUrl()}${url}`;
    
    setIsSavingProduct(true);
    try {
      let imageUrl: string | null = productForm.imageUrl || null;
      
      if (productForm.imageUri) {
        imageUrl = await processAndUploadImage(productForm.imageUri, "product");
      }

      const body: any = {
        name: productForm.name,
        categoryId: productForm.categoryId,
        price: productForm.price,
        description: productForm.description || "",
        inStock: productForm.inStock,
      };
      
      if (productForm.originalPrice) body.originalPrice = productForm.originalPrice;
      if (productForm.discount) body.discount = productForm.discount;
      if (imageUrl) body.image = imageUrl;
      if (productForm.categoryId === "restaurants" && productForm.restaurant) {
        body.restaurant = productForm.restaurant;
      }

      const method = editItem ? "PUT" : "POST";

      const response = await fetch(fullUrl, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const responseText = await response.text();
      
      if (!response.ok) {
        throw new Error(`${response.status}: ${responseText}`);
      }

      Alert.alert("تم", "تم حفظ المنتج بنجاح");
      
      queryClient.invalidateQueries({ queryKey: ["/api/admin/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      resetForm();
    } catch (error: any) {
      console.error("Error saving product:", error);
      Alert.alert("خطأ", `فشل في حفظ المنتج: ${error?.message || "خطأ غير معروف"}`);
    } finally {
      setIsSavingProduct(false);
    }
  };

  const saveArea = async () => {
    try {
      const url = editItem ? `/api/admin/delivery-areas/${editItem.id}` : "/api/admin/delivery-areas";
      const method = editItem ? "PUT" : "POST";

      await fetch(`${getApiUrl()}${url}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: areaForm.name,
          fee: areaForm.fee,
        }),
      });

      queryClient.invalidateQueries({ queryKey: ["/api/admin/delivery-areas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-areas"] });
      resetForm();
    } catch (error) {
      console.error("Error saving area:", error);
    }
  };

  const savePromoCode = async () => {
    try {
      const url = editItem ? `/api/admin/promo-codes/${editItem.id}` : "/api/admin/promo-codes";
      const method = editItem ? "PUT" : "POST";

      const response = await fetch(`${getApiUrl()}${url}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: promoForm.code,
          type: promoForm.type,
          value: promoForm.value,
          expiryDate: promoForm.expiryDate,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "فشل في حفظ كود الخصم");
      }

      queryClient.invalidateQueries({ queryKey: ["/api/admin/promo-codes"] });
      resetForm();
    } catch (error: any) {
      console.error("Error saving promo code:", error?.message || error);
    }
  };

  const resetForm = () => {
    setIsEditing(false);
    setEditItem(null);
    setBannerForm({ title: "", type: "slider", imageUri: "", imageUrl: "" });
    setCategoryForm({ name: "", imageUri: "", imageUrl: "" });
    setProductForm({ name: "", categoryId: "", price: "", originalPrice: "", discount: "", description: "", inStock: true, imageUri: "", imageUrl: "", restaurant: "" });
    setAreaForm({ name: "", fee: "" });
    setPromoForm({ code: "", type: "fixed", value: "", expiryDate: "" });
  };

  const saveCategoryChanges = async () => {
    if (isSavingCategories) return;
    setIsSavingCategories(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/categories"] });
      await queryClient.refetchQueries({ queryKey: ["/api/categories"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setHasCategoryChanges(false);
    } catch (_e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSavingCategories(false);
    }
  };

  const handleEditBanner = (banner: Banner) => {
    setEditItem(banner);
    setBannerForm({
      title: banner.title || "",
      type: banner.type,
      imageUri: "",
      imageUrl: banner.image,
    });
    setIsEditing(true);
  };

  const handleEditCategory = (category: Category) => {
    setEditItem(category);
    setCategoryForm({
      name: category.name,
      imageUri: "",
      imageUrl: category.image,
    });
    setIsEditing(true);
  };

  const handleEditProduct = (product: Product) => {
    setEditItem(product);
    setProductForm({
      name: product.name,
      categoryId: product.categoryId,
      price: product.price.toString(),
      originalPrice: product.originalPrice?.toString() || "",
      discount: product.discount?.toString() || "",
      description: product.description,
      inStock: product.inStock,
      imageUri: "",
      imageUrl: product.image,
      restaurant: (product as any).restaurant || "",
    });
    setIsEditing(true);
  };

  const handleEditArea = (area: DeliveryArea) => {
    setEditItem(area);
    setAreaForm({
      name: area.name,
      fee: area.fee.toString(),
    });
    setIsEditing(true);
  };

  const handleEditPromo = (promo: PromoCode) => {
    setEditItem(promo);
    setPromoForm({
      code: promo.code,
      type: promo.type,
      value: promo.value.toString(),
      expiryDate: promo.expiryDate,
    });
    setIsEditing(true);
  };

  const confirmDelete = (id: string, type: "banner" | "category" | "product" | "area" | "promoCode") => {
    if (Platform.OS === "web") {
      if (window.confirm("هل أنت متأكد من الحذف؟")) {
        if (type === "banner") deleteBanner.mutate(id);
        else if (type === "category") deleteCategory.mutate(id);
        else if (type === "product") deleteProduct.mutate(id);
        else if (type === "area") deleteArea.mutate(id);
        else if (type === "promoCode") deletePromoCode.mutate(id);
      }
    } else {
      Alert.alert("تأكيد الحذف", "هل أنت متأكد من الحذف؟", [
        { text: "إلغاء", style: "cancel" },
        {
          text: "حذف",
          style: "destructive",
          onPress: () => {
            if (type === "banner") deleteBanner.mutate(id);
            else if (type === "category") deleteCategory.mutate(id);
            else if (type === "product") deleteProduct.mutate(id);
            else if (type === "area") deleteArea.mutate(id);
            else if (type === "promoCode") deletePromoCode.mutate(id);
          },
        },
      ]);
    }
  };


  const renderBannersTab = () => (
    <View>
      <View style={styles.formCard}>
        <ThemedText type="h4" style={styles.formTitle}>
          {editItem ? "تعديل البانر" : "إضافة بانر جديد"}
        </ThemedText>

        <TextInput
          style={[styles.input, { backgroundColor: theme.backgroundSecondary, color: theme.text }]}
          placeholder="عنوان البانر (اختياري)"
          placeholderTextColor={theme.textSecondary}
          value={bannerForm.title}
          onChangeText={(text) => setBannerForm({ ...bannerForm, title: text })}
        />

        <View style={styles.typeSelector}>
          <Pressable
            style={[styles.typeButton, bannerForm.type === "slider" && styles.typeButtonActive]}
            onPress={() => setBannerForm({ ...bannerForm, type: "slider" })}
          >
            <ThemedText type="body" style={[styles.typeButtonText, bannerForm.type === "slider" && styles.typeButtonTextActive]}>
              سلايدر
            </ThemedText>
          </Pressable>
          <Pressable
            style={[styles.typeButton, bannerForm.type === "offer" && styles.typeButtonActive]}
            onPress={() => setBannerForm({ ...bannerForm, type: "offer" })}
          >
            <ThemedText type="body" style={[styles.typeButtonText, bannerForm.type === "offer" && styles.typeButtonTextActive]}>
              عرض رئيسي
            </ThemedText>
          </Pressable>
        </View>

        <Pressable
          style={[styles.imagePicker, { borderColor: theme.border }]}
          onPress={() => pickImage((uri) => setBannerForm({ ...bannerForm, imageUri: uri, imageUrl: "" }))}
        >
          {bannerForm.imageUri || bannerForm.imageUrl ? (
            <Image source={{ uri: bannerForm.imageUri || resolveImageUrl(bannerForm.imageUrl) }} style={styles.previewImage} contentFit="cover" />
          ) : (
            <View style={styles.imagePickerPlaceholder}>
              <Feather name="image" size={32} color={theme.textSecondary} />
              <ThemedText type="small" style={{ color: theme.textSecondary }}>اختر صورة</ThemedText>
            </View>
          )}
        </Pressable>

        <View style={styles.formButtons}>
          {isEditing ? (
            <Pressable style={styles.cancelButton} onPress={resetForm}>
              <ThemedText type="body" style={styles.cancelButtonText}>إلغاء</ThemedText>
            </Pressable>
          ) : null}
          <Pressable style={styles.saveButton} onPress={saveBanner}>
            <ThemedText type="body" style={styles.saveButtonText}>{editItem ? "حفظ التعديلات" : "إضافة"}</ThemedText>
          </Pressable>
        </View>
      </View>

      <ThemedText type="h4" style={styles.listTitle}>البانرات الحالية</ThemedText>

      {bannersLoading ? (
        <ActivityIndicator color={AppColors.primary} />
      ) : (
        banners.map((banner) => (
          <View key={banner.id} style={[styles.listItem, { backgroundColor: theme.backgroundSecondary }]}>
            <Image source={{ uri: resolveImageUrl(banner.image) }} style={styles.listItemImage} contentFit="cover" />
            <View style={styles.listItemContent}>
              <ThemedText type="body" numberOfLines={1}>{banner.title || "بدون عنوان"}</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>{banner.type === "offer" ? "عرض رئيسي" : "سلايدر"}</ThemedText>
            </View>
            <View style={styles.listItemActions}>
              <Pressable onPress={() => handleEditBanner(banner)} style={styles.actionButton}>
                <Feather name="edit-2" size={18} color={AppColors.primary} />
              </Pressable>
              <Pressable onPress={() => confirmDelete(banner.id, "banner")} style={styles.actionButton}>
                <Feather name="trash-2" size={18} color="#EF4444" />
              </Pressable>
            </View>
          </View>
        ))
      )}
    </View>
  );

  const renderCategoriesTab = () => (
    <View>
      <View style={styles.formCard}>
        <ThemedText type="h4" style={styles.formTitle}>{editItem ? "تعديل القسم" : "إضافة قسم جديد"}</ThemedText>

        <TextInput
          style={[styles.input, { backgroundColor: theme.backgroundSecondary, color: theme.text }]}
          placeholder="اسم القسم"
          placeholderTextColor={theme.textSecondary}
          value={categoryForm.name}
          onChangeText={(text) => setCategoryForm({ ...categoryForm, name: text })}
        />

        <Pressable
          style={[styles.imagePicker, { borderColor: theme.border }]}
          onPress={() => pickImage((uri) => setCategoryForm({ ...categoryForm, imageUri: uri, imageUrl: "" }))}
        >
          {categoryForm.imageUri || categoryForm.imageUrl ? (
            <Image source={{ uri: categoryForm.imageUri || resolveImageUrl(categoryForm.imageUrl) }} style={styles.previewImage} contentFit="cover" />
          ) : (
            <View style={styles.imagePickerPlaceholder}>
              <Feather name="image" size={32} color={theme.textSecondary} />
              <ThemedText type="small" style={{ color: theme.textSecondary }}>اختر صورة</ThemedText>
            </View>
          )}
        </Pressable>

        <View style={styles.formButtons}>
          {isEditing ? (
            <Pressable style={styles.cancelButton} onPress={resetForm}>
              <ThemedText type="body" style={styles.cancelButtonText}>إلغاء</ThemedText>
            </Pressable>
          ) : null}
          <Pressable style={styles.saveButton} onPress={saveCategory}>
            <ThemedText type="body" style={styles.saveButtonText}>{editItem ? "حفظ التعديلات" : "إضافة"}</ThemedText>
          </Pressable>
        </View>
      </View>

      <ThemedText type="h4" style={styles.listTitle}>الأقسام الحالية</ThemedText>

      {categoriesLoading ? (
        <ActivityIndicator color={AppColors.primary} />
      ) : (
        categories.map((category) => (
          <View key={category.id} style={[styles.listItem, { backgroundColor: theme.backgroundSecondary }]}>
            <Image source={{ uri: resolveImageUrl(category.image) }} style={styles.listItemImage} contentFit="cover" />
            <View style={styles.listItemContent}>
              <ThemedText type="body" numberOfLines={1}>{category.name}</ThemedText>
            </View>
            <View style={styles.listItemActions}>
              <Pressable onPress={() => handleEditCategory(category)} style={styles.actionButton}>
                <Feather name="edit-2" size={18} color={AppColors.primary} />
              </Pressable>
              <Pressable onPress={() => confirmDelete(category.id, "category")} style={styles.actionButton}>
                <Feather name="trash-2" size={18} color="#EF4444" />
              </Pressable>
            </View>
          </View>
        ))
      )}

      {hasCategoryChanges ? (
        <Pressable
          testID="button-save-category-changes"
          onPress={saveCategoryChanges}
          style={[styles.saveCategoryChangesBtn, isSavingCategories && { opacity: 0.7 }]}
        >
          {isSavingCategories ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Feather name="check-circle" size={20} color="#fff" />
          )}
          <ThemedText type="body" style={styles.saveCategoryChangesBtnText}>
            {isSavingCategories ? "جارٍ الحفظ..." : "حفظ التغيير"}
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );

  const renderProductsTab = () => (
    <View>
      <View style={styles.formCard}>
        <ThemedText type="h4" style={styles.formTitle}>{editItem ? "تعديل المنتج" : "إضافة منتج جديد"}</ThemedText>

        <TextInput
          style={[styles.input, { backgroundColor: theme.backgroundSecondary, color: theme.text }]}
          placeholder="اسم المنتج"
          placeholderTextColor={theme.textSecondary}
          value={productForm.name}
          onChangeText={(text) => setProductForm({ ...productForm, name: text })}
        />

        <View style={styles.categorySelector}>
          <ThemedText type="small" style={[styles.fieldLabel, { color: theme.textSecondary }]}>القسم:</ThemedText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
            {categories.map((cat) => (
              <Pressable
                key={cat.id}
                style={[styles.categoryChip, productForm.categoryId === cat.id && styles.categoryChipActive]}
                onPress={() => setProductForm({ ...productForm, categoryId: cat.id })}
              >
                <ThemedText type="small" style={[styles.categoryChipText, productForm.categoryId === cat.id && styles.categoryChipTextActive]}>
                  {cat.name}
                </ThemedText>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {productForm.categoryId === "restaurants" ? (
          <TextInput
            style={[styles.input, { backgroundColor: theme.backgroundSecondary, color: theme.text }]}
            placeholder="اسم المطعم (مثال: يلا ايت)"
            placeholderTextColor={theme.textSecondary}
            value={productForm.restaurant}
            onChangeText={(text) => setProductForm({ ...productForm, restaurant: text })}
          />
        ) : null}

        <View style={styles.priceRow}>
          <TextInput
            style={[styles.input, styles.priceInput, { backgroundColor: theme.backgroundSecondary, color: theme.text }]}
            placeholder="السعر (د.ع)"
            placeholderTextColor={theme.textSecondary}
            value={productForm.price}
            onChangeText={(text) => setProductForm({ ...productForm, price: text })}
            keyboardType="numeric"
          />
          <TextInput
            style={[styles.input, styles.priceInput, { backgroundColor: theme.backgroundSecondary, color: theme.text }]}
            placeholder="السعر الأصلي (اختياري)"
            placeholderTextColor={theme.textSecondary}
            value={productForm.originalPrice}
            onChangeText={(text) => setProductForm({ ...productForm, originalPrice: text })}
            keyboardType="numeric"
          />
        </View>

        <View style={styles.priceRow}>
          <TextInput
            style={[styles.input, styles.priceInput, { backgroundColor: theme.backgroundSecondary, color: theme.text }]}
            placeholder="نسبة الخصم % (اختياري)"
            placeholderTextColor={theme.textSecondary}
            value={productForm.discount}
            onChangeText={(text) => setProductForm({ ...productForm, discount: text })}
            keyboardType="numeric"
          />
          <View style={[styles.switchContainer, { backgroundColor: theme.backgroundSecondary }]}>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>متوفر</ThemedText>
            <Switch
              value={productForm.inStock}
              onValueChange={(value) => setProductForm({ ...productForm, inStock: value })}
              trackColor={{ false: "#ccc", true: AppColors.primary }}
              thumbColor="#fff"
            />
          </View>
        </View>

        <TextInput
          style={[styles.input, styles.descInput, { backgroundColor: theme.backgroundSecondary, color: theme.text }]}
          placeholder="وصف المنتج"
          placeholderTextColor={theme.textSecondary}
          value={productForm.description}
          onChangeText={(text) => setProductForm({ ...productForm, description: text })}
          multiline
          numberOfLines={3}
        />

        <Pressable
          style={[styles.imagePicker, { borderColor: theme.border }]}
          onPress={() => pickImage((uri) => setProductForm({ ...productForm, imageUri: uri, imageUrl: "" }))}
        >
          {productForm.imageUri || productForm.imageUrl ? (
            <Image source={{ uri: productForm.imageUri || resolveImageUrl(productForm.imageUrl) }} style={styles.previewImage} contentFit="cover" />
          ) : (
            <View style={styles.imagePickerPlaceholder}>
              <Feather name="image" size={32} color={theme.textSecondary} />
              <ThemedText type="small" style={{ color: theme.textSecondary }}>اختر صورة المنتج</ThemedText>
            </View>
          )}
        </Pressable>

        <View style={styles.formButtons}>
          {isEditing ? (
            <Pressable style={styles.cancelButton} onPress={resetForm}>
              <ThemedText type="body" style={styles.cancelButtonText}>إلغاء</ThemedText>
            </Pressable>
          ) : null}
          <Pressable style={[styles.saveButton, isSavingProduct && { opacity: 0.7 }]} onPress={saveProduct} disabled={isSavingProduct}>
            {isSavingProduct ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <ThemedText type="body" style={styles.saveButtonText}>{editItem ? "حفظ التعديلات" : "إضافة"}</ThemedText>
            )}
          </Pressable>
        </View>
      </View>

      <ThemedText type="h4" style={styles.listTitle}>المنتجات الحالية ({products.length})</ThemedText>

      {productsLoading ? (
        <ActivityIndicator color={AppColors.primary} />
      ) : (
        products.map((product) => (
          <View key={product.id} style={[styles.listItem, { backgroundColor: theme.backgroundSecondary }]}>
            <Image source={{ uri: resolveImageUrl(product.image) }} style={styles.listItemImage} contentFit="cover" />
            <View style={styles.listItemContent}>
              <ThemedText type="body" numberOfLines={1}>{product.name}</ThemedText>
              <View style={styles.productPriceRow}>
                <ThemedText type="small" style={{ color: AppColors.primary, fontWeight: "600" }}>
                  {formatPrice(product.price)}
                </ThemedText>
                {(product as any).restaurant ? (
                  <View style={[styles.discountBadge, { backgroundColor: "#E8652020" }]}>
                    <ThemedText type="small" style={{ color: AppColors.primary, fontWeight: "600", fontSize: 10 }}>{(product as any).restaurant}</ThemedText>
                  </View>
                ) : null}
                {product.discount ? (
                  <View style={styles.discountBadge}>
                    <ThemedText type="small" style={styles.discountText}>-{product.discount}%</ThemedText>
                  </View>
                ) : null}
              </View>
            </View>
            <View style={styles.listItemActions}>
              <Pressable onPress={() => handleEditProduct(product)} style={styles.actionButton}>
                <Feather name="edit-2" size={18} color={AppColors.primary} />
              </Pressable>
              <Pressable onPress={() => confirmDelete(product.id, "product")} style={styles.actionButton}>
                <Feather name="trash-2" size={18} color="#EF4444" />
              </Pressable>
            </View>
          </View>
        ))
      )}
    </View>
  );

  const renderAreasTab = () => (
    <View>
      <View style={styles.formCard}>
        <ThemedText type="h4" style={styles.formTitle}>{editItem ? "تعديل المنطقة" : "إضافة منطقة جديدة"}</ThemedText>

        <TextInput
          style={[styles.input, { backgroundColor: theme.backgroundSecondary, color: theme.text }]}
          placeholder="اسم المنطقة"
          placeholderTextColor={theme.textSecondary}
          value={areaForm.name}
          onChangeText={(text) => setAreaForm({ ...areaForm, name: text })}
        />

        <TextInput
          style={[styles.input, { backgroundColor: theme.backgroundSecondary, color: theme.text }]}
          placeholder="أجور التوصيل (د.ع)"
          placeholderTextColor={theme.textSecondary}
          value={areaForm.fee}
          onChangeText={(text) => setAreaForm({ ...areaForm, fee: text })}
          keyboardType="numeric"
        />

        <View style={styles.formButtons}>
          {isEditing ? (
            <Pressable style={styles.cancelButton} onPress={resetForm}>
              <ThemedText type="body" style={styles.cancelButtonText}>إلغاء</ThemedText>
            </Pressable>
          ) : null}
          <Pressable style={styles.saveButton} onPress={saveArea}>
            <ThemedText type="body" style={styles.saveButtonText}>{editItem ? "حفظ التعديلات" : "إضافة"}</ThemedText>
          </Pressable>
        </View>
      </View>

      <ThemedText type="h4" style={styles.listTitle}>مناطق التوصيل الحالية</ThemedText>

      {areasLoading ? (
        <ActivityIndicator color={AppColors.primary} />
      ) : (
        deliveryAreas.map((area) => (
          <View key={area.id} style={[styles.listItem, { backgroundColor: theme.backgroundSecondary }]}>
            <View style={styles.areaIcon}>
              <Feather name="map-pin" size={24} color={AppColors.primary} />
            </View>
            <View style={styles.listItemContent}>
              <ThemedText type="body" numberOfLines={1}>{area.name}</ThemedText>
              <ThemedText type="small" style={{ color: AppColors.primary, fontWeight: "600" }}>
                {formatPrice(area.fee)}
              </ThemedText>
            </View>
            <View style={styles.listItemActions}>
              <Pressable onPress={() => handleEditArea(area)} style={styles.actionButton}>
                <Feather name="edit-2" size={18} color={AppColors.primary} />
              </Pressable>
              <Pressable onPress={() => confirmDelete(area.id, "area")} style={styles.actionButton}>
                <Feather name="trash-2" size={18} color="#EF4444" />
              </Pressable>
            </View>
          </View>
        ))
      )}
    </View>
  );

  const getStatusLabel = (status: OrderStatus) => {
    const labels: Record<OrderStatus, string> = {
      pending: "قيد الانتظار",
      confirmed: "تم التأكيد",
      preparing: "جاري التحضير",
      ready: "جاهز للاستلام",
      picked_up: "استُلم من المتجر",
      in_delivery: "في الطريق",
      delivering: "جاري التوصيل",
      delivered: "تم التوصيل",
      cancelled: "ملغي",
      issue: "مشكلة",
    };
    return labels[status] ?? status;
  };

  const getStatusColor = (status: OrderStatus) => {
    const colors: Record<OrderStatus, string> = {
      pending: "#F59E0B",
      confirmed: "#3B82F6",
      preparing: "#8B5CF6",
      ready: "#8B5CF6",
      picked_up: "#06B6D4",
      in_delivery: "#06B6D4",
      delivering: "#06B6D4",
      delivered: "#10B981",
      cancelled: "#EF4444",
      issue: "#F59E0B",
    };
    return colors[status] ?? "#9CA3AF";
  };

  // Approved drivers for assignment picker
  const approvedDrivers = drivers.filter(d => d.status === "approved");

  const getAdminTrackingMapHTML = (driverLat: number, driverLng: number, driverName: string) => `
<!DOCTYPE html><html dir="rtl" lang="ar"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;background:#f0f0f0}
#map{width:100%;height:100%}
.leaflet-control-attribution{display:none!important}
.driver-pulse{width:48px;height:48px;position:relative;display:flex;align-items:center;justify-content:center}
.driver-pulse::before{content:'';position:absolute;width:48px;height:48px;border-radius:50%;background:rgba(232,101,32,0.25);animation:pulse 1.8s ease-out infinite}
.driver-inner{width:32px;height:32px;background:#E86520;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 10px rgba(232,101,32,0.6);display:flex;align-items:center;justify-content:center;position:relative;z-index:1}
@keyframes pulse{0%{transform:scale(0.5);opacity:1}100%{transform:scale(2.2);opacity:0}}
.info-pill{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);background:rgba(255,255,255,0.96);border-radius:24px;padding:8px 18px;font-family:sans-serif;font-size:13px;color:#333;box-shadow:0 2px 12px rgba(0,0,0,0.15);white-space:nowrap;z-index:1000;pointer-events:none}
.dot{width:8px;height:8px;background:#E86520;border-radius:50%;display:inline-block;margin-left:6px;animation:blink 1.2s ease-in-out infinite}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0.2}}
</style></head><body>
<div id="map"></div>
<div class="info-pill"><span class="dot"></span> ${driverName || "المندوب"} - موقع مباشر</div>
<script>
var map=L.map('map',{zoomControl:true,attributionControl:false}).setView([${driverLat},${driverLng}],15);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
var icon=L.divIcon({className:'',html:'<div class="driver-pulse"><div class="driver-inner"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg></div></div>',iconSize:[48,48],iconAnchor:[24,24]});
var marker=L.marker([${driverLat},${driverLng}],{icon}).addTo(map);
function updateDriverLocation(lat,lng){var ll=L.latLng(lat,lng);marker.setLatLng(ll);map.panTo(ll,{animate:true,duration:0.8});}
document.addEventListener('message',function(e){try{var d=JSON.parse(e.data);if(d.type==='updateDriver')updateDriverLocation(d.lat,d.lng);}catch(err){}});
window.addEventListener('message',function(e){try{var d=JSON.parse(e.data);if(d.type==='updateDriver')updateDriverLocation(d.lat,d.lng);}catch(err){}});
</script></body></html>`;

  const openTrackingModal = useCallback(async (orderId: string) => {
    setTrackingOrderId(orderId);
    setTrackingMapHtml(null);
    setTrackingDriverName("");
    try {
      const res = await fetch(new URL(`/api/orders/${orderId}/driver-location`, getApiUrl()).toString());
      const data = await res.json();
      if (data.available) {
        setTrackingDriverName(data.fullName || "المندوب");
        setTrackingMapHtml(getAdminTrackingMapHTML(data.lat, data.lng, data.fullName || "المندوب"));
        if (trackingIntervalRef.current) clearInterval(trackingIntervalRef.current);
        trackingIntervalRef.current = setInterval(async () => {
          try {
            const r2 = await fetch(new URL(`/api/orders/${orderId}/driver-location`, getApiUrl()).toString());
            const d2 = await r2.json();
            if (d2.available && trackingWebViewRef.current) {
              trackingWebViewRef.current.injectJavaScript(`updateDriverLocation(${d2.lat},${d2.lng});true;`);
            }
          } catch {}
        }, 8000);
      }
    } catch {}
  }, []);

  const closeTrackingModal = useCallback(() => {
    setTrackingOrderId(null);
    setTrackingMapHtml(null);
    if (trackingIntervalRef.current) { clearInterval(trackingIntervalRef.current); trackingIntervalRef.current = null; }
  }, []);

  const renderTrackingModal = () => {
    if (!trackingOrderId) return null;
    return (
      <Modal visible animationType="slide" onRequestClose={closeTrackingModal}>
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", backgroundColor: "#1a1a1a", paddingHorizontal: Spacing.lg, paddingTop: 50, paddingBottom: Spacing.md }}>
            <Pressable onPress={closeTrackingModal} style={{ padding: 8 }}>
              <Feather name="x" size={24} color="#fff" />
            </Pressable>
            <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: Spacing.sm }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#4CAF50" }} />
              <ThemedText type="h4" style={{ color: "#fff" }}>تتبع المندوب {trackingDriverName ? `— ${trackingDriverName}` : ""}</ThemedText>
            </View>
          </View>
          {Platform.OS === "web" ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Feather name="smartphone" size={48} color={AppColors.primary} />
              <ThemedText type="body" style={{ color: "#fff", marginTop: Spacing.md, textAlign: "center", paddingHorizontal: Spacing.xl }}>
                التتبع المباشر متاح في تطبيق الجوال فقط
              </ThemedText>
            </View>
          ) : trackingMapHtml ? (
            <WebView
              ref={trackingWebViewRef}
              source={{ html: trackingMapHtml }}
              style={{ flex: 1 }}
              javaScriptEnabled
              originWhitelist={["*"]}
              scrollEnabled={false}
            />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator size="large" color={AppColors.primary} />
              <ThemedText type="body" style={{ color: "#fff", marginTop: Spacing.md }}>
                جاري تحديد موقع المندوب...
              </ThemedText>
            </View>
          )}
        </View>
      </Modal>
    );
  };

  const renderAssignDriverModal = () => {
    if (!assigningOrderId) return null;
    return (
      <View style={styles.modalOverlay}>
        <View style={[styles.modalBox, { backgroundColor: theme.background }]}>
          <ThemedText type="h4" style={{ textAlign: "center", marginBottom: Spacing.md }}>اختر السائق</ThemedText>
          {assignError ? (
            <ThemedText type="small" style={{ color: "#EF4444", textAlign: "center", marginBottom: Spacing.sm }}>
              {assignError}
            </ThemedText>
          ) : null}
          {approvedDrivers.length === 0 ? (
            <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center", marginBottom: Spacing.lg }}>
              لا يوجد سائقون مفعّلون
            </ThemedText>
          ) : (
            approvedDrivers.map(drv => {
              const name = [drv.firstName, drv.secondName].filter(Boolean).join(" ") || drv.fullName || drv.phoneNumber;
              return (
                <Pressable
                  key={drv.id}
                  style={[styles.driverPickerRow, { backgroundColor: theme.backgroundSecondary }]}
                  onPress={() => {
                    setAssignError(null);
                    assignDriverMutation.mutate({ orderId: assigningOrderId, driverPhone: drv.phoneNumber });
                  }}
                  disabled={assignDriverMutation.isPending}
                >
                  <Feather name="user" size={18} color={AppColors.primary} />
                  <View style={{ flex: 1, marginRight: Spacing.sm }}>
                    <ThemedText type="body" style={{ fontWeight: "700" }}>{name}</ThemedText>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>{drv.phoneNumber}</ThemedText>
                  </View>
                  {assignDriverMutation.isPending ? (
                    <ActivityIndicator size="small" color={AppColors.primary} />
                  ) : (
                    <Feather name="chevron-left" size={18} color={theme.textSecondary} />
                  )}
                </Pressable>
              );
            })
          )}
          <Pressable
            style={[styles.statusBtn, { backgroundColor: "#6B7280", marginTop: Spacing.md, alignSelf: "center", paddingHorizontal: Spacing.xl }]}
            onPress={() => { setAssigningOrderId(null); setAssignError(null); }}
          >
            <ThemedText type="small" style={{ color: "#fff" }}>إلغاء</ThemedText>
          </Pressable>
        </View>
      </View>
    );
  };

  const renderOrdersTab = () => {
    const pending = adminOrders.filter(o => o.status === "pending").length;
    const active = adminOrders.filter(o => ["confirmed","preparing","ready","picked_up","in_delivery"].includes(o.status)).length;
    const delivered = adminOrders.filter(o => o.status === "delivered").length;
    const cancelled = adminOrders.filter(o => o.status === "cancelled" || o.status === "issue").length;
    const totalRevenue = adminOrders.filter(o => o.status === "delivered").reduce((s, o) => s + o.total + o.deliveryFee, 0);
    const successRate = adminOrders.length > 0 ? Math.round((delivered / adminOrders.length) * 100) : 0;

    const filteredOrders = adminOrders.filter(order => {
      const matchSearch = ordersSearch.trim() === "" ||
        order.id.toLowerCase().includes(ordersSearch.toLowerCase()) ||
        order.phoneNumber.includes(ordersSearch) ||
        order.region.includes(ordersSearch) ||
        order.address.toLowerCase().includes(ordersSearch.toLowerCase());
      const matchStatus = ordersStatusFilter === "all" || order.status === ordersStatusFilter;
      return matchSearch && matchStatus;
    });

    return (
    <View>
      {/* إحصائيات الطلبات */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm, marginBottom: Spacing.md }}>
        {[
          { label: "قيد الانتظار", value: pending, color: "#F59E0B", icon: "clock" as const },
          { label: "نشط", value: active, color: "#06B6D4", icon: "truck" as const },
          { label: "مكتمل", value: delivered, color: "#4CAF50", icon: "check-circle" as const },
          { label: "ملغى", value: cancelled, color: "#EF4444", icon: "x-circle" as const },
        ].map(stat => (
          <View key={stat.label} style={{ flex: 1, minWidth: 80, backgroundColor: stat.color + "15", borderRadius: BorderRadius.lg, padding: Spacing.sm, alignItems: "center" }}>
            <Feather name={stat.icon} size={18} color={stat.color} />
            <ThemedText type="h4" style={{ color: stat.color, fontWeight: "700", marginTop: 4 }}>{stat.value}</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "center" }}>{stat.label}</ThemedText>
          </View>
        ))}
      </View>

      {/* إجمالي الإيرادات ومعدل النجاح */}
      <View style={{ flexDirection: "row", gap: Spacing.sm, marginBottom: Spacing.md }}>
        <View style={{ flex: 1, backgroundColor: "#4CAF5015", borderRadius: BorderRadius.lg, padding: Spacing.md, alignItems: "center" }}>
          <Feather name="dollar-sign" size={20} color="#4CAF50" />
          <ThemedText type="body" style={{ color: "#4CAF50", fontWeight: "700", marginTop: 4 }}>{formatPrice(totalRevenue)}</ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>إجمالي الإيرادات</ThemedText>
        </View>
        <View style={{ flex: 1, backgroundColor: "#6366F115", borderRadius: BorderRadius.lg, padding: Spacing.md, alignItems: "center" }}>
          <Feather name="trending-up" size={20} color="#6366F1" />
          <ThemedText type="body" style={{ color: "#6366F1", fontWeight: "700", marginTop: 4 }}>{successRate}%</ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>معدل الإتمام</ThemedText>
        </View>
        {ownerEarnings ? (
          <View style={{ flex: 1, backgroundColor: AppColors.primary + "15", borderRadius: BorderRadius.lg, padding: Spacing.md, alignItems: "center" }}>
            <Feather name="award" size={20} color={AppColors.primary} />
            <ThemedText type="body" style={{ color: AppColors.primary, fontWeight: "700", marginTop: 4 }}>{formatPrice(ownerEarnings.totalOwnerEarnings)}</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>عمولاتك</ThemedText>
          </View>
        ) : null}
      </View>

      {/* حقل البحث */}
      <View style={{ flexDirection: "row-reverse", alignItems: "center", backgroundColor: theme.backgroundSecondary, borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: theme.backgroundSecondary }}>
        <Feather name="search" size={16} color={theme.textSecondary} />
        <TextInput
          style={{ flex: 1, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.sm, color: theme.text, textAlign: "right" }}
          placeholder="بحث بالرقم أو المنطقة أو الهاتف..."
          placeholderTextColor={theme.textSecondary}
          value={ordersSearch}
          onChangeText={setOrdersSearch}
        />
        {ordersSearch.length > 0 ? (
          <Pressable onPress={() => setOrdersSearch("")}>
            <Feather name="x" size={16} color={theme.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      {/* فلتر الحالة */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.md }}>
        <View style={{ flexDirection: "row-reverse", gap: Spacing.xs, paddingHorizontal: 2 }}>
          {([
            { key: "all", label: "الكل" },
            { key: "pending", label: "انتظار" },
            { key: "confirmed", label: "مؤكد" },
            { key: "preparing", label: "يحضر" },
            { key: "ready", label: "جاهز" },
            { key: "in_delivery", label: "في الطريق" },
            { key: "delivered", label: "مكتمل" },
            { key: "cancelled", label: "ملغى" },
          ] as { key: OrderStatus | "all"; label: string }[]).map(f => (
            <Pressable
              key={f.key}
              onPress={() => setOrdersStatusFilter(f.key)}
              style={{
                paddingHorizontal: Spacing.md,
                paddingVertical: 6,
                borderRadius: BorderRadius.full,
                backgroundColor: ordersStatusFilter === f.key ? AppColors.primary : theme.backgroundSecondary,
              }}
            >
              <ThemedText type="small" style={{ color: ordersStatusFilter === f.key ? "#fff" : theme.textSecondary, fontWeight: "600" }}>
                {f.label}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <ThemedText type="h4" style={[styles.listTitle, { marginTop: 0 }]}>
        الطلبات ({filteredOrders.length})
      </ThemedText>

      {ordersLoading ? (
        <ActivityIndicator color={AppColors.primary} />
      ) : filteredOrders.length === 0 ? (
        <ThemedText type="body" style={{ textAlign: "center", color: theme.textSecondary, paddingVertical: Spacing.xl }}>
          لا توجد طلبات مطابقة
        </ThemedText>
      ) : (
        filteredOrders.map((order) => (
          <View key={order.id} style={[styles.orderCard, { backgroundColor: theme.backgroundSecondary }]}>
            <View style={styles.orderHeader}>
              <ThemedText type="body" style={{ fontWeight: "700" }}>#{order.id.slice(-6)}</ThemedText>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(order.status) + "20" }]}>
                <ThemedText type="small" style={{ color: getStatusColor(order.status), fontWeight: "600" }}>
                  {getStatusLabel(order.status)}
                </ThemedText>
              </View>
            </View>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              📞 {order.phoneNumber}
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              📍 {order.region} - {order.address}
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              🛒 {order.items.length} منتجات
            </ThemedText>
            {(order.status === "in_delivery" || order.status === "picked_up") ? (
              <Pressable
                style={[styles.trackBtn]}
                onPress={() => openTrackingModal(order.id)}
              >
                <Feather name="map-pin" size={14} color="#fff" />
                <ThemedText type="small" style={{ color: "#fff", fontWeight: "700" }}>تتبع المندوب مباشر</ThemedText>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#4CAF50" }} />
              </Pressable>
            ) : null}
            <View style={styles.orderFooter}>
              <ThemedText type="body" style={{ color: AppColors.primary, fontWeight: "700" }}>
                {formatPrice(order.total + order.deliveryFee)}
              </ThemedText>
              <View style={styles.statusButtons}>
                {order.status !== "delivered" && order.status !== "cancelled" ? (
                  <>
                    {order.status === "pending" ? (
                      <Pressable
                        style={[styles.statusBtn, { backgroundColor: "#3B82F6" }]}
                        onPress={() => updateOrderStatus.mutate({ id: order.id, status: "confirmed" })}
                      >
                        <ThemedText type="small" style={{ color: "#fff" }}>تأكيد</ThemedText>
                      </Pressable>
                    ) : null}
                    {order.status === "confirmed" ? (
                      <Pressable
                        style={[styles.statusBtn, { backgroundColor: "#8B5CF6" }]}
                        onPress={() => updateOrderStatus.mutate({ id: order.id, status: "preparing" })}
                      >
                        <ThemedText type="small" style={{ color: "#fff" }}>تحضير</ThemedText>
                      </Pressable>
                    ) : null}
                    {order.status === "preparing" ? (
                      <Pressable
                        style={[styles.statusBtn, { backgroundColor: "#06B6D4" }]}
                        onPress={() => updateOrderStatus.mutate({ id: order.id, status: "delivering" })}
                      >
                        <ThemedText type="small" style={{ color: "#fff" }}>توصيل</ThemedText>
                      </Pressable>
                    ) : null}
                    {order.status === "delivering" ? (
                      <Pressable
                        style={[styles.statusBtn, { backgroundColor: "#10B981" }]}
                        onPress={() => updateOrderStatus.mutate({ id: order.id, status: "delivered" })}
                      >
                        <ThemedText type="small" style={{ color: "#fff" }}>تم</ThemedText>
                      </Pressable>
                    ) : null}
                    <Pressable
                      style={[styles.statusBtn, { backgroundColor: "#EF4444" }]}
                      onPress={() => updateOrderStatus.mutate({ id: order.id, status: "cancelled" })}
                    >
                      <ThemedText type="small" style={{ color: "#fff" }}>إلغاء</ThemedText>
                    </Pressable>
                    <Pressable
                      style={[styles.statusBtn, { backgroundColor: AppColors.primary, flexDirection: "row", alignItems: "center", gap: 4 }]}
                      onPress={() => { setAssigningOrderId(order.id); setAssignError(null); }}
                    >
                      <Feather name="user-plus" size={12} color="#fff" />
                      <ThemedText type="small" style={{ color: "#fff" }}>تعيين سائق</ThemedText>
                    </Pressable>
                  </>
                ) : null}
              </View>
            </View>
          </View>
        ))
      )}
    </View>
    );
  };

  const getDriverStatusColor = (status: string) => {
    switch (status) {
      case "approved": return "#16A34A";
      case "rejected": return "#DC2626";
      default: return "#F59E0B";
    }
  };

  const getDriverStatusText = (status: string) => {
    switch (status) {
      case "approved": return "مقبول";
      case "rejected": return "مرفوض";
      default: return "قيد المراجعة";
    }
  };

  const renderDriversTab = () => {
    const approved = drivers.filter(d => d.status === "approved").length;
    const pending_d = drivers.filter(d => d.status === "pending").length;
    const rejected_d = drivers.filter(d => d.status === "rejected").length;
    const allStats = driverStatsData?.stats || {};
    const totalDeliveries = Object.values(allStats).reduce((s, d) => s + d.totalOrders, 0);
    const totalEarningsPaid = Object.values(allStats).reduce((s, d) => s + d.totalEarnings, 0);

    return (
    <View>
      {/* ملخص السائقين */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm, marginBottom: Spacing.md }}>
        {[
          { label: "مقبول", value: approved, color: "#4CAF50", icon: "user-check" as const },
          { label: "قيد المراجعة", value: pending_d, color: "#F59E0B", icon: "user" as const },
          { label: "مرفوض", value: rejected_d, color: "#EF4444", icon: "user-x" as const },
          { label: "إجمالي التوصيلات", value: totalDeliveries, color: "#6366F1", icon: "package" as const },
        ].map(stat => (
          <View key={stat.label} style={{ flex: 1, minWidth: 80, backgroundColor: stat.color + "15", borderRadius: BorderRadius.lg, padding: Spacing.sm, alignItems: "center" }}>
            <Feather name={stat.icon} size={18} color={stat.color} />
            <ThemedText type="h4" style={{ color: stat.color, fontWeight: "700", marginTop: 4 }}>{stat.value}</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "center" }}>{stat.label}</ThemedText>
          </View>
        ))}
      </View>

      <ThemedText type="h4" style={[styles.listTitle, { marginTop: 0 }]}>
        سائقي التوصيل ({drivers.length})
      </ThemedText>

      {driversLoading ? (
        <ActivityIndicator size="large" color={AppColors.primary} />
      ) : drivers.length === 0 ? (
        <View style={styles.formCard}>
          <ThemedText type="body" style={{ textAlign: "center", color: "#9CA3AF" }}>
            لا يوجد سائقين مسجلين
          </ThemedText>
        </View>
      ) : (
        drivers.map((driver) => {
          const dStats = allStats[driver.phoneNumber];
          return (
          <View key={driver.id} style={styles.formCard}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Spacing.md }}>
              <View style={{
                backgroundColor: getDriverStatusColor(driver.status) + "20",
                paddingHorizontal: Spacing.md,
                paddingVertical: 4,
                borderRadius: BorderRadius.full,
              }}>
                <ThemedText type="caption" style={{ color: getDriverStatusColor(driver.status), fontWeight: "700" }}>
                  {getDriverStatusText(driver.status)}
                </ThemedText>
              </View>
              <ThemedText type="subtitle" style={{ textAlign: "right", flex: 1, marginRight: Spacing.sm }}>
                {driver.fullName}
              </ThemedText>
            </View>

            <View style={{ gap: Spacing.xs, marginBottom: Spacing.md }}>
              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: Spacing.sm }}>
                <ThemedText type="body" style={{ color: "#6B7280" }}>{driver.phoneNumber}</ThemedText>
                <Feather name="phone" size={16} color="#6B7280" />
              </View>
              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: Spacing.sm }}>
                <ThemedText type="body" style={{ color: "#6B7280" }}>
                  {driver.firstName} {driver.secondName} {driver.thirdName} {driver.fourthName}
                </ThemedText>
                <Feather name="user" size={16} color="#6B7280" />
              </View>
              {driver.createdAt ? (
                <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: Spacing.sm }}>
                  <ThemedText type="caption" style={{ color: "#9CA3AF" }}>
                    {new Date(driver.createdAt).toLocaleDateString("ar-IQ")}
                  </ThemedText>
                  <Feather name="calendar" size={14} color="#9CA3AF" />
                </View>
              ) : null}
            </View>

            {driver.nationalIdImage ? (
              <View style={{ marginBottom: Spacing.md }}>
                <ThemedText type="body" style={{ textAlign: "right", marginBottom: Spacing.xs, fontWeight: "600" }}>
                  البطاقة الوطنية:
                </ThemedText>
                <Image
                  source={{ uri: driver.nationalIdImage }}
                  style={{ width: "100%", height: 200, borderRadius: BorderRadius.md }}
                  contentFit="contain"
                />
              </View>
            ) : null}

            {driver.driverLicenseImage ? (
              <View style={{ marginBottom: Spacing.md }}>
                <ThemedText type="body" style={{ textAlign: "right", marginBottom: Spacing.xs, fontWeight: "600" }}>
                  إجازة السوق:
                </ThemedText>
                <Image
                  source={{ uri: driver.driverLicenseImage }}
                  style={{ width: "100%", height: 200, borderRadius: BorderRadius.md }}
                  contentFit="contain"
                />
              </View>
            ) : (
              <View style={{ marginBottom: Spacing.md }}>
                <ThemedText type="body" style={{ textAlign: "right", color: "#9CA3AF" }}>
                  لم يتم رفع إجازة السوق
                </ThemedText>
              </View>
            )}

            {driver.status === "pending" ? (
              <View style={{ flexDirection: "row", gap: Spacing.sm }}>
                <Pressable
                  style={{
                    flex: 1,
                    minHeight: 48,
                    backgroundColor: "#DC2626",
                    borderRadius: BorderRadius.lg,
                    alignItems: "center",
                    justifyContent: "center",
                    paddingVertical: Spacing.md,
                  }}
                  onPress={() => updateDriverStatusMutation.mutate({ id: driver.id, status: "rejected" })}
                >
                  <ThemedText type="body" style={{ color: "#FFFFFF", fontWeight: "600" }}>رفض</ThemedText>
                </Pressable>
                <Pressable
                  style={{
                    flex: 1,
                    minHeight: 48,
                    backgroundColor: "#16A34A",
                    borderRadius: BorderRadius.lg,
                    alignItems: "center",
                    justifyContent: "center",
                    paddingVertical: Spacing.md,
                  }}
                  onPress={() => updateDriverStatusMutation.mutate({ id: driver.id, status: "approved" })}
                >
                  <ThemedText type="body" style={{ color: "#FFFFFF", fontWeight: "600" }}>قبول</ThemedText>
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={{
                  minHeight: 48,
                  backgroundColor: driver.status === "approved" ? "#F59E0B" : "#16A34A",
                  borderRadius: BorderRadius.lg,
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: Spacing.md,
                }}
                onPress={() => updateDriverStatusMutation.mutate({
                  id: driver.id,
                  status: driver.status === "approved" ? "pending" : "approved",
                })}
              >
                <ThemedText type="body" style={{ color: "#FFFFFF", fontWeight: "600" }}>
                  {driver.status === "approved" ? "تعليق" : "قبول"}
                </ThemedText>
              </Pressable>
            )}

            <View style={{ marginTop: Spacing.md, borderTopWidth: 1, borderTopColor: "#E5E7EB", paddingTop: Spacing.md }}>
              <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: Spacing.sm }}>
                <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: Spacing.xs }}>
                  <Feather name="credit-card" size={16} color={AppColors.primary} />
                  <ThemedText type="body" style={{ fontWeight: "600", textAlign: "right" }}>المحفظة</ThemedText>
                </View>
                <Pressable
                  style={{ backgroundColor: "#4CAF50", paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: BorderRadius.md }}
                  onPress={() => setRechargeDriver(rechargeDriver === driver.phoneNumber ? null : driver.phoneNumber)}
                >
                  <ThemedText type="small" style={{ color: "#FFFFFF", fontWeight: "600" }}>شحن رصيد</ThemedText>
                </Pressable>
              </View>
              {rechargeDriver === driver.phoneNumber ? (
                <View style={{ flexDirection: "row", gap: Spacing.sm }}>
                  <Pressable
                    style={{ backgroundColor: AppColors.primary, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, justifyContent: "center" }}
                    onPress={() => {
                      if (rechargeAmount && Number(rechargeAmount) > 0) {
                        rechargeWalletMutation.mutate({ phoneNumber: driver.phoneNumber, amount: Number(rechargeAmount) });
                      }
                    }}
                  >
                    <ThemedText type="small" style={{ color: "#FFFFFF", fontWeight: "600" }}>تأكيد</ThemedText>
                  </Pressable>
                  <TextInput
                    style={[styles.input, { flex: 1, backgroundColor: theme.backgroundSecondary, color: theme.text, marginBottom: 0 }]}
                    placeholder="المبلغ (د.ع)"
                    placeholderTextColor={theme.textSecondary}
                    keyboardType="numeric"
                    value={rechargeAmount}
                    onChangeText={setRechargeAmount}
                  />
                </View>
              ) : null}
            </View>

            {/* إحصائيات أداء السائق */}
            {dStats ? (
              <View style={{ marginTop: Spacing.sm, borderTopWidth: 1, borderTopColor: "#E5E7EB", paddingTop: Spacing.md }}>
                <ThemedText type="small" style={{ textAlign: "right", fontWeight: "700", marginBottom: Spacing.sm, color: theme.text }}>
                  إحصائيات الأداء
                </ThemedText>
                <View style={{ flexDirection: "row-reverse", gap: Spacing.sm }}>
                  <View style={{ flex: 1, backgroundColor: "#6366F115", borderRadius: BorderRadius.md, padding: Spacing.sm, alignItems: "center" }}>
                    <ThemedText type="small" style={{ color: "#6366F1", fontWeight: "700" }}>{dStats.totalOrders}</ThemedText>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>توصيل</ThemedText>
                  </View>
                  <View style={{ flex: 1, backgroundColor: "#4CAF5015", borderRadius: BorderRadius.md, padding: Spacing.sm, alignItems: "center" }}>
                    <ThemedText type="small" style={{ color: "#4CAF50", fontWeight: "700" }}>{formatPrice(dStats.totalEarnings)}</ThemedText>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>أرباح</ThemedText>
                  </View>
                  <View style={{ flex: 1, backgroundColor: AppColors.primary + "15", borderRadius: BorderRadius.md, padding: Spacing.sm, alignItems: "center" }}>
                    <ThemedText type="small" style={{ color: AppColors.primary, fontWeight: "700" }}>{formatPrice(dStats.walletBalance)}</ThemedText>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>رصيد</ThemedText>
                  </View>
                  <View style={{ flex: 1, backgroundColor: "#06B6D415", borderRadius: BorderRadius.md, padding: Spacing.sm, alignItems: "center" }}>
                    <ThemedText type="small" style={{ color: "#06B6D4", fontWeight: "700" }}>{dStats.todayOrders}</ThemedText>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>اليوم</ThemedText>
                  </View>
                </View>
              </View>
            ) : null}
          </View>
          );
        })
      )}
    </View>
    );
  };

  const renderPromoCodesTab = () => (
    <View>
      <View style={styles.formCard}>
        <ThemedText type="h4" style={styles.formTitle}>
          {editItem ? "تعديل كود الخصم" : "إضافة كود خصم جديد"}
        </ThemedText>

        <TextInput
          style={[styles.input, { backgroundColor: theme.backgroundSecondary, color: theme.text }]}
          placeholder="كود الخصم"
          placeholderTextColor={theme.textSecondary}
          value={promoForm.code}
          onChangeText={(text) => setPromoForm({ ...promoForm, code: text })}
        />

        <View style={styles.typeSelector}>
          <Pressable
            style={[styles.typeButton, promoForm.type === "fixed" && styles.typeButtonActive]}
            onPress={() => setPromoForm({ ...promoForm, type: "fixed" })}
          >
            <ThemedText type="body" style={[styles.typeButtonText, promoForm.type === "fixed" && styles.typeButtonTextActive]}>
              مبلغ ثابت
            </ThemedText>
          </Pressable>
          <Pressable
            style={[styles.typeButton, promoForm.type === "percentage" && styles.typeButtonActive]}
            onPress={() => setPromoForm({ ...promoForm, type: "percentage" })}
          >
            <ThemedText type="body" style={[styles.typeButtonText, promoForm.type === "percentage" && styles.typeButtonTextActive]}>
              نسبة مئوية
            </ThemedText>
          </Pressable>
        </View>

        <TextInput
          style={[styles.input, { backgroundColor: theme.backgroundSecondary, color: theme.text }]}
          placeholder={promoForm.type === "percentage" ? "القيمة (%)" : "القيمة (د.ع)"}
          placeholderTextColor={theme.textSecondary}
          value={promoForm.value}
          onChangeText={(text) => setPromoForm({ ...promoForm, value: text })}
          keyboardType="numeric"
        />

        <TextInput
          style={[styles.input, { backgroundColor: theme.backgroundSecondary, color: theme.text }]}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={theme.textSecondary}
          value={promoForm.expiryDate}
          onChangeText={(text) => setPromoForm({ ...promoForm, expiryDate: text })}
        />

        <View style={styles.formButtons}>
          {isEditing ? (
            <Pressable style={styles.cancelButton} onPress={resetForm}>
              <ThemedText type="body" style={styles.cancelButtonText}>إلغاء</ThemedText>
            </Pressable>
          ) : null}
          <Pressable style={styles.saveButton} onPress={savePromoCode}>
            <ThemedText type="body" style={styles.saveButtonText}>{editItem ? "حفظ التعديلات" : "إضافة"}</ThemedText>
          </Pressable>
        </View>
      </View>

      <ThemedText type="h4" style={styles.listTitle}>أكواد الخصم الحالية</ThemedText>

      {promoCodesLoading ? (
        <ActivityIndicator color={AppColors.primary} />
      ) : (
        promoCodes.map((promo) => (
          <View key={promo.id} style={[styles.listItem, { backgroundColor: theme.backgroundSecondary }]}>
            <View style={styles.areaIcon}>
              <Feather name="tag" size={22} color={AppColors.primary} />
            </View>
            <View style={styles.listItemContent}>
              <ThemedText type="body" numberOfLines={1}>{promo.code}</ThemedText>
              <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.xs }}>
                <View style={[styles.discountBadge, { backgroundColor: promo.type === "percentage" ? "#16A34A" : "#F59E0B" }]}>
                  <ThemedText type="small" style={styles.discountText}>
                    {promo.type === "percentage" ? "نسبة" : "ثابت"}
                  </ThemedText>
                </View>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  {promo.type === "percentage" ? `${promo.value}%` : formatPrice(promo.value)}
                </ThemedText>
                <ThemedText type="small" style={{ color: promo.isActive ? "#16A34A" : "#EF4444" }}>
                  {promo.isActive ? "فعال" : "غير فعال"}
                </ThemedText>
              </View>
            </View>
            <View style={styles.listItemActions}>
              <Pressable onPress={() => handleEditPromo(promo)} style={styles.actionButton}>
                <Feather name="edit-2" size={18} color={AppColors.primary} />
              </Pressable>
              <Pressable onPress={() => confirmDelete(promo.id, "promoCode")} style={styles.actionButton}>
                <Feather name="trash-2" size={18} color="#EF4444" />
              </Pressable>
            </View>
          </View>
        ))
      )}
    </View>
  );

  const renderUsersTab = () => {
    const filtered = adminUsers.filter((u) =>
      u.phoneNumber?.includes(usersSearch) ||
      u.fullName?.toLowerCase().includes(usersSearch.toLowerCase())
    );

    const formatDate = (ts: any) => {
      if (!ts) return "";
      try {
        const date = ts._seconds ? new Date(ts._seconds * 1000) : new Date(ts);
        return date.toLocaleDateString("ar-IQ", { year: "numeric", month: "short", day: "numeric" });
      } catch { return ""; }
    };

    return (
      <View style={styles.usersContainer}>
        {/* Stats card */}
        <View style={[styles.usersStatsCard, { backgroundColor: theme.backgroundSecondary }]}>
          <View style={styles.usersStatBox}>
            <Feather name="users" size={26} color={AppColors.primary} />
            <ThemedText style={styles.usersStatNum}>
              {usersLoading ? "..." : adminUsers.length}
            </ThemedText>
            <ThemedText style={styles.usersStatLabel}>إجمالي المستخدمين</ThemedText>
          </View>
          <View style={styles.usersStatDivider} />
          <View style={styles.usersStatBox}>
            <Feather name="bell" size={26} color="#22C55E" />
            <ThemedText style={[styles.usersStatNum, { color: "#22C55E" }]}>
              {usersLoading ? "..." : adminUsers.filter((u) => !!u.pushToken).length}
            </ThemedText>
            <ThemedText style={styles.usersStatLabel}>مفعّل الإشعارات</ThemedText>
          </View>
        </View>

        {/* Search */}
        <View style={[styles.usersSearchBox, { backgroundColor: theme.backgroundSecondary }]}>
          <Feather name="search" size={16} color="#9CA3AF" />
          <TextInput
            style={[styles.usersSearchInput, { color: theme.text }]}
            placeholder="ابحث بالاسم أو رقم الهاتف..."
            placeholderTextColor="#9CA3AF"
            value={usersSearch}
            onChangeText={setUsersSearch}
            textAlign="right"
          />
          {usersSearch.length > 0 ? (
            <Pressable onPress={() => setUsersSearch("")}>
              <Feather name="x" size={15} color="#9CA3AF" />
            </Pressable>
          ) : null}
        </View>

        {/* Refresh */}
        <Pressable
          style={styles.usersRefreshBtn}
          onPress={() => refetchUsers()}
        >
          <Feather name="refresh-cw" size={14} color={AppColors.primary} />
          <ThemedText style={styles.usersRefreshText}>تحديث القائمة</ThemedText>
        </Pressable>

        {/* List */}
        {usersLoading ? (
          <ActivityIndicator color={AppColors.primary} style={{ marginTop: Spacing.xl }} />
        ) : filtered.length === 0 ? (
          <View style={styles.usersEmpty}>
            <Feather name="user-x" size={40} color="#D1D5DB" />
            <ThemedText style={styles.usersEmptyText}>
              {usersSearch ? "لا نتائج مطابقة" : "لا يوجد مستخدمون بعد"}
            </ThemedText>
          </View>
        ) : (
          <View style={styles.usersList}>
            {filtered.map((user, idx) => (
              <View
                key={user.id}
                style={[styles.userRow, { backgroundColor: theme.backgroundSecondary }]}
              >
                <View style={styles.userRowLeft}>
                  <View style={[styles.userAvatar, { backgroundColor: `rgba(232,101,32,${0.1 + (idx % 4) * 0.05})` }]}>
                    <ThemedText style={styles.userAvatarText}>
                      {user.fullName?.charAt(0) || "؟"}
                    </ThemedText>
                  </View>
                </View>
                <View style={styles.userRowInfo}>
                  <ThemedText style={styles.userRowName} numberOfLines={1}>
                    {user.fullName || "بدون اسم"}
                  </ThemedText>
                  <View style={styles.userRowMeta}>
                    <Feather name="phone" size={11} color="#9CA3AF" />
                    <ThemedText style={styles.userRowPhone}>{user.phoneNumber}</ThemedText>
                  </View>
                  {user.region ? (
                    <View style={styles.userRowMeta}>
                      <Feather name="map-pin" size={11} color="#9CA3AF" />
                      <ThemedText style={styles.userRowPhone}>{user.region}</ThemedText>
                    </View>
                  ) : null}
                  {formatDate(user.createdAt) ? (
                    <ThemedText style={styles.userRowDate}>
                      {formatDate(user.createdAt)}
                    </ThemedText>
                  ) : null}
                </View>
                <View style={styles.userRowRight}>
                  {user.pushToken ? (
                    <View style={styles.userNotifBadge}>
                      <Feather name="bell" size={10} color="#16A34A" />
                    </View>
                  ) : null}
                  <ThemedText style={styles.userRowIndex}>#{idx + 1}</ThemedText>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  const handleSendNotification = async () => {
    if (!notifForm.title.trim() || !notifForm.body.trim()) {
      setNotifError("يرجى إدخال العنوان والرسالة");
      return;
    }
    setIsSendingNotif(true);
    setNotifResult(null);
    setNotifError(null);
    try {
      const res = await fetch(`${getApiUrl()}/api/admin/send-notification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: notifForm.title, body: notifForm.body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الإرسال");
      setNotifResult({ sent: data.sent, total: data.total ?? data.sent });
      setNotifForm({ title: "", body: "" });
    } catch (e: any) {
      setNotifError(e.message);
    } finally {
      setIsSendingNotif(false);
    }
  };

  const renderNotificationsTab = () => (
    <View style={styles.notifContainer}>
      <View style={styles.notifHeader}>
        <Feather name="bell" size={28} color={AppColors.primary} />
        <ThemedText style={styles.notifTitle}>إرسال إشعار للمستخدمين</ThemedText>
        <ThemedText style={styles.notifSubtitle}>
          سيصل الإشعار لجميع المستخدمين المسجلين حتى خارج التطبيق
        </ThemedText>
      </View>

      <View style={[styles.notifCard, { backgroundColor: theme.backgroundSecondary }]}>
        <ThemedText style={styles.notifLabel}>عنوان الإشعار</ThemedText>
        <TextInput
          style={[styles.notifInput, { color: theme.text, borderColor: theme.backgroundSecondary }]}
          placeholder="مثال: تخفيضات حصرية اليوم!"
          placeholderTextColor="#9CA3AF"
          value={notifForm.title}
          onChangeText={(v) => setNotifForm((f) => ({ ...f, title: v }))}
          textAlign="right"
        />

        <ThemedText style={[styles.notifLabel, { marginTop: Spacing.md }]}>نص الرسالة</ThemedText>
        <TextInput
          style={[styles.notifInput, styles.notifTextArea, { color: theme.text, borderColor: theme.backgroundSecondary }]}
          placeholder="اكتب تفاصيل الإشعار هنا..."
          placeholderTextColor="#9CA3AF"
          value={notifForm.body}
          onChangeText={(v) => setNotifForm((f) => ({ ...f, body: v }))}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          textAlign="right"
        />
      </View>

      {notifResult !== null ? (
        <View style={styles.notifSuccess}>
          <Feather name="check-circle" size={22} color="#22C55E" />
          <ThemedText style={styles.notifSuccessText}>
            تم الإرسال بنجاح — وصل إلى {notifResult.sent} من {notifResult.total} مستخدم
          </ThemedText>
        </View>
      ) : null}

      {notifError !== null ? (
        <View style={styles.notifErrorBox}>
          <Feather name="alert-circle" size={18} color="#EF4444" />
          <ThemedText style={styles.notifErrorText}>{notifError}</ThemedText>
        </View>
      ) : null}

      <Pressable
        style={[styles.notifSendBtn, isSendingNotif && { opacity: 0.7 }]}
        onPress={handleSendNotification}
        disabled={isSendingNotif}
      >
        {isSendingNotif ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Feather name="send" size={18} color="#FFFFFF" />
        )}
        <ThemedText style={styles.notifSendBtnText}>
          {isSendingNotif ? "جاري الإرسال..." : "إرسال للجميع"}
        </ThemedText>
      </Pressable>
    </View>
  );

  const renderReportsTab = () => {
    const totalOrders = adminOrders.length;
    const deliveredOrders = adminOrders.filter(o => o.status === "delivered").length;
    const cancelledOrders = adminOrders.filter(o => o.status === "cancelled" || o.status === "issue").length;
    const pendingOrders = adminOrders.filter(o => o.status === "pending").length;
    const activeOrders = adminOrders.filter(o => ["confirmed","preparing","ready","picked_up","in_delivery"].includes(o.status)).length;
    const totalRevenue = adminOrders.filter(o => o.status === "delivered").reduce((s, o) => s + o.total + o.deliveryFee, 0);
    const avgOrderValue = totalOrders > 0 ? Math.round(adminOrders.reduce((s, o) => s + o.total + o.deliveryFee, 0) / totalOrders) : 0;
    const successRate = totalOrders > 0 ? Math.round((deliveredOrders / totalOrders) * 100) : 0;
    const cancelRate = totalOrders > 0 ? Math.round((cancelledOrders / totalOrders) * 100) : 0;

    // أكثر المناطق طلباً
    const areaMap: Record<string, { count: number; revenue: number }> = {};
    adminOrders.forEach(o => {
      if (!areaMap[o.region]) areaMap[o.region] = { count: 0, revenue: 0 };
      areaMap[o.region].count++;
      if (o.status === "delivered") areaMap[o.region].revenue += o.total + o.deliveryFee;
    });
    const topAreas = Object.entries(areaMap).sort((a, b) => b[1].count - a[1].count).slice(0, 5);

    // أداء السائقين
    const allStats = driverStatsData?.stats || {};
    const driverPerf = Object.entries(allStats).map(([phone, s]) => ({ phone, ...s }))
      .sort((a, b) => b.totalOrders - a.totalOrders).slice(0, 5);

    return (
      <View>
        {/* ملخص عام */}
        <View style={{ backgroundColor: AppColors.primary, borderRadius: BorderRadius.xl, padding: Spacing.lg, marginBottom: Spacing.md }}>
          <ThemedText type="h3" style={{ color: "#fff", textAlign: "right", marginBottom: Spacing.sm }}>لوحة الإحصائيات الشاملة</ThemedText>
          <ThemedText type="small" style={{ color: "#ffffff99", textAlign: "right", marginBottom: Spacing.md }}>
            {new Date().toLocaleDateString("ar-IQ", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </ThemedText>
          <View style={{ flexDirection: "row-reverse", flexWrap: "wrap", gap: Spacing.sm }}>
            {[
              { label: "إجمالي الطلبات", value: totalOrders, icon: "shopping-bag" as const },
              { label: "إجمالي الإيرادات", value: formatPrice(totalRevenue), icon: "dollar-sign" as const },
              { label: "متوسط الطلب", value: formatPrice(avgOrderValue), icon: "bar-chart-2" as const },
            ].map(s => (
              <View key={s.label} style={{ flex: 1, minWidth: 100, backgroundColor: "#ffffff20", borderRadius: BorderRadius.lg, padding: Spacing.sm, alignItems: "center" }}>
                <Feather name={s.icon} size={20} color="#fff" />
                <ThemedText type="body" style={{ color: "#fff", fontWeight: "700", marginTop: 4 }}>{s.value}</ThemedText>
                <ThemedText type="small" style={{ color: "#ffffff99", textAlign: "center" }}>{s.label}</ThemedText>
              </View>
            ))}
          </View>
        </View>

        {/* معدلات الأداء */}
        <ThemedText type="h4" style={styles.listTitle}>معدلات الأداء</ThemedText>
        <View style={{ flexDirection: "row", gap: Spacing.sm, marginBottom: Spacing.md }}>
          <View style={{ flex: 1, backgroundColor: "#4CAF5015", borderRadius: BorderRadius.lg, padding: Spacing.md }}>
            <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: Spacing.xs, marginBottom: 4 }}>
              <Feather name="check-circle" size={16} color="#4CAF50" />
              <ThemedText type="small" style={{ color: "#4CAF50", fontWeight: "700" }}>معدل الإتمام</ThemedText>
            </View>
            <ThemedText type="h2" style={{ color: "#4CAF50", textAlign: "center" }}>{successRate}%</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "center" }}>{deliveredOrders} طلب مكتمل</ThemedText>
          </View>
          <View style={{ flex: 1, backgroundColor: "#EF444415", borderRadius: BorderRadius.lg, padding: Spacing.md }}>
            <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: Spacing.xs, marginBottom: 4 }}>
              <Feather name="x-circle" size={16} color="#EF4444" />
              <ThemedText type="small" style={{ color: "#EF4444", fontWeight: "700" }}>معدل الإلغاء</ThemedText>
            </View>
            <ThemedText type="h2" style={{ color: "#EF4444", textAlign: "center" }}>{cancelRate}%</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "center" }}>{cancelledOrders} ملغى</ThemedText>
          </View>
        </View>

        {/* توزيع الحالات */}
        <ThemedText type="h4" style={styles.listTitle}>توزيع الطلبات حسب الحالة</ThemedText>
        <View style={[styles.formCard, { backgroundColor: theme.backgroundSecondary }]}>
          {[
            { label: "قيد الانتظار", value: pendingOrders, color: "#F59E0B" },
            { label: "نشط (تحضير/توصيل)", value: activeOrders, color: "#06B6D4" },
            { label: "مكتمل", value: deliveredOrders, color: "#4CAF50" },
            { label: "ملغى / مشكلة", value: cancelledOrders, color: "#EF4444" },
          ].map(item => (
            <View key={item.label} style={{ marginBottom: Spacing.sm }}>
              <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", marginBottom: 4 }}>
                <ThemedText type="small" style={{ color: theme.text, fontWeight: "600" }}>{item.label}</ThemedText>
                <ThemedText type="small" style={{ color: item.color, fontWeight: "700" }}>
                  {item.value} ({totalOrders > 0 ? Math.round((item.value / totalOrders) * 100) : 0}%)
                </ThemedText>
              </View>
              <View style={{ height: 8, backgroundColor: "#E5E7EB", borderRadius: 4 }}>
                <View style={{
                  height: 8,
                  backgroundColor: item.color,
                  borderRadius: 4,
                  width: totalOrders > 0 ? `${Math.round((item.value / totalOrders) * 100)}%` : "0%",
                }} />
              </View>
            </View>
          ))}
        </View>

        {/* الأرباح والعمولات */}
        {ownerEarnings ? (
          <>
            <ThemedText type="h4" style={styles.listTitle}>الأرباح والعمولات</ThemedText>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm, marginBottom: Spacing.md }}>
              {[
                { label: "عمولاتك", value: formatPrice(ownerEarnings.totalOwnerEarnings), color: "#4CAF50", icon: "award" as const },
                { label: "أرباح السائقين", value: formatPrice(ownerEarnings.totalDriverEarnings), color: "#2196F3", icon: "truck" as const },
                { label: "إجمالي رسوم التوصيل", value: formatPrice(ownerEarnings.totalDeliveryFees), color: AppColors.primary, icon: "map-pin" as const },
              ].map(s => (
                <View key={s.label} style={{ flex: 1, minWidth: 100, backgroundColor: s.color + "15", borderRadius: BorderRadius.lg, padding: Spacing.md, alignItems: "center" }}>
                  <Feather name={s.icon} size={20} color={s.color} />
                  <ThemedText type="body" style={{ color: s.color, fontWeight: "700", marginTop: 4 }}>{s.value}</ThemedText>
                  <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "center" }}>{s.label}</ThemedText>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {/* أكثر المناطق طلباً */}
        {topAreas.length > 0 ? (
          <>
            <ThemedText type="h4" style={styles.listTitle}>أكثر المناطق طلباً</ThemedText>
            <View style={[styles.formCard, { backgroundColor: theme.backgroundSecondary }]}>
              {topAreas.map(([area, data], idx) => (
                <View key={area} style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingVertical: Spacing.sm, borderBottomWidth: idx < topAreas.length - 1 ? 1 : 0, borderBottomColor: "#E5E7EB" }}>
                  <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: Spacing.sm }}>
                    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: AppColors.primary, alignItems: "center", justifyContent: "center" }}>
                      <ThemedText type="small" style={{ color: "#fff", fontWeight: "700" }}>{idx + 1}</ThemedText>
                    </View>
                    <ThemedText type="body" style={{ color: theme.text }}>{area}</ThemedText>
                  </View>
                  <View style={{ alignItems: "flex-start" }}>
                    <ThemedText type="small" style={{ color: AppColors.primary, fontWeight: "700" }}>{data.count} طلب</ThemedText>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>{formatPrice(data.revenue)}</ThemedText>
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {/* أداء السائقين */}
        {driverPerf.length > 0 ? (
          <>
            <ThemedText type="h4" style={styles.listTitle}>أداء السائقين</ThemedText>
            <View style={[styles.formCard, { backgroundColor: theme.backgroundSecondary }]}>
              {driverPerf.map((d, idx) => (
                <View key={d.phone} style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingVertical: Spacing.sm, borderBottomWidth: idx < driverPerf.length - 1 ? 1 : 0, borderBottomColor: "#E5E7EB" }}>
                  <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: Spacing.sm }}>
                    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: "#6366F1", alignItems: "center", justifyContent: "center" }}>
                      <ThemedText type="small" style={{ color: "#fff", fontWeight: "700" }}>{idx + 1}</ThemedText>
                    </View>
                    <View>
                      <ThemedText type="body" style={{ color: theme.text }}>{d.phone}</ThemedText>
                      <ThemedText type="small" style={{ color: theme.textSecondary }}>اليوم: {d.todayOrders} توصيل</ThemedText>
                    </View>
                  </View>
                  <View style={{ alignItems: "flex-start" }}>
                    <ThemedText type="small" style={{ color: "#6366F1", fontWeight: "700" }}>{d.totalOrders} توصيل</ThemedText>
                    <ThemedText type="small" style={{ color: "#4CAF50" }}>{formatPrice(d.totalEarnings)}</ThemedText>
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : null}
      </View>
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case "banners": return renderBannersTab();
      case "categories": return renderCategoriesTab();
      case "products": return renderProductsTab();
      case "areas": return renderAreasTab();
      case "orders": return renderOrdersTab();
      case "drivers": return renderDriversTab();
      case "promoCodes": return renderPromoCodesTab();
      case "notifications": return renderNotificationsTab();
      case "users": return renderUsersTab();
      case "reports": return renderReportsTab();
    }
  };

  return (
    <View style={{ flex: 1 }}>
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll}>
        <View style={styles.tabs}>
          {[
            { key: "reports", label: "التقارير" },
            { key: "orders", label: "الطلبات" },
            { key: "drivers", label: "السائقين" },
            { key: "banners", label: "البانرات" },
            { key: "categories", label: "الأقسام" },
            { key: "products", label: "المنتجات" },
            { key: "areas", label: "مناطق التوصيل" },
            { key: "promoCodes", label: "أكواد الخصم" },
            { key: "notifications", label: "الإشعارات" },
            { key: "users", label: "المستخدمين" },
          ].map((tab) => {
            const hasActiveDelivery = tab.key === "orders" && adminOrders.some(o => o.status === "in_delivery" || o.status === "picked_up");
            return (
            <Pressable
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => { setActiveTab(tab.key as TabType); resetForm(); }}
            >
              <ThemedText type="body" style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </ThemedText>
              {hasActiveDelivery ? (
                <View style={{ position: "absolute", top: 4, left: 4, width: 8, height: 8, borderRadius: 4, backgroundColor: "#4CAF50" }} />
              ) : null}
            </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {renderContent()}
    </ScrollView>
    {renderAssignDriverModal()}
    {renderTrackingModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  tabsScroll: {
    marginBottom: Spacing.lg,
    flexGrow: 0,
  },
  tabs: {
    flexDirection: "row",
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  tab: {
    minHeight: 48,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.lg,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  tabActive: {
    backgroundColor: AppColors.primary,
  },
  tabText: {
    color: "#6B7280",
    fontSize: 12,
  },
  tabTextActive: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  formCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  formTitle: {
    marginBottom: Spacing.md,
    textAlign: "right",
  },
  fieldLabel: {
    marginBottom: Spacing.xs,
    textAlign: "right",
  },
  input: {
    borderRadius: BorderRadius.lg,
    minHeight: 50,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    fontSize: 13,
    fontFamily: "Tajawal_400Regular",
    marginBottom: Spacing.md,
    textAlign: "right",
  },
  descInput: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  priceRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  priceInput: {
    flex: 1,
  },
  switchContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  categorySelector: {
    marginBottom: Spacing.md,
  },
  categoryScroll: {
    marginTop: Spacing.xs,
  },
  categoryChip: {
    minHeight: 44,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    backgroundColor: "#F3F4F6",
    marginRight: Spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryChipActive: {
    backgroundColor: AppColors.primary,
  },
  categoryChipText: {
    color: "#6B7280",
  },
  categoryChipTextActive: {
    color: "#FFFFFF",
  },
  typeSelector: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  typeButton: {
    flex: 1,
    minHeight: 48,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  typeButtonActive: {
    backgroundColor: AppColors.primary,
  },
  typeButtonText: {
    color: "#6B7280",
  },
  typeButtonTextActive: {
    color: "#FFFFFF",
  },
  imagePicker: {
    height: 140,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderStyle: "dashed",
    overflow: "hidden",
    marginBottom: Spacing.md,
  },
  imagePickerPlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.xs,
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  formButtons: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  saveButton: {
    flex: 1,
    backgroundColor: AppColors.primary,
    minHeight: 52,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    minHeight: 52,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButtonText: {
    color: "#6B7280",
    fontSize: 13,
  },
  listTitle: {
    marginBottom: Spacing.md,
    textAlign: "right",
  },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  listItemImage: {
    width: 60,
    height: 40,
    borderRadius: BorderRadius.sm,
  },
  listItemContent: {
    flex: 1,
    marginHorizontal: Spacing.md,
    alignItems: "flex-end",
  },
  listItemActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  actionButton: {
    minWidth: 44,
    minHeight: 44,
    padding: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  areaIcon: {
    width: 50,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  productPriceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  discountBadge: {
    backgroundColor: "#EF4444",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  discountText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "600",
  },
  orderCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  trackBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: "#1a1a2e",
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.xs,
  },
  orderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.xs,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  orderFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: Spacing.sm,
  },
  statusButtons: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  statusBtn: {
    minHeight: 40,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  saveCategoryChangesBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: AppColors.primary,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.md + 2,
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.lg,
    marginBottom: Spacing.lg,
    shadowColor: AppColors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  saveCategoryChangesBtnText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 12,
  },
  // ── Notifications Tab ──
  notifContainer: {
    gap: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  notifHeader: {
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    backgroundColor: "rgba(232,101,32,0.06)",
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: "rgba(232,101,32,0.15)",
  },
  notifTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 18,
    color: AppColors.primary,
    textAlign: "center",
  },
  notifSubtitle: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
  },
  notifCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    gap: Spacing.xs,
  },
  notifLabel: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    textAlign: "right",
    marginBottom: Spacing.xs,
  },
  notifInput: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    borderWidth: 1.5,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    backgroundColor: "#F9FAFB",
    color: "#1F2937",
  },
  notifTextArea: {
    minHeight: 110,
    paddingTop: Spacing.sm,
  },
  notifSendBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: AppColors.primary,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.md + 4,
    shadowColor: AppColors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  notifSendBtnText: {
    color: "#FFFFFF",
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
  },
  notifSuccess: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "#F0FDF4",
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  notifSuccessText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 14,
    color: "#15803D",
    flex: 1,
    textAlign: "right",
  },
  notifErrorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "#FEF2F2",
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  notifErrorText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: "#DC2626",
    flex: 1,
    textAlign: "right",
  },
  // ── Users Tab ──
  usersContainer: {
    gap: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  usersStatsCard: {
    flexDirection: "row",
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    alignItems: "center",
  },
  usersStatBox: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  usersStatDivider: {
    width: 1,
    height: 56,
    backgroundColor: "rgba(0,0,0,0.08)",
    marginHorizontal: Spacing.md,
  },
  usersStatNum: {
    fontFamily: "Cairo_700Bold",
    fontSize: 28,
    color: AppColors.primary,
  },
  usersStatLabel: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    color: "#6B7280",
    textAlign: "center",
  },
  usersSearchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
  },
  usersSearchInput: {
    flex: 1,
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    paddingVertical: 0,
  },
  usersRefreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  usersRefreshText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: AppColors.primary,
  },
  usersList: {
    gap: Spacing.sm,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  userRowLeft: {
    alignItems: "center",
  },
  userAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  userAvatarText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 18,
    color: AppColors.primary,
  },
  userRowInfo: {
    flex: 1,
    gap: 2,
    alignItems: "flex-end",
  },
  userRowName: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    textAlign: "right",
  },
  userRowMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  userRowPhone: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    color: "#6B7280",
  },
  userRowDate: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    color: "#9CA3AF",
    textAlign: "right",
  },
  userRowRight: {
    alignItems: "center",
    gap: Spacing.xs,
  },
  userNotifBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
  },
  userRowIndex: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    color: "#9CA3AF",
  },
  usersEmpty: {
    alignItems: "center",
    paddingVertical: Spacing.xl * 2,
    gap: Spacing.md,
  },
  usersEmptyText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 15,
    color: "#9CA3AF",
    textAlign: "center",
  },
  modalOverlay: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 999,
  },
  modalBox: {
    width: "85%",
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 12,
  },
  driverPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
});
