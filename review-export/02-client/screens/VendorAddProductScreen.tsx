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
  Dimensions,
} from "react-native";
import { Image } from "expo-image";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { Picker } from "@react-native-picker/picker";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import { CATEGORY_MAP, ALL_CATEGORIES, PRODUCT_NAME_PLACEHOLDER } from "@/constants/businessCategories";
import DynamicProductFields from "@/components/DynamicProductFields";
import { AppColors } from "@/constants/theme";

const ORANGE = AppColors.primary;
const ORANGE_LIGHT = AppColors.secondary;
const AMBER = AppColors.warning;
const MAX_IMAGES = 5;
const THUMB_SIZE = 88;
const UNITS = ["قطعة", "كيلو", "غرام", "لتر", "مل", "علبة", "كرتون", "دستة", "باكيج"];

export default function VendorAddProductScreen({ navigation }: any) {
  const headerHeight = useHeaderHeight();
  const { vendorToken, vendorProfile } = useAuth();

  const businessType = (vendorProfile as any)?.businessType || "other";
  const categories = CATEGORY_MAP[businessType] || ALL_CATEGORIES;
  const isPending = vendorProfile?.status === "pending";

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [category, setCategory] = useState(categories[0]);
  const [unit, setUnit] = useState(UNITS[0]);
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [dynamicData, setDynamicData] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

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
    if (imageUris.length >= MAX_IMAGES) {
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
      setImageUris((prev) => [...prev, result.assets[0].uri]);
      setError("");
    }
  };

  const takePhoto = async () => {
    if (imageUris.length >= MAX_IMAGES) {
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
      setImageUris((prev) => [...prev, result.assets[0].uri]);
      setError("");
    }
  };

  const removeImage = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setImageUris((prev) => prev.filter((_, i) => i !== index));
  };

  const submit = async () => {
    if (!name.trim() || !price || !category || imageUris.length === 0) {
      setError("يرجى ملء اسم المنتج، السعر، الفئة، ورفع صورة واحدة على الأقل");
      return;
    }
    if (isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
      setError("يرجى إدخال سعر صحيح");
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

      const compressedUris = await Promise.all(
        imageUris.map(async (uri) => {
          try {
            const result = await manipulateAsync(
              uri,
              [{ resize: { width: 800 } }],
              { compress: 0.72, format: SaveFormat.WEBP }
            );
            return result.uri;
          } catch {
            return uri;
          }
        })
      );

      for (const uri of compressedUris) {
        const filename = uri.split("/").pop() || "product.webp";
        formData.append("images", {
          uri,
          name: filename,
          type: "image/webp",
        } as any);
      }

      const res = await fetch(new URL("/api/vendor/products", getApiUrl()).toString(), {
        method: "POST",
        headers: { Authorization: `Bearer ${vendorToken}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "حدث خطأ في إضافة المنتج");
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
          <MaterialCommunityIcons name="check-circle" size={64} color={ORANGE} />
        </View>
        <ThemedText style={styles.successTitle}>تم إضافة المنتج بنجاح!</ThemedText>
        <ThemedText style={styles.successDesc}>
          {isPending
            ? "منتجك محفوظ — سيُراجع بعد تفعيل متجرك وموافقة الإدارة"
            : "سيراجع الفريق منتجك خلال 24 ساعة ويظهر للزبائن بعد الموافقة"}
        </ThemedText>
        <View style={styles.successActions}>
          <Pressable
            style={[styles.successBtn, { backgroundColor: ORANGE }]}
            onPress={() => {
              setSuccess(false);
              setName(""); setDescription(""); setPrice(""); setStock("");
              setCategory(categories[0]); setUnit(UNITS[0]); setImageUris([]);
            }}
            testID="button-add-another"
          >
            <ThemedText style={styles.successBtnText}>إضافة منتج آخر</ThemedText>
          </Pressable>
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
      {isPending ? (
        <View style={styles.pendingBanner}>
          <MaterialCommunityIcons name="clock-alert-outline" size={18} color={AMBER} />
          <ThemedText style={styles.pendingBannerText}>
            متجرك قيد المراجعة — يمكنك إعداد منتجاتك الآن، وستظهر للزبائن بعد تفعيل حسابك
          </ThemedText>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorBox}>
          <Feather name="alert-circle" size={16} color={AppColors.error} />
          <ThemedText style={styles.errorText}>{error}</ThemedText>
        </View>
      ) : null}

      <ThemedText style={styles.label}>
        صور المنتج <ThemedText style={{ color: ORANGE }}>*</ThemedText>
        <ThemedText style={styles.labelHint}> (1 — {MAX_IMAGES} صور، الأولى هي الصورة الرئيسية)</ThemedText>
      </ThemedText>

      {/* ── Large primary image preview ── */}
      {imageUris.length > 0 ? (
        <View style={styles.heroWrap}>
          <Image source={{ uri: imageUris[0] }} style={styles.heroImage} contentFit="cover" />
          <View style={styles.heroBadge}>
            <Feather name="star" size={11} color={AppColors.white} />
            <ThemedText style={styles.heroBadgeText}>الصورة الرئيسية</ThemedText>
          </View>
          <Pressable
            style={styles.heroRemoveBtn}
            onPress={() => removeImage(0)}
            testID="button-remove-image-0"
          >
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
      {imageUris.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.thumbRow}
          contentContainerStyle={styles.thumbRowContent}
        >
          {imageUris.slice(1).map((uri, i) => {
            const index = i + 1;
            return (
              <View key={uri + index} style={styles.thumbWrap} testID={`image-thumb-${index}`}>
                <Image source={{ uri }} style={styles.thumb} contentFit="cover" />
                <Pressable
                  style={styles.removeBtn}
                  onPress={() => removeImage(index)}
                  testID={`button-remove-image-${index}`}
                >
                  <Feather name="x" size={11} color={AppColors.white} />
                </Pressable>
              </View>
            );
          })}
          {imageUris.length < MAX_IMAGES ? (
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
          <Feather name="camera" size={16} color={ORANGE} />
          <ThemedText style={styles.imgActionText}>التقاط صورة</ThemedText>
        </Pressable>
        <View style={styles.imgActionDivider} />
        <Pressable style={styles.imgActionBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); pickImageFromGallery(); }} testID="button-pick-image">
          <Feather name="image" size={16} color={ORANGE} />
          <ThemedText style={styles.imgActionText}>من المعرض</ThemedText>
        </Pressable>
      </View>

      <ThemedText style={styles.label}>
        اسم المنتج <ThemedText style={{ color: ORANGE }}>*</ThemedText>
      </ThemedText>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder={PRODUCT_NAME_PLACEHOLDER[businessType] || "اسم المنتج"}
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

      <View style={styles.noteBox}>
        <MaterialCommunityIcons name="image-filter-none" size={16} color={AppColors.statusPurple} />
        <ThemedText style={styles.noteText}>
          الصور ستُعالج تلقائياً: تحويل لـ WebP + ضغط 800×800 بكسل
        </ThemedText>
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
            <Feather name="upload-cloud" size={18} color={AppColors.white} />
            <ThemedText style={styles.submitText}>رفع المنتج للمراجعة</ThemedText>
          </>
        )}
      </Pressable>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AppColors.secondary },
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
    backgroundColor: ORANGE_LIGHT,
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },
  heroBadge: {
    position: "absolute",
    bottom: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: ORANGE,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  heroBadgeText: {
    fontFamily: "Cairo_700Bold", fontSize: 11, color: AppColors.white,
  },
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
    borderColor: AppColors.primaryLight,
    backgroundColor: AppColors.secondary,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 10,
  },
  heroPlaceholderTitle: {
    fontFamily: "Cairo_700Bold", fontSize: 15, color: ORANGE,
  },
  heroPlaceholderSub: {
    fontFamily: "Cairo_400Regular", fontSize: 12, color: AppColors.gray400,
  },
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
    borderColor: AppColors.primaryLight,
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
    borderColor: AppColors.primaryLight,
    backgroundColor: AppColors.secondary,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  addThumbText: {
    fontFamily: "Cairo_700Bold", fontSize: 11, color: ORANGE,
  },
  imgActions: {
    flexDirection: "row", borderWidth: 1.5, borderColor: AppColors.primaryLight,
    borderRadius: 16,
    overflow: "hidden", marginBottom: 14, marginTop: 10, backgroundColor: AppColors.white,
  },
  imgActionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 12,
  },
  imgActionDivider: { width: 1.5, backgroundColor: AppColors.primaryLight },
  imgActionText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: ORANGE },
  pendingBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    backgroundColor: AppColors.warningLight, borderWidth: 1, borderColor: AppColors.warning,
    borderRadius: 12, padding: 12, marginBottom: 14,
  },
  pendingBannerText: {
    fontFamily: "Cairo_400Regular", fontSize: 12, color: AppColors.primaryDark,
    flex: 1, textAlign: "right", lineHeight: 20,
  },
  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: AppColors.errorLight, borderRadius: 10,
    padding: 12, marginBottom: 14, borderWidth: 1, borderColor: AppColors.error,
  },
  errorText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: AppColors.error, flex: 1, textAlign: "right" },
  noteBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: ORANGE_LIGHT, borderRadius: 10, padding: 12, marginBottom: 20,
  },
  noteText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: AppColors.primaryDark, flex: 1, textAlign: "right", lineHeight: 20 },
  submitBtn: {
    backgroundColor: ORANGE, borderRadius: 14, paddingVertical: 14,
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
    backgroundColor: ORANGE_LIGHT, justifyContent: "center", alignItems: "center", marginBottom: 24,
  },
  successTitle: { fontFamily: "Cairo_700Bold", fontSize: 22, color: AppColors.gray700, textAlign: "center", marginBottom: 10 },
  successDesc: { fontFamily: "Cairo_400Regular", fontSize: 14, color: AppColors.gray500, textAlign: "center", lineHeight: 24, marginBottom: 32 },
  successActions: { width: "100%", gap: 12 },
  successBtn: { paddingVertical: 14, borderRadius: 14, alignItems: "center" },
  successBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: AppColors.white },
});
