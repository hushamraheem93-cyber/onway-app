import React, { useState } from "react";
import {
  StyleSheet,
  View,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { useNavigation } from "@react-navigation/native";

import { ThemedText } from "@/components/ThemedText";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { AppColors, Spacing, BorderRadius, Shadows } from "@/constants/theme";

const REGIONS = [
  { id: "daloaiya", name: "الضلوعية المركز" },
  { id: "hawija", name: "الحويجة البحرية" },
  { id: "jbour", name: "منطقة الجبور" },
  { id: "bishikan", name: "بيشيكان" },
  { id: "other", name: "منطقة أخرى" },
];

export default function EditProfileScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation();
  const { theme } = useTheme();
  const { userProfile, saveProfile, phoneNumber } = useAuth();

  const [fullName, setFullName] = useState(userProfile?.fullName || "");
  const [gender, setGender] = useState<"male" | "female" | null>(userProfile?.gender || null);
  const [region, setRegion] = useState(userProfile?.region || "");
  const [address, setAddress] = useState(userProfile?.address || "");
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showRegionPicker, setShowRegionPicker] = useState(false);

  const existingImageUrl = userProfile?.profileImage || null;
  const displayImageUrl = profileImage || existingImageUrl;

  const isFormValid = fullName.trim() && gender && region && address.trim();

  const handleSave = async () => {
    if (!isFormValid || !gender) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsLoading(true);

    try {
      await saveProfile({
        fullName: fullName.trim(),
        gender,
        region,
        address: address.trim(),
      }, profileImage || undefined);
      
      Alert.alert("تم", "تم تحديث الملف الشخصي بنجاح", [
        { text: "حسناً", onPress: () => navigation.goBack() }
      ]);
    } catch (error: any) {
      Alert.alert("خطأ", error.message || "حدث خطأ أثناء حفظ البيانات");
    } finally {
      setIsLoading(false);
    }
  };

  const pickImage = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
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
    Alert.alert(
      "صورة الملف الشخصي",
      "اختر طريقة إضافة الصورة",
      [
        { text: "الكاميرا", onPress: takePhoto },
        { text: "معرض الصور", onPress: pickImage },
        { text: "إلغاء", style: "cancel" },
      ]
    );
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

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: insets.bottom + Spacing.xl + 100,
        paddingHorizontal: Spacing.lg,
      }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      bottomOffset={50}
    >
      <View style={styles.header}>
        <Pressable onPress={showImageOptions} style={styles.avatarContainer}>
          {displayImageUrl ? (
            <Image
              source={{ uri: displayImageUrl }}
              style={styles.avatarImage}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: AppColors.primary }]}>
              <Feather name="user" size={40} color="#FFFFFF" />
            </View>
          )}
          <View style={[styles.cameraButton, { backgroundColor: theme.backgroundDefault }]}>
            <Feather name="camera" size={16} color={AppColors.primary} />
          </View>
        </Pressable>
        <ThemedText type="small" style={[styles.avatarHint, { color: theme.textSecondary }]}>
          اضغط لتغيير الصورة
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
                color={gender === "female" ? "#FFFFFF" : theme.textSecondary} 
              />
              <ThemedText 
                type="body" 
                style={[
                  styles.genderText,
                  { color: gender === "female" ? "#FFFFFF" : theme.text },
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
                color={gender === "male" ? "#FFFFFF" : theme.textSecondary} 
              />
              <ThemedText 
                type="body" 
                style={[
                  styles.genderText,
                  { color: gender === "male" ? "#FFFFFF" : theme.text },
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
          <ThemedText type="body" style={styles.label}>العنوان التفصيلي</ThemedText>
          <TextInput
            style={[
              styles.input,
              styles.textarea,
              { 
                backgroundColor: theme.backgroundSecondary, 
                color: theme.text,
                borderColor: theme.border,
              },
            ]}
            placeholder="مثال: حي النور، شارع المدرسة، قرب المسجد الكبير"
            placeholderTextColor={theme.textSecondary}
            value={address}
            onChangeText={setAddress}
            textAlign="right"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>
      </View>

      <Pressable
        style={[
          styles.saveButton,
          !isFormValid && styles.saveButtonDisabled,
        ]}
        onPress={handleSave}
        disabled={!isFormValid || isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <ThemedText type="h4" style={styles.saveButtonText}>
            حفظ التغييرات
          </ThemedText>
        )}
      </Pressable>

      <ThemedText type="small" style={[styles.note, { color: theme.textSecondary }]}>
        رقم الهاتف: {phoneNumber}
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
  avatarContainer: {
    position: "relative",
    marginBottom: Spacing.sm,
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
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
    borderColor: "#FFFFFF",
    overflow: "hidden",
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#FFFFFF",
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
    borderColor: "#FFFFFF",
  },
  avatarHint: {
    marginBottom: Spacing.md,
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
    marginBottom: Spacing.sm,
    fontWeight: "600",
  },
  input: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    fontSize: 13,
    borderWidth: 1,
  },
  textarea: {
    minHeight: 100,
    textAlignVertical: "top",
    paddingTop: Spacing.md,
  },
  genderRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  genderOption: {
    flex: 1,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  genderText: {
    fontWeight: "500",
  },
  dropdown: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dropdownText: {
    flex: 1,
    textAlign: "right",
  },
  pickerContainer: {
    marginTop: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    overflow: "hidden",
  },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  pickerItemText: {
    textAlign: "right",
    flex: 1,
  },
  saveButton: {
    backgroundColor: AppColors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
  },
  note: {
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
});
