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
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { Picker } from "@react-native-picker/picker";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import {
  CATEGORY_MAP,
  ALL_CATEGORIES,
  PRODUCT_NAME_PLACEHOLDER,
} from "@/constants/businessCategories";
import DynamicProductFields from "@/components/DynamicProductFields";
import { AppColors, FontFamily } from "@/constants/theme";

const ORANGE = AppColors.primary;
const MAX_IMAGES = 5;
const THUMB_SIZE = 88;
const UNITS = [
  "قطعة",
  "كيلو",
  "غرام",
  "لتر",
  "مل",
  "علبة",
  "كرتون",
  "دستة",
  "باكيج",
];

export default function VendorAddProductScreen({ navigation }: any) {
  const headerHeight = useHeaderHeight();
  const { vendorToken, vendorProfile } = useAuth();

  const businessType = (vendorProfile as any)?.businessType || "other";
  const categories = CATEGORY_MAP[businessType] || ALL_CATEGORIES;
  const isPending = vendorProfile?.status === "pending";

  // ── State (unchanged) ─────────────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [description, setDesc] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [category, setCategory] = useState(categories[0]);
  const [unit, setUnit] = useState(UNITS[0]);
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [dynamicData, setDynamic] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const [variants, setVariants] = useState<
    { id: string; name: string; priceAdjustment: string }[]
  >([]);
  const [addons, setAddons] = useState<
    { id: string; name: string; price: string }[]
  >([]);

  const addVariant = () =>
    setVariants((p) => [
      ...p,
      { id: Date.now().toString(), name: "", priceAdjustment: "0" },
    ]);
  const removeVariant = (id: string) =>
    setVariants((p) => p.filter((v) => v.id !== id));
  const updateVariant = (
    id: string,
    field: "name" | "priceAdjustment",
    value: string,
  ) =>
    setVariants((p) =>
      p.map((v) => (v.id === id ? { ...v, [field]: value } : v)),
    );

  const addAddon = () =>
    setAddons((p) => [
      ...p,
      { id: Date.now().toString(), name: "", price: "0" },
    ]);
  const removeAddon = (id: string) =>
    setAddons((p) => p.filter((a) => a.id !== id));
  const updateAddon = (id: string, field: "name" | "price", value: string) =>
    setAddons((p) =>
      p.map((a) => (a.id === id ? { ...a, [field]: value } : a)),
    );

  // ── Image helpers (unchanged logic) ──────────────────────────────────────────

  const showImageSourcePicker = (
    onGallery: () => void,
    onCamera: () => void,
  ) => {
    if (Platform.OS === "web") {
      onGallery();
      return;
    }
    Alert.alert("إضافة صورة", "اختر مصدر الصورة", [
      { text: "من المعرض", onPress: onGallery },
      { text: "التقاط صورة", onPress: onCamera },
      { text: "إلغاء", style: "cancel" },
    ]);
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
      setImageUris((p) => [...p, result.assets[0].uri]);
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
        try {
          await Linking.openSettings();
        } catch {}
      } else setError("يرجى السماح بالوصول إلى الكاميرا");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.9,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled && result.assets[0]) {
      setImageUris((p) => [...p, result.assets[0].uri]);
      setError("");
    }
  };

  const removeImage = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setImageUris((p) => p.filter((_, i) => i !== index));
  };

  // ── Submit (unchanged logic) ──────────────────────────────────────────────────

  const submit = async () => {
    const hasImage = imageUris.length > 0;
    if (!name.trim() || !price || !category || !hasImage) {
      setError("يرجى ملء اسم المنتج، السعر، الفئة، واختيار أو رفع صورة");
      return;
    }
    if (isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
      setError("يرجى إدخال سعر صحيح");
      return;
    }
    if (!vendorToken) {
      setError("انتهت جلستك — سجّل دخولك مجدداً لإضافة المنتج");
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
      if (Object.keys(dynamicData).length > 0)
        formData.append("extraData", JSON.stringify(dynamicData));
      const validVariants = variants
        .filter((v) => v.name.trim())
        .map((v) => ({
          id: v.id,
          name: v.name.trim(),
          priceAdjustment: parseFloat(v.priceAdjustment) || 0,
        }));
      const validAddons = addons
        .filter((a) => a.name.trim())
        .map((a) => ({
          id: a.id,
          name: a.name.trim(),
          price: parseFloat(a.price) || 0,
        }));
      if (validVariants.length > 0)
        formData.append("variants", JSON.stringify(validVariants));
      if (validAddons.length > 0)
        formData.append("addons", JSON.stringify(validAddons));

      const compressedUris = await Promise.all(
        imageUris.map(async (uri) => {
          try {
            const r = await manipulateAsync(uri, [{ resize: { width: 800 } }], {
              compress: 0.72,
              format: SaveFormat.WEBP,
            });
            return r.uri;
          } catch {
            return uri;
          }
        }),
      );
      for (const uri of compressedUris) {
        const filename = uri.split("/").pop() || "product.webp";
        formData.append("images", {
          uri,
          name: filename,
          type: "image/webp",
        } as any);
      }

      const res = await fetch(
        new URL("/api/vendor/products", getApiUrl()).toString(),
        {
          method: "POST",
          headers: { Authorization: `Bearer ${vendorToken}` },
          body: formData,
        },
      );
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

  // ── Success state ──────────────────────────────────────────────────────────────

  if (success) {
    return (
      <View style={[s.successWrap, { paddingTop: headerHeight + 40 }]}>
        <View style={[s.successIcon, { backgroundColor: AppColors.secondary }]}>
          <MaterialCommunityIcons
            name="check-circle"
            size={64}
            color={ORANGE}
          />
        </View>
        <ThemedText style={s.successTitle}>تم إضافة المنتج بنجاح!</ThemedText>
        <ThemedText style={s.successDesc}>
          {isPending
            ? "منتجك محفوظ — سيُراجع بعد تفعيل متجرك وموافقة الإدارة"
            : "سيراجع الفريق منتجك خلال 24 ساعة ويظهر للزبائن بعد الموافقة"}
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          style={[s.btn, { backgroundColor: ORANGE }]}
          onPress={() => {
            setSuccess(false);
            setName("");
            setDesc("");
            setPrice("");
            setStock("");
            setCategory(categories[0]);
            setUnit(UNITS[0]);
            setImageUris([]);
            setVariants([]);
            setAddons([]);
          }}
          testID="button-add-another"
        >
          <ThemedText style={s.btnText}>إضافة منتج آخر</ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={[s.btn, { backgroundColor: AppColors.gray100 }]}
          onPress={() => navigation.navigate("VendorProducts")}
          testID="button-view-products"
        >
          <ThemedText style={[s.btnText, { color: AppColors.gray700 }]}>
            عرض منتجاتي
          </ThemedText>
        </Pressable>
      </View>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────────

  return (
    <KeyboardAwareScrollView
      style={s.container}
      contentContainerStyle={{
        paddingTop: headerHeight + 16,
        paddingHorizontal: 16,
        paddingBottom: 60,
      }}
      showsVerticalScrollIndicator={false}
    >
      {isPending && (
        <View
          style={[
            s.banner,
            {
              backgroundColor: AppColors.warningLight,
              borderColor: AppColors.warning,
            },
          ]}
        >
          <MaterialCommunityIcons
            name="clock-alert-outline"
            size={18}
            color={AppColors.warning}
          />
          <ThemedText style={s.bannerText}>
            متجرك قيد المراجعة — يمكنك إعداد منتجاتك الآن، وستظهر للزبائن بعد
            تفعيل حسابك
          </ThemedText>
        </View>
      )}

      {error ? (
        <View
          style={[
            s.banner,
            {
              backgroundColor: AppColors.errorLight,
              borderColor: AppColors.error,
            },
          ]}
        >
          <Feather name="alert-circle" size={16} color={AppColors.error} />
          <ThemedText style={[s.bannerText, { color: AppColors.error }]}>
            {error}
          </ThemedText>
        </View>
      ) : null}

      {/* ── Section 1: Product name ── */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <MaterialCommunityIcons name="tag-outline" size={16} color={ORANGE} />
          <ThemedText style={s.cardTitle}>اسم المنتج</ThemedText>
        </View>
        <TextInput
          style={s.input}
          value={name}
          onChangeText={setName}
          placeholder={PRODUCT_NAME_PLACEHOLDER[businessType] || "اسم المنتج"}
          placeholderTextColor={AppColors.gray300}
          testID="input-name"
        />
      </View>

      {/* ── Section: Images (device camera / gallery only) ── */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <MaterialCommunityIcons
            name="image-multiple-outline"
            size={16}
            color={ORANGE}
          />
          <ThemedText style={s.cardTitle}>
            صور المنتج <ThemedText style={{ color: ORANGE }}>*</ThemedText>
          </ThemedText>
          <ThemedText style={s.cardHint}>(1—{MAX_IMAGES} صور)</ThemedText>
        </View>

        {imageUris.length > 0 ? (
          <View style={s.heroWrap}>
            <Image
              source={{ uri: imageUris[0] }}
              style={s.heroImage}
              contentFit="cover"
            />
            <View style={[s.heroBadge, { backgroundColor: ORANGE }]}>
              <Feather name="star" size={11} color={AppColors.white} />
              <ThemedText style={s.heroBadgeText}>الصورة الرئيسية</ThemedText>
            </View>
            <Pressable
              style={s.heroRemoveBtn}
              onPress={() => removeImage(0)}
              testID="button-remove-image-0"
              accessibilityRole="button"
              accessibilityLabel="إزالة الصورة الرئيسية"
            >
              <Feather name="x" size={14} color={AppColors.white} />
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            style={s.heroPlaceholder}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              showImageSourcePicker(pickImageFromGallery, takePhoto);
            }}
            testID="button-add-image"
          >
            <MaterialCommunityIcons
              name="camera-plus-outline"
              size={44}
              color={ORANGE + "60"}
            />
            <ThemedText style={[s.heroPlaceholderTitle, { color: ORANGE }]}>
              اضغط لإضافة صورة المنتج
            </ThemedText>
            <ThemedText style={s.heroPlaceholderSub}>
              من الكاميرا أو معرض الصور
            </ThemedText>
          </Pressable>
        )}

        {imageUris.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.thumbRowContent}
          >
            {imageUris.slice(1).map((uri, i) => {
              const index = i + 1;
              return (
                <View
                  key={uri + index}
                  style={s.thumbWrap}
                  testID={`image-thumb-${index}`}
                >
                  <Image source={{ uri }} style={s.thumb} contentFit="cover" />
                  <Pressable
                    style={s.removeBtn}
                    onPress={() => removeImage(index)}
                    testID={`button-remove-image-${index}`}
                    accessibilityRole="button"
                    accessibilityLabel={`إزالة الصورة ${index + 1}`}
                  >
                    <Feather name="x" size={11} color={AppColors.white} />
                  </Pressable>
                </View>
              );
            })}
            {imageUris.length < MAX_IMAGES && (
              <Pressable
                accessibilityRole="button"
                style={s.addThumbBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  showImageSourcePicker(pickImageFromGallery, takePhoto);
                }}
                testID="button-add-extra-image"
              >
                <MaterialCommunityIcons name="plus" size={24} color={ORANGE} />
                <ThemedText style={[s.addThumbText, { color: ORANGE }]}>
                  إضافة
                </ThemedText>
              </Pressable>
            )}
          </ScrollView>
        )}

        <View style={s.imgActions}>
          <Pressable
            accessibilityRole="button"
            style={s.imgActionBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              takePhoto();
            }}
            testID="button-take-photo"
          >
            <Feather name="camera" size={16} color={ORANGE} />
            <ThemedText style={[s.imgActionText, { color: ORANGE }]}>
              التقاط صورة
            </ThemedText>
          </Pressable>
          <View
            style={[s.imgActionDivider, { backgroundColor: AppColors.divider }]}
          />
          <Pressable
            accessibilityRole="button"
            style={s.imgActionBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              pickImageFromGallery();
            }}
            testID="button-pick-image"
          >
            <Feather name="image" size={16} color={ORANGE} />
            <ThemedText style={[s.imgActionText, { color: ORANGE }]}>
              من المعرض
            </ThemedText>
          </Pressable>
        </View>
      </View>

      {/* ── Section 4: Description ── */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <MaterialCommunityIcons
            name="text-box-outline"
            size={16}
            color={ORANGE}
          />
          <ThemedText style={s.cardTitle}>وصف المنتج</ThemedText>
        </View>
        <TextInput
          style={[s.input, s.textArea]}
          value={description}
          onChangeText={setDesc}
          placeholder="وصف مختصر عن المنتج..."
          placeholderTextColor={AppColors.gray300}
          multiline
          numberOfLines={3}
          testID="input-description"
        />
      </View>

      {/* ── Section 5: Price & stock ── */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <MaterialCommunityIcons
            name="currency-usd"
            size={16}
            color={ORANGE}
          />
          <ThemedText style={s.cardTitle}>السعر والمخزون</ThemedText>
        </View>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <ThemedText style={s.label}>
              السعر (دينار) <ThemedText style={{ color: ORANGE }}>*</ThemedText>
            </ThemedText>
            <TextInput
              style={s.input}
              value={price}
              onChangeText={setPrice}
              accessibilityLabel="السعر (دينار)"
              placeholder="5000"
              placeholderTextColor={AppColors.gray300}
              keyboardType="numeric"
              testID="input-price"
            />
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText style={s.label}>المخزون</ThemedText>
            <TextInput
              style={s.input}
              value={stock}
              onChangeText={setStock}
              accessibilityLabel="المخزون"
              placeholder="100"
              placeholderTextColor={AppColors.gray300}
              keyboardType="numeric"
              testID="input-stock"
            />
          </View>
        </View>
      </View>

      {/* ── Section 6: Category & unit ── */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <MaterialCommunityIcons
            name="tag-multiple-outline"
            size={16}
            color={ORANGE}
          />
          <ThemedText style={s.cardTitle}>الفئة والوحدة</ThemedText>
        </View>
        <ThemedText style={s.label}>
          القسم / الفئة <ThemedText style={{ color: ORANGE }}>*</ThemedText>
        </ThemedText>
        <View style={s.pickerWrap}>
          <Picker
            selectedValue={category}
            onValueChange={setCategory}
            style={s.picker}
            accessibilityLabel="القسم / الفئة"
          >
            {categories.map((c) => (
              <Picker.Item key={c} label={c} value={c} />
            ))}
          </Picker>
        </View>
        <DynamicProductFields
          businessType={businessType}
          values={dynamicData}
          onChange={(key, value) => setDynamic((p) => ({ ...p, [key]: value }))}
        />
        <ThemedText style={s.label}>وحدة القياس</ThemedText>
        <View style={s.pickerWrap}>
          <Picker
            selectedValue={unit}
            onValueChange={setUnit}
            style={s.picker}
            accessibilityLabel="وحدة القياس"
          >
            {UNITS.map((u) => (
              <Picker.Item key={u} label={u} value={u} />
            ))}
          </Picker>
        </View>
      </View>

      {/* ── Section 7: Variants ── */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <MaterialCommunityIcons
            name="format-list-bulleted-type"
            size={16}
            color={ORANGE}
          />
          <ThemedText style={[s.cardTitle, { flex: 1 }]}>
            الأحجام / الخيارات{" "}
            <ThemedText style={s.optional}>(اختياري)</ThemedText>
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            onPress={addVariant}
            style={s.addExtraBtn}
            testID="button-add-variant"
          >
            <Feather name="plus" size={15} color={ORANGE} />
            <ThemedText style={[s.addExtraText, { color: ORANGE }]}>
              إضافة
            </ThemedText>
          </Pressable>
        </View>
        {variants.length === 0 ? (
          <ThemedText style={s.hint}>
            مثال: صغير (+0)، وسط (+2000)، كبير (+5000)
          </ThemedText>
        ) : null}
        {variants.map((v) => (
          <View key={v.id} style={s.extraRow}>
            <TextInput
              style={[s.input, s.extraInput, { flex: 2 }]}
              value={v.name}
              onChangeText={(val) => updateVariant(v.id, "name", val)}
              accessibilityLabel="اسم الحجم"
              placeholder="الاسم"
              placeholderTextColor={AppColors.gray300}
              testID={`input-variant-name-${v.id}`}
            />
            <TextInput
              style={[s.input, s.extraInput, { flex: 1 }]}
              value={v.priceAdjustment}
              onChangeText={(val) =>
                updateVariant(v.id, "priceAdjustment", val)
              }
              accessibilityLabel="فرق سعر الحجم"
              placeholder="فرق السعر"
              placeholderTextColor={AppColors.gray300}
              keyboardType="numeric"
              testID={`input-variant-price-${v.id}`}
            />
            <Pressable
              onPress={() => removeVariant(v.id)}
              style={s.extraRemoveBtn}
              testID={`button-remove-variant-${v.id}`}
              accessibilityRole="button"
              accessibilityLabel={`إزالة الحجم ${v.name || ""}`.trim()}
            >
              <Feather name="x" size={14} color={AppColors.error} />
            </Pressable>
          </View>
        ))}
      </View>

      {/* ── Section 8: Addons ── */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <MaterialCommunityIcons
            name="plus-circle-multiple-outline"
            size={16}
            color={ORANGE}
          />
          <ThemedText style={[s.cardTitle, { flex: 1 }]}>
            الإضافات <ThemedText style={s.optional}>(اختياري)</ThemedText>
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            onPress={addAddon}
            style={s.addExtraBtn}
            testID="button-add-addon"
          >
            <Feather name="plus" size={15} color={ORANGE} />
            <ThemedText style={[s.addExtraText, { color: ORANGE }]}>
              إضافة
            </ThemedText>
          </Pressable>
        </View>
        {addons.length === 0 ? (
          <ThemedText style={s.hint}>
            مثال: جبن إضافي (+2000)، صلصة حارة (+500)
          </ThemedText>
        ) : null}
        {addons.map((a) => (
          <View key={a.id} style={s.extraRow}>
            <TextInput
              style={[s.input, s.extraInput, { flex: 2 }]}
              value={a.name}
              onChangeText={(val) => updateAddon(a.id, "name", val)}
              placeholder="اسم الإضافة"
              placeholderTextColor={AppColors.gray300}
              testID={`input-addon-name-${a.id}`}
            />
            <TextInput
              style={[s.input, s.extraInput, { flex: 1 }]}
              value={a.price}
              onChangeText={(val) => updateAddon(a.id, "price", val)}
              accessibilityLabel="سعر الإضافة"
              placeholder="السعر"
              placeholderTextColor={AppColors.gray300}
              keyboardType="numeric"
              testID={`input-addon-price-${a.id}`}
            />
            <Pressable
              onPress={() => removeAddon(a.id)}
              style={s.extraRemoveBtn}
              testID={`button-remove-addon-${a.id}`}
              accessibilityRole="button"
              accessibilityLabel={`إزالة الإضافة ${a.name || ""}`.trim()}
            >
              <Feather name="x" size={14} color={AppColors.error} />
            </Pressable>
          </View>
        ))}
      </View>

      {/* Note */}
      <View
        style={[
          s.banner,
          { backgroundColor: AppColors.secondary, borderColor: ORANGE + "30" },
        ]}
      >
        <MaterialCommunityIcons
          name="image-filter-none"
          size={16}
          color={ORANGE}
        />
        <ThemedText style={[s.bannerText, { color: AppColors.primaryDark }]}>
          الصور ستُعالج تلقائياً: تحويل لـ WebP + ضغط 800×800 بكسل
        </ThemedText>
      </View>

      {/* Submit */}
      <Pressable
        accessibilityRole="button"
        style={[s.submitBtn, loading && { opacity: 0.6 }]}
        onPress={submit}
        disabled={loading}
        testID="button-submit"
      >
        {loading ? (
          <ActivityIndicator color={AppColors.white} />
        ) : (
          <>
            <Feather name="upload-cloud" size={18} color={AppColors.white} />
            <ThemedText style={s.submitText}>رفع المنتج للمراجعة</ThemedText>
          </>
        )}
      </Pressable>
    </KeyboardAwareScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: AppColors.background },
  card: {
    backgroundColor: AppColors.white,
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    shadowColor: AppColors.black,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  cardTitle: {
    fontFamily: FontFamily.cairoBold,
    fontSize: 15,
    color: AppColors.gray800,
    textAlign: "right",
  },
  cardHint: {
    fontFamily: FontFamily.tajawal,
    fontSize: 11,
    color: AppColors.gray400,
  },
  optional: {
    fontFamily: FontFamily.tajawal,
    fontSize: 12,
    color: AppColors.gray400,
  },
  label: {
    fontFamily: FontFamily.cairoBold,
    fontSize: 13,
    color: AppColors.gray700,
    textAlign: "right",
    marginBottom: 6,
    marginTop: 4,
  },
  input: {
    borderWidth: 1.5,
    borderColor: AppColors.divider,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontFamily: FontFamily.tajawal,
    fontSize: 16,
    lineHeight: 22,
    color: AppColors.black,
    textAlign: "right",
    marginBottom: 14,
    backgroundColor: AppColors.white,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  // Multiline: keep the text top-aligned but still drop Android's extra font padding
  // so the first line is not clipped from the top.
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
    paddingTop: 12,
    includeFontPadding: false,
  },
  pickerWrap: {
    borderWidth: 1.5,
    borderColor: AppColors.divider,
    borderRadius: 12,
    marginBottom: 14,
    backgroundColor: AppColors.white,
    overflow: "hidden",
  },
  picker: { height: Platform.OS === "ios" ? 140 : 50, color: AppColors.black },
  banner: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  bannerText: {
    fontFamily: FontFamily.tajawal,
    fontSize: 12,
    color: AppColors.primaryDark,
    flex: 1,
    textAlign: "right",
    lineHeight: 20,
  },
  heroWrap: {
    width: "100%",
    height: 220,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 10,
    position: "relative",
    backgroundColor: AppColors.secondary,
  },
  heroImage: { width: "100%", height: "100%" },
  heroBadge: {
    position: "absolute",
    bottom: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  heroBadgeText: {
    fontFamily: FontFamily.cairoBold,
    fontSize: 11,
    color: AppColors.white,
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
  heroPlaceholderTitle: { fontFamily: FontFamily.cairoBold, fontSize: 15 },
  heroPlaceholderSub: {
    fontFamily: FontFamily.tajawal,
    fontSize: 12,
    color: AppColors.gray400,
  },
  thumbRowContent: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 4,
    paddingHorizontal: 2,
    marginBottom: 10,
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
  addThumbText: { fontFamily: FontFamily.cairoBold, fontSize: 11 },
  imgActions: {
    flexDirection: "row",
    borderWidth: 1.5,
    borderColor: AppColors.divider,
    borderRadius: 14,
    overflow: "hidden",
    marginTop: 10,
    backgroundColor: AppColors.white,
  },
  imgActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
  },
  imgActionDivider: { width: 1.5 },
  imgActionText: { fontFamily: FontFamily.cairoBold, fontSize: 13 },
  libraryRow: { flexDirection: "row", gap: 10, paddingBottom: 4 },
  libThumbWrap: {
    width: 96,
    height: 96,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "transparent",
  },
  libThumb: { width: "100%", height: "100%" },
  libCheckOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.38)",
    alignItems: "center",
    justifyContent: "center",
  },
  libSelectedRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  libSelectedText: { fontFamily: FontFamily.cairoMedium, fontSize: 12 },
  libDivider: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },
  libLine: { flex: 1, height: 1, backgroundColor: AppColors.divider },
  libOrText: {
    fontFamily: FontFamily.tajawal,
    fontSize: 12,
    color: AppColors.gray500,
  },
  hint: {
    fontFamily: FontFamily.tajawal,
    fontSize: 12,
    color: AppColors.gray400,
    textAlign: "right",
    marginBottom: 8,
  },
  extraRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  extraInput: { marginBottom: 0, paddingVertical: 10, fontSize: 14 },
  extraRemoveBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: AppColors.errorLight,
    alignItems: "center",
    justifyContent: "center",
  },
  addExtraBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: AppColors.secondary,
  },
  addExtraText: { fontFamily: FontFamily.cairoBold, fontSize: 12 },
  submitBtn: {
    backgroundColor: ORANGE,
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: 20,
  },
  submitText: {
    fontFamily: FontFamily.cairoBold,
    fontSize: 16,
    color: AppColors.white,
  },
  successWrap: {
    flex: 1,
    backgroundColor: AppColors.white,
    alignItems: "center",
    paddingHorizontal: 28,
    paddingBottom: 60,
    gap: 16,
  },
  successIcon: {
    width: 100,
    height: 100,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  successTitle: {
    fontFamily: FontFamily.cairoBold,
    fontSize: 22,
    color: AppColors.gray700,
    textAlign: "center",
  },
  successDesc: {
    fontFamily: FontFamily.tajawal,
    fontSize: 14,
    color: AppColors.gray500,
    textAlign: "center",
    lineHeight: 24,
  },
  btn: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  btnText: {
    fontFamily: FontFamily.cairoBold,
    fontSize: 15,
    color: AppColors.white,
  },
});
