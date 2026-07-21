import React, { useState } from "react";
import {
  StyleSheet,
  View,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  Keyboard,
  Modal,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { useNavigation } from "@react-navigation/native";
import { AppColors, FontWeight } from "@/constants/theme";

const BRAND_ORANGE = AppColors.primary;
const BRAND_DARK = AppColors.primaryDark;

export default function PhoneLoginScreen() {
  const { sendOtp } = useAuth();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalMessage, setModalMessage] = useState("");

  const validatePhone = (phone: string) => {
    const cleanPhone = phone.replace(/\s/g, "");
    return cleanPhone.length >= 9;
  };

  const formatPhoneForLogin = (phone: string) => {
    const cleanPhone = phone.replace(/\s/g, "");
    return `00964${cleanPhone}`;
  };

  const handleContinue = async () => {
    Keyboard.dismiss();
    setError("");
    if (!phoneNumber.trim()) {
      setError("الرجاء إدخال رقم الهاتف");
      return;
    }
    if (!validatePhone(phoneNumber)) {
      setError("يرجى إدخال رقم هاتف عراقي صحيح");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsLoading(true);
    try {
      const fullPhone = formatPhoneForLogin(phoneNumber);
      await sendOtp(fullPhone);
    } catch (err: any) {
      setError(err.message || "حدث خطأ أثناء إرسال رمز التحقق");
    } finally {
      setIsLoading(false);
    }
  };

  const showInfoModal = (title: string, message: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setModalTitle(title);
    setModalMessage(message);
    setModalVisible(true);
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[BRAND_ORANGE, BRAND_DARK]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* soft depth accents */}
      <View style={styles.blobTop} pointerEvents="none" />
      <View style={styles.blobBottom} pointerEvents="none" />

      <SafeAreaView style={styles.safeArea} edges={["bottom", "left", "right"]}>
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView
            contentContainerStyle={[styles.scrollContent, { paddingTop: Math.max(insets.top + 20, 56) }]}
            keyboardShouldPersistTaps="handled"
            bounces={false}
            showsVerticalScrollIndicator={false}
          >
            {navigation.canGoBack() ? (
              <Pressable
                style={styles.backBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  navigation.goBack();
                }}
                testID="button-back"
                accessibilityRole="button"
                accessibilityLabel="رجوع"
              >
                <Feather name="arrow-right" size={22} color={AppColors.white} />
              </Pressable>
            ) : null}

            {/* Hero */}
            <View style={styles.logoSection}>
              <View style={styles.logoBadge}>
                <ThemedText style={styles.logoText}>OnWay</ThemedText>
              </View>
              <ThemedText style={styles.tagline}>توصيل سريع وموثوق إلى باب بيتك</ThemedText>
            </View>

            {/* Form sheet */}
            <View style={styles.card}>
              <ThemedText style={styles.welcome}>تسجيل الدخول</ThemedText>
              <ThemedText style={styles.welcomeSub}>أدخل رقم هاتفك للمتابعة</ThemedText>

              <ThemedText style={styles.label}>رقم الهاتف</ThemedText>
              <View style={styles.phoneRow}>
                <TextInput
                  placeholder="7XX XXX XXXX"
                  placeholderTextColor="rgba(0,0,0,0.30)"
                  keyboardType="phone-pad"
                  returnKeyType="done"
                  style={styles.phoneInput}
                  value={phoneNumber}
                  onChangeText={(text) => {
                    setPhoneNumber(text);
                    if (error) setError("");
                  }}
                  onSubmitEditing={handleContinue}
                  maxLength={12}
                  testID="input-phone"
                  accessibilityLabel="رقم الهاتف"
                  accessibilityHint="أدخل رقم هاتفك العراقي لتسجيل الدخول"
                />
                <View style={styles.prefixBox}>
                  <ThemedText style={styles.countryCode}>964+</ThemedText>
                  <Image
                    source={{ uri: "https://flagcdn.com/w80/iq.png" }}
                    style={styles.flag}
                  />
                </View>
              </View>

              {error ? (
                <View style={styles.errorRow}>
                  <Feather name="alert-circle" size={14} color={AppColors.error} />
                  <ThemedText style={styles.errorText}>{error}</ThemedText>
                </View>
              ) : null}

              <Pressable
                style={({ pressed }) => [
                  styles.submitBtn,
                  isLoading ? styles.submitDisabled : undefined,
                  pressed && !isLoading ? styles.submitPressed : undefined,
                ]}
                onPress={handleContinue}
                disabled={isLoading}
                testID="button-continue"
                accessibilityRole="button"
                accessibilityLabel="دخول"
                accessibilityState={{ disabled: isLoading, busy: isLoading }}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color={AppColors.white} />
                ) : (
                  <>
                    <ThemedText style={styles.submitText}>دخول</ThemedText>
                    <Feather name="arrow-left" size={19} color={AppColors.white} />
                  </>
                )}
              </Pressable>

              <Pressable
                onPress={() =>
                  showInfoModal(
                    "استعادة الحساب",
                    "أدخل رقم هاتفك واضغط دخول. سيتم توجيهك مباشرةً إلى حسابك."
                  )
                }
                testID="button-forgot-password"
                style={styles.forgotWrap}
              >
                <ThemedText style={styles.forgotPasswordText}>هل نسيت كلمة السر؟</ThemedText>
              </Pressable>
            </View>

            {/* Register */}
            <View style={styles.registerContainer}>
              <ThemedText style={styles.whiteText}>ليس لديك حساب؟ </ThemedText>
              <Pressable
                onPress={() =>
                  showInfoModal(
                    "إنشاء حساب جديد",
                    "أدخل رقم هاتفك واضغط على إرسال رمز التحقق. سيتم إنشاء حسابك تلقائياً عند أول تسجيل دخول."
                  )
                }
                testID="button-register"
              >
                <ThemedText style={styles.signUpText}>سجل الآن</ThemedText>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setModalVisible(false)}
        >
          <Pressable style={styles.modalContent} onPress={() => {}}>
            <ThemedText style={styles.modalTitle}>{modalTitle}</ThemedText>
            <ThemedText style={styles.modalMessage}>{modalMessage}</ThemedText>
            <Pressable
              style={styles.modalButton}
              onPress={() => setModalVisible(false)}
              testID="button-modal-dismiss"
            >
              <ThemedText style={styles.modalButtonText}>حسناً</ThemedText>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BRAND_ORANGE,
  },
  blobTop: {
    position: "absolute",
    top: -90,
    right: -70,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  blobBottom: {
    position: "absolute",
    bottom: -60,
    left: -80,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 40,
  },
  logoSection: {
    alignItems: "center",
    marginBottom: 26,
    marginTop: 16,
  },
  logoBadge: {
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.16)",
    marginBottom: 12,
  },
  logoText: {
    fontFamily: "Montserrat_800ExtraBold",
    fontSize: 30,
    color: AppColors.white,
    textAlign: "center",
    letterSpacing: 1,
    writingDirection: "ltr",
    lineHeight: 42,
    includeFontPadding: true,
  },
  tagline: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 14,
    color: "rgba(255,255,255,0.9)",
    textAlign: "center",
  },
  card: {
    width: "100%",
    backgroundColor: AppColors.white,
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 22,
    ...Platform.select({
      ios: {
        shadowColor: AppColors.black,
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.18,
        shadowRadius: 24,
      },
      android: { elevation: 10 },
      default: { boxShadow: "0 14px 34px rgba(0,0,0,0.18)" },
    }),
  },
  welcome: {
    fontFamily: "Cairo_700Bold",
    fontSize: 22,
    color: AppColors.gray800,
    textAlign: "right",
  },
  welcomeSub: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: AppColors.gray500,
    textAlign: "right",
    marginTop: 3,
    marginBottom: 22,
  },
  label: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    color: AppColors.gray700,
    textAlign: "right",
    marginBottom: 8,
    lineHeight: 22,
    includeFontPadding: true,
    paddingTop: 2,
  },
  phoneRow: {
    flexDirection: "row",
    backgroundColor: AppColors.gray50,
    borderWidth: 1.5,
    borderColor: AppColors.divider,
    borderRadius: 16,
    height: 58,
    alignItems: "center",
    paddingHorizontal: 16,
  },
  phoneInput: {
    flex: 1,
    fontSize: 16, // ≥16 for readability + prevents iOS auto-zoom (HIG/WCAG)
    color: AppColors.gray800,
    textAlign: "left",
    fontFamily: "Cairo_600SemiBold",
  },
  prefixBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 12,
    borderLeftWidth: 1,
    borderLeftColor: AppColors.divider,
  },
  countryCode: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    color: AppColors.gray700,
  },
  flag: {
    width: 22,
    height: 15,
    borderRadius: 2,
  },
  errorRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    justifyContent: "flex-start",
    marginTop: 10,
  },
  errorText: {
    fontFamily: "Cairo_600SemiBold",
    color: AppColors.error,
    fontSize: 13,
    textAlign: "right",
  },
  submitBtn: {
    width: "100%",
    flexDirection: "row",
    gap: 8,
    backgroundColor: BRAND_ORANGE,
    borderRadius: 16,
    paddingVertical: 17,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
    ...Platform.select({
      ios: {
        shadowColor: BRAND_ORANGE,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.32,
        shadowRadius: 14,
      },
      android: { elevation: 5 },
      default: { boxShadow: "0 8px 16px rgba(232,98,42,0.32)" },
    }),
  },
  submitDisabled: {
    opacity: 0.7,
  },
  submitPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.92,
  },
  submitText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 17,
    letterSpacing: 0.3,
    color: AppColors.white,
  },
  forgotWrap: {
    alignSelf: "center",
    marginTop: 16,
    paddingVertical: 4,
  },
  forgotPasswordText: {
    color: BRAND_ORANGE,
    fontSize: 14,
    fontFamily: "Cairo_700Bold",
  },
  backBtn: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  registerContainer: {
    flexDirection: "row-reverse",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 26,
  },
  whiteText: {
    color: AppColors.white,
    fontSize: 15,
    fontFamily: "Cairo_400Regular",
  },
  signUpText: {
    color: AppColors.white,
    fontSize: 15,
    fontWeight: FontWeight.bold,
    textDecorationLine: "underline",
    fontFamily: "Cairo_700Bold",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: AppColors.overlay,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  modalContent: {
    backgroundColor: AppColors.white,
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 24,
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
  },
  modalTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 17,
    color: AppColors.gray700,
    textAlign: "center",
    marginBottom: 12,
  },
  modalMessage: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: AppColors.gray500,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 24,
  },
  modalButton: {
    backgroundColor: BRAND_ORANGE,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 40,
  },
  modalButtonText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 15,
    color: AppColors.white,
  },
});
