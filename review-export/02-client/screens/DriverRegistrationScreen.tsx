import React, { useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  TextInput,
  Pressable,
  ActivityIndicator,
  Platform,
  ActionSheetIOS,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { GradientBackground } from "@/components/GradientBackground";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { AppColors, Spacing, BorderRadius, Shadows, FontWeight} from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";

export default function DriverRegistrationScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { phoneNumber, completeDriverRegistration, goBackToUserType } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [secondName, setSecondName] = useState("");
  const [thirdName, setThirdName] = useState("");
  const [fourthName, setFourthName] = useState("");
  const [motorcycleNumber, setMotorcycleNumber] = useState("");
  const [nationalIdImage, setNationalIdImage] = useState<string | null>(null);
  const [residenceCardImage, setResidenceCardImage] = useState<string | null>(null);
  const [driverLicenseImage, setDriverLicenseImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [agreementAccepted, setAgreementAccepted] = useState(false);

  const isFormValid =
    firstName.trim().length > 0 &&
    secondName.trim().length > 0 &&
    thirdName.trim().length > 0 &&
    fourthName.trim().length > 0 &&
    motorcycleNumber.trim().length > 0 &&
    nationalIdImage !== null &&
    residenceCardImage !== null &&
    agreementAccepted;

  const getSetterForType = (imageType: "nationalId" | "residenceCard" | "driverLicense") => {
    switch (imageType) {
      case "nationalId": return setNationalIdImage;
      case "residenceCard": return setResidenceCardImage;
      case "driverLicense": return setDriverLicenseImage;
    }
  };

  const handleImageResult = (result: ImagePicker.ImagePickerResult, imageType: "nationalId" | "residenceCard" | "driverLicense") => {
    if (result.canceled || !result.assets || !result.assets[0]) return;

    const asset = result.assets[0];
    const setter = getSetterForType(imageType);

    if (asset.base64) {
      const mimeType = asset.mimeType || "image/jpeg";
      setter(`data:${mimeType};base64,${asset.base64}`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      setter(asset.uri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const pickFromGallery = useCallback(async (imageType: "nationalId" | "residenceCard" | "driverLicense") => {
    setErrorMessage("");
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        setErrorMessage("يرجى السماح بالوصول لمعرض الصور لاختيار صورة");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.4,
        base64: true,
      });

      handleImageResult(result, imageType);
    } catch (error) {
      setErrorMessage("حدث خطأ أثناء اختيار الصورة");
    }
  }, []);

  const takePhoto = useCallback(async (imageType: "nationalId" | "residenceCard" | "driverLicense") => {
    setErrorMessage("");
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        setErrorMessage("يرجى السماح بالوصول للكاميرا لالتقاط صورة");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.4,
        base64: true,
      });

      handleImageResult(result, imageType);
    } catch (error) {
      setErrorMessage("حدث خطأ أثناء التقاط الصورة");
    }
  }, []);

  const showImageOptions = useCallback((imageType: "nationalId" | "residenceCard" | "driverLicense") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (Platform.OS === "web") {
      pickFromGallery(imageType);
      return;
    }

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["إلغاء", "الكاميرا", "معرض الصور"],
          cancelButtonIndex: 0,
          title: "اختر طريقة إضافة الصورة",
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            takePhoto(imageType);
          } else if (buttonIndex === 2) {
            pickFromGallery(imageType);
          }
        }
      );
    } else {
      pickFromGallery(imageType);
    }
  }, [pickFromGallery, takePhoto]);

  const handleSubmit = async () => {
    if (!isFormValid || !phoneNumber || !nationalIdImage || !residenceCardImage) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsLoading(true);
    setErrorMessage("");

    try {
      const fullName = `${firstName.trim()} ${secondName.trim()} ${thirdName.trim()} ${fourthName.trim()}`;

      const bodyData: Record<string, string> = {
        phoneNumber: phoneNumber || "",
        fullName,
        firstName: firstName.trim(),
        secondName: secondName.trim(),
        thirdName: thirdName.trim(),
        fourthName: fourthName.trim(),
        motorcycleNumber: motorcycleNumber.trim(),
        nationalIdImage,
        residenceCardImage,
      };
      if (driverLicenseImage) {
        bodyData.driverLicenseImage = driverLicenseImage;
      }

      const response = await fetch(new URL("/api/drivers", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyData),
      });

      if (!response.ok) {
        let errMsg = "فشل في تسجيل السائق";
        try {
          const err = await response.json();
          errMsg = err.error || errMsg;
        } catch {}
        throw new Error(errMsg);
      }

      await completeDriverRegistration();
    } catch (error: any) {
      setErrorMessage(error.message || "حدث خطأ أثناء التسجيل");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <GradientBackground />
    <KeyboardAwareScrollViewCompat
      style={[styles.container]}
      contentContainerStyle={{
        paddingTop: insets.top + Spacing.xl,
        paddingBottom: insets.bottom + Spacing.xl + 100,
        paddingHorizontal: Spacing.lg,
      }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      bottomOffset={50}
    >
      <Pressable
        style={[styles.backButton, { backgroundColor: theme.backgroundDefault }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          goBackToUserType();
        }}
        testID="button-back"
      >
        <Feather name="arrow-right" size={22} color={theme.text} />
        <ThemedText type="body" style={{ fontWeight: FontWeight.semiBold }}>رجوع</ThemedText>
      </Pressable>

      <View style={styles.header}>
        <View style={[styles.iconCircle, { backgroundColor: "#E8F5E915" }]}>
          <Feather name="truck" size={36} color={AppColors.success} />
        </View>
        <ThemedText type="h2" style={styles.title}>تسجيل سائق توصيل</ThemedText>
        <ThemedText type="body" style={[styles.subtitle, { color: theme.textSecondary }]}>
          أدخل بياناتك للانضمام لفريق التوصيل
        </ThemedText>
      </View>

      {errorMessage ? (
        <View style={styles.errorBanner}>
          <Feather name="alert-circle" size={18} color={AppColors.white} />
          <ThemedText type="body" style={styles.errorBannerText}>{errorMessage}</ThemedText>
          <Pressable onPress={() => setErrorMessage("")}>
            <Feather name="x" size={18} color={AppColors.white} />
          </Pressable>
        </View>
      ) : null}

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
        <View style={[styles.phoneDisplay, { backgroundColor: AppColors.primary + "08", borderColor: AppColors.primary + "30" }]}>
          <Feather name="check-circle" size={18} color={AppColors.success} />
          <ThemedText type="body" style={[styles.phoneText, { color: theme.text }]}>
            {phoneNumber}
          </ThemedText>
          <Feather name="phone" size={18} color={AppColors.primary} />
        </View>
        <ThemedText type="small" style={{ textAlign: "right", color: AppColors.success, marginTop: Spacing.xs, fontWeight: FontWeight.semiBold }}>
          تم تعبئة الرقم تلقائياً من تسجيل الدخول
        </ThemedText>
      </View>

      <View style={[styles.card, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
        <ThemedText type="h4" style={styles.sectionTitle}>رقم الدراجة النارية</ThemedText>
        <TextInput
          style={[styles.input, { backgroundColor: theme.backgroundSecondary, color: theme.text, borderColor: theme.border }]}
          placeholder="أدخل رقم الدراجة النارية"
          placeholderTextColor={theme.textSecondary}
          value={motorcycleNumber}
          onChangeText={setMotorcycleNumber}
          textAlign="right"
          testID="input-motorcycle-number"
        />
      </View>

      <View style={[styles.card, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
        <ThemedText type="h4" style={styles.sectionTitle}>صورة البطاقة الوطنية</ThemedText>
        <ThemedText type="small" style={[styles.idHint, { color: theme.textSecondary }]}>
          التقط صورة واضحة للوجه الأمامي للبطاقة الوطنية
        </ThemedText>

        <Pressable
          style={[styles.idUpload, { borderColor: nationalIdImage ? AppColors.primary : theme.border, backgroundColor: theme.backgroundSecondary }]}
          onPress={() => showImageOptions("nationalId")}
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
                <Feather name="check-circle" size={16} color={AppColors.white} />
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
        <ThemedText type="h4" style={styles.sectionTitle}>صورة بطاقة السكن</ThemedText>
        <ThemedText type="small" style={[styles.idHint, { color: theme.textSecondary }]}>
          التقط صورة واضحة لبطاقة السكن
        </ThemedText>

        <Pressable
          style={[styles.idUpload, { borderColor: residenceCardImage ? AppColors.success : theme.border, backgroundColor: theme.backgroundSecondary }]}
          onPress={() => showImageOptions("residenceCard")}
          testID="button-upload-residence-card"
        >
          {residenceCardImage ? (
            <View>
              <Image
                source={{ uri: residenceCardImage }}
                style={styles.idPreview}
                contentFit="cover"
              />
              <View style={[styles.uploadedBadge, { backgroundColor: AppColors.success }]}>
                <Feather name="check-circle" size={16} color={AppColors.white} />
                <ThemedText type="small" style={styles.uploadedText}>تم الرفع</ThemedText>
              </View>
            </View>
          ) : (
            <View style={styles.idPlaceholder}>
              <Feather name="home" size={36} color={theme.textSecondary} />
              <ThemedText type="body" style={[styles.idPlaceholderText, { color: theme.textSecondary }]}>
                اضغط لإضافة صورة بطاقة السكن
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
          style={[styles.idUpload, { borderColor: driverLicenseImage ? AppColors.success : theme.border, backgroundColor: theme.backgroundSecondary }]}
          onPress={() => showImageOptions("driverLicense")}
          testID="button-upload-license"
        >
          {driverLicenseImage ? (
            <View>
              <Image
                source={{ uri: driverLicenseImage }}
                style={styles.idPreview}
                contentFit="cover"
              />
              <View style={[styles.uploadedBadge, { backgroundColor: AppColors.success }]}>
                <Feather name="check-circle" size={16} color={AppColors.white} />
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

      <View style={[styles.card, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
        <ThemedText type="h4" style={[styles.sectionTitle, { color: AppColors.primary }]}>
          اتفاقية انضمام كابتن OnWay
        </ThemedText>

        <ScrollView 
          style={[styles.agreementBox, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}
          nestedScrollEnabled={true}
          showsVerticalScrollIndicator={true}
        >
          <ThemedText type="body" style={styles.agreementText}>
            بصفتك كابتن في تطبيق OnWay داخل قضاء الضلوعية، يجب عليك الالتزام بالشروط التالية:{"\n\n"}
            <ThemedText style={styles.agreementBold}>1. الأمانة والمسؤولية:</ThemedText>{"\n"}
            أتعهد بالحفاظ على الطلبات وتسليمها بحالتها الأصلية دون فتح الغلاف أو التلاعب بالمحتويات، وأتحمل المسؤولية الكاملة عن أي نقص أو تلف يحدث للطلب أثناء النقل.{"\n\n"}
            <ThemedText style={styles.agreementBold}>2. التعامل الأخلاقي:</ThemedText>{"\n"}
            الالتزام بالأدب وحسن السيرة والسلوك مع الزبائن وأصحاب المحلات، وتمثيل تطبيق OnWay بأفضل صورة أمام أهالي المنطقة.{"\n\n"}
            <ThemedText style={styles.agreementBold}>3. السلامة المرورية:</ThemedText>{"\n"}
            أتعهد بالالتزام بقواعد السلامة المرورية أثناء القيادة، وأقر بأنني المسؤول الأول والقانوني عن أي حادث أو مخالفة مرورية تحدث أثناء العمل.{"\n\n"}
            <ThemedText style={styles.agreementBold}>4. خصوصية البيانات:</ThemedText>{"\n"}
            أتعهد بعدم استخدام أرقام هواتف الزبائن أو مواقع سكنهم لأي غرض خارج إطار عملية التوصيل، ويمنع التواصل مع الزبون بعد انتهاء الطلب نهائياً.{"\n\n"}
            <ThemedText style={styles.agreementBold}>5. إخلاء المسؤولية:</ThemedText>{"\n"}
            يخلي تطبيق OnWay مسؤوليته عن أي نزاعات قانونية أو حوادث قد يتعرض لها السائق، حيث يعتبر السائق متعاقداً مستقلاً ويتحمل كافة التبعات القانونية لعمله.
          </ThemedText>
        </ScrollView>

        <Pressable
          style={styles.checkboxRow}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setAgreementAccepted(!agreementAccepted);
          }}
          testID="button-accept-agreement"
        >
          <View style={[styles.checkbox, agreementAccepted ? styles.checkboxChecked : { borderColor: theme.border }]}>
            {agreementAccepted ? (
              <Feather name="check" size={14} color={AppColors.white} />
            ) : null}
          </View>
          <ThemedText type="body" style={[styles.checkboxLabel, { color: theme.textSecondary }]}>
            أقر بأنني قرأت كافة الشروط وأوافق على تحمل المسؤولية الكاملة.
          </ThemedText>
        </Pressable>
      </View>

      <Pressable
        style={[styles.submitButton, !isFormValid && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={!isFormValid || isLoading}
        testID="button-submit-driver"
      >
        {isLoading ? (
          <ActivityIndicator color={AppColors.white} />
        ) : (
          <>
            <ThemedText type="h4" style={styles.submitButtonText}>
              إتمام الانضمام للفريق
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
  },
  errorBanner: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    backgroundColor: AppColors.error,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
  },
  errorBannerText: {
    flex: 1,
    color: AppColors.white,
    fontWeight: FontWeight.semiBold,
    textAlign: "right",
    fontSize: 14,
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
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.md,
    color: AppColors.textPrimary,
  },
  sectionTitleRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  optionalBadge: {
    backgroundColor: AppColors.successLight,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  optionalText: {
    color: AppColors.success,
    fontSize: 11,
    fontWeight: FontWeight.semiBold,
  },
  field: {
    marginBottom: Spacing.md,
  },
  label: {
    textAlign: "right",
    fontWeight: FontWeight.semiBold,
    marginBottom: Spacing.sm,
    fontSize: 14,
  },
  input: {
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: 13,
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
    fontSize: 13,
    fontWeight: FontWeight.semiBold,
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
    color: AppColors.white,
    fontWeight: FontWeight.bold,
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
    backgroundColor: AppColors.success,
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
    color: AppColors.white,
    fontWeight: FontWeight.bold,
    marginRight: Spacing.sm,
  },
  buttonIcon: {
    backgroundColor: AppColors.white,
    borderRadius: 10,
    padding: 5,
  },
  note: {
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  agreementBox: {
    maxHeight: 400,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    marginBottom: Spacing.lg,
  },
  agreementText: {
    fontSize: 14,
    color: AppColors.gray700,
    textAlign: "right",
    lineHeight: 24,
  },
  agreementBold: {
    fontWeight: FontWeight.bold,
    color: AppColors.black,
  },
  checkboxRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderRadius: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: {
    backgroundColor: AppColors.primary,
    borderColor: AppColors.primary,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 13,
    textAlign: "right",
    lineHeight: 20,
  },
});
