import React, { useState } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  Image,
  Platform,
  Linking,
} from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { Picker } from "@react-native-picker/picker";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";

const PURPLE = "#673AB7";
const ORANGE = "#E86520";

const CATEGORY_MAP: Record<string, string[]> = {
  restaurant: [
    "وجبات رئيسية", "مقبلات وسلطات", "شاورما وسندويشات", "برجر وبيتزا",
    "مشروبات ساخنة", "مشروبات باردة", "حلويات وآيس كريم", "أطباق خاصة",
  ],
  supermarket: [
    "مواد غذائية", "خضار وفواكه", "منتجات الألبان والبيض", "مشروبات",
    "أطعمة معلبة", "حبوب وبقوليات", "أطعمة مجمدة", "منظفات ومواد تنظيف",
    "منتجات العناية الشخصية", "منتجات الأطفال", "وجبات خفيفة وشيبس", "أخرى",
  ],
  pharmacy: [
    "أدوية عامة", "مسكنات وخافضات حرارة", "فيتامينات ومكملات",
    "مستلزمات طبية", "مستحضرات تجميل", "منتجات الأم والطفل",
    "أدوية مزمنة", "صحة العيون", "أخرى",
  ],
  bakery: [
    "خبز وأرغفة", "كعك وبسكويت", "معجنات وفطاير", "حلويات شرقية",
    "تورتات وكيك", "كنافة وعباسية", "حلويات غربية", "عروض مناسبات",
  ],
  other: [
    "منتجات غذائية", "منتجات منزلية", "ملابس وأكسسوارات",
    "إلكترونيات", "عطور ومستحضرات", "مواد بناء", "أخرى",
  ],
};

const ALL_CATEGORIES = Array.from(new Set(Object.values(CATEGORY_MAP).flat()));
const UNITS = ["قطعة", "كيلو", "غرام", "لتر", "مل", "علبة", "كرتون", "دستة", "باكيج"];

interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  category: string;
  stock: number;
  unit: string;
  imageUrl: string;
  status: string;
}

export default function VendorEditProductScreen({ navigation, route }: any) {
  const headerHeight = useHeaderHeight();
  const { vendorToken, vendorProfile } = useAuth();

  const product: Product = route.params?.product;
  const businessType = (vendorProfile as any)?.businessType || "other";
  const categories = CATEGORY_MAP[businessType] || ALL_CATEGORIES;

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
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const pickImage = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
      setImageUri(result.assets[0].uri);
      setError("");
    }
  };

  const takePhoto = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      if (!permission.canAskAgain && Platform.OS !== "web") {
        setError("تم رفض إذن الكاميرا — افتح الإعدادات للسماح بالوصول");
        try {
          await Linking.openSettings();
        } catch {}
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
      setImageUri(result.assets[0].uri);
      setError("");
    }
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

      if (imageUri) {
        const filename = imageUri.split("/").pop() || "product.jpg";
        const ext = filename.split(".").pop()?.toLowerCase() || "jpg";
        const mimeType = ext === "png" ? "image/png" : "image/jpeg";
        formData.append("image", {
          uri: imageUri,
          name: filename,
          type: mimeType,
        } as any);
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
          {imageUri
            ? "المنتج الآن قيد المراجعة من الإدارة وسيظهر للزبائن بعد الموافقة"
            : "تم حفظ التغييرات بنجاح"}
        </ThemedText>
        <View style={styles.successActions}>
          <Pressable
            style={[styles.successBtn, { backgroundColor: "#F3F4F6" }]}
            onPress={() => navigation.navigate("VendorProducts")}
            testID="button-view-products"
          >
            <ThemedText style={[styles.successBtnText, { color: "#444" }]}>عرض منتجاتي</ThemedText>
          </Pressable>
        </View>
      </View>
    );
  }

  const currentImage = imageUri || product?.imageUrl;

  return (
    <KeyboardAwareScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: headerHeight + 16, paddingHorizontal: 16, paddingBottom: 60 }}
      showsVerticalScrollIndicator={false}
    >
      {error ? (
        <View style={styles.errorBox}>
          <Feather name="alert-circle" size={16} color="#EF4444" />
          <ThemedText style={styles.errorText}>{error}</ThemedText>
        </View>
      ) : null}

      <ThemedText style={styles.label}>صورة المنتج</ThemedText>

      <View style={styles.imgPicker}>
        {currentImage ? (
          <Image source={{ uri: currentImage }} style={styles.imgPreview} resizeMode="cover" />
        ) : (
          <View style={styles.imgPlaceholder}>
            <MaterialCommunityIcons name="camera-plus" size={36} color="#C4B5FD" />
            <ThemedText style={styles.imgHint}>اختر مصدر الصورة</ThemedText>
          </View>
        )}
      </View>

      <View style={styles.imgActions}>
        <Pressable style={styles.imgActionBtn} onPress={takePhoto} testID="button-take-photo">
          <Feather name="camera" size={16} color={PURPLE} />
          <ThemedText style={styles.imgActionText}>التقاط صورة</ThemedText>
        </Pressable>
        <View style={styles.imgActionDivider} />
        <Pressable style={styles.imgActionBtn} onPress={pickImage} testID="button-pick-image">
          <Feather name="image" size={16} color={PURPLE} />
          <ThemedText style={styles.imgActionText}>من المعرض</ThemedText>
        </Pressable>
      </View>

      {imageUri ? (
        <View style={styles.imageChangeNotice}>
          <MaterialCommunityIcons name="information-outline" size={14} color="#7C3AED" />
          <ThemedText style={styles.imageChangeText}>
            تغيير الصورة سيُعيد المنتج لقائمة المراجعة
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
        placeholderTextColor="#bbb"
        testID="input-name"
      />

      <ThemedText style={styles.label}>وصف المنتج</ThemedText>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={description}
        onChangeText={setDescription}
        placeholder="وصف مختصر عن المنتج..."
        placeholderTextColor="#bbb"
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
            placeholderTextColor="#bbb"
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
            placeholderTextColor="#bbb"
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
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Feather name="save" size={18} color="#fff" />
            <ThemedText style={styles.submitText}>حفظ التعديلات</ThemedText>
          </>
        )}
      </Pressable>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F7FF" },
  label: {
    fontFamily: "Cairo_700Bold", fontSize: 13, color: "#444",
    textAlign: "right", marginBottom: 6, marginTop: 4,
  },
  input: {
    borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 11,
    fontFamily: "Cairo_400Regular", fontSize: 14, color: "#111",
    textAlign: "right", marginBottom: 14, backgroundColor: "#fff",
  },
  textArea: { minHeight: 80, textAlignVertical: "top", paddingTop: 10 },
  row: { flexDirection: "row" },
  pickerWrap: {
    borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 12,
    marginBottom: 14, backgroundColor: "#fff", overflow: "hidden",
  },
  picker: { height: Platform.OS === "ios" ? 140 : 50, color: "#111" },
  imgPicker: {
    borderWidth: 2, borderStyle: "dashed", borderColor: "#C4B5FD",
    borderRadius: 16, borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
    overflow: "hidden", backgroundColor: "#F5F3FF",
    height: 180,
  },
  imgPreview: { width: "100%", height: "100%" },
  imgPlaceholder: { flex: 1, justifyContent: "center", alignItems: "center", gap: 6 },
  imgHint: { fontFamily: "Cairo_700Bold", fontSize: 14, color: PURPLE },
  imgActions: {
    flexDirection: "row", borderWidth: 1.5, borderColor: "#C4B5FD",
    borderTopWidth: 0, borderBottomLeftRadius: 16, borderBottomRightRadius: 16,
    overflow: "hidden", marginBottom: 10, backgroundColor: "#fff",
  },
  imgActionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 12,
  },
  imgActionDivider: { width: 1.5, backgroundColor: "#C4B5FD" },
  imgActionText: { fontFamily: "Cairo_700Bold", fontSize: 13, color: PURPLE },
  imageChangeNotice: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#EDE7F6", borderRadius: 10, padding: 10, marginBottom: 14,
  },
  imageChangeText: {
    fontFamily: "Cairo_400Regular", fontSize: 12, color: "#5B21B6",
    flex: 1, textAlign: "right",
  },
  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#FEF2F2", borderRadius: 10,
    padding: 12, marginBottom: 14, borderWidth: 1, borderColor: "#FECACA",
  },
  errorText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: "#EF4444", flex: 1, textAlign: "right" },
  submitBtn: {
    backgroundColor: PURPLE, borderRadius: 14, paddingVertical: 14,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },
  successWrap: {
    flex: 1, backgroundColor: "#fff", alignItems: "center",
    paddingHorizontal: 28, paddingBottom: 60,
  },
  successIcon: {
    width: 100, height: 100, borderRadius: 28,
    backgroundColor: "#EDE7F6", justifyContent: "center", alignItems: "center", marginBottom: 24,
  },
  successTitle: { fontFamily: "Cairo_700Bold", fontSize: 22, color: "#333", textAlign: "center", marginBottom: 10 },
  successDesc: { fontFamily: "Cairo_400Regular", fontSize: 14, color: "#666", textAlign: "center", lineHeight: 24, marginBottom: 32 },
  successActions: { width: "100%", gap: 12 },
  successBtn: { paddingVertical: 14, borderRadius: 14, alignItems: "center" },
  successBtnText: { fontFamily: "Cairo_700Bold", fontSize: 15, color: "#fff" },
});
