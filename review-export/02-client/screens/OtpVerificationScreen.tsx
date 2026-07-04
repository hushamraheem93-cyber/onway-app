import React, { useState, useRef, useEffect } from "react";
import {
  StyleSheet,
  View,
  TextInput,
  Pressable,
  ActivityIndicator,
  Platform,
  ScrollView,
  Keyboard,
} from "react-native";
import { useSafeAreaInsets, SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { AppColors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";

const OTP_LENGTH = 4;
const BRAND_ORANGE = AppColors.primary;
const BRAND_DARK = AppColors.primaryDark;

export default function OtpVerificationScreen() {
  const insets = useSafeAreaInsets();
  const { verifyOtp, pendingPhone, sendOtp, goBackToPhoneLogin } = useAuth();

  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(60);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    // OTP disabled — auto-verify immediately on mount
    setTimeout(() => handleVerify("0000"), 300);
  }, []);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const timer = setInterval(() => {
      setResendTimer((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendTimer]);

  const handleOtpChange = (text: string, index: number) => {
    const newOtp = [...otp];
    newOtp[index] = text;
    setOtp(newOtp);
    setError("");

    if (text && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    if (newOtp.every((d) => d.length === 1)) {
      Keyboard.dismiss();
      handleVerify(newOtp.join(""));
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
      const newOtp = [...otp];
      newOtp[index - 1] = "";
      setOtp(newOtp);
    }
  };

  const handleVerify = async (code?: string) => {
    // OTP disabled — use "0000" as universal bypass code
    const otpCode = code || otp.join("") || "0000";

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsLoading(true);
    setError("");

    try {
      await verifyOtp(otpCode);
    } catch (err: any) {
      setError(err.message || "رمز التحقق غير صحيح");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setOtp(Array(OTP_LENGTH).fill(""));
      inputRefs.current[0]?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendTimer > 0 || !pendingPhone) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      await sendOtp(pendingPhone);
      setResendTimer(60);
      setError("");
      setOtp(Array(OTP_LENGTH).fill(""));
      inputRefs.current[0]?.focus();
    } catch (err: any) {
      setError(err.message || "حدث خطأ في إعادة الإرسال");
    }
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    goBackToPhoneLogin();
  };

  const maskedPhone = pendingPhone
    ? `${pendingPhone.slice(0, 7)}****${pendingPhone.slice(-2)}`
    : "";

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        <LinearGradient
          colors={[BRAND_ORANGE, BRAND_DARK]}
          style={styles.topSection}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Pressable
            style={styles.backBtn}
            onPress={handleBack}
            testID="button-back"
          >
            <Feather name="arrow-right" size={22} color={AppColors.white} />
          </Pressable>

          <View style={styles.decorCircle1} />
          <View style={styles.decorCircle2} />

          <View style={styles.headerContent}>
            <View style={styles.logoWrap}>
              <ThemedText style={styles.logoText}>OnWay</ThemedText>
            </View>
            <View style={styles.shieldCircle}>
              <Feather name="shield" size={40} color={BRAND_ORANGE} />
            </View>
            <ThemedText style={styles.headerTitle}>رمز التحقق</ThemedText>
            <ThemedText style={styles.headerSub}>
              تم إرسال رمز التحقق إلى الرقم
            </ThemedText>
            <ThemedText style={styles.phoneText}>{maskedPhone}</ThemedText>
          </View>
        </LinearGradient>

        <View
          style={[
            styles.card,
            { paddingBottom: Math.max(insets.bottom, 16) + 16 },
          ]}
        >
          <View style={styles.handleBar} />

          <ThemedText style={styles.inputLabel}>أدخل الرمز المكون من 4 أرقام</ThemedText>

          <View style={styles.otpRow}>
            {Array.from({ length: OTP_LENGTH }).map((_, index) => (
              <TextInput
                key={index}
                ref={(ref) => {
                  inputRefs.current[index] = ref;
                }}
                style={[
                  styles.otpInput,
                  otp[index] ? styles.otpInputFilled : undefined,
                ]}
                keyboardType="number-pad"
                returnKeyType="done"
                maxLength={1}
                value={otp[index]}
                onChangeText={(text) => handleOtpChange(text, index)}
                onKeyPress={({ nativeEvent }) =>
                  handleKeyPress(nativeEvent.key, index)
                }
                onSubmitEditing={() => Keyboard.dismiss()}
                selectTextOnFocus
                textContentType="oneTimeCode"
                testID={`input-otp-${index}`}
              />
            ))}
          </View>

          {error ? (
            <View style={styles.errorRow}>
              <Feather name="alert-circle" size={14} color={AppColors.error} />
              <ThemedText style={styles.errorText}>{error}</ThemedText>
            </View>
          ) : null}

          <Pressable
            style={({ pressed }) => [
              styles.verifyBtn,
              isLoading ? styles.verifyDisabled : undefined,
              pressed && !isLoading ? styles.verifyPressed : undefined,
            ]}
            onPress={() => {
              Keyboard.dismiss();
              handleVerify();
            }}
            disabled={isLoading}
            testID="button-verify-otp"
          >
            <LinearGradient
              colors={[BRAND_ORANGE, BRAND_DARK]}
              style={styles.verifyGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={AppColors.white} />
              ) : (
                <>
                  <ThemedText style={styles.verifyText}>تحقق</ThemedText>
                  <View style={styles.verifyArrow}>
                    <Feather name="check" size={18} color={BRAND_ORANGE} />
                  </View>
                </>
              )}
            </LinearGradient>
          </Pressable>

          <View style={styles.resendRow}>
            <ThemedText style={styles.resendLabel}>لم يصلك الرمز؟</ThemedText>
            {resendTimer > 0 ? (
              <ThemedText style={styles.timerText}>
                إعادة الإرسال ({resendTimer}ث)
              </ThemedText>
            ) : (
              <Pressable onPress={handleResend} testID="button-resend-otp">
                <ThemedText style={styles.resendLink}>إعادة الإرسال</ThemedText>
              </Pressable>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.white,
  },
  scrollContent: {
    flexGrow: 1,
  },
  backBtn: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.15)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  topSection: {
    paddingTop: 60,
    paddingBottom: 50,
    alignItems: "center",
    overflow: "hidden",
  },
  decorCircle1: {
    position: "absolute",
    top: -50,
    left: -50,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: AppColors.decorativeOnBrand,
  },
  decorCircle2: {
    position: "absolute",
    bottom: 10,
    right: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: AppColors.decorativeOnBrand,
  },
  headerContent: {
    alignItems: "center",
    paddingHorizontal: 24,
  },
  logoWrap: {
    marginBottom: 16,
    paddingVertical: 6,
  },
  logoText: {
    fontFamily: "Montserrat_800ExtraBold",
    fontSize: 22,
    color: AppColors.white,
    letterSpacing: 1,
    textAlign: "center",
    writingDirection: "ltr",
    lineHeight: 38,
    includeFontPadding: true,
  },
  shieldCircle: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: AppColors.white,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  headerTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 19,
    color: AppColors.white,
    marginBottom: 4,
    lineHeight: 42,
    includeFontPadding: true,
    paddingTop: 4,
  },
  headerSub: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: AppColors.textOnBrandSubtle,
    lineHeight: 24,
    includeFontPadding: true,
  },
  phoneText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    color: AppColors.white,
    letterSpacing: 2,
    marginTop: 4,
    writingDirection: "ltr",
  },
  card: {
    flex: 1,
    backgroundColor: AppColors.white,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    marginTop: -30,
    paddingHorizontal: 24,
    paddingTop: 16,
    ...Platform.select({
      ios: {
        shadowColor: AppColors.black,
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: AppColors.border,
    alignSelf: "center",
    marginBottom: 24,
  },
  inputLabel: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 12,
    color: AppColors.gray700,
    textAlign: "center",
    marginBottom: 20,
  },
  otpRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 14,
    marginBottom: 20,
    writingDirection: "ltr",
  },
  otpInput: {
    width: 60,
    height: 60,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: AppColors.divider,
    backgroundColor: AppColors.gray50,
    textAlign: "center",
    fontSize: 19,
    fontFamily: "Cairo_700Bold",
    color: AppColors.gray700,
    writingDirection: "ltr",
  },
  otpInputFilled: {
    borderColor: BRAND_ORANGE,
    backgroundColor: AppColors.secondary,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    justifyContent: "center",
    marginBottom: 12,
  },
  errorText: {
    fontFamily: "Cairo_400Regular",
    color: AppColors.error,
    fontSize: 13,
  },
  verifyBtn: {
    borderRadius: 14,
    overflow: "hidden",
    marginTop: 8,
    ...Platform.select({
      ios: {
        shadowColor: BRAND_ORANGE,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  verifyDisabled: {
    opacity: 0.7,
  },
  verifyPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.9,
  },
  verifyGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 10,
  },
  verifyText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 17,
    color: AppColors.white,
  },
  verifyArrow: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: AppColors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  resendRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 24,
  },
  resendLabel: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: AppColors.gray400,
  },
  timerText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: AppColors.gray400,
  },
  resendLink: {
    fontFamily: "Cairo_700Bold",
    color: BRAND_ORANGE,
    fontSize: 14,
  },
});
