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

const ORANGE = "#E86520";
const PURPLE = "#673AB7";

const BUSINESS_TYPES = [
  { label: "مطعم / وجبات", value: "restaurant" },
  { label: "سوبرماركت / بقالة", value: "supermarket" },
  { label: "صيدلية", value: "pharmacy" },
  { label: "مخبز / حلويات", value: "bakery" },
  { label: "أخرى", value: "other" },
];

export default function VendorRegistrationScreen() {
  const insets = useSafeAreaInsets();
  const { phoneNumber, completeVendorRegistration, goBackToUserType } = useAuth();

  const [storeName, setStoreName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [businessType, setBusinessType] = useState("restaurant");
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

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
        <LinearGradient colors={["#EDE7F6", "#D1C4E9"]} style={styles.successIconBg}>
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
              <View style={[styles.stepNum, { backgroundColor: i === 0 ? PURPLE : "#ccc" }]}>
                <ThemedText style={styles.stepNumText}>{i + 1}</ThemedText>
              </View>
              <MaterialCommunityIcons name={step.icon as any} size={20} color={i === 0 ? PURPLE : "#aaa"} style={{ marginHorizontal: 10 }} />
              <ThemedText style={[styles.stepLabel, { color: i === 0 ? "#333" : "#aaa" }]}>{step.label}</ThemedText>
            </View>
          ))}
        </View>
        <Pressable style={styles.doneBtn} onPress={goBackToUserType} testID="button-done">
          <ThemedText style={styles.doneBtnText}>العودة للشاشة الرئيسية</ThemedText>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[PURPLE, "#4527A0"]}
        style={[styles.header, { paddingTop: insets.top + 16 }]}
      >
        <Pressable style={styles.backBtn} onPress={goBackToUserType} testID="button-back">
          <Feather name="arrow-right" size={20} color="#fff" />
        </Pressable>
        <View style={styles.headerTextWrap}>
          <MaterialCommunityIcons name="store" size={32} color="#fff" style={{ marginBottom: 6 }} />
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
            <Feather name="alert-circle" size={16} color="#EF4444" />
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
          placeholderTextColor="#bbb"
          testID="input-storeName"
        />

        <Label text="اسمك (صاحب المتجر)" required />
        <TextInput
          style={styles.input}
          value={ownerName}
          onChangeText={setOwnerName}
          placeholder="الاسم الكامل"
          placeholderTextColor="#bbb"
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
          placeholderTextColor="#bbb"
          testID="input-address"
        />

        <View style={styles.infoBox}>
          <Feather name="info" size={14} color="#666" />
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
            <ActivityIndicator color="#fff" />
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
  container: { flex: 1, backgroundColor: "#fff" },
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
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: 20, color: "#fff", textAlign: "center" },
  headerSub: { fontFamily: "Cairo_400Regular", fontSize: 13, color: "rgba(255,255,255,0.75)", textAlign: "center", marginTop: 4 },
  scroll: { flex: 1 },
  label: { fontFamily: "Cairo_700Bold", fontSize: 13, color: "#444", marginBottom: 6, textAlign: "right" },
  input: {
    borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontFamily: "Cairo_400Regular", fontSize: 14, color: "#111",
    textAlign: "right", marginBottom: 16,
    backgroundColor: "#FAFAFA",
  },
  pickerWrap: {
    borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 12,
    marginBottom: 16, backgroundColor: "#FAFAFA", overflow: "hidden",
  },
  picker: { height: Platform.OS === "ios" ? 150 : 50, color: "#111" },
  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#FEF2F2", borderRadius: 10,
    padding: 12, marginBottom: 16, borderWidth: 1, borderColor: "#FECACA",
  },
  errorText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: "#EF4444", flex: 1, textAlign: "right" },
  phoneNote: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#FFF7ED", borderRadius: 10,
    padding: 10, marginBottom: 20, borderWidth: 1, borderColor: "#FED7AA",
  },
  phoneNoteText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: "#92400E", flex: 1, textAlign: "right" },
  infoBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "#F9FAFB", borderRadius: 10,
    padding: 12, marginBottom: 20, borderWidth: 1, borderColor: "#E5E7EB",
  },
  infoText: { fontFamily: "Cairo_400Regular", fontSize: 12, color: "#666", flex: 1, textAlign: "right", lineHeight: 20 },
  submitBtn: {
    backgroundColor: PURPLE, borderRadius: 14, paddingVertical: 14,
    alignItems: "center",
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },
  // Success
  successWrap: { flex: 1, backgroundColor: "#fff", alignItems: "center", paddingHorizontal: 32 },
  successIconBg: {
    width: 110, height: 110, borderRadius: 32,
    justifyContent: "center", alignItems: "center", marginBottom: 24,
  },
  successTitle: { fontFamily: "Cairo_700Bold", fontSize: 22, color: "#333", textAlign: "center", marginBottom: 12 },
  successSub: { fontFamily: "Cairo_400Regular", fontSize: 14, color: "#666", textAlign: "center", lineHeight: 24, marginBottom: 32 },
  pendingSteps: { width: "100%", gap: 14, marginBottom: 40 },
  stepRow: { flexDirection: "row", alignItems: "center" },
  stepNum: {
    width: 26, height: 26, borderRadius: 13,
    justifyContent: "center", alignItems: "center",
  },
  stepNumText: { fontFamily: "Cairo_700Bold", fontSize: 12, color: "#fff" },
  stepLabel: { fontFamily: "Cairo_400Regular", fontSize: 14 },
  doneBtn: {
    backgroundColor: PURPLE, borderRadius: 14, paddingVertical: 14,
    paddingHorizontal: 32, alignItems: "center", width: "100%",
  },
  doneBtnText: { fontFamily: "Cairo_700Bold", fontSize: 16, color: "#fff" },
});
