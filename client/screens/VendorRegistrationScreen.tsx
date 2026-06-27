import React, { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import { BUSINESS_TYPES } from "@/constants/businessCategories";
import { AppColors } from "@/constants/theme";

const ORANGE = AppColors.primary;
const PURPLE = AppColors.vendorPurple;

export default function VendorRegistrationScreen() {
  const insets = useSafeAreaInsets();
  const { phoneNumber, completeVendorRegistration, goBackToUserType, setUserType } = useAuth();

  const [storeName, setStoreName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [businessType, setBusinessType] = useState("restaurant");
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [pendingVendorData, setPendingVendorData] = useState<{ vendor: any; token: string } | null>(null);

  const submit = async () => {
    if (!storeName.trim() || !ownerName.trim() || !businessType) {
      setError("يرجى ملء اسم المتجر، اسمك، ونوع النشاط");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(new URL("/api/vendor/register", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeName: storeName.trim(),
          ownerName: ownerName.trim(),
          businessType,
          phoneNumber,
          address: address.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "حدث خطأ في التسجيل");
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (data.vendor && data.token) {
        setPendingVendorData({ vendor: data.vendor, token: data.token });
      }
      setSuccess(true);
    } catch {
      setError("تعذر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <View style={[styles.successWrap, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 }]}>
        <LinearGradient colors={[AppColors.vendorPurpleLight, AppColors.vendorPurpleLight]} style={styles.successIconBg}>
          <MaterialCommunityIcons name="store-check" size={56} color={PURPLE} />
        </LinearGradient>
        <ThemedText style={styles.successTitle}>تم إرسال طلبك بنجاح!</ThemedText>
        <ThemedText style={styles.successSub}>
          سيراجع فريق OnWay طلبك ويردّ عليك خلال 24 ساعة.{"\n"}
          ستُرسل لك إشعاراً عند الموافقة.
        </ThemedText>
        <View style={styles.pendingSteps}>
          {[
            { icon: "file-check", label: "مراجعة البيانات" },
            { icon: "account-check", label: "الموافقة على الحساب" },
            { icon: "storefront", label: "البدء في بيع منتجاتك" },
          ].map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <View style={[styles.stepNum, { backgroundColor: i === 0 ? PURPLE : AppColors.gray300 }]}>
                <ThemedText style={styles.stepNumText}>{i + 1}</ThemedText>
              </View>
              <MaterialCommunityIcons name={step.icon as any} size={20} color={i === 0 ? PURPLE : AppColors.gray400} style={{ marginHorizontal: 10 }} />
              <ThemedText style={[styles.stepLabel, { color: i === 0 ? AppColors.gray700 : AppColors.gray400 }]}>{step.label}</ThemedText>
            </View>
          ))}
        </View>
        <Pressable
          style={styles.doneBtn}
          onPress={async () => {
            if (pendingVendorData) {
              await completeVendorRegistration(pendingVendorData.vendor, pendingVendorData.token);
            } else {
              goBackToUserType();
            }
          }}
          testID="button-done"
        >
          <ThemedText style={styles.doneBtnText}>الدخول للتطبيق</ThemedText>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[PURPLE, AppColors.vendorPurple]}
        style={[styles.header, { paddingTop: insets.top + 16 }]}
      >
        <Pressable style={styles.backBtn} onPress={goBackToUserType} testID="button-back">
          <Feather name="arrow-right" size={20} color={AppColors.white} />
        </Pressable>
        <View style={styles.headerTextWrap}>
          <MaterialCommunityIcons name="store" size={32} color={AppColors.white} style={{ marginBottom: 6 }} />
          <ThemedText style={styles.headerTitle}>تسجيل متجر جديد</ThemedText>
          <ThemedText style={styles.headerSub}>انضم كشريك تجاري في OnWay</ThemedText>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {!!error && (
          <View style={styles.errorBox}>
            <Feather name="alert-circle" size={16} color={AppColors.error} />
            <ThemedText style={styles.errorText}>{error}</ThemedText>
          </View>
        )}

        <View style={styles.phoneNote}>
          <Feather name="phone" size={14} color={ORANGE} />
          <ThemedText style={styles.phoneNoteText}>رقم الهاتف: {phoneNumber}</ThemedText>
        </View>

        <Label text="اسم المتجر" required />
        <TextInput
          style={styles.input}
          value={storeName}
          onChangeText={setStoreName}
          placeholder="مثال: مطعم النخيل"
          placeholderTextColor={AppColors.gray300}
          testID="input-storeName"
        />

        <Label text="اسمك (صاحب المتجر)" required />
        <TextInput
          style={styles.input}
          value={ownerName}
          onChangeText={setOwnerName}
          placeholder="الاسم الكامل"
          placeholderTextColor={AppColors.gray300}
          testID="input-ownerName"
        />

        <Label text="نوع النشاط التجاري" required />
        <View style={styles.pickerWrap}>
          <Picker
            selectedValue={businessType}
            onValueChange={setBusinessType}
            style={styles.picker}
            itemStyle={{ fontFamily: "Cairo_400Regular", fontSize: 14 }}
          >
            {BUSINESS_TYPES.map((t) => (
              <Picker.Item key={t.value} label={t.label} value={t.value} />
            ))}
          </Picker>
        </View>

        <Label text="العنوان (اختياري)" />
        <TextInput
          style={styles.input}
          value={address}
          onChangeText={setAddress}
          placeholder="بغداد، المنصور..."
          placeholderTextColor={AppColors.gray300}
          testID="input-address"
        />

        <View style={styles.infoBox}>
          <Feather name="info" size={14} color={AppColors.gray500} />
          <ThemedText style={styles.infoText}>
            سيتم مراجعة طلبك خلال 24 ساعة وستصلك إشعار عند الموافقة
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
            <ThemedText style={styles.submitText}>إرسال طلب الانضمام</ThemedText>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Label({ text, required }: { text: string; required?: boolean }) {
  return (
    <ThemedText style={styles.label}>
      {text}
      {required ? <ThemedText style={{ color: ORANGE }}> *</ThemedText> : null}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AppColors.white },
  header: {
    paddingBottom: 32,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center", alignItems: "center",
    alignSelf: "flex-end",
  },
  headerTextWrap: { alignItems: "center", marginTop: 8 },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 20, color: AppColors.white, textAlign: "center" },
  headerSub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: "rgba(255,255,255,0.75)", textAlign: "center", marginTop: 4 },
  scroll: { flex: 1 },
  label: { fontFamily: "Cairo_700Bold", fontSize: 13, color: AppColors.gray700, marginBottom: 6, textAlign: "right" },
  input: {
    borderWidth: 1.5, borderColor: AppColors.divider, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: "Cairo_400Regular", fontSize: 14, color: AppColors.black,
    textAlign: "right", marginBottom: 16,
    backgroundColor: AppColors.gray50,
  },
  pickerWrap: {
    borderWidth: 1.5, borderColor: AppColors.divider, borderRadius: 12,
    marginBottom: 16, backgroundColor: AppColors.gray50, overflow: "hidden",
  },
  picker: { height: Platform.OS === "ios" ? 150 : 50, color: AppColors.black },
  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: AppColors.errorLight, borderRadius: 10,
    padding: 12, marginBottom: 16, borderWidth: 1, borderColor: AppColors.error,
  },
  errorText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: AppColors.error, flex: 1, textAlign: "right" },
  phoneNote: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: AppColors.secondary, borderRadius: 10,
    padding: 10, marginBottom: 20, borderWidth: 1, borderColor: AppColors.secondary,
  },
  phoneNoteText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: AppColors.primaryDark, flex: 1, textAlign: "right" },
  infoBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: AppColors.gray50, borderRadius: 10,
    padding: 12, marginBottom: 20, borderWidth: 1, borderColor: AppColors.divider,
  },
  infoText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: AppColors.gray500, flex: 1, textAlign: "right", lineHeight: 20 },
  submitBtn: {
    backgroundColor: PURPLE, borderRadius: 14, paddingVertical: 14,
    alignItems: "center",
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: AppColors.white },
  // Success
  successWrap: { flex: 1, backgroundColor: AppColors.white, alignItems: "center", paddingHorizontal: 32 },
  successIconBg: {
    width: 110, height: 110, borderRadius: 32,
    justifyContent: "center", alignItems: "center", marginBottom: 24,
  },
  successTitle: { fontFamily: "Cairo_700Bold", fontSize: 22, color: AppColors.gray700, textAlign: "center", marginBottom: 12 },
  successSub: { fontFamily: "Cairo_400Regular", fontSize: 14, color: AppColors.gray500, textAlign: "center", lineHeight: 24, marginBottom: 32 },
  pendingSteps: { width: "100%", gap: 14, marginBottom: 40 },
  stepRow: { flexDirection: "row", alignItems: "center" },
  stepNum: {
    width: 26, height: 26, borderRadius: 13,
    justifyContent: "center", alignItems: "center",
  },
  stepNumText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: AppColors.white },
  stepLabel: { fontFamily: "Cairo_400Regular", fontSize: 14 },
  doneBtn: {
    backgroundColor: PURPLE, borderRadius: 14, paddingVertical: 14,
    paddingHorizontal: 32, alignItems: "center", width: "100%",
  },
  doneBtnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: AppColors.white },
});
