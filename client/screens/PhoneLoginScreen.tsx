import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  View,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Easing,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { AppColors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const BRAND_ORANGE = "#FF7622";
const BRAND_DARK = "#E5691E";

export default function PhoneLoginScreen() {
  const insets = useSafeAreaInsets();
  const { sendOtp } = useAuth();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const cardSlide = useRef(new Animated.Value(50)).current;
  const headerScale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(headerScale, {
        toValue: 1,
        friction: 7,
        tension: 60,
        useNativeDriver: true,
      }),
      Animated.timing(cardSlide, {
        toValue: 0,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const validatePhone = (phone: string) => {
    const cleanPhone = phone.replace(/\s/g, "");
    return cleanPhone.length >= 9;
  };

  const formatPhoneForLogin = (phone: string) => {
    const cleanPhone = phone.replace(/\s/g, "");
    return `00964${cleanPhone}`;
  };

  const handleContinue = async () => {
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

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[BRAND_ORANGE, BRAND_DARK]}
        style={[styles.topSection, { paddingTop: insets.top + 20 }]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.decorCircle1} />
        <View style={styles.decorCircle2} />

        <Animated.View
          style={[
            styles.headerContent,
            { opacity: fadeAnim, transform: [{ scale: headerScale }] },
          ]}
        >
          <View style={styles.logoRow}>
            <View style={styles.logoIconWrap}>
              <Feather name="truck" size={20} color={BRAND_ORANGE} />
            </View>
            <ThemedText style={styles.logoOn}>On</ThemedText>
            <ThemedText style={styles.logoWay}>Way</ThemedText>
          </View>
          <ThemedText style={styles.headerTitle}>مرحباً بك</ThemedText>
          <ThemedText style={styles.headerSub}>
            سجل دخولك للبدء بالتسوق والتوصيل
          </ThemedText>
        </Animated.View>
      </LinearGradient>

      <Animated.View
        style={[
          styles.card,
          {
            opacity: fadeAnim,
            transform: [{ translateY: cardSlide }],
            paddingBottom: insets.bottom + 16,
          },
        ]}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.formInner}
        >
          <View style={styles.handleBar} />

          <ThemedText style={styles.inputLabel}>رقم الهاتف</ThemedText>

          <View style={styles.phoneRow}>
            <TextInput
              placeholder="7XX XXX XXXX"
              placeholderTextColor="#C0C0C0"
              keyboardType="phone-pad"
              style={styles.phoneInput}
              value={phoneNumber}
              onChangeText={(text) => {
                setPhoneNumber(text);
                if (error) setError("");
              }}
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
          >
            <LinearGradient
              colors={[BRAND_ORANGE, BRAND_DARK]}
              style={styles.submitGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <ThemedText style={styles.submitText}>
                    إرسال رمز التحقق
                  </ThemedText>
                  <View style={styles.submitArrow}>
                    <Feather name="arrow-left" size={18} color={BRAND_ORANGE} />
                  </View>
                </>
              )}
            </LinearGradient>
          </Pressable>

          <View style={styles.footerRow}>
            <View style={styles.divider} />
            <ThemedText style={styles.footerLabel}>أو</ThemedText>
            <View style={styles.divider} />
          </View>

          <View style={styles.featureRow}>
            <View style={styles.featureChip}>
              <Feather name="zap" size={14} color={BRAND_ORANGE} />
              <ThemedText style={styles.featureText}>توصيل سريع</ThemedText>
            </View>
            <View style={styles.featureChip}>
              <Feather name="shield" size={14} color={BRAND_ORANGE} />
              <ThemedText style={styles.featureText}>دفع آمن</ThemedText>
            </View>
            <View style={styles.featureChip}>
              <Feather name="map-pin" size={14} color={BRAND_ORANGE} />
              <ThemedText style={styles.featureText}>تتبع مباشر</ThemedText>
            </View>
          </View>

          <ThemedText style={styles.terms}>
            بالمتابعة، أنت توافق على شروط الخدمة وسياسة الخصوصية
          </ThemedText>
        </KeyboardAvoidingView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  topSection: {
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
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  decorCircle2: {
    position: "absolute",
    bottom: 10,
    right: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  headerContent: {
    alignItems: "center",
    gap: 6,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  logoIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  logoOn: {
    fontFamily: "Kanit_700Bold",
    fontSize: 30,
    color: "#FFFFFF",
    letterSpacing: 1,
  },
  logoWay: {
    fontFamily: "Kanit_700Bold",
    fontSize: 30,
    color: "rgba(255,255,255,0.7)",
    letterSpacing: 1,
  },
  headerTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 26,
    color: "#FFFFFF",
  },
  headerSub: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: "rgba(255,255,255,0.8)",
  },
  card: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    marginTop: -30,
    paddingHorizontal: 24,
    paddingTop: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  formInner: {
    flex: 1,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E0E0E0",
    alignSelf: "center",
    marginBottom: 24,
  },
  inputLabel: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 15,
    color: "#444",
    marginBottom: 10,
    textAlign: "right",
  },
  phoneRow: {
    flexDirection: "row",
    backgroundColor: "#F7F7F7",
    borderRadius: 14,
    height: 56,
    alignItems: "center",
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: "#EFEFEF",
  },
  phoneInput: {
    flex: 1,
    fontSize: 18,
    color: "#333",
    textAlign: "left",
    fontFamily: "Cairo_600SemiBold",
  },
  prefixBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: "#F0F0F0",
  },
  countryCode: {
    fontFamily: "Cairo_700Bold",
    fontSize: 15,
    color: "#333",
  },
  flag: {
    width: 24,
    height: 16,
    borderRadius: 2,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    justifyContent: "flex-end",
  },
  errorText: {
    fontFamily: "Cairo_400Regular",
    color: AppColors.error,
    fontSize: 13,
  },
  submitBtn: {
    borderRadius: 14,
    overflow: "hidden",
    marginTop: 24,
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
  submitDisabled: {
    opacity: 0.7,
  },
  submitPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.9,
  },
  submitGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 10,
  },
  submitText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 17,
    color: "#FFFFFF",
  },
  submitArrow: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 24,
    marginBottom: 16,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: "#F0F0F0",
  },
  footerLabel: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: "#BBB",
  },
  featureRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  featureChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FFF5EE",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  featureText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    color: "#555",
  },
  terms: {
    fontFamily: "Cairo_400Regular",
    color: "#BBB",
    textAlign: "center",
    fontSize: 11,
    marginTop: 16,
  },
});
