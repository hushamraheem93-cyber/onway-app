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
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { useNavigation } from "@react-navigation/native";
import { AppColors } from "@/constants/theme";

const BRAND_ORANGE = AppColors.primary;

export default function PhoneLoginScreen() {
  const { sendOtp } = useAuth();
  const navigation = useNavigation();
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
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          {navigation.canGoBack() ? (
            <Pressable
              style={styles.backBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.goBack();
              }}
              testID="button-back"
            >
              <Feather name="arrow-right" size={22} color={AppColors.white} />
            </Pressable>
          ) : null}

          <View style={styles.topSpacer} />

          <View style={styles.logoSection}>
            <View style={styles.logoWrap}>
              <ThemedText style={styles.logoText}>OnWay</ThemedText>
            </View>
            <ThemedText style={styles.tagline}>توصيل سريع وموثوق</ThemedText>
          </View>

          <View style={styles.formBlock}>
            <View style={styles.phoneRow}>
              <TextInput
                placeholder="رقم الهاتف"
                placeholderTextColor="rgba(0,0,0,0.35)"
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
                <Feather name="alert-circle" size={14} color={AppColors.white} />
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
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={BRAND_ORANGE} />
              ) : (
                <ThemedText style={styles.submitText}>دخول</ThemedText>
              )}
            </Pressable>

            <View style={styles.extraOptions}>
              <Pressable
                onPress={() =>
                  showInfoModal(
                    "استعادة الحساب",
                    "أدخل رقم هاتفك واضغط دخول. سيتم توجيهك مباشرةً إلى حسابك."
                  )
                }
                testID="button-forgot-password"
              >
                <ThemedText style={styles.forgotPasswordText}>هل نسيت كلمة السر؟</ThemedText>
              </Pressable>

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
            </View>
          </View>

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </KeyboardAvoidingView>

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BRAND_ORANGE,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  topSpacer: {
    height: 40,
  },
  logoSection: {
    alignItems: "center",
    marginBottom: 40,
  },
  logoWrap: {
    marginBottom: 8,
    paddingVertical: 6,
  },
  logoText: {
    fontFamily: "Montserrat_800ExtraBold",
    fontSize: 28,
    color: AppColors.white,
    textAlign: "center",
    letterSpacing: 1,
    writingDirection: "ltr",
    lineHeight: 48,
    includeFontPadding: true,
  },
  tagline: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
    color: AppColors.textOnBrandMuted,
    textAlign: "center",
  },
  formBlock: {
    width: "100%",
    gap: 20,
  },
  phoneRow: {
    flexDirection: "row",
    backgroundColor: AppColors.white,
    borderRadius: 12,
    height: 56,
    alignItems: "center",
    paddingHorizontal: 16,
  },
  phoneInput: {
    flex: 1,
    fontSize: 13,
    color: AppColors.gray700,
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
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    justifyContent: "flex-end",
    marginTop: -10,
  },
  errorText: {
    fontFamily: "Cairo_400Regular",
    color: AppColors.white,
    fontSize: 13,
  },
  submitBtn: {
    width: "100%",
    backgroundColor: AppColors.white,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: AppColors.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  submitDisabled: {
    opacity: 0.7,
  },
  submitPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.9,
  },
  submitText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    color: BRAND_ORANGE,
  },
  backBtn: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  bottomSpacer: {
    height: 40,
  },
  extraOptions: {
    marginTop: 20,
    alignItems: "center",
    width: "100%",
  },
  forgotPasswordText: {
    color: AppColors.white,
    fontSize: 14,
    textDecorationLine: "underline",
    marginBottom: 30,
    fontFamily: "Cairo_400Regular",
  },
  registerContainer: {
    flexDirection: "row-reverse",
    marginTop: 10,
  },
  whiteText: {
    color: AppColors.white,
    fontSize: 12,
    fontFamily: "Cairo_400Regular",
  },
  signUpText: {
    color: AppColors.white,
    fontSize: 12,
    fontWeight: "bold",
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
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 24,
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
  },
  modalTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    color: AppColors.gray700,
    textAlign: "center",
    marginBottom: 12,
  },
  modalMessage: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    color: AppColors.gray500,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 24,
  },
  modalButton: {
    backgroundColor: BRAND_ORANGE,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 40,
  },
  modalButtonText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 12,
    color: AppColors.white,
  },
});
