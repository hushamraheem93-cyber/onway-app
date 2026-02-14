import React, { useState, useRef, useEffect } from "react";
import {
  StyleSheet,
  View,
  TextInput,
  Pressable,
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { AppColors, Spacing } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";

import onwayLogo from "../../assets/images/icon.png";

const OTP_LENGTH = 4;
const BRAND_ORANGE = "#FF7622";
const LIGHT_ORANGE = "#FF9A5C";

export default function OtpVerificationScreen() {
  const insets = useSafeAreaInsets();
  const { verifyOtp, pendingPhone, sendOtp } = useAuth();
  const inputRef = useRef<TextInput>(null);

  const [otpCode, setOtpCode] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(60);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();

    setTimeout(() => inputRef.current?.focus(), 400);
  }, []);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const timer = setInterval(() => {
      setResendTimer((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendTimer]);

  const handleOtpChange = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, "").slice(0, OTP_LENGTH);
    setOtpCode(cleaned);
    setError("");

    if (cleaned.length === OTP_LENGTH) {
      handleVerify(cleaned);
    }
  };

  const handleVerify = async (code?: string) => {
    const finalCode = code || otpCode;
    if (finalCode.length !== OTP_LENGTH) {
      setError("يرجى إدخال رمز التحقق كاملاً");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsLoading(true);
    setError("");

    try {
      await verifyOtp(finalCode);
    } catch (err: any) {
      setError(err.message || "رمز التحقق غير صحيح");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setOtpCode("");
      inputRef.current?.focus();
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
      setOtpCode("");
      inputRef.current?.focus();
    } catch (err: any) {
      setError(err.message || "حدث خطأ في إعادة الإرسال");
    }
  };

  const maskedPhone = pendingPhone
    ? `${pendingPhone.slice(0, 7)}****${pendingPhone.slice(-2)}`
    : "";

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[BRAND_ORANGE, LIGHT_ORANGE]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={[styles.topSection, { paddingTop: insets.top + 20 }]}
      >
        <View style={styles.logoContainer}>
          <Image
            source={onwayLogo}
            style={styles.logoImage}
            contentFit="contain"
          />
        </View>
      </LinearGradient>

      <Animated.View
        style={[
          styles.whiteCard,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
            paddingBottom: insets.bottom + 20,
          },
        ]}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.formInner}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.shieldCircle}>
              <Feather name="shield" size={32} color={BRAND_ORANGE} />
            </View>

            <ThemedText type="h2" style={styles.title}>
              رمز التحقق
            </ThemedText>
            <ThemedText type="body" style={styles.subtitle}>
              تم إرسال رمز التحقق عبر واتساب إلى
            </ThemedText>
            <ThemedText type="body" style={styles.phoneDisplay}>
              {maskedPhone}
            </ThemedText>

            <TextInput
              ref={inputRef}
              style={styles.otpSingleInput}
              keyboardType="number-pad"
              maxLength={OTP_LENGTH}
              value={otpCode}
              onChangeText={handleOtpChange}
              placeholder="- - - -"
              placeholderTextColor="#C8C8C8"
              testID="input-otp"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
            />

            {error ? (
              <ThemedText type="small" style={styles.errorText}>
                {error}
              </ThemedText>
            ) : null}

            <Pressable
              style={[styles.verifyButton, isLoading && styles.verifyButtonDisabled]}
              onPress={() => handleVerify()}
              disabled={isLoading}
              testID="button-verify-otp"
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <ThemedText type="h4" style={styles.verifyButtonText}>
                  تحقق
                </ThemedText>
              )}
            </Pressable>

            <View style={styles.resendRow}>
              <ThemedText type="body" style={styles.resendLabel}>
                لم يصلك الرمز؟
              </ThemedText>
              {resendTimer > 0 ? (
                <ThemedText type="body" style={styles.timerText}>
                  إعادة الإرسال ({resendTimer}ث)
                </ThemedText>
              ) : (
                <Pressable onPress={handleResend} testID="button-resend-otp">
                  <ThemedText type="body" style={styles.resendLink}>
                    إعادة الإرسال
                  </ThemedText>
                </Pressable>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND_ORANGE,
  },
  topSection: {
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 40,
    minHeight: 200,
  },
  logoContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  logoImage: {
    width: 100,
    height: 100,
  },
  whiteCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    paddingHorizontal: 28,
    paddingTop: 28,
    marginTop: -24,
  },
  formInner: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
  },
  shieldCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: `${BRAND_ORANGE}12`,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  title: {
    textAlign: "center",
    fontWeight: "700",
    color: "#1A1A1A",
    fontSize: 22,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    textAlign: "center",
    color: "#888",
    fontSize: 14,
    marginBottom: 4,
  },
  phoneDisplay: {
    textAlign: "center",
    fontWeight: "700",
    fontSize: 18,
    color: BRAND_ORANGE,
    marginBottom: Spacing.xl,
    letterSpacing: 1,
    direction: "ltr",
  },
  otpSingleInput: {
    width: "100%",
    height: 60,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#ECECEC",
    backgroundColor: "#F6F6F8",
    textAlign: "center",
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: 16,
    color: "#222",
    marginBottom: Spacing.md,
  },
  errorText: {
    color: AppColors.error,
    textAlign: "center",
    marginBottom: Spacing.md,
    fontSize: 13,
  },
  verifyButton: {
    backgroundColor: BRAND_ORANGE,
    width: "100%",
    height: 56,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
    shadowColor: BRAND_ORANGE,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  verifyButtonDisabled: {
    opacity: 0.6,
  },
  verifyButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
  resendRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  resendLabel: {
    fontSize: 14,
    color: "#999",
  },
  timerText: {
    fontSize: 14,
    color: "#999",
  },
  resendLink: {
    color: BRAND_ORANGE,
    fontWeight: "700",
    fontSize: 14,
  },
});
