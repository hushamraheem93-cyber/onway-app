import React, { useState } from "react";
import {
  StyleSheet,
  View,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { AppColors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { compressAndConvertToBase64 } from "@/lib/imageUtils";
import { getApiUrl } from "@/lib/query-client";

export default function DriverRegistrationScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { phoneNumber, completeDriverRegistration } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [secondName, setSecondName] = useState("");
  const [thirdName, setThirdName] = useState("");
  const [fourthName, setFourthName] = useState("");
  const [nationalIdImage, setNationalIdImage] = useState<string | null>(null);
  const [driverLicenseImage, setDriverLicenseImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const isFormValid =
    firstName.trim() &&
    secondName.trim() &&
    thirdName.trim() &&
    fourthName.trim() &&
    nationalIdImage;

  const pickImage = async (setter: (uri: string) => void) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setter(result.assets[0].uri);
    }
  };

  const takePhoto = async (setter: (uri: string) => void) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("تنبيه", "يرجى السماح بالوصول للكاميرا لالتقاط صورة");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setter(result.assets[0].uri);
    }
  };

  const showImageOptions = (setter: (uri: string) => void, title: string) => {
    Alert.alert(
      title,
      "اختر طريقة إضافة الصورة",
      [
        { text: "الكاميرا", onPress: () => takePhoto(setter) },
        { text: "معرض الصور", onPress: () => pickImage(setter) },
        { text: "إلغاء", style: "cancel" },
      ]
    );
  };

  const handleSubmit = async () => {
    if (!isFormValid || !phoneNumber || !nationalIdImage) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsLoading(true);

    try {
      const fullName = `${firstName.trim()} ${secondName.trim()} ${thirdName.trim()} ${fourthName.trim()}`;

      let nationalIdBase64 = "";
      if (nationalIdImage) {
        nationalIdBase64 = await compressAndConvertToBase64(nationalIdImage, "product");
      }

      let driverLicenseBase64 = "";
      if (driverLicenseImage) {
        driverLicenseBase64 = await compressAndConvertToBase64(driverLicenseImage, "product");
      }

      const response = await fetch(new URL("/api/drivers", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber,
          fullName,
          firstName: firstName.trim(),
          secondName: secondName.trim(),
          thirdName: thirdName.trim(),
          fourthName: fourthName.trim(),
          nationalIdImage: nationalIdBase64,
          ...(driverLicenseBase64 && { driverLicenseImage: driverLicenseBase64 }),
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "فشل في تسجيل السائق");
      }

      await completeDriverRegistration();
    } catch (error: any) {
      Alert.alert("خطأ", error.message || "حدث خطأ أثناء التسجيل");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{
        paddingTop: insets.top + Spacing.xl,
        paddingBottom: insets.bottom + Spacing.xl + 100,
        paddingHorizontal: Spacing.lg,
      }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      bottomOffset={50}
    >
      <View style={styles.header}>
        <View style={[styles.iconCircle, { backgroundColor: "#E8F5E915" }]}>
          <Feather name="truck" size={36} color="#4CAF50" />
        </View>
        <ThemedText type="h2" style={styles.title}>تسجيل سائق توصيل</ThemedText>
        <ThemedText type="body" style={[styles.subtitle, { color: theme.textSecondary }]}>
          أدخل بياناتك للانضمام لفريق التوصيل
        </ThemedText>
      </View>

      <View style={[styles.card, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
        <ThemedText type="h4" style={styles.sectionTitle}>الاسم الرباعي</ThemedText>

        <View style={styles.field}>
          <ThemedText type="body" style={styles.label}>الاسم الأول</ThemedText>
          <TextInput
            style={[styles.input, { backgroundColor: theme.backgroundSecondary, color: theme.text, borderColor: theme.border }]}
            placeholder="مثال: أحمد"
            placeholderTextColor={theme.textSecondary}
            value={firstName}
            onChangeText={setFirstName}
            textAlign="right"
            testID="input-first-name"
          />
        </View>

        <View style={styles.field}>
          <ThemedText type="body" style={styles.label}>اسم الأب</ThemedText>
          <TextInput
            style={[styles.input, { backgroundColor: theme.backgroundSecondary, color: theme.text, borderColor: theme.border }]}
            placeholder="مثال: محمد"
            placeholderTextColor={theme.textSecondary}
            value={secondName}
            onChangeText={setSecondName}
            textAlign="right"
            testID="input-second-name"
          />
        </View>

        <View style={styles.field}>
          <ThemedText type="body" style={styles.label}>اسم الجد</ThemedText>
          <TextInput
            style={[styles.input, { backgroundColor: theme.backgroundSecondary, color: theme.text, borderColor: theme.border }]}
            placeholder="مثال: علي"
            placeholderTextColor={theme.textSecondary}
            value={thirdName}
            onChangeText={setThirdName}
            textAlign="right"
            testID="input-third-name"
          />
        </View>

        <View style={styles.field}>
          <ThemedText type="body" style={styles.label}>اللقب</ThemedText>
          <TextInput
            style={[styles.input, { backgroundColor: theme.backgroundSecondary, color: theme.text, borderColor: theme.border }]}
            placeholder="مثال: العبيدي"
            placeholderTextColor={theme.textSecondary}
            value={fourthName}
            onChangeText={setFourthName}
            textAlign="right"
            testID="input-fourth-name"
          />
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
        <ThemedText type="h4" style={styles.sectionTitle}>رقم الهاتف</ThemedText>
        <View style={[styles.phoneDisplay, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
          <Feather name="phone" size={18} color={AppColors.primary} />
          <ThemedText type="body" style={[styles.phoneText, { color: theme.text }]}>
            {phoneNumber}
          </ThemedText>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
        <ThemedText type="h4" style={styles.sectionTitle}>صورة البطاقة الوطنية</ThemedText>
        <ThemedText type="small" style={[styles.idHint, { color: theme.textSecondary }]}>
          التقط صورة واضحة للوجه الأمامي للبطاقة الوطنية
        </ThemedText>

        <Pressable
          style={[styles.idUpload, { borderColor: nationalIdImage ? AppColors.primary : theme.border, backgroundColor: theme.backgroundSecondary }]}
          onPress={() => showImageOptions(setNationalIdImage, "صورة البطاقة الوطنية")}
          testID="button-upload-id"
        >
          {nationalIdImage ? (
            <View>
              <Image
                source={{ uri: nationalIdImage }}
                style={styles.idPreview}
                contentFit="cover"
              />
              <View style={styles.uploadedBadge}>
                <Feather name="check-circle" size={16} color="#FFFFFF" />
                <ThemedText type="small" style={styles.uploadedText}>تم الرفع</ThemedText>
              </View>
            </View>
          ) : (
            <View style={styles.idPlaceholder}>
              <Feather name="camera" size={36} color={theme.textSecondary} />
              <ThemedText type="body" style={[styles.idPlaceholderText, { color: theme.textSecondary }]}>
                اضغط لإضافة صورة البطاقة الوطنية
              </ThemedText>
            </View>
          )}
        </Pressable>
      </View>

      <View style={[styles.card, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
        <View style={styles.sectionTitleRow}>
          <ThemedText type="h4" style={styles.sectionTitle}>صورة إجازة السوق</ThemedText>
          <View style={styles.optionalBadge}>
            <ThemedText type="small" style={styles.optionalText}>اختياري</ThemedText>
          </View>
        </View>
        <ThemedText type="small" style={[styles.idHint, { color: theme.textSecondary }]}>
          التقط صورة واضحة لإجازة السوق (إن وجدت)
        </ThemedText>

        <Pressable
          style={[styles.idUpload, { borderColor: driverLicenseImage ? "#4CAF50" : theme.border, backgroundColor: theme.backgroundSecondary }]}
          onPress={() => showImageOptions(setDriverLicenseImage, "صورة إجازة السوق")}
          testID="button-upload-license"
        >
          {driverLicenseImage ? (
            <View>
              <Image
                source={{ uri: driverLicenseImage }}
                style={styles.idPreview}
                contentFit="cover"
              />
              <View style={[styles.uploadedBadge, { backgroundColor: "#4CAF50" }]}>
                <Feather name="check-circle" size={16} color="#FFFFFF" />
                <ThemedText type="small" style={styles.uploadedText}>تم الرفع</ThemedText>
              </View>
            </View>
          ) : (
            <View style={styles.idPlaceholder}>
              <Feather name="file-text" size={36} color={theme.textSecondary} />
              <ThemedText type="body" style={[styles.idPlaceholderText, { color: theme.textSecondary }]}>
                اضغط لإضافة صورة إجازة السوق
              </ThemedText>
            </View>
          )}
        </Pressable>
      </View>

      <Pressable
        style={[styles.submitButton, !isFormValid && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={!isFormValid || isLoading}
        testID="button-submit-driver"
      >
        {isLoading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <ThemedText type="h4" style={styles.submitButtonText}>
              تقديم الطلب
            </ThemedText>
            <View style={styles.buttonIcon}>
              <Feather name="send" size={18} color={AppColors.primary} />
            </View>
          </>
        )}
      </Pressable>

      <ThemedText type="small" style={[styles.note, { color: theme.textSecondary }]}>
        سيتم مراجعة بياناتك من قبل الإدارة وسيتم إبلاغك بالنتيجة
      </ThemedText>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  title: {
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  subtitle: {
    textAlign: "center",
  },
  card: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    textAlign: "right",
    fontWeight: "700",
    marginBottom: Spacing.md,
    color: "#2D2D2D",
  },
  sectionTitleRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  optionalBadge: {
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  optionalText: {
    color: "#4CAF50",
    fontSize: 11,
    fontWeight: "600",
  },
  field: {
    marginBottom: Spacing.md,
  },
  label: {
    textAlign: "right",
    fontWeight: "600",
    marginBottom: Spacing.sm,
    fontSize: 14,
  },
  input: {
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: 16,
    borderWidth: 1,
  },
  phoneDisplay: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  phoneText: {
    flex: 1,
    textAlign: "right",
    fontSize: 16,
    fontWeight: "600",
  },
  idHint: {
    textAlign: "right",
    marginBottom: Spacing.md,
  },
  idUpload: {
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderStyle: "dashed",
    minHeight: 180,
    overflow: "hidden",
  },
  idPreview: {
    width: "100%",
    height: 200,
  },
  uploadedBadge: {
    position: "absolute",
    bottom: 10,
    right: 10,
    backgroundColor: AppColors.primary,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  uploadedText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 12,
  },
  idPlaceholder: {
    flex: 1,
    minHeight: 180,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.md,
  },
  idPlaceholderText: {
    fontSize: 14,
  },
  submitButton: {
    backgroundColor: "#4CAF50",
    flexDirection: "row",
    height: 60,
    borderRadius: BorderRadius.lg,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
    marginRight: Spacing.sm,
  },
  buttonIcon: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    padding: 5,
  },
  note: {
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
});
