import React, { useState } from "react";
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
} from "react-native";
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
import { getApiUrl, apiRequest } from "@/lib/query-client";
import { formatPrice } from "@/constants/currency";
import { compressAndConvertToBase64, isBase64Image, ImageSize } from "@/lib/imageUtils";

type TabType = "banners" | "categories" | "products" | "areas" | "orders" | "drivers" | "promoCodes";
type BannerType = "offer" | "slider";
type OrderStatus = "pending" | "confirmed" | "preparing" | "delivering" | "delivered" | "cancelled";

interface AdminOrder {
  id: string;
  phoneNumber: string;
  items: { productId: string; name: string; price: number; quantity: number; image: string }[];
  total: number;
  deliveryFee: number;
  address: string;
  region: string;
  status: OrderStatus;
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

  const [activeTab, setActiveTab] = useState<TabType>("banners");
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

  const [rechargeDriver, setRechargeDriver] = useState<string | null>(null);
  const [rechargeAmount, setRechargeAmount] = useState("");

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
      let imageBase64 = bannerForm.imageUrl;
      
      if (bannerForm.imageUri) {
        imageBase64 = await compressAndConvertToBase64(bannerForm.imageUri, "banner");
      }

      const body = {
        title: bannerForm.title,
        type: bannerForm.type,
        isActive: true,
        image: imageBase64,
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
      let imageBase64 = categoryForm.imageUrl;
      
      if (categoryForm.imageUri) {
        imageBase64 = await compressAndConvertToBase64(categoryForm.imageUri, "category");
      }

      const body = {
        name: categoryForm.name,
        image: imageBase64,
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
    
    const apiUrl = getApiUrl();
    const url = editItem ? `/api/admin/products/${editItem.id}` : "/api/admin/products";
    const fullUrl = `${apiUrl}${url}`;
    
    Alert.alert("بدء الحفظ", `URL: ${fullUrl}\nالاسم: ${productForm.name}\nالسعر: ${productForm.price}`);
    
    setIsSavingProduct(true);
    try {
      let imageBase64 = productForm.imageUrl || null;
      
      if (productForm.imageUri) {
        imageBase64 = await compressAndConvertToBase64(productForm.imageUri, "product");
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
      if (imageBase64) body.image = imageBase64;
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
        Alert.alert("خطأ من الخادم", `Status: ${response.status}\n${responseText}`);
        throw new Error(`${response.status}: ${responseText}`);
      }

      Alert.alert("نجاح!", `تم حفظ المنتج بنجاح\n${responseText.substring(0, 100)}`);
      
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

  const getImageUrl = (image: string) => {
    if (!image) return "";
    if (isBase64Image(image)) return image;
    if (image.startsWith("http")) return image;
    return `${getApiUrl()}${image}`;
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
            <Image source={{ uri: bannerForm.imageUri || getImageUrl(bannerForm.imageUrl) }} style={styles.previewImage} contentFit="cover" />
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
            <Image source={{ uri: getImageUrl(banner.image) }} style={styles.listItemImage} contentFit="cover" />
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
            <Image source={{ uri: categoryForm.imageUri || getImageUrl(categoryForm.imageUrl) }} style={styles.previewImage} contentFit="cover" />
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
            <Image source={{ uri: getImageUrl(category.image) }} style={styles.listItemImage} contentFit="cover" />
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
            <Image source={{ uri: productForm.imageUri || getImageUrl(productForm.imageUrl) }} style={styles.previewImage} contentFit="cover" />
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
            <Image source={{ uri: getImageUrl(product.image) }} style={styles.listItemImage} contentFit="cover" />
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
      delivering: "جاري التوصيل",
      delivered: "تم التوصيل",
      cancelled: "ملغي",
    };
    return labels[status];
  };

  const getStatusColor = (status: OrderStatus) => {
    const colors: Record<OrderStatus, string> = {
      pending: "#F59E0B",
      confirmed: "#3B82F6",
      preparing: "#8B5CF6",
      delivering: "#06B6D4",
      delivered: "#10B981",
      cancelled: "#EF4444",
    };
    return colors[status];
  };

  const renderOrdersTab = () => (
    <View>
      {ownerEarnings ? (
        <View style={[styles.formCard, { backgroundColor: theme.backgroundSecondary, marginBottom: Spacing.lg }]}>
          <ThemedText type="h4" style={{ textAlign: "right", color: theme.text, marginBottom: Spacing.md }}>
            ملخص الأرباح والعمولات
          </ThemedText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm }}>
            <View style={{ flex: 1, minWidth: 140, backgroundColor: "#4CAF5015", padding: Spacing.md, borderRadius: BorderRadius.lg, alignItems: "center" }}>
              <Feather name="dollar-sign" size={22} color="#4CAF50" />
              <ThemedText type="h3" style={{ color: "#4CAF50", marginTop: Spacing.xs }}>{formatPrice(ownerEarnings.totalOwnerEarnings)}</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>أرباحك (العمولات)</ThemedText>
            </View>
            <View style={{ flex: 1, minWidth: 140, backgroundColor: "#2196F315", padding: Spacing.md, borderRadius: BorderRadius.lg, alignItems: "center" }}>
              <Feather name="truck" size={22} color="#2196F3" />
              <ThemedText type="h3" style={{ color: "#2196F3", marginTop: Spacing.xs }}>{formatPrice(ownerEarnings.totalDriverEarnings)}</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>أرباح السائقين</ThemedText>
            </View>
            <View style={{ flex: 1, minWidth: 140, backgroundColor: "#FF962215", padding: Spacing.md, borderRadius: BorderRadius.lg, alignItems: "center" }}>
              <Feather name="package" size={22} color={AppColors.primary} />
              <ThemedText type="h3" style={{ color: AppColors.primary, marginTop: Spacing.xs }}>{ownerEarnings.totalDeliveredOrders}</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>طلبات مكتملة</ThemedText>
            </View>
          </View>
          <View style={{ marginTop: Spacing.md, borderTopWidth: 1, borderTopColor: "#E5E7EB", paddingTop: Spacing.md }}>
            <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "right" }}>
              نظام العمولة: مطاعم (250 د.ع لك / 750 للسائق) | أقسام أخرى (1,000 د.ع لك / 2,000 للسائق)
            </ThemedText>
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

  const renderDriversTab = () => (
    <View>
      <ThemedText type="subtitle" style={styles.formTitle}>
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
        drivers.map((driver) => (
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

  const renderContent = () => {
    switch (activeTab) {
      case "banners": return renderBannersTab();
      case "categories": return renderCategoriesTab();
      case "products": return renderProductsTab();
      case "areas": return renderAreasTab();
      case "orders": return renderOrdersTab();
      case "drivers": return renderDriversTab();
      case "promoCodes": return renderPromoCodesTab();
    }
  };

  return (
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
            { key: "banners", label: "البانرات" },
            { key: "categories", label: "الأقسام" },
            { key: "products", label: "المنتجات" },
            { key: "areas", label: "مناطق التوصيل" },
            { key: "orders", label: "الطلبات" },
            { key: "drivers", label: "السائقين" },
            { key: "promoCodes", label: "أكواد الخصم" },
          ].map((tab) => (
            <Pressable
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => { setActiveTab(tab.key as TabType); resetForm(); }}
            >
              <ThemedText type="body" style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {renderContent()}
    </ScrollView>
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
  },
  tabActive: {
    backgroundColor: AppColors.primary,
  },
  tabText: {
    color: "#6B7280",
    fontSize: 15,
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
    fontSize: 16,
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
    fontSize: 16,
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
    fontSize: 16,
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
    fontSize: 15,
  },
});
