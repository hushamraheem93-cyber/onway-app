import React, { useState, useRef, useEffect } from "react";
import {
  StyleSheet,
  View,
  TextInput,
  Pressable,
  ActivityIndicator,
  Animated,
  Easing,
  Dimensions,
  Keyboard,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { Spacing } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";

const OTP_LENGTH = 4;
const PRIMARY = "#FF7622";
const PRIMARY_DARK = "#E5691E";
const LIGHT_ORANGE = "#FF9A5C";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

export default function OtpVerificationScreen() {
  const insets = useSafeAreaInsets();
  const { verifyOtp, pendingPhone, sendOtp } = useAuth();

  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(60);
  const inputRef = useRef<TextInput>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(60)).current;
  const iconPulse = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideUp, {
        toValue: 0,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(iconPulse, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();

    inputRef.current?.focus();
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
    setOtp(cleaned);
    setError("");

    if (cleaned.length === OTP_LENGTH) {
      handleVerify(cleaned);
    }
  };

  const handleVerify = async (code?: string) => {
    const otpCode = code || otp;
    if (otpCode.length !== OTP_LENGTH) {
      setError("يرجى إدخال رمز التحقق كاملاً");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsLoading(true);
    setError("");

    try {
      await verifyOtp(otpCode);
    } catch (err: any) {
      setError(err.message || "رمز التحقق غير صحيح");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setOtp("");
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
      setOtp("");
      inputRef.current?.focus();
    } catch (err: any) {
      setError(err.message || "حدث خطأ في إعادة الإرسال");
    }
  };

  const maskedPhone = pendingPhone
    ? `${pendingPhone.slice(0, 7)}****${pendingPhone.slice(-2)}`
    : "";

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.flex1}
          keyboardVerticalOffset={0}
        >
          <ScrollView
            bounces={false}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <LinearGradient
              colors={[PRIMARY, LIGHT_ORANGE, "#FFB88C"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.topSection, { paddingTop: insets.top + 16 }]}
            >
              <View style={styles.topDecorCircle1} />
              <View style={styles.topDecorCircle2} />

              <Animated.View style={[styles.shieldContainer, { transform: [{ scale: iconPulse }] }]}>
                <View style={styles.shieldOuter}>
                  <View style={styles.shieldInner}>
                    <Feather name="lock" size={32} color="#FFFFFF" />
                  </View>
                </View>
              </Animated.View>

              <ThemedText type="h2" style={styles.topTitle}>
                رمز التحقق
              </ThemedText>
              <ThemedText type="small" style={styles.topSubtitle}>
                تم إرسال رمز مكون من ٤ أرقام عبر واتساب
              </ThemedText>
            </LinearGradient>

            <Animated.View
              style={[
                styles.bottomSheet,
                {
                  opacity: fadeAnim,
                  transform: [{ translateY: slideUp }],
                  paddingBottom: insets.bottom + 24,
                },
              ]}
            >
              <View style={styles.handleBar} />

              <View style={styles.phoneChip}>
                <Feather name="phone" size={14} color={PRIMARY} />
                <ThemedText type="small" style={styles.phoneChipText}>
                  {maskedPhone}
                </ThemedText>
              </View>

              <View style={styles.inputGroup}>
                <ThemedText type="small" style={styles.inputLabel}>
                  رمز التحقق
                </ThemedText>
                <View style={styles.otpInputRow}>
                  <TextInput
                    ref={inputRef}
                    style={styles.otpInput}
                    keyboardType="number-pad"
                    maxLength={OTP_LENGTH}
                    value={otp}
                    onChangeText={handleOtpChange}
                    placeholder="- - - -"
                    placeholderTextColor="#C0C0C0"
                    returnKeyType="done"
                    onSubmitEditing={() => handleVerify()}
                    testID="input-otp"
                  />
                </View>
              </View>

              {error ? (
                <View style={styles.errorRow}>
                  <Feather name="alert-circle" size={14} color="#E53935" />
                  <ThemedText type="small" style={styles.errorText}>
                    {error}
                  </ThemedText>
                </View>
              ) : null}

              <Pressable
                style={({ pressed }) => [
                  styles.verifyButton,
                  isLoading && styles.verifyButtonDisabled,
                  pressed && !isLoading && styles.verifyButtonPressed,
                ]}
                onPress={() => handleVerify()}
                disabled={isLoading}
                testID="button-verify-otp"
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <View style={styles.buttonInner}>
                    <ThemedText type="h4" style={styles.verifyButtonText}>
                      تحقق
                    </ThemedText>
                    <View style={styles.buttonArrow}>
                      <Feather name="check" size={18} color="#FFFFFF" />
                    </View>
                  </View>
                )}
              </Pressable>

              <View style={styles.resendRow}>
                <ThemedText type="body" style={styles.resendLabel}>
                  لم يصلك الرمز؟
                </ThemedText>
                {resendTimer > 0 ? (
                  <View style={styles.timerChip}>
                    <Feather name="clock" size={12} color="#8E8E93" />
                    <ThemedText type="small" style={styles.timerText}>
                      {resendTimer}ث
                    </ThemedText>
                  </View>
                ) : (
                  <Pressable onPress={handleResend} testID="button-resend-otp">
                    <ThemedText type="body" style={styles.resendLink}>
                      إعادة الإرسال
                    </ThemedText>
                  </Pressable>
                )}
              </View>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PRIMARY,
  },
  flex1: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  topSection: {
    height: SCREEN_HEIGHT * 0.38,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
  },
  topDecorCircle1: {
    position: "absolute",
    top: -40,
    left: -30,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  topDecorCircle2: {
    position: "absolute",
    bottom: 40,
    right: -40,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  shieldContainer: {
    marginBottom: 16,
  },
  shieldOuter: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  shieldInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 26,
    marginBottom: 6,
  },
  topSubtitle: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 14,
    fontWeight: "500",
  },
  bottomSheet: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    marginTop: -28,
    paddingHorizontal: 24,
    paddingTop: 14,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 12,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E0E0E0",
    marginBottom: 20,
  },
  phoneChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: `${PRIMARY}10`,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 24,
  },
  phoneChipText: {
    color: PRIMARY,
    fontWeight: "700",
    fontSize: 14,
    letterSpacing: 0.5,
  },
  inputGroup: {
    width: "100%",
    marginBottom: 4,
  },
  inputLabel: {
    textAlign: "right",
    color: "#6E6E73",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
  },
  otpInputRow: {
    width: "100%",
  },
  otpInput: {
    width: "100%",
    height: 56,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#EEEEEE",
    backgroundColor: "#F7F7F9",
    textAlign: "center",
    fontSize: 28,
    fontWeight: "700",
    color: "#1A1A2E",
    letterSpacing: 14,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    marginBottom: 4,
  },
  errorText: {
    color: "#E53935",
    fontSize: 13,
  },
  verifyButton: {
    backgroundColor: PRIMARY,
    width: "100%",
    height: 54,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
    marginBottom: 20,
    shadowColor: PRIMARY,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  verifyButtonDisabled: {
    opacity: 0.65,
  },
  verifyButtonPressed: {
    backgroundColor: PRIMARY_DARK,
    transform: [{ scale: 0.98 }],
  },
  buttonInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  verifyButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
  buttonArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  resendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  resendLabel: {
    fontSize: 14,
    color: "#8E8E93",
  },
  timerChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F5F5F5",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  timerText: {
    fontSize: 13,
    color: "#8E8E93",
    fontWeight: "600",
  },
  resendLink: {
    color: PRIMARY,
    fontWeight: "700",
    fontSize: 14,
  },
});
