import React, { useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";

import { ThemedText } from "@/components/ThemedText";
import { GradientBackground } from "@/components/GradientBackground";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { useLocation } from "@/context/LocationContext";
import { AppColors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

type NavProp = NativeStackNavigationProp<RootStackParamList, "ProfileCompletion">;

const REGIONS = [
  { id: "daloaiya", name: "الضلوعية المركز" },
  { id: "hawija", name: "الحويجة البحرية" },
  { id: "jbour", name: "منطقة الجبور" },
  { id: "bishikan", name: "بيشيكان" },
  { id: "other", name: "منطقة أخرى" },
];

export default function ProfileCompletionScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { saveProfile, phoneNumber, logout } = useAuth();
  const { savedLocation } = useLocation();
  const navigation = useNavigation<NavProp>();

  const [fullName, setFullName] = useState("");
  const [gender, setGender] = useState<"male" | "female" | null>(null);
  const [region, setRegion] = useState("");
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showRegionPicker, setShowRegionPicker] = useState(false);

  const [pickedAddress, setPickedAddress] = useState<{
    address: string;
    latitude: number;
    longitude: number;
  } | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (savedLocation) {
        setPickedAddress({
          address: savedLocation.address,
          latitude: savedLocation.latitude,
          longitude: savedLocation.longitude,
        });
      }
    }, [savedLocation])
  );

  const isFormValid = fullName.trim() && gender && region && pickedAddress;

  const handleSave = async () => {
    if (!isFormValid || !gender || !pickedAddress) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsLoading(true);

    try {
      await saveProfile(
        {
          fullName: fullName.trim(),
          gender,
          region,
          address: pickedAddress.address,
          latitude: pickedAddress.latitude,
          longitude: pickedAddress.longitude,
        },
        profileImage || undefined
      );
    } catch (error: any) {
      Alert.alert("خطأ", error.message || "حدث خطأ أثناء حفظ البيانات");
    } finally {
      setIsLoading(false);
    }
  };

  const pickImage = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setProfileImage(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("تنبيه", "يرجى السماح بالوصول للكاميرا لالتقاط صورة");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setProfileImage(result.assets[0].uri);
    }
  };

  const showImageOptions = () => {
    Alert.alert("صورة الملف الشخصي", "اختر طريقة إضافة الصورة", [
      { text: "الكاميرا", onPress: takePhoto },
      { text: "معرض الصور", onPress: pickImage },
      { text: "إلغاء", style: "cancel" },
    ]);
  };

  const handleGenderSelect = (selectedGender: "male" | "female") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setGender(selectedGender);
  };

  const handleRegionSelect = (selectedRegion: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRegion(selectedRegion);
    setShowRegionPicker(false);
  };

  const openMapPicker = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("MapPicker");
  };

  return (
    <View style={{ flex: 1 }}>
      <GradientBackground />
      <KeyboardAwareScrollViewCompat
        style={styles.container}
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
            logout();
          }}
          testID="button-back"
        >
          <Feather name="arrow-right" size={22} color={theme.text} />
          <ThemedText type="body" style={{ fontWeight: "600" }}>رجوع</ThemedText>
        </Pressable>

        <View style={styles.header}>
          <Pressable onPress={showImageOptions} style={styles.avatarContainer}>
            {profileImage ? (
              <Image
                source={{ uri: profileImage }}
                style={styles.avatarImage}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: AppColors.primary }]}>
                <Feather name="user" size={40} color={AppColors.white} />
              </View>
            )}
            <View style={[styles.cameraButton, { backgroundColor: theme.backgroundDefault }]}>
              <Feather name="camera" size={16} color={AppColors.primary} />
            </View>
          </Pressable>
          <ThemedText type="small" style={[styles.avatarHint, { color: theme.textSecondary }]}>
            اضغط لإضافة صورة
          </ThemedText>
          <ThemedText type="h2" style={styles.title}>أكمل ملفك الشخصي</ThemedText>
          <ThemedText type="body" style={[styles.subtitle, { color: theme.textSecondary }]}>
            يرجى إدخال بياناتك للمتابعة
          </ThemedText>
        </View>

        <View style={[styles.card, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
          <View style={styles.field}>
            <ThemedText type="body" style={styles.label}>الاسم الكامل</ThemedText>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.backgroundSecondary,
                  color: theme.text,
                  borderColor: theme.border,
                },
              ]}
              placeholder="أدخل اسمك الكامل"
              placeholderTextColor={theme.textSecondary}
              value={fullName}
              onChangeText={setFullName}
              textAlign="right"
              autoCapitalize="words"
            />
          </View>

          <View style={styles.field}>
            <ThemedText type="body" style={styles.label}>الجنس</ThemedText>
            <View style={styles.genderRow}>
              <Pressable
                style={[
                  styles.genderOption,
                  {
                    backgroundColor: gender === "female" ? AppColors.primary : theme.backgroundSecondary,
                    borderColor: gender === "female" ? AppColors.primary : theme.border,
                  },
                ]}
                onPress={() => handleGenderSelect("female")}
              >
                <Feather
                  name="user"
                  size={20}
                  color={gender === "female" ? AppColors.white : theme.textSecondary}
                />
                <ThemedText
                  type="body"
                  style={[
                    styles.genderText,
                    { color: gender === "female" ? AppColors.white : theme.text },
                  ]}
                >
                  أنثى
                </ThemedText>
              </Pressable>

              <Pressable
                style={[
                  styles.genderOption,
                  {
                    backgroundColor: gender === "male" ? AppColors.primary : theme.backgroundSecondary,
                    borderColor: gender === "male" ? AppColors.primary : theme.border,
                  },
                ]}
                onPress={() => handleGenderSelect("male")}
              >
                <Feather
                  name="user"
                  size={20}
                  color={gender === "male" ? AppColors.white : theme.textSecondary}
                />
                <ThemedText
                  type="body"
                  style={[
                    styles.genderText,
                    { color: gender === "male" ? AppColors.white : theme.text },
                  ]}
                >
                  ذكر
                </ThemedText>
              </Pressable>
            </View>
          </View>

          <View style={styles.field}>
            <ThemedText type="body" style={styles.label}>المنطقة</ThemedText>
            <Pressable
              style={[
                styles.input,
                styles.dropdown,
                {
                  backgroundColor: theme.backgroundSecondary,
                  borderColor: theme.border,
                },
              ]}
              onPress={() => setShowRegionPicker(!showRegionPicker)}
            >
              <Feather name="chevron-down" size={20} color={theme.textSecondary} />
              <ThemedText
                type="body"
                style={[
                  styles.dropdownText,
                  { color: region ? theme.text : theme.textSecondary },
                ]}
              >
                {region || "اختر منطقتك"}
              </ThemedText>
            </Pressable>

            {showRegionPicker ? (
              <View style={[styles.pickerContainer, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
                {REGIONS.map((r) => (
                  <Pressable
                    key={r.id}
                    style={[
                      styles.pickerItem,
                      region === r.name && { backgroundColor: `${AppColors.primary}20` },
                    ]}
                    onPress={() => handleRegionSelect(r.name)}
                  >
                    <ThemedText type="body" style={styles.pickerItemText}>
                      {r.name}
                    </ThemedText>
                    {region === r.name ? (
                      <Feather name="check" size={18} color={AppColors.primary} />
                    ) : null}
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          <View style={styles.field}>
            <ThemedText type="body" style={styles.label}>الموقع على الخريطة</ThemedText>

            {pickedAddress ? (
              <Pressable
                style={[styles.locationCard, { borderColor: AppColors.primary + "40", backgroundColor: AppColors.primary + "08" }]}
                onPress={openMapPicker}
                testID="button-change-location"
              >
                <View style={styles.locationCardLeft}>
                  <View style={styles.locationIcon}>
                    <Feather name="map-pin" size={18} color={AppColors.primary} />
                  </View>
                  <View style={styles.locationTextContainer}>
                    <ThemedText type="small" style={[styles.locationLabel, { color: theme.textSecondary }]}>
                      الموقع المحدد
                    </ThemedText>
                    <ThemedText type="body" style={[styles.locationAddress, { color: theme.text }]} numberOfLines={2}>
                      {pickedAddress.address}
                    </ThemedText>
                  </View>
                </View>
                <View style={styles.changeBtn}>
                  <ThemedText type="small" style={{ color: AppColors.primary, fontWeight: "700" }}>
                    تغيير
                  </ThemedText>
                </View>
              </Pressable>
            ) : (
              <Pressable
                style={[styles.mapButton, { borderColor: theme.border, backgroundColor: theme.backgroundSecondary }]}
                onPress={openMapPicker}
                testID="button-pick-location"
              >
                <View style={[styles.mapButtonIcon, { backgroundColor: AppColors.primary + "18" }]}>
                  <Feather name="map-pin" size={22} color={AppColors.primary} />
                </View>
                <View style={styles.mapButtonText}>
                  <ThemedText type="body" style={{ fontWeight: "700", color: theme.text, textAlign: "right" }}>
                    تحديد موقعي على الخريطة
                  </ThemedText>
                  <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "right" }}>
                    اضغط لتحديد عنوانك بدقة
                  </ThemedText>
                </View>
                <Feather name="chevron-left" size={20} color={theme.textSecondary} />
              </Pressable>
            )}
          </View>
        </View>

        <Pressable
          style={[
            styles.saveButton,
            !isFormValid && styles.saveButtonDisabled,
          ]}
          onPress={handleSave}
          disabled={!isFormValid || isLoading}
          testID="button-save-profile"
        >
          {isLoading ? (
            <ActivityIndicator color={AppColors.white} />
          ) : (
            <>
              <ThemedText type="h4" style={styles.saveButtonText}>
                حفظ والمتابعة
              </ThemedText>
              <View style={styles.buttonIcon}>
                <Feather name="arrow-left" size={20} color={AppColors.primary} />
              </View>
            </>
          )}
        </Pressable>

        <ThemedText type="small" style={[styles.note, { color: theme.textSecondary }]}>
          رقم الهاتف: {phoneNumber}
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
  header: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  avatarContainer: {
    position: "relative",
    marginBottom: Spacing.sm,
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: AppColors.white,
    shadowColor: AppColors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: AppColors.white,
    overflow: "hidden",
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: AppColors.white,
    overflow: "hidden",
  },
  cameraButton: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: AppColors.white,
  },
  avatarHint: {
    marginBottom: Spacing.md,
  },
  title: {
    textAlign: "center",
    marginBottom: Spacing.xs,
    lineHeight: 38,
    includeFontPadding: true,
    paddingTop: 4,
  },
  subtitle: {
    textAlign: "center",
    lineHeight: 26,
    includeFontPadding: true,
  },
  card: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  field: {
    marginBottom: Spacing.lg,
  },
  label: {
    textAlign: "right",
    fontWeight: "600",
    marginBottom: Spacing.sm,
  },
  input: {
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: 13,
    borderWidth: 1,
  },
  dropdown: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dropdownText: {
    flex: 1,
    textAlign: "right",
  },
  pickerContainer: {
    marginTop: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  pickerItem: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  pickerItemText: {
    textAlign: "right",
  },
  genderRow: {
    flexDirection: "row-reverse",
    gap: Spacing.md,
  },
  genderOption: {
    flex: 1,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  genderText: {
    fontWeight: "600",
  },
  mapButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderStyle: "dashed",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  mapButtonIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  mapButtonText: {
    flex: 1,
    gap: 3,
  },
  locationCard: {
    flexDirection: "row-reverse",
    alignItems: "center",
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  locationCardLeft: {
    flex: 1,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
  },
  locationIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: AppColors.primary + "18",
    justifyContent: "center",
    alignItems: "center",
  },
  locationTextContainer: {
    flex: 1,
    gap: 2,
  },
  locationLabel: {
    textAlign: "right",
    fontSize: 11,
  },
  locationAddress: {
    textAlign: "right",
    fontWeight: "600",
    fontSize: 13,
    lineHeight: 20,
  },
  changeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: AppColors.primary + "15",
  },
  saveButton: {
    backgroundColor: AppColors.primary,
    flexDirection: "row",
    height: 60,
    borderRadius: BorderRadius.lg,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: AppColors.white,
    fontWeight: "bold",
    marginRight: Spacing.sm,
  },
  buttonIcon: {
    backgroundColor: AppColors.white,
    borderRadius: 10,
    padding: 5,
  },
  note: {
    textAlign: "center",
  },
});
