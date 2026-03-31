import React, { useState } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { GradientBackground } from "@/components/GradientBackground";
import { useTheme } from "@/hooks/useTheme";
import { AppColors, Spacing } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl, apiRequest } from "@/lib/query-client";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

const BRAND_ORANGE = "#E86520";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function CourierPickupScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const { phoneNumber } = useAuth();

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [orderPrice, setOrderPrice] = useState("");
  const [courierLocation, setCourierLocation] = useState("");
  const [courierPhone, setCourierPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const isFormValid =
    customerName.trim().length > 0 &&
    customerPhone.trim().length > 0 &&
    orderPrice.trim().length > 0 &&
    courierLocation.trim().length > 0 &&
    courierPhone.trim().length > 0;

  const handleSubmit = async () => {
    if (!isFormValid) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsSubmitting(true);

    try {
      const orderData = {
        phoneNumber: phoneNumber || customerPhone,
        customerName,
        items: [
          {
            productId: "courier-pickup",
            name: "استلام طلب من المندوب",
            price: Number(orderPrice) || 0,
            quantity: 1,
            image: "",
          },
        ],
        total: Number(orderPrice) || 0,
        deliveryFee: 0,
        address: courierLocation,
        region: "خدمات المندوب",
        courierPhone,
        notes: notes || undefined,
        orderType: "courier-pickup",
      };

      const response = await fetch(new URL("/api/orders", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderData),
      });

      if (response.ok) {
        setIsSubmitted(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert("خطأ", "حدث خطأ أثناء تقديم الطلب. حاول مرة أخرى.");
      }
    } catch (error) {
      Alert.alert("خطأ", "حدث خطأ في الاتصال. تأكد من اتصالك بالإنترنت.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundDefault }]}>
        <View style={[styles.successContainer, { paddingTop: headerHeight + 40 }]}>
          <View style={styles.successIcon}>
            <Feather name="check-circle" size={64} color={BRAND_ORANGE} />
          </View>
          <ThemedText style={styles.successTitle}>تم تقديم الطلب بنجاح</ThemedText>
          <ThemedText style={styles.successSubtitle}>
            سيتم التواصل معك قريباً لتأكيد استلام الطلب
          </ThemedText>
          <Pressable
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            testID="button-back-home"
          >
            <ThemedText style={styles.backButtonText}>العودة للرئيسية</ThemedText>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={headerHeight}
    >
      <GradientBackground />
      <ScrollView
        style={[styles.container]}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.lg,
          paddingBottom: insets.bottom + 40,
          paddingHorizontal: 20,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerSection}>
          <View style={styles.headerIconWrap}>
            <Feather name="package" size={32} color={BRAND_ORANGE} />
          </View>
          <ThemedText style={styles.headerTitle}>استلام طلب من المندوب</ThemedText>
          <ThemedText style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
            أدخل تفاصيل الطلب المراد استلامه
          </ThemedText>
        </View>

        <View style={styles.formSection}>
          <View style={styles.inputGroup}>
            <ThemedText style={styles.label}>اسم صاحب الطلب</ThemedText>
            <View style={[styles.inputContainer, { backgroundColor: theme.backgroundSecondary }]}>
              <Feather name="user" size={18} color="#999" style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="أدخل اسم صاحب الطلب"
                placeholderTextColor="#BBB"
                value={customerName}
                onChangeText={setCustomerName}
                textAlign="right"
                testID="input-customer-name"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={styles.label}>رقم هاتف صاحب الطلب</ThemedText>
            <View style={[styles.inputContainer, { backgroundColor: theme.backgroundSecondary }]}>
              <Feather name="phone" size={18} color="#999" style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="07xxxxxxxxx"
                placeholderTextColor="#BBB"
                value={customerPhone}
                onChangeText={setCustomerPhone}
                keyboardType="phone-pad"
                textAlign="right"
                testID="input-customer-phone"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={styles.label}>سعر الطلب (د.ع)</ThemedText>
            <View style={[styles.inputContainer, { backgroundColor: theme.backgroundSecondary }]}>
              <Feather name="dollar-sign" size={18} color="#999" style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="أدخل سعر الطلب بالدينار"
                placeholderTextColor="#BBB"
                value={orderPrice}
                onChangeText={setOrderPrice}
                keyboardType="numeric"
                textAlign="right"
                testID="input-order-price"
              />
            </View>
          </View>

          <View style={styles.divider} />

          <ThemedText style={styles.sectionTitle}>معلومات المندوب</ThemedText>

          <View style={styles.inputGroup}>
            <ThemedText style={styles.label}>موقع المندوب</ThemedText>
            <View style={[styles.inputContainer, { backgroundColor: theme.backgroundSecondary }]}>
              <Feather name="map-pin" size={18} color="#999" style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="أدخل موقع أو عنوان المندوب"
                placeholderTextColor="#BBB"
                value={courierLocation}
                onChangeText={setCourierLocation}
                textAlign="right"
                testID="input-courier-location"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={styles.label}>رقم هاتف المندوب</ThemedText>
            <View style={[styles.inputContainer, { backgroundColor: theme.backgroundSecondary }]}>
              <Feather name="phone-call" size={18} color="#999" style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="07xxxxxxxxx"
                placeholderTextColor="#BBB"
                value={courierPhone}
                onChangeText={setCourierPhone}
                keyboardType="phone-pad"
                textAlign="right"
                testID="input-courier-phone"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={styles.label}>ملاحظات إضافية (اختياري)</ThemedText>
            <View style={[styles.inputContainer, styles.textArea, { backgroundColor: theme.backgroundSecondary }]}>
              <TextInput
                style={[styles.input, styles.textAreaInput, { color: theme.text }]}
                placeholder="أي تفاصيل إضافية عن الطلب..."
                placeholderTextColor="#BBB"
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={3}
                textAlign="right"
                textAlignVertical="top"
                testID="input-notes"
              />
            </View>
          </View>
        </View>

        <Pressable
          style={[
            styles.submitButton,
            !isFormValid ? styles.submitButtonDisabled : undefined,
          ]}
          onPress={handleSubmit}
          disabled={!isFormValid || isSubmitting}
          testID="button-submit-courier"
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              <Feather name="send" size={18} color="#FFF" style={{ marginLeft: 8 }} />
              <ThemedText style={styles.submitButtonText}>تقديم الطلب</ThemedText>
            </>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerSection: {
    alignItems: "center",
    marginBottom: 28,
  },
  headerIconWrap: {
    width: 70,
    height: 70,
    borderRadius: 20,
    backgroundColor: "#FFF5EE",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  headerTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 17,
    color: "#2D2D2D",
    textAlign: "center",
    lineHeight: 38,
    includeFontPadding: true,
  },
  headerSubtitle: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 24,
    includeFontPadding: true,
    marginTop: 4,
  },
  formSection: {
    gap: 4,
  },
  sectionTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    color: BRAND_ORANGE,
    textAlign: "right",
    marginBottom: 12,
    lineHeight: 28,
    includeFontPadding: true,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 14,
    color: "#444",
    textAlign: "right",
    marginBottom: 8,
    lineHeight: 24,
    includeFontPadding: true,
  },
  inputContainer: {
    flexDirection: "row-reverse",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#F0F0F0",
    paddingHorizontal: 14,
    height: 52,
  },
  inputIcon: {
    marginLeft: 10,
  },
  input: {
    flex: 1,
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    lineHeight: 24,
    includeFontPadding: true,
  },
  textArea: {
    height: 100,
    alignItems: "flex-start",
    paddingTop: 12,
  },
  textAreaInput: {
    height: 76,
  },
  divider: {
    height: 1,
    backgroundColor: "#F0F0F0",
    marginVertical: 20,
  },
  submitButton: {
    backgroundColor: BRAND_ORANGE,
    borderRadius: 16,
    height: 56,
    flexDirection: "row-reverse",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 24,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    color: "#FFFFFF",
    lineHeight: 28,
    includeFontPadding: true,
  },
  successContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  successIcon: {
    marginBottom: 24,
  },
  successTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 17,
    color: "#2D2D2D",
    textAlign: "center",
    lineHeight: 38,
    includeFontPadding: true,
    marginBottom: 8,
  },
  successSubtitle: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: "#888",
    textAlign: "center",
    lineHeight: 24,
    includeFontPadding: true,
    marginBottom: 32,
  },
  backButton: {
    backgroundColor: BRAND_ORANGE,
    borderRadius: 14,
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  backButtonText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 12,
    color: "#FFFFFF",
    lineHeight: 26,
    includeFontPadding: true,
  },
});
