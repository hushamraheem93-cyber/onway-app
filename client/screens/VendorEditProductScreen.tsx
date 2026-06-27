import React, { useState } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  Platform,
  Linking,
  ScrollView,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { Picker } from "@react-native-picker/picker";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import { resolveImageUrl } from "@/utils/imageUtils";
import { CATEGORY_MAP, ALL_CATEGORIES } from "@/constants/businessCategories";
import DynamicProductFields from "@/components/DynamicProductFields";
import { AppColors } from "@/constants/theme";

const PURPLE = AppColors.vendorPurple;
const ORANGE = AppColors.primary;
const MAX_IMAGES = 5;
const THUMB_SIZE = 88;
const UNITS = ["قطعة", "كيلو", "غرام", "لتر", "مل", "علبة", "كرتون", "دستة", "باكيج"];

interface ExistingImage {
  type: "existing";
  url: string;
}
interface NewImage {
  type: "new";
  uri: string;
}
type ImageEntry = ExistingImage | NewImage;

interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  category: string;
  stock: number;
  unit: string;
  imageUrl: string;
  imageUrls?: string[];
  status: string;
}

export default function VendorEditProductScreen({ navigation, route }: any) {
  const headerHeight = useHeaderHeight();
  const { vendorToken, vendorProfile } = useAuth();

  const product: Product = route.params?.product;
  const businessType = (vendorProfile as any)?.businessType || "other";
  const categories = CATEGORY_MAP[businessType] || ALL_CATEGORIES;

  const getInitialImages = (): ImageEntry[] => {
    if (product?.imageUrls && product.imageUrls.length > 0) {
      return product.imageUrls.map((url) => ({ type: "existing" as const, url }));
    }
    if (product?.imageUrl) {
      return [{ type: "existing" as const, url: product.imageUrl }];
    }
    return [];
  };

  const [name, setName] = useState(product?.name || "");
  const [description, setDescription] = useState(product?.description || "");
  const [price, setPrice] = useState(product?.price?.toString() || "");
  const [stock, setStock] = useState(product?.stock?.toString() || "");
  const [category, setCategory] = useState(
    product?.category && categories.includes(product.category)
      ? product.category
      : categories[0]
  );
  const [unit, setUnit] = useState(
    product?.unit && UNITS.includes(product.unit) ? product.unit : UNITS[0]
  );
  const [images, setImages] = useState<ImageEntry[]>(getInitialImages());
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [imagesChanged, setImagesChanged] = useState(false);
  const [dynamicData, setDynamicData] = useState<Record<string, string>>((product as any)?.extraData || {});

  const showImageSourcePicker = (onGallery: () => void, onCamera: () => void) => {
    if (Platform.OS === "web") {
      onGallery();
      return;
    }
    Alert.alert(
      "إضافة صورة",
      "اختر مصدر الصورة",
      [
        { text: "من المعرض", onPress: onGallery },
        { text: "التقاط صورة", onPress: onCamera },
        { text: "إلغاء", style: "cancel" },
      ]
    );
  };

  const pickImageFromGallery = async () => {
    if (images.length >= MAX_IMAGES) {
      setError(`الحد الأقصى ${MAX_IMAGES} صور`);
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      setError("يرجى السماح بالوصول إلى مكتبة الصور");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.9,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled && result.assets[0]) {
      setImages((prev) => [...prev, { type: "new", uri: result.assets[0].uri }]);
      setImagesChanged(true);
      setError("");
    }
  };

  const takePhoto = async () => {
    if (images.length >= MAX_IMAGES) {
      setError(`الحد الأقصى ${MAX_IMAGES} صور`);
      return;
    }
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      if (!permission.canAskAgain && Platform.OS !== "web") {
        setError("تم رفض إذن الكاميرا — افتح الإعدادات للسماح بالوصول");
        try { await Linking.openSettings(); } catch {}
      } else {
        setError("يرجى السماح بالوصول إلى الكاميرا");
      }
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.9,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled && result.assets[0]) {
      setImages((prev) => [...prev, { type: "new", uri: result.assets[0].uri }]);
      setImagesChanged(true);
      setError("");
    }
  };

  const removeImage = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setImages((prev) => prev.filter((_, i) => i !== index));
    setImagesChanged(true);
  };

  const submit = async () => {
    if (!name.trim() || !price || !category) {
      setError("يرجى ملء اسم المنتج، السعر، والفئة");
      return;
    }
    if (isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
      setError("يرجى إدخال سعر صحيح");
      return;
    }
    if (images.length === 0) {
      setError("يجب أن يكون للمنتج صورة واحدة على الأقل");
      return;
    }
    setError("");
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("name", name.trim());
      formData.append("description", description.trim());
      formData.append("price", price);
      formData.append("category", category);
      formData.append("stock", stock || "0");
      formData.append("unit", unit);
      if (Object.keys(dynamicData).length > 0) {
        formData.append("extraData", JSON.stringify(dynamicData));
      }

      if (imagesChanged) {
        const existingUrls = images
          .filter((img): img is ExistingImage => img.type === "existing")
          .map((img) => img.url);
        formData.append("existingImages", JSON.stringify(existingUrls));

        const newImages = images.filter((img): img is NewImage => img.type === "new");
        for (const img of newImages) {
          const filename = img.uri.split("/").pop() || "product.jpg";
          const ext = filename.split(".").pop()?.toLowerCase() || "jpg";
          const mimeType = ext === "png" ? "image/png" : "image/jpeg";
          formData.append("images", {
            uri: img.uri,
            name: filename,
            type: mimeType,
          } as any);
        }
      }

      const url = new URL(`/api/vendor/products/${product.id}`, getApiUrl()).toString();
      const res = await fetch(url, {
        method: "PUT",
        headers: { Authorization: `Bearer ${vendorToken}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "حدث خطأ في تحديث المنتج");
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "تعذر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <View style={[styles.successWrap, { paddingTop: headerHeight + 40 }]}>
        <View style={styles.successIcon}>
          <MaterialCommunityIcons name="check-circle" size={64} color={PURPLE} />
        </View>
        <ThemedText style={styles.successTitle}>تم تحديث المنتج بنجاح!</ThemedText>
        <ThemedText style={styles.successDesc}>
          {imagesChanged
            ? "المنتج الآن قيد المراجعة من الإدارة وسيظهر للزبائن بعد الموافقة"
            : "تم حفظ التغييرات بنجاح"}
        </ThemedText>
        <View style={styles.successActions}>
          <Pressable
            style={[styles.successBtn, { backgroundColor: AppColors.gray100 }]}
            onPress={() => navigation.navigate("VendorProducts")}
            testID="button-view-products"
          >
            <ThemedText style={[styles.successBtnText, { color: AppColors.gray700 }]}>عرض منتجاتي</ThemedText>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAwareScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: headerHeight + 16, paddingHorizontal: 16, paddingBottom: 60 }}
      showsVerticalScrollIndicator={false}
    >
      {error ? (
        <View style={styles.errorBox}>
          <Feather name="alert-circle" size={16} color={AppColors.error} />
          <ThemedText style={styles.errorText}>{error}</ThemedText>
        </View>
      ) : null}

      <ThemedText style={styles.label}>
        صور المنتج
        <ThemedText style={styles.labelHint}> (حتى {MAX_IMAGES} صور، الأولى هي الصورة الرئيسية)</ThemedText>
      </ThemedText>

      {/* ── Large primary image preview ── */}
      {images.length > 0 ? (
        <View style={styles.heroWrap}>
          <Image
            source={{ uri: images[0].type === "existing" ? resolveImageUrl(images[0].url) : images[0].uri }}
            style={styles.heroImage}
            contentFit="cover"
          />
          <View style={styles.heroBadge}>
            <Feather name="star" size={11} color={AppColors.white} />
            <ThemedText style={styles.heroBadgeText}>الصورة الرئيسية</ThemedText>
          </View>
          <Pressable style={styles.heroRemoveBtn} onPress={() => removeImage(0)} testID="button-remove-image-0">
            <Feather name="x" size={14} color={AppColors.white} />
          </Pressable>
        </View>
      ) : (
        <Pressable
          style={styles.heroPlaceholder}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            showImageSourcePicker(pickImageFromGallery, takePhoto);
          }}
          testID="button-add-image"
        >
          <MaterialCommunityIcons name="camera-plus-outline" size={44} color={AppColors.vendorPurpleLight} />
          <ThemedText style={styles.heroPlaceholderTitle}>اضغط لإضافة صورة المنتج</ThemedText>
          <ThemedText style={styles.heroPlaceholderSub}>من الكاميرا أو معرض الصور</ThemedText>
        </Pressable>
      )}

      {/* ── Extra images thumbnail strip (images 2–5) ── */}
      {images.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbRow} contentContainerStyle={styles.thumbRowContent}>
          {images.slice(1).map((img, i) => {
            const index = i + 1;
            const uri = img.type === "existing" ? resolveImageUrl(img.url) : img.uri;
            return (
              <View key={`${img.type}-${index}`} style={styles.thumbWrap} testID={`image-thumb-${index}`}>
                <Image source={{ uri }} style={styles.thumb} contentFit="cover" />
                <Pressable style={styles.removeBtn} onPress={() => removeImage(index)} testID={`button-remove-image-${index}`}>
                  <Feather name="x" size={11} color={AppColors.white} />
                </Pressable>
              </View>
            );
          })}
          {images.length < MAX_IMAGES ? (
            <Pressable
              style={styles.addThumbBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                showImageSourcePicker(pickImageFromGallery, takePhoto);
              }}
              testID="button-add-extra-image"
            >
              <MaterialCommunityIcons name="plus" size={24} color={AppColors.vendorPurpleLight} />
              <ThemedText style={styles.addThumbText}>إضافة</ThemedText>
            </Pressable>
          ) : null}
        </ScrollView>
      ) : null}

      <View style={styles.imgActions}>
        <Pressable style={styles.imgActionBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); takePhoto(); }} testID="button-take-photo">
          <Feather name="camera" size={16} color={PURPLE} />
          <ThemedText style={styles.imgActionText}>التقاط صورة</ThemedText>
        </Pressable>
        <View style={styles.imgActionDivider} />
        <Pressable style={styles.imgActionBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); pickImageFromGallery(); }} testID="button-pick-image">
          <Feather name="image" size={16} color={PURPLE} />
          <ThemedText style={styles.imgActionText}>من المعرض</ThemedText>
        </Pressable>
      </View>

      {imagesChanged ? (
        <View style={styles.imageChangeNotice}>
          <MaterialCommunityIcons name="information-outline" size={14} color={AppColors.statusPurple} />
          <ThemedText style={styles.imageChangeText}>
            تغيير الصور سيُعيد المنتج لقائمة المراجعة
          </ThemedText>
        </View>
      ) : null}

      <ThemedText style={styles.label}>
        اسم المنتج <ThemedText style={{ color: ORANGE }}>*</ThemedText>
      </ThemedText>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="اسم المنتج"
        placeholderTextColor={AppColors.gray300}
        testID="input-name"
      />

      <ThemedText style={styles.label}>وصف المنتج</ThemedText>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={description}
        onChangeText={setDescription}
        placeholder="وصف مختصر عن المنتج..."
        placeholderTextColor={AppColors.gray300}
        multiline
        numberOfLines={3}
        testID="input-description"
      />

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.label}>
            السعر (دينار) <ThemedText style={{ color: ORANGE }}>*</ThemedText>
          </ThemedText>
          <TextInput
            style={styles.input}
            value={price}
            onChangeText={setPrice}
            placeholder="5000"
            placeholderTextColor={AppColors.gray300}
            keyboardType="numeric"
            testID="input-price"
          />
        </View>
        <View style={{ width: 12 }} />
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.label}>المخزون</ThemedText>
          <TextInput
            style={styles.input}
            value={stock}
            onChangeText={setStock}
            placeholder="100"
            placeholderTextColor={AppColors.gray300}
            keyboardType="numeric"
            testID="input-stock"
          />
        </View>
      </View>

      <ThemedText style={styles.label}>
        القسم / الفئة <ThemedText style={{ color: ORANGE }}>*</ThemedText>
      </ThemedText>
      <View style={styles.pickerWrap}>
        <Picker selectedValue={category} onValueChange={setCategory} style={styles.picker}>
          {categories.map((c) => (
            <Picker.Item key={c} label={c} value={c} />
          ))}
        </Picker>
      </View>

      <DynamicProductFields
        businessType={businessType}
        values={dynamicData}
        onChange={(key, value) => setDynamicData((prev) => ({ ...prev, [key]: value }))}
      />

      <ThemedText style={styles.label}>وحدة القياس</ThemedText>
      <View style={styles.pickerWrap}>
        <Picker selectedValue={unit} onValueChange={setUnit} style={styles.picker}>
          {UNITS.map((u) => (
            <Picker.Item key={u} label={u} value={u} />
          ))}
        </Picker>
      </View>

      <Pressable
        style={[styles.submitBtn, loading && styles.submitDisabled]}
        onPress={submit}
        disabled={loading}
        testID="button-submit"
      >
        {loading ? (
          <ActivityIndicator color={AppColors.white} />
        ) : (
          <>
            <Feather name="save" size={18} color={AppColors.white} />
            <ThemedText style={styles.submitText}>حفظ التعديلات</ThemedText>
          </>
        )}
      </Pressable>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AppColors.vendorPurpleLight },
  label: {
    fontFamily: "Cairo_700Bold", fontSize: 13, color: AppColors.gray700,
    textAlign: "right", marginBottom: 6, marginTop: 4,
  },
  labelHint: { fontFamily: "Cairo_400Regular", fontSize: 11, color: AppColors.gray500 },
  input: {
    borderWidth: 1.5, borderColor: AppColors.divider, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11,
    fontFamily: "Cairo_400Regular", fontSize: 14, color: AppColors.black,
    textAlign: "right", marginBottom: 14, backgroundColor: AppColors.white,
  },
  textArea: { minHeight: 80, textAlignVertical: "top", paddingTop: 10 },
  row: { flexDirection: "row" },
  pickerWrap: {
    borderWidth: 1.5, borderColor: AppColors.divider, borderRadius: 12,
    marginBottom: 14, backgroundColor: AppColors.white, overflow: "hidden",
  },
  picker: { height: Platform.OS === "ios" ? 140 : 50, color: AppColors.black },
  /* ── Hero image preview ── */
  heroWrap: {
    width: "100%",
    height: 220,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 10,
    position: "relative",
    backgroundColor: AppColors.vendorPurpleLight,
  },
  heroImage: { width: "100%", height: "100%" },
  heroBadge: {
    position: "absolute",
    bottom: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: PURPLE,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  heroBadgeText: { fontFamily: "Cairo_700Bold", fontSize: 11, color: AppColors.white },
  heroRemoveBtn: {
    position: "absolute",
    top: 10,
    left: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: AppColors.overlay,
    alignItems: "center",
    justifyContent: "center",
  },
  heroPlaceholder: {
    width: "100%",
    height: 200,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: AppColors.vendorPurpleLight,
    backgroundColor: AppColors.vendorPurpleLight,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 10,
  },
  heroPlaceholderTitle: { fontFamily: "Cairo_700Bold", fontSize: 15, color: PURPLE },
  heroPlaceholderSub: { fontFamily: "Cairo_400Regular", fontSize: 12, color: AppColors.gray400 },
  /* ── Extra thumbnails strip ── */
  thumbRow: { marginBottom: 0 },
  thumbRowContent: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  thumbWrap: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 12,
    overflow: "visible",
    position: "relative",
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: AppColors.vendorPurpleLight,
  },
  removeBtn: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: AppColors.error,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  addThumbBtn: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: AppColors.vendorPurpleLight,
    backgroundColor: AppColors.vendorPurpleLight,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  addThumbText: {
    fontFamily: "Cairo_700Bold", fontSize: 11, color: PURPLE,
  },
  imgActions: {
    flexDirection: "row", borderWidth: 1.5, borderColor: AppColors.vendorPurpleLight,
    borderRadius: 16,
    overflow: "hidden", marginBottom: 10, marginTop: 10, backgroundColor: AppColors.white,
  },
  imgActionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 12,
  },
  imgActionDivider: { width: 1.5, backgroundColor: AppColors.vendorPurpleLight },
  imgActionText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: PURPLE },
  imageChangeNotice: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: AppColors.vendorPurpleLight, borderRadius: 10, padding: 10, marginBottom: 14,
  },
  imageChangeText: {
    fontFamily: "Cairo_400Regular", fontSize: 12, color: AppColors.statusPurple,
    flex: 1, textAlign: "right",
  },
  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: AppColors.errorLight, borderRadius: 10,
    padding: 12, marginBottom: 14, borderWidth: 1, borderColor: AppColors.error,
  },
  errorText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: AppColors.error, flex: 1, textAlign: "right" },
  submitBtn: {
    backgroundColor: PURPLE, borderRadius: 14, paddingVertical: 14,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: AppColors.white },
  successWrap: {
    flex: 1, backgroundColor: AppColors.white, alignItems: "center",
    paddingHorizontal: 28, paddingBottom: 60,
  },
  successIcon: {
    width: 100, height: 100, borderRadius: 28,
    backgroundColor: AppColors.vendorPurpleLight, justifyContent: "center", alignItems: "center", marginBottom: 24,
  },
  successTitle: { fontFamily: "Cairo_700Bold", fontSize: 22, color: AppColors.gray700, textAlign: "center", marginBottom: 10 },
  successDesc: { fontFamily: "Cairo_400Regular", fontSize: 14, color: AppColors.gray500, textAlign: "center", lineHeight: 24, marginBottom: 32 },
  successActions: { width: "100%", gap: 12 },
  successBtn: { paddingVertical: 14, borderRadius: 14, alignItems: "center" },
  successBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: AppColors.white },
});
