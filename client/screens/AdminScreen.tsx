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
import { Spacing, BorderRadius, AppColors, FontWeight} from "@/constants/theme";
import { Banner, Category } from "@/constants/categories";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { resolveImageUrl } from "@/utils/imageUtils";
import { formatPrice } from "@/constants/currency";
import { compressAndConvertToBase64, processAndUploadImage, isBase64Image, ImageSize } from "@/lib/imageUtils";

type TabType = "dashboard" | "orders" | "drivers" | "users" | "banners" | "categories" | "products" | "areas" | "promoCodes" | "notifications" | "vendors" | "settings";

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

interface VendorPartner {
  id: string;
  storeName: string;
  businessType: string;
  phoneNumber: string;
  status: "pending" | "active" | "rejected" | "suspended";
  address?: string;
  bio?: string;
  profileImageUrl?: string;
  coverImageUrl?: string;
  totalProducts?: number;
  rating?: number;
  deliveryTime?: string;
  deliveryPrice?: number;
  createdAt?: string;
  approvedAt?: string;
}

interface VendorProduct {
  id: string;
  vendorId: string;
  name: string;
  price: number;
  imageUrl?: string;
  status: "approved" | "pending" | "rejected" | "deleted";
  stock?: number;
  category?: string;
  description?: string;
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

  const [activeTab, setActiveTab] = useState<TabType>("dashboard");
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

  const [urgencyForm, setUrgencyForm] = useState({ confirmed: "10", preparing: "25", ready: "15" });
  const [isSavingUrgency, setIsSavingUrgency] = useState(false);
  const [urgencySaveError, setUrgencySaveError] = useState<string | null>(null);
  const [urgencySaveOk, setUrgencySaveOk] = useState(false);

  const [usersSearch, setUsersSearch] = useState("");

  const [serviceFeeInput, setServiceFeeInput] = useState("");
  const [isSavingFee, setIsSavingFee] = useState(false);

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

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${getApiUrl()}/api/settings/urgency-thresholds`);
        if (res.ok) {
          const data = await res.json();
          setUrgencyForm({
            confirmed: String(data.confirmed ?? 10),
            preparing: String(data.preparing ?? 25),
            ready: String(data.ready ?? 15),
          });
        }
      } catch (_) {}
    })();
  }, []);

  const saveUrgencyThresholds = async () => {
    const confirmed = parseInt(urgencyForm.confirmed, 10);
    const preparing = parseInt(urgencyForm.preparing, 10);
    const ready = parseInt(urgencyForm.ready, 10);
    if (isNaN(confirmed) || isNaN(preparing) || isNaN(ready) || confirmed <= 0 || preparing <= 0 || ready <= 0) {
      setUrgencySaveError("أدخل أرقاماً صحيحة وأكبر من صفر");
      setTimeout(() => setUrgencySaveError(null), 3000);
      return;
    }
    setIsSavingUrgency(true);
    setUrgencySaveError(null);
    setUrgencySaveOk(false);
    try {
      const res = await fetch(`${getApiUrl()}/api/admin/settings/urgency-thresholds`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed, preparing, ready }),
      });
      if (res.ok) {
        setUrgencySaveOk(true);
        setTimeout(() => setUrgencySaveOk(false), 3000);
      } else {
        const err = await res.json().catch(() => ({}));
        setUrgencySaveError(err?.error ?? "فشل الحفظ");
        setTimeout(() => setUrgencySaveError(null), 3000);
      }
    } catch (_) {
      setUrgencySaveError("تعذّر الاتصال بالخادم");
      setTimeout(() => setUrgencySaveError(null), 3000);
    } finally {
      setIsSavingUrgency(false);
    }
  };

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
  });

  const { data: vendorPartnersRaw, isLoading: vendorsLoading, refetch: refetchVendors } = useQuery<{ vendors: VendorPartner[]; total: number }>({
    queryKey: ["/api/admin/vendor-partners"],
    queryFn: async () => {
      const res = await fetch(`${getApiUrl()}/api/admin/vendor-partners`, { credentials: "include" });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });
  const vendorPartners: VendorPartner[] = vendorPartnersRaw?.vendors ?? [];

  const { data: allVendorProducts } = useQuery<{ products: VendorProduct[]; total: number }>({
    queryKey: ["/api/admin/vendor-products"],
    queryFn: async () => {
      const res = await fetch(`${getApiUrl()}/api/admin/vendor-products?status=all`, { credentials: "include" });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });

  const { data: feesSettings, refetch: refetchFees } = useQuery<{ serviceFee: number }>({
    queryKey: ["/api/settings/fees"],
  });

  const [selectedVendor, setSelectedVendor] = useState<VendorPartner | null>(null);
  const [vendorStatusFilter, setVendorStatusFilter] = useState<"all" | "active" | "pending" | "rejected" | "suspended">("all");

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
      const res = await fetch(`${getApiUrl()}/api/admin/driver-wallet/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber, amount, notes: "دفعة من الإدارة" }),
      });
      if (!res.ok) throw new Error("فشل في تسجيل الدفعة");
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
                <Feather name="trash-2" size={18} color={AppColors.error} />
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
                <Feather name="trash-2" size={18} color={AppColors.error} />
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
            <ActivityIndicator size="small" color={AppColors.white} />
          ) : (
            <Feather name="check-circle" size={20} color={AppColors.white} />
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
              trackColor={{ false: AppColors.gray300, true: AppColors.primary }}
              thumbColor={AppColors.white}
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
              <ActivityIndicator color={AppColors.white} size="small" />
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
                <ThemedText type="small" style={{ color: AppColors.primary, fontWeight: FontWeight.semiBold }}>
                  {formatPrice(product.price)}
                </ThemedText>
                {(product as any).restaurant ? (
                  <View style={[styles.discountBadge, { backgroundColor: "#E8652020" }]}>
                    <ThemedText type="small" style={{ color: AppColors.primary, fontWeight: FontWeight.semiBold, fontSize: 10 }}>{(product as any).restaurant}</ThemedText>
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
                <Feather name="trash-2" size={18} color={AppColors.error} />
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
              <ThemedText type="small" style={{ color: AppColors.primary, fontWeight: FontWeight.semiBold }}>
                {formatPrice(area.fee)}
              </ThemedText>
            </View>
            <View style={styles.listItemActions}>
              <Pressable onPress={() => handleEditArea(area)} style={styles.actionButton}>
                <Feather name="edit-2" size={18} color={AppColors.primary} />
              </Pressable>
              <Pressable onPress={() => confirmDelete(area.id, "area")} style={styles.actionButton}>
                <Feather name="trash-2" size={18} color={AppColors.error} />
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
      pending: AppColors.warning,
      confirmed: AppColors.info,
      preparing: AppColors.statusPurple,
      ready: AppColors.statusPurple,
      picked_up: AppColors.statusCyan,
      in_delivery: AppColors.statusCyan,
      delivering: AppColors.statusCyan,
      delivered: AppColors.success,
      cancelled: AppColors.error,
      issue: AppColors.warning,
    };
    return colors[status] ?? AppColors.gray400;
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
var icon=L.divIcon({className:'',html:'<div class="driver-pulse"><div class="driver-inner"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={AppColors.white} stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg></div></div>',iconSize:[48,48],iconAnchor:[24,24]});
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
        <View style={{ flex: 1, backgroundColor: AppColors.black }}>
          <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", backgroundColor: AppColors.black, paddingHorizontal: Spacing.lg, paddingTop: 50, paddingBottom: Spacing.md }}>
            <Pressable onPress={closeTrackingModal} style={{ padding: 8 }}>
              <Feather name="x" size={24} color={AppColors.white} />
            </Pressable>
            <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: Spacing.sm }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: AppColors.success }} />
              <ThemedText type="h4" style={{ color: AppColors.white }}>تتبع المندوب {trackingDriverName ? `— ${trackingDriverName}` : ""}</ThemedText>
            </View>
          </View>
          {Platform.OS === "web" ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Feather name="smartphone" size={48} color={AppColors.primary} />
              <ThemedText type="body" style={{ color: AppColors.white, marginTop: Spacing.md, textAlign: "center", paddingHorizontal: Spacing.xl }}>
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
              <ThemedText type="body" style={{ color: AppColors.white, marginTop: Spacing.md }}>
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
        <View style={[styles.modalBox, { backgroundColor: theme.backgroundDefault }]}>
          <ThemedText type="h4" style={{ textAlign: "center", marginBottom: Spacing.md }}>اختر السائق</ThemedText>
          {assignError ? (
            <ThemedText type="small" style={{ color: AppColors.error, textAlign: "center", marginBottom: Spacing.sm }}>
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
                    <ThemedText type="body" style={{ fontWeight: FontWeight.bold }}>{name}</ThemedText>
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
            style={[styles.statusBtn, { backgroundColor: AppColors.gray500, marginTop: Spacing.md, alignSelf: "center", paddingHorizontal: Spacing.xl }]}
            onPress={() => { setAssigningOrderId(null); setAssignError(null); }}
          >
            <ThemedText type="small" style={{ color: AppColors.white }}>إلغاء</ThemedText>
          </Pressable>
        </View>
      </View>
    );
  };

  const renderOrdersTab = () => (
    <View>
      {ownerEarnings ? (
        <View style={[styles.formCard, { backgroundColor: theme.backgroundSecondary, marginBottom: Spacing.lg }]}>
          <ThemedText type="h4" style={{ textAlign: "right", color: theme.text, marginBottom: Spacing.md }}>
            ملخص الأرباح والعمولات
          </ThemedText>

          {/* Stats row */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm, marginBottom: Spacing.lg }}>
            <View style={{ flex: 1, minWidth: 120, backgroundColor: "#4CAF5015", padding: Spacing.md, borderRadius: BorderRadius.lg, alignItems: "center" }}>
              <Feather name="trending-up" size={20} color={AppColors.success} />
              <ThemedText type="h3" style={{ color: AppColors.success, marginTop: Spacing.xs }}>{formatPrice(ownerEarnings.totalOwnerEarnings)}</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "center" }}>عمولة التطبيق</ThemedText>
            </View>
            <View style={{ flex: 1, minWidth: 120, backgroundColor: "#2196F315", padding: Spacing.md, borderRadius: BorderRadius.lg, alignItems: "center" }}>
              <Feather name="truck" size={20} color={AppColors.info} />
              <ThemedText type="h3" style={{ color: AppColors.info, marginTop: Spacing.xs }}>{formatPrice(ownerEarnings.totalDriverEarnings)}</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "center" }}>أرباح السائقين</ThemedText>
            </View>
            <View style={{ flex: 1, minWidth: 120, backgroundColor: "#FF962215", padding: Spacing.md, borderRadius: BorderRadius.lg, alignItems: "center" }}>
              <Feather name="check-circle" size={20} color={AppColors.primary} />
              <ThemedText type="h3" style={{ color: AppColors.primary, marginTop: Spacing.xs }}>{ownerEarnings.totalDeliveredOrders}</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "center" }}>طلبات مكتملة</ThemedText>
            </View>
          </View>

          {/* Commission split visualization */}
          <View style={{ borderTopWidth: 1, borderTopColor: AppColors.divider, paddingTop: Spacing.md }}>
            <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: Spacing.sm, marginBottom: Spacing.sm }}>
              <Feather name="percent" size={13} color={theme.textSecondary} />
              <ThemedText type="small" style={{ color: theme.text, fontWeight: FontWeight.bold }}>توزيع العمولة لكل طلب</ThemedText>
            </View>

            {/* Restaurant */}
            <View style={{ marginBottom: Spacing.sm }}>
              <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", marginBottom: 4 }}>
                <ThemedText type="small" style={{ color: theme.text }}>مطعم (1,000 د.ع)</ThemedText>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <ThemedText style={{ fontSize: 10, color: AppColors.primary }}>25% للتطبيق</ThemedText>
                  <ThemedText style={{ fontSize: 10, color: AppColors.success }}>75% للسائق</ThemedText>
                </View>
              </View>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: AppColors.divider, overflow: "hidden", flexDirection: "row-reverse" }}>
                <View style={{ width: "75%", height: "100%", backgroundColor: AppColors.success }} />
                <View style={{ width: "25%", height: "100%", backgroundColor: AppColors.primary }} />
              </View>
            </View>

            {/* Marketing */}
            <View>
              <View style={{ flexDirection: "row-reverse", justifyContent: "space-between", marginBottom: 4 }}>
                <ThemedText type="small" style={{ color: theme.text }}>تسويق (3,000 د.ع)</ThemedText>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <ThemedText style={{ fontSize: 10, color: AppColors.primary }}>33% للتطبيق</ThemedText>
                  <ThemedText style={{ fontSize: 10, color: AppColors.success }}>67% للسائق</ThemedText>
                </View>
              </View>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: AppColors.divider, overflow: "hidden", flexDirection: "row-reverse" }}>
                <View style={{ width: "67%", height: "100%", backgroundColor: AppColors.success }} />
                <View style={{ width: "33%", height: "100%", backgroundColor: AppColors.primary }} />
              </View>
            </View>

            {/* Legend */}
            <View style={{ flexDirection: "row-reverse", gap: Spacing.lg, marginTop: Spacing.sm }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: AppColors.primary }} />
                <ThemedText type="small" style={{ color: theme.textSecondary }}>التطبيق</ThemedText>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: AppColors.success }} />
                <ThemedText type="small" style={{ color: theme.textSecondary }}>السائق</ThemedText>
              </View>
            </View>
          </View>
        </View>
      ) : null}

      <ThemedText type="h4" style={styles.listTitle}>الطلبات</ThemedText>

      {ordersLoading ? (
        <ActivityIndicator color={AppColors.primary} />
      ) : adminOrders.length === 0 ? (
        <ThemedText type="body" style={{ textAlign: "center", color: theme.textSecondary }}>
          لا توجد طلبات حالياً
        </ThemedText>
      ) : (
        adminOrders.map((order) => (
          <View key={order.id} style={[styles.orderCard, { backgroundColor: theme.backgroundSecondary }]}>
            <View style={styles.orderHeader}>
              <ThemedText type="body" style={{ fontWeight: FontWeight.bold }}>#{order.id.slice(-6)}</ThemedText>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(order.status) + "20" }]}>
                <ThemedText type="small" style={{ color: getStatusColor(order.status), fontWeight: FontWeight.semiBold }}>
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
                <Feather name="map-pin" size={14} color={AppColors.white} />
                <ThemedText type="small" style={{ color: AppColors.white, fontWeight: FontWeight.bold }}>تتبع المندوب مباشر</ThemedText>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: AppColors.success }} />
              </Pressable>
            ) : null}
            <View style={styles.orderFooter}>
              <ThemedText type="body" style={{ color: AppColors.primary, fontWeight: FontWeight.bold }}>
                {formatPrice(order.total + order.deliveryFee)}
              </ThemedText>
              <View style={styles.statusButtons}>
                {order.status !== "delivered" && order.status !== "cancelled" ? (
                  <>
                    {order.status === "pending" ? (
                      <Pressable
                        style={[styles.statusBtn, { backgroundColor: AppColors.info }]}
                        onPress={() => updateOrderStatus.mutate({ id: order.id, status: "confirmed" })}
                      >
                        <ThemedText type="small" style={{ color: AppColors.white }}>تأكيد</ThemedText>
                      </Pressable>
                    ) : null}
                    {order.status === "confirmed" ? (
                      <Pressable
                        style={[styles.statusBtn, { backgroundColor: AppColors.statusPurple }]}
                        onPress={() => updateOrderStatus.mutate({ id: order.id, status: "preparing" })}
                      >
                        <ThemedText type="small" style={{ color: AppColors.white }}>تحضير</ThemedText>
                      </Pressable>
                    ) : null}
                    {order.status === "preparing" ? (
                      <Pressable
                        style={[styles.statusBtn, { backgroundColor: AppColors.statusCyan }]}
                        onPress={() => updateOrderStatus.mutate({ id: order.id, status: "delivering" })}
                      >
                        <ThemedText type="small" style={{ color: AppColors.white }}>توصيل</ThemedText>
                      </Pressable>
                    ) : null}
                    {order.status === "delivering" ? (
                      <Pressable
                        style={[styles.statusBtn, { backgroundColor: AppColors.success }]}
                        onPress={() => updateOrderStatus.mutate({ id: order.id, status: "delivered" })}
                      >
                        <ThemedText type="small" style={{ color: AppColors.white }}>تم</ThemedText>
                      </Pressable>
                    ) : null}
                    <Pressable
                      style={[styles.statusBtn, { backgroundColor: AppColors.error }]}
                      onPress={() => updateOrderStatus.mutate({ id: order.id, status: "cancelled" })}
                    >
                      <ThemedText type="small" style={{ color: AppColors.white }}>إلغاء</ThemedText>
                    </Pressable>
                    <Pressable
                      style={[styles.statusBtn, { backgroundColor: AppColors.primary, flexDirection: "row", alignItems: "center", gap: 4 }]}
                      onPress={() => { setAssigningOrderId(order.id); setAssignError(null); }}
                    >
                      <Feather name="user-plus" size={12} color={AppColors.white} />
                      <ThemedText type="small" style={{ color: AppColors.white }}>تعيين سائق</ThemedText>
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

  const getDriverStatusColor = (status: string) => {
    switch (status) {
      case "approved": return AppColors.success;
      case "rejected": return AppColors.error;
      default: return AppColors.warning;
    }
  };

  const getDriverStatusText = (status: string) => {
    switch (status) {
      case "approved": return "مقبول";
      case "rejected": return "مرفوض";
      default: return "قيد المراجعة";
    }
  };

  const renderDriversTab = () => (
    <View>
      <ThemedText type="h4" style={styles.formTitle}>
        سائقي التوصيل ({drivers.length})
      </ThemedText>

      {driversLoading ? (
        <ActivityIndicator size="large" color={AppColors.primary} />
      ) : drivers.length === 0 ? (
        <View style={styles.formCard}>
          <ThemedText type="body" style={{ textAlign: "center", color: AppColors.gray400 }}>
            لا يوجد سائقين مسجلين
          </ThemedText>
        </View>
      ) : (
        drivers.map((driver) => (
          <View key={driver.id} style={styles.formCard}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Spacing.md }}>
              <View style={{
                backgroundColor: getDriverStatusColor(driver.status) + "20",
                paddingHorizontal: Spacing.md,
                paddingVertical: 4,
                borderRadius: BorderRadius.full,
              }}>
                <ThemedText type="small" style={{ color: getDriverStatusColor(driver.status), fontWeight: FontWeight.bold }}>
                  {getDriverStatusText(driver.status)}
                </ThemedText>
              </View>
              <ThemedText type="h4" style={{ textAlign: "right", flex: 1, marginRight: Spacing.sm }}>
                {driver.fullName}
              </ThemedText>
            </View>

            <View style={{ gap: Spacing.xs, marginBottom: Spacing.md }}>
              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: Spacing.sm }}>
                <ThemedText type="body" style={{ color: AppColors.gray500 }}>{driver.phoneNumber}</ThemedText>
                <Feather name="phone" size={16} color={AppColors.gray500} />
              </View>
              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: Spacing.sm }}>
                <ThemedText type="body" style={{ color: AppColors.gray500 }}>
                  {driver.firstName} {driver.secondName} {driver.thirdName} {driver.fourthName}
                </ThemedText>
                <Feather name="user" size={16} color={AppColors.gray500} />
              </View>
              {driver.createdAt ? (
                <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: Spacing.sm }}>
                  <ThemedText type="small" style={{ color: AppColors.gray400 }}>
                    {new Date(driver.createdAt).toLocaleDateString("ar-IQ")}
                  </ThemedText>
                  <Feather name="calendar" size={14} color={AppColors.gray400} />
                </View>
              ) : null}
            </View>

            {driver.nationalIdImage ? (
              <View style={{ marginBottom: Spacing.md }}>
                <ThemedText type="body" style={{ textAlign: "right", marginBottom: Spacing.xs, fontWeight: FontWeight.semiBold }}>
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
                <ThemedText type="body" style={{ textAlign: "right", marginBottom: Spacing.xs, fontWeight: FontWeight.semiBold }}>
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
                <ThemedText type="body" style={{ textAlign: "right", color: AppColors.gray400 }}>
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
                    backgroundColor: AppColors.error,
                    borderRadius: BorderRadius.lg,
                    alignItems: "center",
                    justifyContent: "center",
                    paddingVertical: Spacing.md,
                  }}
                  onPress={() => updateDriverStatusMutation.mutate({ id: driver.id, status: "rejected" })}
                >
                  <ThemedText type="body" style={{ color: AppColors.white, fontWeight: FontWeight.semiBold }}>رفض</ThemedText>
                </Pressable>
                <Pressable
                  style={{
                    flex: 1,
                    minHeight: 48,
                    backgroundColor: AppColors.success,
                    borderRadius: BorderRadius.lg,
                    alignItems: "center",
                    justifyContent: "center",
                    paddingVertical: Spacing.md,
                  }}
                  onPress={() => updateDriverStatusMutation.mutate({ id: driver.id, status: "approved" })}
                >
                  <ThemedText type="body" style={{ color: AppColors.white, fontWeight: FontWeight.semiBold }}>قبول</ThemedText>
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={{
                  minHeight: 48,
                  backgroundColor: driver.status === "approved" ? AppColors.warning : AppColors.success,
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
                <ThemedText type="body" style={{ color: AppColors.white, fontWeight: FontWeight.semiBold }}>
                  {driver.status === "approved" ? "تعليق" : "قبول"}
                </ThemedText>
              </Pressable>
            )}

            <View style={{ marginTop: Spacing.md, borderTopWidth: 1, borderTopColor: AppColors.divider, paddingTop: Spacing.md }}>
              <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: Spacing.sm }}>
                <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: Spacing.xs }}>
                  <Feather name="credit-card" size={16} color={AppColors.primary} />
                  <ThemedText type="body" style={{ fontWeight: FontWeight.semiBold, textAlign: "right" }}>المحفظة</ThemedText>
                </View>
                <Pressable
                  style={{ backgroundColor: AppColors.primary, paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: BorderRadius.md }}
                  onPress={() => setRechargeDriver(rechargeDriver === driver.phoneNumber ? null : driver.phoneNumber)}
                >
                  <ThemedText type="small" style={{ color: AppColors.white, fontWeight: FontWeight.semiBold }}>تسجيل دفعة</ThemedText>
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
                    <ThemedText type="small" style={{ color: AppColors.white, fontWeight: FontWeight.semiBold }}>تأكيد</ThemedText>
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
          </View>
        ))
      )}
    </View>
  );

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
                <View style={[styles.discountBadge, { backgroundColor: promo.type === "percentage" ? AppColors.success : AppColors.warning }]}>
                  <ThemedText type="small" style={styles.discountText}>
                    {promo.type === "percentage" ? "نسبة" : "ثابت"}
                  </ThemedText>
                </View>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  {promo.type === "percentage" ? `${promo.value}%` : formatPrice(promo.value)}
                </ThemedText>
                <ThemedText type="small" style={{ color: promo.isActive ? AppColors.success : AppColors.error }}>
                  {promo.isActive ? "فعال" : "غير فعال"}
                </ThemedText>
              </View>
            </View>
            <View style={styles.listItemActions}>
              <Pressable onPress={() => handleEditPromo(promo)} style={styles.actionButton}>
                <Feather name="edit-2" size={18} color={AppColors.primary} />
              </Pressable>
              <Pressable onPress={() => confirmDelete(promo.id, "promoCode")} style={styles.actionButton}>
                <Feather name="trash-2" size={18} color={AppColors.error} />
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
            <Feather name="bell" size={26} color={AppColors.success} />
            <ThemedText style={[styles.usersStatNum, { color: AppColors.success }]}>
              {usersLoading ? "..." : adminUsers.filter((u) => !!u.pushToken).length}
            </ThemedText>
            <ThemedText style={styles.usersStatLabel}>مفعّل الإشعارات</ThemedText>
          </View>
        </View>

        {/* Search */}
        <View style={[styles.usersSearchBox, { backgroundColor: theme.backgroundSecondary }]}>
          <Feather name="search" size={16} color={AppColors.gray400} />
          <TextInput
            style={[styles.usersSearchInput, { color: theme.text }]}
            placeholder="ابحث بالاسم أو رقم الهاتف..."
            placeholderTextColor={AppColors.gray400}
            value={usersSearch}
            onChangeText={setUsersSearch}
            textAlign="right"
          />
          {usersSearch.length > 0 ? (
            <Pressable onPress={() => setUsersSearch("")}>
              <Feather name="x" size={15} color={AppColors.gray400} />
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
            <Feather name="user-x" size={40} color={AppColors.gray300} />
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
                    <Feather name="phone" size={11} color={AppColors.gray400} />
                    <ThemedText style={styles.userRowPhone}>{user.phoneNumber}</ThemedText>
                  </View>
                  {user.region ? (
                    <View style={styles.userRowMeta}>
                      <Feather name="map-pin" size={11} color={AppColors.gray400} />
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
                      <Feather name="bell" size={10} color={AppColors.success} />
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
          placeholderTextColor={AppColors.gray400}
          value={notifForm.title}
          onChangeText={(v) => setNotifForm((f) => ({ ...f, title: v }))}
          textAlign="right"
        />

        <ThemedText style={[styles.notifLabel, { marginTop: Spacing.md }]}>نص الرسالة</ThemedText>
        <TextInput
          style={[styles.notifInput, styles.notifTextArea, { color: theme.text, borderColor: theme.backgroundSecondary }]}
          placeholder="اكتب تفاصيل الإشعار هنا..."
          placeholderTextColor={AppColors.gray400}
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
          <Feather name="check-circle" size={22} color={AppColors.success} />
          <ThemedText style={styles.notifSuccessText}>
            تم الإرسال بنجاح — وصل إلى {notifResult.sent} من {notifResult.total} مستخدم
          </ThemedText>
        </View>
      ) : null}

      {notifError !== null ? (
        <View style={styles.notifErrorBox}>
          <Feather name="alert-circle" size={18} color={AppColors.error} />
          <ThemedText style={styles.notifErrorText}>{notifError}</ThemedText>
        </View>
      ) : null}

      <Pressable
        style={[styles.notifSendBtn, isSendingNotif && { opacity: 0.7 }]}
        onPress={handleSendNotification}
        disabled={isSendingNotif}
      >
        {isSendingNotif ? (
          <ActivityIndicator color={AppColors.white} size="small" />
        ) : (
          <Feather name="send" size={18} color={AppColors.white} />
        )}
        <ThemedText style={styles.notifSendBtnText}>
          {isSendingNotif ? "جاري الإرسال..." : "إرسال للجميع"}
        </ThemedText>
      </Pressable>
    </View>
  );

  const renderDashboardTab = () => {
    const ADMIN_RED = AppColors.error;
    const totalOrders = adminOrders.length;
    const pendingOrders = adminOrders.filter(o => o.status === "pending").length;
    const activeOrders = adminOrders.filter(o => ["confirmed","preparing","ready","picked_up","in_delivery"].includes(o.status)).length;
    const deliveredOrders = adminOrders.filter(o => o.status === "delivered").length;
    const approvedDrivers = drivers.filter(d => d.status === "approved").length;
    const pendingDrivers = drivers.filter(d => d.status === "pending").length;
    const todayRevenue = ownerEarnings?.totalOwnerEarnings ?? 0;
    const recentOrders = [...adminOrders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5);

    const kpiCards = [
      { label: "طلبات اليوم", value: totalOrders, icon: "shopping-cart" as const, color: AppColors.info, bg: AppColors.infoLight },
      { label: "بانتظار القبول", value: pendingOrders, icon: "clock" as const, color: AppColors.warning, bg: AppColors.warningLight },
      { label: "قيد التوصيل", value: activeOrders, icon: "navigation" as const, color: AppColors.statusPurple, bg: AppColors.vendorPurpleLight },
      { label: "تمت التوصيل", value: deliveredOrders, icon: "check-circle" as const, color: AppColors.success, bg: AppColors.successLight },
      { label: "إجمالي السائقين", value: approvedDrivers, icon: "truck" as const, color: ADMIN_RED, bg: AppColors.secondary },
      { label: "طلبات السائقين", value: pendingDrivers, icon: "user-check" as const, color: AppColors.statusPurple, bg: AppColors.vendorPurpleLight },
      { label: "المستخدمون", value: adminUsers.length, icon: "users" as const, color: AppColors.info, bg: AppColors.infoLight },
      { label: "عمولة التطبيق", value: formatPrice(todayRevenue), icon: "trending-up" as const, color: AppColors.success, bg: AppColors.successLight, isText: true },
    ];

    const getStatusColor = (s: string) => {
      const m: Record<string, string> = { pending:AppColors.warning, confirmed:AppColors.info, preparing:AppColors.statusPurple, ready:AppColors.primary, picked_up:AppColors.primary, in_delivery:AppColors.statusCyan, delivered:AppColors.success, cancelled:AppColors.error, issue:AppColors.error };
      return m[s] || AppColors.gray500;
    };
    const getStatusLabel = (s: string) => {
      const m: Record<string, string> = { pending:"انتظار", confirmed:"مؤكد", preparing:"يتحضر", ready:"جاهز", picked_up:"استُلم", in_delivery:"بالطريق", delivered:"وصل", cancelled:"ملغي", issue:"مشكلة" };
      return m[s] || s;
    };

    const quickLinks: { label: string; tab: TabType; icon: keyof typeof Feather.glyphMap; color: string }[] = [
      { label: "البانرات", tab: "banners", icon: "image", color: AppColors.info },
      { label: "الأقسام", tab: "categories", icon: "grid", color: AppColors.statusPurple },
      { label: "المنتجات", tab: "products", icon: "package", color: AppColors.warning },
      { label: "المناطق", tab: "areas", icon: "map-pin", color: AppColors.success },
      { label: "أكواد الخصم", tab: "promoCodes", icon: "tag", color: AppColors.error },
      { label: "الإشعارات", tab: "notifications", icon: "bell", color: AppColors.statusPurple },
    ];

    return (
      <View style={{ gap: Spacing.lg }}>
        {/* Welcome strip */}
        <View style={{ borderRadius: BorderRadius.xl, overflow: "hidden", backgroundColor: ADMIN_RED }}>
          <View style={{ padding: Spacing.lg, flexDirection: "row-reverse", alignItems: "center", gap: Spacing.md }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }}>
              <Feather name="shield" size={24} color={AppColors.white} />
            </View>
            <View style={{ flex: 1, alignItems: "flex-end" }}>
              <ThemedText style={{ color: AppColors.white, fontSize: 18, fontFamily: "Cairo_700Bold" }}>لوحة التحكم</ThemedText>
              <ThemedText style={{ color: AppColors.textOnBrandMuted, fontSize: 13, fontFamily: "Cairo_400Regular" }}>مرحباً بك في نظام إدارة أونواي</ThemedText>
            </View>
          </View>
          {/* Mini status bar */}
          <View style={{ flexDirection: "row-reverse", backgroundColor: "rgba(0,0,0,0.15)", paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, gap: Spacing.lg }}>
            <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: pendingOrders > 0 ? AppColors.warning : AppColors.success }} />
              <ThemedText style={{ color: AppColors.white, fontSize: 12, fontFamily: "Cairo_400Regular" }}>{pendingOrders > 0 ? `${pendingOrders} طلب ينتظر` : "لا طلبات معلقة"}</ThemedText>
            </View>
            <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: AppColors.success }} />
              <ThemedText style={{ color: AppColors.white, fontSize: 12, fontFamily: "Cairo_400Regular" }}>{approvedDrivers} سائق نشط</ThemedText>
            </View>
          </View>
        </View>

        {/* KPI grid */}
        <View>
          <ThemedText style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: theme.textSecondary, textAlign: "right", marginBottom: Spacing.sm }}>الإحصائيات الرئيسية</ThemedText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm }}>
            {kpiCards.map((card, i) => (
              <View key={i} style={{ width: "47%", backgroundColor: card.bg, borderRadius: BorderRadius.lg, padding: Spacing.md, gap: 4 }}>
                <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: card.color + "20", alignItems: "center", justifyContent: "center" }}>
                    <Feather name={card.icon} size={18} color={card.color} />
                  </View>
                  {card.isText ? (
                    <ThemedText style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: card.color }}>{card.value as string}</ThemedText>
                  ) : (
                    <ThemedText style={{ fontFamily: "Cairo_700Bold", fontSize: 26, color: card.color }}>{card.value as number}</ThemedText>
                  )}
                </View>
                <ThemedText style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: AppColors.gray500, textAlign: "right" }}>{card.label}</ThemedText>
              </View>
            ))}
          </View>
        </View>

        {/* Quick links */}
        <View>
          <ThemedText style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: theme.textSecondary, textAlign: "right", marginBottom: Spacing.sm }}>وصول سريع</ThemedText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm }}>
            {quickLinks.map((ql, i) => (
              <Pressable
                key={i}
                onPress={() => { setActiveTab(ql.tab); resetForm(); }}
                style={{ width: "30%", backgroundColor: theme.backgroundSecondary, borderRadius: BorderRadius.lg, padding: Spacing.md, alignItems: "center", gap: 6 }}
              >
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: ql.color + "15", alignItems: "center", justifyContent: "center" }}>
                  <Feather name={ql.icon} size={20} color={ql.color} />
                </View>
                <ThemedText style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: theme.text, textAlign: "center" }}>{ql.label}</ThemedText>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Recent orders */}
        <View>
          <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: Spacing.sm }}>
            <ThemedText style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: theme.textSecondary }}>آخر الطلبات</ThemedText>
            <Pressable onPress={() => { setActiveTab("orders"); resetForm(); }}>
              <ThemedText style={{ fontFamily: "Cairo_400Regular", fontSize: 13, color: ADMIN_RED }}>عرض الكل</ThemedText>
            </Pressable>
          </View>
          {recentOrders.length === 0 ? (
            <View style={{ padding: Spacing.xl, alignItems: "center" }}>
              <ThemedText style={{ color: theme.textSecondary, fontFamily: "Cairo_400Regular", fontSize: 13 }}>لا توجد طلبات بعد</ThemedText>
            </View>
          ) : (
            <View style={{ gap: Spacing.sm }}>
              {recentOrders.map(order => (
                <Pressable
                  key={order.id}
                  onPress={() => { setActiveTab("orders"); resetForm(); }}
                  style={{ backgroundColor: theme.backgroundSecondary, borderRadius: BorderRadius.lg, padding: Spacing.md, flexDirection: "row-reverse", alignItems: "center", gap: Spacing.md }}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: getStatusColor(order.status) + "15", alignItems: "center", justifyContent: "center" }}>
                    <Feather name="shopping-bag" size={18} color={getStatusColor(order.status)} />
                  </View>
                  <View style={{ flex: 1, alignItems: "flex-end", gap: 2 }}>
                    <ThemedText style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: theme.text }}>#{order.id.slice(-6)}</ThemedText>
                    <ThemedText style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: theme.textSecondary }}>{order.phoneNumber}</ThemedText>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 2 }}>
                    <View style={{ paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: 100, backgroundColor: getStatusColor(order.status) + "20" }}>
                      <ThemedText style={{ fontSize: 11, fontFamily: "Cairo_700Bold", color: getStatusColor(order.status) }}>{getStatusLabel(order.status)}</ThemedText>
                    </View>
                    <ThemedText style={{ fontSize: 13, fontFamily: "Cairo_700Bold", color: theme.text }}>{formatPrice(order.total)}</ThemedText>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Urgency Thresholds Settings */}
        <View style={{ backgroundColor: theme.backgroundSecondary, borderRadius: BorderRadius.xl, padding: Spacing.lg, gap: Spacing.md }}>
          <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: Spacing.sm, marginBottom: 2 }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#FEE2E220", alignItems: "center", justifyContent: "center" }}>
              <Feather name="clock" size={18} color={AppColors.error} />
            </View>
            <View style={{ flex: 1, alignItems: "flex-end" }}>
              <ThemedText style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: theme.text }}>حدود تنبيه الوقت للبائعين</ThemedText>
              <ThemedText style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: theme.textSecondary }}>عدد الدقائق قبل تحوّل المؤقت إلى اللون الأحمر</ThemedText>
            </View>
          </View>
          <View style={{ gap: Spacing.sm }}>
            {([
              { key: "confirmed" as const, label: "بعد التأكيد (مؤكد)" },
              { key: "preparing" as const, label: "أثناء التحضير" },
              { key: "ready" as const, label: "جاهز وينتظر السائق" },
            ]).map(({ key, label }) => (
              <View key={key} style={{ flexDirection: "row-reverse", alignItems: "center", gap: Spacing.sm }}>
                <ThemedText style={{ flex: 1, fontFamily: "Cairo_400Regular", fontSize: 13, color: theme.text, textAlign: "right" }}>{label}</ThemedText>
                <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 6 }}>
                  <TextInput
                    value={urgencyForm[key]}
                    onChangeText={(t) => setUrgencyForm((prev) => ({ ...prev, [key]: t.replace(/[^0-9]/g, "") }))}
                    keyboardType="number-pad"
                    style={{
                      width: 60, textAlign: "center", fontFamily: "Cairo_700Bold", fontSize: 15,
                      color: theme.text, backgroundColor: theme.backgroundDefault,
                      borderRadius: BorderRadius.md, borderWidth: 1, borderColor: theme.border ?? AppColors.divider,
                      paddingVertical: 6, paddingHorizontal: 8,
                    }}
                    testID={`urgency-input-${key}`}
                  />
                  <ThemedText style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: theme.textSecondary }}>دقيقة</ThemedText>
                </View>
              </View>
            ))}
          </View>
          {urgencySaveError ? (
            <ThemedText style={{ fontFamily: "Cairo_400Regular", fontSize: 13, color: AppColors.error, textAlign: "right" }}>{urgencySaveError}</ThemedText>
          ) : null}
          {urgencySaveOk ? (
            <ThemedText style={{ fontFamily: "Cairo_400Regular", fontSize: 13, color: AppColors.success, textAlign: "right" }}>تم الحفظ بنجاح</ThemedText>
          ) : null}
          <Pressable
            onPress={saveUrgencyThresholds}
            disabled={isSavingUrgency}
            testID="button-save-urgency"
            style={{ backgroundColor: ADMIN_RED, borderRadius: BorderRadius.lg, paddingVertical: 10, alignItems: "center" }}
          >
            {isSavingUrgency ? (
              <ActivityIndicator color={AppColors.white} size="small" />
            ) : (
              <ThemedText style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: AppColors.white }}>حفظ الحدود الزمنية</ThemedText>
            )}
          </Pressable>
        </View>

        {/* Commission summary shortcut */}
        {ownerEarnings ? (
          <Pressable
            onPress={() => { setActiveTab("orders"); resetForm(); }}
            style={{ backgroundColor: AppColors.secondary, borderRadius: BorderRadius.xl, padding: Spacing.lg, flexDirection: "row-reverse", alignItems: "center", gap: Spacing.md, borderWidth: 1, borderColor: AppColors.errorLight }}
          >
            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: AppColors.errorLight, alignItems: "center", justifyContent: "center" }}>
              <Feather name="dollar-sign" size={22} color={ADMIN_RED} />
            </View>
            <View style={{ flex: 1, alignItems: "flex-end" }}>
              <ThemedText style={{ fontFamily: "Cairo_700Bold", fontSize: 15, color: ADMIN_RED }}>{formatPrice(ownerEarnings.totalOwnerEarnings)}</ThemedText>
              <ThemedText style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: AppColors.gray500 }}>إجمالي عمولة التطبيق — {ownerEarnings.totalDeliveredOrders} طلب مكتمل</ThemedText>
            </View>
            <Feather name="chevron-left" size={16} color={ADMIN_RED} />
          </Pressable>
        ) : null}
      </View>
    );
  };

  const VENDOR_STATUS_LABELS: Record<string, string> = {
    all: "الكل", active: "نشط", pending: "قيد المراجعة", rejected: "مرفوض", suspended: "موقوف",
  };
  const VENDOR_STATUS_COLORS: Record<string, string> = {
    active: AppColors.success, pending: AppColors.warning, rejected: AppColors.error, suspended: AppColors.gray500,
  };
  const BUSINESS_TYPE_LABELS: Record<string, string> = {
    restaurant: "مطعم", supermarket: "سوبرماركت", pharmacy: "صيدلية",
    bakery: "مخبز", other: "أخرى",
  };

  const renderVendorsTab = () => {
    const filtered = vendorStatusFilter === "all"
      ? vendorPartners
      : vendorPartners.filter((v) => v.status === vendorStatusFilter);

    const vendorProductsMap: Record<string, VendorProduct[]> = {};
    (allVendorProducts?.products ?? []).forEach((p) => {
      if (!vendorProductsMap[p.vendorId]) vendorProductsMap[p.vendorId] = [];
      vendorProductsMap[p.vendorId].push(p);
    });

    const selectedProducts = selectedVendor ? (vendorProductsMap[selectedVendor.id] ?? []) : [];

    return (
      <View style={{ gap: Spacing.md }}>
        {/* Summary row */}
        <View style={{ flexDirection: "row-reverse", gap: Spacing.sm }}>
          {[
            { label: "الكل", count: vendorPartners.length, color: ADMIN_RED },
            { label: "نشط", count: vendorPartners.filter((v) => v.status === "active").length, color: AppColors.success },
            { label: "قيد المراجعة", count: vendorPartners.filter((v) => v.status === "pending").length, color: AppColors.warning },
          ].map((s) => (
            <View key={s.label} style={{ flex: 1, backgroundColor: s.color + "15", borderRadius: 14, padding: Spacing.md, alignItems: "center", gap: 4 }}>
              <ThemedText style={{ fontFamily: "Cairo_700Bold", fontSize: 18, color: s.color }}>{s.count}</ThemedText>
              <ThemedText style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: s.color, textAlign: "center" }}>{s.label}</ThemedText>
            </View>
          ))}
        </View>

        {/* Filter tabs */}
        <View style={{ flexDirection: "row-reverse", gap: 6, flexWrap: "wrap" }}>
          {(["all", "active", "pending", "rejected", "suspended"] as const).map((f) => (
            <Pressable
              key={f}
              onPress={() => setVendorStatusFilter(f)}
              style={{
                paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
                backgroundColor: vendorStatusFilter === f ? ADMIN_RED : theme.backgroundDefault,
                borderWidth: 1, borderColor: vendorStatusFilter === f ? ADMIN_RED : theme.border ?? AppColors.divider,
              }}
              testID={`vendor-filter-${f}`}
            >
              <ThemedText style={{
                fontFamily: "Cairo_700Bold", fontSize: 12,
                color: vendorStatusFilter === f ? AppColors.white : theme.textSecondary,
              }}>
                {VENDOR_STATUS_LABELS[f]}
              </ThemedText>
            </Pressable>
          ))}
        </View>

        {/* Store cards */}
        {vendorsLoading ? (
          <ActivityIndicator size="large" color={ADMIN_RED} style={{ paddingVertical: 40 }} />
        ) : filtered.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 40, gap: 8 }}>
            <Feather name="briefcase" size={40} color={ADMIN_RED} style={{ opacity: 0.3 }} />
            <ThemedText style={{ fontFamily: "Cairo_700Bold", color: theme.textSecondary }}>لا متاجر في هذه الفئة</ThemedText>
          </View>
        ) : (
          filtered.map((vendor) => {
            const products = vendorProductsMap[vendor.id] ?? [];
            const approvedCount = products.filter((p) => p.status === "approved").length;
            return (
              <Pressable
                key={vendor.id}
                onPress={() => setSelectedVendor(vendor)}
                testID={`vendor-card-${vendor.id}`}
                style={{
                  backgroundColor: theme.backgroundDefault, borderRadius: 16, overflow: "hidden",
                  shadowColor: AppColors.black, shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
                  elevation: 2,
                }}
              >
                {/* Cover */}
                {vendor.coverImageUrl ? (
                  <Image source={{ uri: resolveImageUrl(vendor.coverImageUrl) }} style={{ width: "100%", height: 72, resizeMode: "cover" }} />
                ) : (
                  <View style={{ width: "100%", height: 72, backgroundColor: ADMIN_RED + "20", alignItems: "center", justifyContent: "center" }}>
                    <Feather name="briefcase" size={28} color={ADMIN_RED} style={{ opacity: 0.5 }} />
                  </View>
                )}
                <View style={{ padding: Spacing.md, gap: Spacing.sm }}>
                  <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: Spacing.sm }}>
                    {/* Logo */}
                    {vendor.profileImageUrl ? (
                      <Image source={{ uri: resolveImageUrl(vendor.profileImageUrl) }} style={{ width: 44, height: 44, borderRadius: 12, borderWidth: 2, borderColor: AppColors.white, marginTop: -20 }} />
                    ) : (
                      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: ADMIN_RED + "30", alignItems: "center", justifyContent: "center", marginTop: -20, borderWidth: 2, borderColor: AppColors.white }}>
                        <Feather name="briefcase" size={20} color={ADMIN_RED} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <ThemedText style={{ fontFamily: "Cairo_700Bold", fontSize: 15, color: theme.text, textAlign: "right" }}>{vendor.storeName}</ThemedText>
                      <ThemedText style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: theme.textSecondary, textAlign: "right" }}>
                        {BUSINESS_TYPE_LABELS[vendor.businessType] || vendor.businessType} · {vendor.phoneNumber}
                      </ThemedText>
                    </View>
                    {/* Status badge */}
                    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, backgroundColor: (VENDOR_STATUS_COLORS[vendor.status] ?? AppColors.gray500) + "20" }}>
                      <ThemedText style={{ fontFamily: "Cairo_700Bold", fontSize: 11, color: VENDOR_STATUS_COLORS[vendor.status] ?? AppColors.gray500 }}>
                        {VENDOR_STATUS_LABELS[vendor.status] ?? vendor.status}
                      </ThemedText>
                    </View>
                  </View>
                  {/* Stats */}
                  <View style={{ flexDirection: "row-reverse", gap: Spacing.lg }}>
                    <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4 }}>
                      <Feather name="package" size={13} color={theme.textSecondary} />
                      <ThemedText style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: theme.textSecondary }}>{approvedCount} منتج</ThemedText>
                    </View>
                    {vendor.deliveryTime ? (
                      <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4 }}>
                        <Feather name="clock" size={13} color={theme.textSecondary} />
                        <ThemedText style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: theme.textSecondary }}>{vendor.deliveryTime}</ThemedText>
                      </View>
                    ) : null}
                    {vendor.createdAt ? (
                      <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 4 }}>
                        <Feather name="calendar" size={13} color={theme.textSecondary} />
                        <ThemedText style={{ fontFamily: "Cairo_400Regular", fontSize: 12, color: theme.textSecondary }}>
                          {new Date(vendor.createdAt).toLocaleDateString("ar-IQ", { year: "numeric", month: "short", day: "numeric" })}
                        </ThemedText>
                      </View>
                    ) : null}
                  </View>
                </View>
              </Pressable>
            );
          })
        )}

        {/* Vendor Detail Modal */}
        {selectedVendor ? (
          <Modal transparent animationType="slide" visible onRequestClose={() => setSelectedVendor(null)}>
            <View style={{ flex: 1, backgroundColor: AppColors.overlay }}>
              <Pressable style={{ flex: 1 }} onPress={() => setSelectedVendor(null)} />
              <View style={{
                backgroundColor: theme.backgroundDefault,
                borderTopLeftRadius: 24, borderTopRightRadius: 24,
                maxHeight: "85%",
              }}>
                {/* Header */}
                <View style={{ flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: theme.border ?? AppColors.divider }}>
                  <ThemedText style={{ fontFamily: "Cairo_700Bold", fontSize: 17, color: theme.text }}>{selectedVendor.storeName}</ThemedText>
                  <Pressable onPress={() => setSelectedVendor(null)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: AppColors.gray100, alignItems: "center", justifyContent: "center" }}>
                    <Feather name="x" size={18} color={AppColors.gray700} />
                  </Pressable>
                </View>
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md }}>
                  {/* Cover + logo */}
                  {selectedVendor.coverImageUrl ? (
                    <Image source={{ uri: resolveImageUrl(selectedVendor.coverImageUrl) }} style={{ width: "100%", height: 130, borderRadius: 14, resizeMode: "cover" }} />
                  ) : null}

                  {/* Info card */}
                  <View style={{ backgroundColor: theme.backgroundRoot, borderRadius: 14, padding: Spacing.md, gap: 10 }}>
                    {[
                      { label: "نوع المتجر", value: BUSINESS_TYPE_LABELS[selectedVendor.businessType] || selectedVendor.businessType },
                      { label: "رقم الهاتف", value: selectedVendor.phoneNumber },
                      { label: "العنوان", value: selectedVendor.address || "—" },
                      { label: "وقت التوصيل", value: selectedVendor.deliveryTime || "—" },
                      { label: "رسوم التوصيل", value: selectedVendor.deliveryPrice != null ? formatPrice(selectedVendor.deliveryPrice) : "—" },
                      { label: "تاريخ التسجيل", value: selectedVendor.createdAt ? new Date(selectedVendor.createdAt).toLocaleDateString("ar-IQ", { year: "numeric", month: "long", day: "numeric" }) : "—" },
                      { label: "تاريخ الموافقة", value: selectedVendor.approvedAt ? new Date(selectedVendor.approvedAt).toLocaleDateString("ar-IQ", { year: "numeric", month: "long", day: "numeric" }) : "—" },
                    ].map((item) => (
                      <View key={item.label} style={{ flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <ThemedText style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: theme.textSecondary }}>{item.label}</ThemedText>
                        <ThemedText style={{ fontFamily: "Cairo_400Regular", fontSize: 13, color: theme.text, textAlign: "left", flex: 1, marginLeft: 8 }}>{item.value}</ThemedText>
                      </View>
                    ))}
                    {selectedVendor.bio ? (
                      <View style={{ gap: 4 }}>
                        <ThemedText style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: theme.textSecondary, textAlign: "right" }}>نبذة عن المتجر</ThemedText>
                        <ThemedText style={{ fontFamily: "Cairo_400Regular", fontSize: 13, color: theme.text, textAlign: "right" }}>{selectedVendor.bio}</ThemedText>
                      </View>
                    ) : null}
                  </View>

                  {/* Status badge */}
                  <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                    <ThemedText style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: theme.textSecondary }}>الحالة:</ThemedText>
                    <View style={{ paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, backgroundColor: (VENDOR_STATUS_COLORS[selectedVendor.status] ?? AppColors.gray500) + "20" }}>
                      <ThemedText style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: VENDOR_STATUS_COLORS[selectedVendor.status] ?? AppColors.gray500 }}>
                        {VENDOR_STATUS_LABELS[selectedVendor.status] ?? selectedVendor.status}
                      </ThemedText>
                    </View>
                  </View>

                  {/* Products section */}
                  <View style={{ gap: Spacing.sm }}>
                    <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: 8 }}>
                      <Feather name="package" size={16} color={ADMIN_RED} />
                      <ThemedText style={{ fontFamily: "Cairo_700Bold", fontSize: 15, color: theme.text }}>
                        المنتجات ({selectedProducts.length})
                      </ThemedText>
                    </View>
                    {selectedProducts.length === 0 ? (
                      <ThemedText style={{ fontFamily: "Cairo_400Regular", fontSize: 13, color: theme.textSecondary, textAlign: "right" }}>لا توجد منتجات بعد</ThemedText>
                    ) : (
                      selectedProducts.map((prod) => (
                        <View key={prod.id} style={{ backgroundColor: theme.backgroundRoot, borderRadius: 12, padding: Spacing.md, flexDirection: "row-reverse", alignItems: "center", gap: Spacing.md }}>
                          {prod.imageUrl ? (
                            <Image source={{ uri: resolveImageUrl(prod.imageUrl) }} style={{ width: 52, height: 52, borderRadius: 10, resizeMode: "cover" }} />
                          ) : (
                            <View style={{ width: 52, height: 52, borderRadius: 10, backgroundColor: ADMIN_RED + "15", alignItems: "center", justifyContent: "center" }}>
                              <Feather name="image" size={20} color={ADMIN_RED} style={{ opacity: 0.5 }} />
                            </View>
                          )}
                          <View style={{ flex: 1, gap: 2 }}>
                            <ThemedText style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: theme.text, textAlign: "right" }}>{prod.name}</ThemedText>
                            <ThemedText style={{ fontFamily: "Cairo_700Bold", fontSize: 13, color: ADMIN_RED, textAlign: "right" }}>{formatPrice(prod.price)}</ThemedText>
                            {prod.description ? (
                              <ThemedText style={{ fontFamily: "Cairo_400Regular", fontSize: 11, color: theme.textSecondary, textAlign: "right" }} numberOfLines={2}>{prod.description}</ThemedText>
                            ) : null}
                          </View>
                          <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: prod.status === "approved" ? AppColors.success + "20" : prod.status === "pending" ? AppColors.warning + "20" : AppColors.error + "20" }}>
                            <ThemedText style={{ fontFamily: "Cairo_700Bold", fontSize: 10, color: prod.status === "approved" ? AppColors.success : prod.status === "pending" ? AppColors.warning : AppColors.error }}>
                              {prod.status === "approved" ? "نشط" : prod.status === "pending" ? "قيد المراجعة" : "مرفوض"}
                            </ThemedText>
                          </View>
                        </View>
                      ))
                    )}
                  </View>
                </ScrollView>
              </View>
            </View>
          </Modal>
        ) : null}
      </View>
    );
  };

  const renderSettingsTab = () => {
    const currentFee = feesSettings?.serviceFee ?? 500;
    const handleSaveFee = async () => {
      const parsed = parseInt(serviceFeeInput, 10);
      if (isNaN(parsed) || parsed < 0) {
        Alert.alert("خطأ", "الرجاء إدخال قيمة صحيحة");
        return;
      }
      setIsSavingFee(true);
      try {
        const res = await fetch(`${getApiUrl()}/api/admin/settings/fees`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ serviceFee: parsed }),
        });
        if (!res.ok) throw new Error("failed");
        await refetchFees();
        queryClient.invalidateQueries({ queryKey: ["/api/settings/fees"] });
        setServiceFeeInput("");
        Alert.alert("تم", "تم تحديث رسوم الخدمة بنجاح");
      } catch {
        Alert.alert("خطأ", "فشل تحديث رسوم الخدمة");
      } finally {
        setIsSavingFee(false);
      }
    };

    return (
      <View style={{ gap: Spacing.lg }}>
        <ThemedText style={{ fontFamily: "Cairo_700Bold", fontSize: 18, textAlign: "right" }}>إعدادات التطبيق</ThemedText>

        <View style={{ backgroundColor: theme.backgroundSecondary, borderRadius: BorderRadius.lg, padding: Spacing.lg, gap: Spacing.md }}>
          <View style={{ flexDirection: "row-reverse", alignItems: "center", gap: Spacing.sm }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: "#F59E0B20", alignItems: "center", justifyContent: "center" }}>
              <Feather name="dollar-sign" size={20} color={AppColors.warning} />
            </View>
            <View style={{ flex: 1, alignItems: "flex-end" }}>
              <ThemedText style={{ fontFamily: "Cairo_700Bold", fontSize: 15 }}>رسوم الخدمة</ThemedText>
              <ThemedText style={{ fontFamily: "Cairo_400Regular", fontSize: 13, color: theme.textSecondary }}>
                القيمة الحالية: {formatPrice(currentFee)}
              </ThemedText>
            </View>
          </View>

          <View style={{ flexDirection: "row-reverse", gap: Spacing.sm, alignItems: "center" }}>
            <TextInput
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: BorderRadius.md,
                padding: Spacing.md,
                fontFamily: "Cairo_400Regular",
                fontSize: 15,
                color: theme.text,
                backgroundColor: theme.backgroundDefault,
                textAlign: "right",
              }}
              placeholder="أدخل القيمة الجديدة (دينار)"
              placeholderTextColor={theme.textSecondary}
              keyboardType="numeric"
              value={serviceFeeInput}
              onChangeText={setServiceFeeInput}
              testID="input-service-fee"
            />
            <Pressable
              onPress={handleSaveFee}
              disabled={isSavingFee || serviceFeeInput.trim() === ""}
              style={{
                backgroundColor: isSavingFee || serviceFeeInput.trim() === "" ? theme.border : AppColors.warning,
                borderRadius: BorderRadius.md,
                paddingHorizontal: Spacing.lg,
                paddingVertical: Spacing.md,
                alignItems: "center",
                justifyContent: "center",
              }}
              testID="button-save-service-fee"
            >
              {isSavingFee ? (
                <ActivityIndicator size="small" color={AppColors.white} />
              ) : (
                <ThemedText style={{ fontFamily: "Cairo_700Bold", fontSize: 14, color: AppColors.white }}>حفظ</ThemedText>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard": return renderDashboardTab();
      case "banners": return renderBannersTab();
      case "categories": return renderCategoriesTab();
      case "products": return renderProductsTab();
      case "areas": return renderAreasTab();
      case "orders": return renderOrdersTab();
      case "drivers": return renderDriversTab();
      case "promoCodes": return renderPromoCodesTab();
      case "notifications": return renderNotificationsTab();
      case "users": return renderUsersTab();
      case "vendors": return renderVendorsTab();
      case "settings": return renderSettingsTab();
    }
  };

  const ADMIN_RED = AppColors.error;

  const TABS: { key: TabType; label: string; icon: keyof typeof Feather.glyphMap; badge?: number }[] = [
    { key: "dashboard", label: "الرئيسية", icon: "home" },
    { key: "orders", label: "الطلبات", icon: "shopping-bag", badge: adminOrders.filter(o => o.status === "pending").length },
    { key: "drivers", label: "السائقون", icon: "truck", badge: drivers.filter(d => d.status === "pending").length },
    { key: "users", label: "المستخدمون", icon: "users" },
    { key: "banners", label: "البانرات", icon: "image" },
    { key: "categories", label: "الأقسام", icon: "grid" },
    { key: "products", label: "المنتجات", icon: "package" },
    { key: "areas", label: "المناطق", icon: "map-pin" },
    { key: "promoCodes", label: "الخصومات", icon: "tag" },
    { key: "notifications", label: "الإشعارات", icon: "bell" },
    { key: "vendors", label: "المتاجر", icon: "briefcase", badge: vendorPartners.filter((v) => v.status === "pending").length },
    { key: "settings", label: "الإعدادات", icon: "settings" },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: theme.backgroundRoot }}>
      {/* Sticky tab bar */}
      <View style={[styles.adminTabBar, { paddingTop: headerHeight, backgroundColor: theme.backgroundDefault }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.adminTabsRow}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                style={[styles.adminTab, isActive && { borderBottomColor: ADMIN_RED, borderBottomWidth: 2 }]}
                onPress={() => { setActiveTab(tab.key); resetForm(); }}
                testID={`tab-${tab.key}`}
              >
                <View style={{ position: "relative" }}>
                  <Feather name={tab.icon} size={20} color={isActive ? ADMIN_RED : theme.textSecondary} />
                  {tab.badge && tab.badge > 0 ? (
                    <View style={styles.adminTabBadge}>
                      <ThemedText style={{ fontSize: 9, color: AppColors.white, fontFamily: "Cairo_700Bold", lineHeight: 14 }}>{tab.badge > 9 ? "9+" : tab.badge}</ThemedText>
                    </View>
                  ) : null}
                </View>
                <ThemedText style={[styles.adminTabLabel, { color: isActive ? ADMIN_RED : theme.textSecondary }]}>
                  {tab.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={{ height: 1, backgroundColor: theme.border }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: Spacing.lg, paddingBottom: insets.bottom + Spacing.xl, paddingHorizontal: Spacing.lg }}
      >
        {renderContent()}
      </ScrollView>

      {renderAssignDriverModal()}
      {renderTrackingModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Admin tab bar ─────────────────────────────────────────
  adminTabBar: {
    shadowColor: AppColors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 10,
  },
  adminTabsRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.sm,
  },
  adminTab: {
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    minWidth: 64,
    borderBottomColor: "transparent",
    borderBottomWidth: 2,
  },
  adminTabLabel: {
    fontFamily: "Cairo_400Regular",
    fontSize: 10,
  },
  adminTabBadge: {
    position: "absolute",
    top: -5,
    right: -8,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: AppColors.error,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  // ── Legacy (kept for existing tab content) ────────────────
  tabsScroll: { marginBottom: Spacing.lg, flexGrow: 0 },
  tabs: { flexDirection: "row", gap: Spacing.sm, paddingVertical: Spacing.xs },
  tab: {
    minHeight: 48, paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.lg, backgroundColor: AppColors.gray100,
    alignItems: "center", justifyContent: "center", overflow: "visible",
  },
  tabActive: { backgroundColor: AppColors.primary },
  tabText: { color: AppColors.gray500, fontSize: 12 },
  tabTextActive: { color: AppColors.white, fontWeight: FontWeight.semiBold },
  formCard: {
    backgroundColor: AppColors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    shadowColor: AppColors.black,
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
    backgroundColor: AppColors.gray100,
    marginRight: Spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  categoryChipActive: {
    backgroundColor: AppColors.primary,
  },
  categoryChipText: {
    color: AppColors.gray500,
  },
  categoryChipTextActive: {
    color: AppColors.white,
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
    backgroundColor: AppColors.gray100,
    alignItems: "center",
    justifyContent: "center",
  },
  typeButtonActive: {
    backgroundColor: AppColors.primary,
  },
  typeButtonText: {
    color: AppColors.gray500,
  },
  typeButtonTextActive: {
    color: AppColors.white,
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
    color: AppColors.white,
    fontWeight: FontWeight.bold,
    fontSize: 13,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: AppColors.gray100,
    minHeight: 52,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButtonText: {
    color: AppColors.gray500,
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
    backgroundColor: AppColors.error,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  discountText: {
    color: AppColors.white,
    fontSize: 10,
    fontWeight: FontWeight.semiBold,
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
    backgroundColor: AppColors.black,
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
    color: AppColors.white,
    fontWeight: FontWeight.bold,
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
    backgroundColor: AppColors.primary + "0F",
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
    color: AppColors.gray500,
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
    backgroundColor: AppColors.gray50,
    color: AppColors.gray800,
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
    color: AppColors.white,
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
  },
  notifSuccess: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: AppColors.successLight,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: AppColors.successLight,
  },
  notifSuccessText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 14,
    color: AppColors.success,
    flex: 1,
    textAlign: "right",
  },
  notifErrorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: AppColors.errorLight,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: AppColors.error,
  },
  notifErrorText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: AppColors.error,
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
    color: AppColors.gray500,
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
    color: AppColors.gray500,
  },
  userRowDate: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    color: AppColors.gray400,
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
    backgroundColor: AppColors.successLight,
    alignItems: "center",
    justifyContent: "center",
  },
  userRowIndex: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    color: AppColors.gray400,
  },
  usersEmpty: {
    alignItems: "center",
    paddingVertical: Spacing.xl * 2,
    gap: Spacing.md,
  },
  usersEmptyText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 15,
    color: AppColors.gray400,
    textAlign: "center",
  },
  modalOverlay: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: AppColors.overlay,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 999,
  },
  modalBox: {
    width: "85%",
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    shadowColor: AppColors.black,
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
