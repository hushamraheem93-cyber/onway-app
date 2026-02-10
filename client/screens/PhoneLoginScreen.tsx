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
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { AppColors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";

import deliveryBikeImage from "@/assets/images/delivery-bike.png";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const PRIMARY = "#FF7622";
const PRIMARY_DARK = "#E5691E";
const LIGHT_ORANGE = "#FF9A5C";
const BG_ORANGE = "#FFF5EE";

export default function PhoneLoginScreen() {
  const insets = useSafeAreaInsets();
  const { sendOtp } = useAuth();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const slideUpAnim = useRef(new Animated.Value(80)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.5)).current;
  const bikeSlide = useRef(new Animated.Value(100)).current;

  useEffect(() => {
    Animated.stagger(150, [
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 5,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.timing(bikeSlide, {
        toValue: 0,
        duration: 700,
        easing: Easing.out(Easing.back(1.2)),
        useNativeDriver: true,
      }),
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(slideUpAnim, {
          toValue: 0,
          duration: 600,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
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
        colors={[PRIMARY, LIGHT_ORANGE, "#FFB88C"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.topSection, { paddingTop: insets.top + 16 }]}
      >
        <View style={styles.topDecorCircle1} />
        <View style={styles.topDecorCircle2} />

        <Animated.View style={[styles.logoRow, { transform: [{ scale: logoScale }] }]}>
          <ThemedText type="h1" style={styles.logoWhite}>On</ThemedText>
          <ThemedText type="h1" style={styles.logoAccent}>way</ThemedText>
        </Animated.View>

        <ThemedText type="small" style={styles.tagline}>
          توصيل سريع لكل طلباتك
        </ThemedText>

        <Animated.View style={[styles.bikeContainer, { transform: [{ translateX: bikeSlide }] }]}>
          <Image
            source={deliveryBikeImage}
            style={styles.bikeImage}
            contentFit="contain"
          />
        </Animated.View>
      </LinearGradient>

      <Animated.View
        style={[
          styles.bottomSheet,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideUpAnim }],
            paddingBottom: insets.bottom + 16,
          },
        ]}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.formWrapper}
        >
          <View style={styles.handleBar} />

          <ThemedText type="h3" style={styles.welcomeTitle}>
            مرحباً بك
          </ThemedText>
          <ThemedText type="body" style={styles.welcomeSubtitle}>
            أدخل رقم هاتفك للبدء
          </ThemedText>

          <View style={styles.inputGroup}>
            <ThemedText type="small" style={styles.inputLabel}>
              رقم الهاتف
            </ThemedText>
            <View style={styles.phoneInputRow}>
              <TextInput
                placeholder="7XX XXX XXXX"
                placeholderTextColor="#C0C0C0"
                keyboardType="phone-pad"
                style={styles.textInput}
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                maxLength={12}
                testID="input-phone"
              />
              <View style={styles.prefixContainer}>
                <ThemedText type="body" style={styles.countryCode}>964+</ThemedText>
                <View style={styles.flagContainer}>
                  <Image
                    source={{ uri: "https://flagcdn.com/w80/iq.png" }}
                    style={styles.flagIcon}
                  />
                </View>
              </View>
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
              styles.mainButton,
              isLoading && styles.mainButtonDisabled,
              pressed && !isLoading && styles.mainButtonPressed,
            ]}
            onPress={handleContinue}
            disabled={isLoading}
            testID="button-continue"
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <View style={styles.buttonInner}>
                <ThemedText type="h4" style={styles.buttonText}>
                  إرسال رمز التحقق
                </ThemedText>
                <View style={styles.buttonArrow}>
                  <Feather name="arrow-left" size={18} color="#FFFFFF" />
                </View>
              </View>
            )}
          </Pressable>

          <ThemedText type="small" style={styles.termsText}>
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
    backgroundColor: PRIMARY,
  },
  topSection: {
    height: SCREEN_HEIGHT * 0.48,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
  },
  topDecorCircle1: {
    position: "absolute",
    top: -60,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  topDecorCircle2: {
    position: "absolute",
    bottom: 20,
    left: -50,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  logoWhite: {
    fontSize: 42,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 1,
  },
  logoAccent: {
    fontSize: 42,
    fontWeight: "900",
    color: "rgba(255,255,255,0.75)",
    letterSpacing: 1,
  },
  tagline: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 15,
    fontWeight: "500",
    marginBottom: 12,
  },
  bikeContainer: {
    width: SCREEN_WIDTH * 0.6,
    height: SCREEN_HEIGHT * 0.2,
    alignItems: "center",
    justifyContent: "center",
  },
  bikeImage: {
    width: "100%",
    height: "100%",
  },
  bottomSheet: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    marginTop: -28,
    paddingHorizontal: 24,
    paddingTop: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 12,
  },
  formWrapper: {
    flex: 1,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E0E0E0",
    alignSelf: "center",
    marginBottom: 20,
  },
  welcomeTitle: {
    textAlign: "right",
    fontWeight: "700",
    color: "#1A1A2E",
    fontSize: 22,
    marginBottom: 4,
  },
  welcomeSubtitle: {
    textAlign: "right",
    color: "#8E8E93",
    fontSize: 14,
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 4,
  },
  inputLabel: {
    textAlign: "right",
    color: "#6E6E73",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
  },
  phoneInputRow: {
    flexDirection: "row",
    backgroundColor: "#F7F7F9",
    borderRadius: 14,
    height: 54,
    alignItems: "center",
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: "#EEEEEE",
  },
  textInput: {
    flex: 1,
    fontSize: 17,
    color: "#1A1A2E",
    textAlign: "left",
    fontWeight: "500",
    letterSpacing: 0.5,
  },
  prefixContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderLeftWidth: 1,
    borderLeftColor: "#E5E5E5",
    paddingLeft: 12,
    marginLeft: 8,
  },
  countryCode: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1A1A2E",
    marginRight: 8,
  },
  flagContainer: {
    borderRadius: 4,
    overflow: "hidden",
  },
  flagIcon: {
    width: 28,
    height: 19,
    borderRadius: 3,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    marginTop: 8,
    marginBottom: 4,
  },
  errorText: {
    color: "#E53935",
    fontSize: 13,
  },
  mainButton: {
    backgroundColor: PRIMARY,
    height: 54,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
    shadowColor: PRIMARY,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  mainButtonDisabled: {
    opacity: 0.65,
  },
  mainButtonPressed: {
    backgroundColor: PRIMARY_DARK,
    transform: [{ scale: 0.98 }],
  },
  buttonInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  buttonText: {
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
  termsText: {
    color: "#B0B0B0",
    textAlign: "center",
    fontSize: 11,
    marginTop: 16,
    lineHeight: 18,
  },
});
