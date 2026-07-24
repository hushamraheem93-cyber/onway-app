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
import { AppColors, FontFamily, BorderRadius } from "@/constants/theme";

const ORANGE = AppColors.primary;
const MAX_IMAGES = 5;
const THUMB_SIZE = 88;
const UNITS = ["قطعة", "كيلو", "غرام", "لتر", "مل", "علبة", "كرتون", "دستة", "باكيج"];

// ─── Types (unchanged) ─────────────────────────────────────────────────────────

interface ExistingImage { type: "existing"; url: string }
interface NewImage      { type: "new";      uri: string }
type ImageEntry = ExistingImage | NewImage;

interface Product {
  id: string; name: string; description?: string;
  price: number; category: string; stock: number;
  unit: string; imageUrl: string; imageUrls?: string[]; status: string;
}

// ─── Screen ────────────────────────────────────────────────────────────────────

export default function VendorEditProductScreen({ navigation, route }: any) {
  const headerHeight = useHeaderHeight();
  const { vendorToken, vendorProfile } = useAuth();

  const product: Product = route.params?.product;
  const businessType = (vendorProfile as any)?.businessType || "other";
  const categories   = CATEGORY_MAP[businessType] || ALL_CATEGORIES;

  const getInitialImages = (): ImageEntry[] => {
    if (product?.imageUrls && product.imageUrls.length > 0) return product.imageUrls.map((url) => ({ type: "existing" as const, url }));
    if (product?.imageUrl) return [{ type: "existing" as const, url: product.imageUrl }];
    return [];
  };

  const [name, setName]             = useState(product?.name || "");
  const [description, setDesc]      = useState(product?.description || "");
  const [price, setPrice]           = useState(product?.price?.toString() || "");
  const [stock, setStock]           = useState(product?.stock?.toString() || "");
  const [category, setCategory]     = useState(product?.category && categories.includes(product.category) ? product.category : categories[0]);
  const [unit, setUnit]             = useState(product?.unit && UNITS.includes(product.unit) ? product.unit : UNITS[0]);
  const [images, setImages]         = useState<ImageEntry[]>(getInitialImages());
  const [error, setError]           = useState("");
  const [loading, setLoading]       = useState(false);
  const [success, setSuccess]       = useState(false);
  const [imagesChanged, setChanged] = useState(false);
  const [dynamicData, setDynamic]   = useState<Record<string, string>>((product as any)?.extraData || {});

  // ── Image helpers (unchanged logic) ──────────────────────────────────────────

  const showImageSourcePicker = (onGallery: () => void, onCamera: () => void) => {
    if (Platform.OS === "web") { onGallery(); return; }
    Alert.alert("إضافة صورة", "اختر مصدر الصورة", [
      { text: "من المعرض", onPress: onGallery },
      { text: "التقاط صورة", onPress: onCamera },
      { text: "إلغاء", style: "cancel" },
    ]);
  };

  const pickImageFromGallery = async () => {
    if (images.length >= MAX_IMAGES) { setError(`الحد الأقصى ${MAX_IMAGES} صور`); return; }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") { setError("يرجى السماح بالوصول إلى مكتبة الصور"); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9, allowsEditing: true, aspect: [1, 1] });
    if (!result.canceled && result.assets[0]) { setImages((p) => [...p, { type: "new", uri: result.assets[0].uri }]); setChanged(true); setError(""); }
  };

  const takePhoto = async () => {
    if (images.length >= MAX_IMAGES) { setError(`الحد الأقصى ${MAX_IMAGES} صور`); return; }
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      if (!permission.canAskAgain && Platform.OS !== "web") { setError("تم رفض إذن الكاميرا — افتح الإعدادات للسماح بالوصول"); try { await Linking.openSettings(); } catch {} }
      else setError("يرجى السماح بالوصول إلى الكاميرا");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.9, allowsEditing: true, aspect: [1, 1] });
    if (!result.canceled && result.assets[0]) { setImages((p) => [...p, { type: "new", uri: result.assets[0].uri }]); setChanged(true); setError(""); }
  };

  const removeImage = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setImages((p) => p.filter((_, i) => i !== index));
    setChanged(true);
  };

  // ── Submit (unchanged logic) ──────────────────────────────────────────────────

  const submit = async () => {
    if (!name.trim() || !price || !category) { setError("يرجى ملء اسم المنتج، السعر، والفئة"); return; }
    if (isNaN(parseFloat(price)) || parseFloat(price) <= 0) { setError("يرجى إدخال سعر صحيح"); return; }
    if (images.length === 0) { setError("يجب أن يكون للمنتج صورة واحدة على الأقل"); return; }
    setError(""); setLoading(true);
    try {
      const formData = new FormData();
      formData.append("name", name.trim());
      formData.append("description", description.trim());
      formData.append("price", price);
      formData.append("category", category);
      formData.append("stock", stock || "0");
      formData.append("unit", unit);
      if (Object.keys(dynamicData).length > 0) formData.append("extraData", JSON.stringify(dynamicData));
      if (imagesChanged) {
        const existingUrls = images.filter((img): img is ExistingImage => img.type === "existing").map((img) => img.url);
        formData.append("existingImages", JSON.stringify(existingUrls));
        for (const img of images.filter((img): img is NewImage => img.type === "new")) {
          const filename = img.uri.split("/").pop() || "product.jpg";
          const ext = filename.split(".").pop()?.toLowerCase() || "jpg";
          formData.append("images", { uri: img.uri, name: filename, type: ext === "png" ? "image/png" : "image/jpeg" } as any);
        }
      }
      const res = await fetch(new URL(`/api/vendor/products/${product.id}`, getApiUrl()).toString(), {
        method: "PUT",
        headers: { Authorization: `Bearer ${vendorToken}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "حدث خطأ في تحديث المنتج"); return; }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSuccess(true);
    } catch (err: any) { setError(err.message || "تعذر الاتصال بالخادم"); }
    finally { setLoading(false); }
  };

  // ── Success state ──────────────────────────────────────────────────────────────

  if (success) {
    return (
      <View style={[s.successWrap, { paddingTop: headerHeight + 40 }]}>
        <View style={[s.successIcon, { backgroundColor: AppColors.secondary }]}>
          <MaterialCommunityIcons name="check-circle" size={64} color={ORANGE} />
        </View>
        <ThemedText style={s.successTitle}>تم تحديث المنتج بنجاح!</ThemedText>
        <ThemedText style={s.successDesc}>
          {imagesChanged ? "المنتج الآن قيد المراجعة من الإدارة وسيظهر للزبائن بعد الموافقة" : "تم حفظ التغييرات بنجاح"}
        </ThemedText>
        <Pressable style={[s.submitBtn, { backgroundColor: AppColors.gray100 }]} onPress={() => navigation.navigate("VendorProducts")} testID="button-view-products">
          <ThemedText style={[s.submitText, { color: AppColors.gray700 }]}>عرض منتجاتي</ThemedText>
        </Pressable>
      </View>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────────

  return (
    <KeyboardAwareScrollView
      style={s.container}
      contentContainerStyle={{ paddingTop: headerHeight + 16, paddingHorizontal: 16, paddingBottom: 60 }}
      showsVerticalScrollIndicator={false}
    >
      {error ? (
        <View style={s.errorBox}>
          <Feather name="alert-circle" size={16} color={AppColors.error} />
          <ThemedText style={s.errorText}>{error}</ThemedText>
        </View>
      ) : null}

      {/* ── Images section ── */}
      <View style={s.sectionCard}>
        <View style={s.sectionHeader}>
          <MaterialCommunityIcons name="image-multiple-outline" size={18} color={ORANGE} />
          <ThemedText style={s.sectionTitle}>صور المنتج</ThemedText>
          <ThemedText style={s.sectionHint}>(حتى {MAX_IMAGES} صور، الأولى رئيسية)</ThemedText>
        </View>

        {images.length > 0 ? (
          <View style={s.heroWrap}>
            <Image
              source={{ uri: images[0].type === "existing" ? resolveImageUrl(images[0].url) : images[0].uri }}
              style={s.heroImage}
              contentFit="cover"
            />
            <View style={[s.heroBadge, { backgroundColor: ORANGE }]}>
              <Feather name="star" size={11} color={AppColors.white} />
              <ThemedText style={s.heroBadgeText}>الصورة الرئيسية</ThemedText>
            </View>
            <Pressable style={s.heroRemoveBtn} onPress={() => removeImage(0)} testID="button-remove-image-0">
              <Feather name="x" size={14} color={AppColors.white} />
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={s.heroPlaceholder}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); showImageSourcePicker(pickImageFromGallery, takePhoto); }}
            testID="button-add-image"
          >
            <MaterialCommunityIcons name="camera-plus-outline" size={44} color={ORANGE + "60"} />
            <ThemedText style={[s.heroPlaceholderTitle, { color: ORANGE }]}>اضغط لإضافة صورة المنتج</ThemedText>
            <ThemedText style={s.heroPlaceholderSub}>من الكاميرا أو معرض الصور</ThemedText>
          </Pressable>
        )}

        {images.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.thumbRowContent}>
            {images.slice(1).map((img, i) => {
              const index = i + 1;
              const uri = img.type === "existing" ? resolveImageUrl(img.url) : img.uri;
              return (
                <View key={`${img.type}-${index}`} style={s.thumbWrap} testID={`image-thumb-${index}`}>
                  <Image source={{ uri }} style={s.thumb} contentFit="cover" />
                  <Pressable style={s.removeBtn} onPress={() => removeImage(index)} testID={`button-remove-image-${index}`}>
                    <Feather name="x" size={11} color={AppColors.white} />
                  </Pressable>
                </View>
              );
            })}
            {images.length < MAX_IMAGES && (
              <Pressable
                style={s.addThumbBtn}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); showImageSourcePicker(pickImageFromGallery, takePhoto); }}
                testID="button-add-extra-image"
              >
                <MaterialCommunityIcons name="plus" size={24} color={ORANGE} />
                <ThemedText style={[s.addThumbText, { color: ORANGE }]}>إضافة</ThemedText>
              </Pressable>
            )}
          </ScrollView>
        )}

        <View style={s.imgActions}>
          <Pressable style={s.imgActionBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); takePhoto(); }} testID="button-take-photo">
            <Feather name="camera" size={16} color={ORANGE} />
            <ThemedText style={[s.imgActionText, { color: ORANGE }]}>التقاط صورة</ThemedText>
          </Pressable>
          <View style={[s.imgActionDivider, { backgroundColor: AppColors.divider }]} />
          <Pressable style={s.imgActionBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); pickImageFromGallery(); }} testID="button-pick-image">
            <Feather name="image" size={16} color={ORANGE} />
            <ThemedText style={[s.imgActionText, { color: ORANGE }]}>من المعرض</ThemedText>
          </Pressable>
        </View>

        {imagesChanged && (
          <View style={[s.noticeBox, { backgroundColor: AppColors.warningLight, borderColor: AppColors.warning + "40" }]}>
            <MaterialCommunityIcons name="information-outline" size={14} color={AppColors.warning} />
            <ThemedText style={[s.noticeText, { color: AppColors.primaryDark }]}>تغيير الصور سيُعيد المنتج لقائمة المراجعة</ThemedText>
          </View>
        )}
      </View>

      {/* ── Info section ── */}
      <View style={s.sectionCard}>
        <View style={s.sectionHeader}>
          <MaterialCommunityIcons name="text-box-outline" size={18} color={ORANGE} />
          <ThemedText style={s.sectionTitle}>معلومات المنتج</ThemedText>
        </View>

        <ThemedText style={s.label}>اسم المنتج <ThemedText style={{ color: ORANGE }}>*</ThemedText></ThemedText>
        <TextInput style={s.input} value={name} onChangeText={setName} placeholder="اسم المنتج" placeholderTextColor={AppColors.gray300} testID="input-name" />

        <ThemedText style={s.label}>وصف المنتج</ThemedText>
        <TextInput style={[s.input, s.textArea]} value={description} onChangeText={setDesc} placeholder="وصف مختصر عن المنتج..." placeholderTextColor={AppColors.gray300} multiline numberOfLines={3} testID="input-description" />
      </View>

      {/* ── Pricing & stock section ── */}
      <View style={s.sectionCard}>
        <View style={s.sectionHeader}>
          <MaterialCommunityIcons name="currency-usd" size={18} color={ORANGE} />
          <ThemedText style={s.sectionTitle}>السعر والمخزون</ThemedText>
        </View>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <ThemedText style={s.label}>السعر (دينار) <ThemedText style={{ color: ORANGE }}>*</ThemedText></ThemedText>
            <TextInput style={s.input} value={price} onChangeText={setPrice} placeholder="5000" placeholderTextColor={AppColors.gray300} keyboardType="numeric" testID="input-price" />
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText style={s.label}>المخزون</ThemedText>
            <TextInput style={s.input} value={stock} onChangeText={setStock} placeholder="100" placeholderTextColor={AppColors.gray300} keyboardType="numeric" testID="input-stock" />
          </View>
        </View>
      </View>

      {/* ── Category & unit section ── */}
      <View style={s.sectionCard}>
        <View style={s.sectionHeader}>
          <MaterialCommunityIcons name="tag-outline" size={18} color={ORANGE} />
          <ThemedText style={s.sectionTitle}>الفئة والوحدة</ThemedText>
        </View>
        <ThemedText style={s.label}>القسم / الفئة <ThemedText style={{ color: ORANGE }}>*</ThemedText></ThemedText>
        <View style={s.pickerWrap}>
          <Picker selectedValue={category} onValueChange={setCategory} style={s.picker}>
            {categories.map((c) => <Picker.Item key={c} label={c} value={c} />)}
          </Picker>
        </View>

        <DynamicProductFields businessType={businessType} values={dynamicData} onChange={(key, value) => setDynamic((p) => ({ ...p, [key]: value }))} />

        <ThemedText style={s.label}>وحدة القياس</ThemedText>
        <View style={s.pickerWrap}>
          <Picker selectedValue={unit} onValueChange={setUnit} style={s.picker}>
            {UNITS.map((u) => <Picker.Item key={u} label={u} value={u} />)}
          </Picker>
        </View>
      </View>

      {/* Submit */}
      <Pressable style={[s.submitBtn, loading && { opacity: 0.6 }]} onPress={submit} disabled={loading} testID="button-submit">
        {loading
          ? <ActivityIndicator color={AppColors.white} />
          : <><Feather name="save" size={18} color={AppColors.white} /><ThemedText style={s.submitText}>حفظ التعديلات</ThemedText></>}
      </Pressable>
    </KeyboardAwareScrollView>
  );
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: AppColors.background },
  sectionCard:{ backgroundColor: AppColors.white, borderRadius: 20, padding: 16, marginBottom: 14, shadowColor: AppColors.black, shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  sectionHeader:{ flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 14 },
  sectionTitle: { fontFamily: FontFamily.cairoBold, fontSize: 15, color: AppColors.gray800, flex: 1, textAlign: "right" },
  sectionHint:  { fontFamily: FontFamily.tajawal, fontSize: 11, color: AppColors.gray400 },
  label:        { fontFamily: FontFamily.cairoBold, fontSize: 13, color: AppColors.gray700, textAlign: "right", marginBottom: 6, marginTop: 4 },
  input:        { borderWidth: 1.5, borderColor: AppColors.divider, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontFamily: FontFamily.tajawal, fontSize: 16, color: AppColors.black, textAlign: "right", marginBottom: 14, backgroundColor: AppColors.white },
  textArea:     { minHeight: 80, textAlignVertical: "top", paddingTop: 10 },
  pickerWrap:   { borderWidth: 1.5, borderColor: AppColors.divider, borderRadius: 12, marginBottom: 14, backgroundColor: AppColors.white, overflow: "hidden" },
  picker:       { height: Platform.OS === "ios" ? 140 : 50, color: AppColors.black },
  heroWrap:     { width: "100%", height: 220, borderRadius: 16, overflow: "hidden", marginBottom: 10, position: "relative", backgroundColor: AppColors.secondary },
  heroImage:    { width: "100%", height: "100%" },
  heroBadge:    { position: "absolute", bottom: 10, right: 10, flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  heroBadgeText:{ fontFamily: FontFamily.cairoBold, fontSize: 11, color: AppColors.white },
  heroRemoveBtn:{ position: "absolute", top: 10, left: 10, width: 30, height: 30, borderRadius: 15, backgroundColor: AppColors.overlay, alignItems: "center", justifyContent: "center" },
  heroPlaceholder:{ width: "100%", height: 200, borderRadius: 16, borderWidth: 2, borderStyle: "dashed", borderColor: AppColors.primaryLight, backgroundColor: AppColors.secondary, alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 10 },
  heroPlaceholderTitle:{ fontFamily: FontFamily.cairoBold, fontSize: 15 },
  heroPlaceholderSub:  { fontFamily: FontFamily.tajawal, fontSize: 12, color: AppColors.gray400 },
  thumbRowContent: { flexDirection: "row", gap: 10, paddingVertical: 4, paddingHorizontal: 2, marginBottom: 10 },
  thumbWrap:    { width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: 12, overflow: "visible", position: "relative" },
  thumb:        { width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: 12, borderWidth: 2, borderColor: AppColors.primaryLight },
  removeBtn:    { position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: AppColors.error, alignItems: "center", justifyContent: "center", zIndex: 10 },
  addThumbBtn:  { width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: 12, borderWidth: 2, borderStyle: "dashed", borderColor: AppColors.primaryLight, backgroundColor: AppColors.secondary, alignItems: "center", justifyContent: "center", gap: 4 },
  addThumbText: { fontFamily: FontFamily.cairoBold, fontSize: 11 },
  imgActions:   { flexDirection: "row", borderWidth: 1.5, borderColor: AppColors.divider, borderRadius: 14, overflow: "hidden", marginTop: 10, backgroundColor: AppColors.white },
  imgActionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12 },
  imgActionDivider: { width: 1.5 },
  imgActionText:{ fontFamily: FontFamily.cairoBold, fontSize: 13 },
  noticeBox:    { flexDirection: "row-reverse", alignItems: "center", gap: 6, borderRadius: 10, padding: 10, marginTop: 10, borderWidth: 1 },
  noticeText:   { fontFamily: FontFamily.tajawal, fontSize: 12, flex: 1, textAlign: "right" },
  errorBox:     { flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: AppColors.errorLight, borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: AppColors.error },
  errorText:    { fontFamily: FontFamily.tajawal, fontSize: 13, color: AppColors.error, flex: 1, textAlign: "right" },
  submitBtn:    { backgroundColor: ORANGE, borderRadius: 16, paddingVertical: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 20 },
  submitText:   { fontFamily: FontFamily.cairoBold, fontSize: 16, color: AppColors.white },
  successWrap:  { flex: 1, backgroundColor: AppColors.white, alignItems: "center", paddingHorizontal: 28, paddingBottom: 60, gap: 16 },
  successIcon:  { width: 100, height: 100, borderRadius: 28, justifyContent: "center", alignItems: "center", marginBottom: 8 },
  successTitle: { fontFamily: FontFamily.cairoBold, fontSize: 22, color: AppColors.gray700, textAlign: "center" },
  successDesc:  { fontFamily: FontFamily.tajawal, fontSize: 14, color: AppColors.gray500, textAlign: "center", lineHeight: 24 },
});
