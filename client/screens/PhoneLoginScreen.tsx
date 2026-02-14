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

import { ThemedText } from "@/components/ThemedText";
import { AppColors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";

import onwayLogo from "../../assets/images/icon.png";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const BRAND_ORANGE = "#FF7622";
const LIGHT_ORANGE = "#FF9A5C";

export default function PhoneLoginScreen() {
  const insets = useSafeAreaInsets();
  const { sendOtp } = useAuth();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const logoScale = useRef(new Animated.Value(0.5)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const cardSlide = useRef(new Animated.Value(80)).current;
  const cardFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, friction: 5, tension: 60, useNativeDriver: true }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(cardFade, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(cardSlide, { toValue: 0, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
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
        colors={[BRAND_ORANGE, LIGHT_ORANGE]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={[styles.topSection, { paddingTop: insets.top + 30 }]}
      >
        <Animated.View style={[styles.logoContainer, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
          <Image
            source={onwayLogo}
            style={styles.logoImage}
            contentFit="contain"
          />
        </Animated.View>
      </LinearGradient>

      <Animated.View
        style={[
          styles.whiteCard,
          {
            opacity: cardFade,
            transform: [{ translateY: cardSlide }],
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
            <ThemedText type="h2" style={styles.welcomeTitle}>
              مرحباً بك
            </ThemedText>
            <ThemedText type="body" style={styles.welcomeSubtitle}>
              أدخل رقم هاتفك للبدء في التسوق أو التوصيل
            </ThemedText>

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
                <Image
                  source={{ uri: "https://flagcdn.com/w80/iq.png" }}
                  style={styles.flagIcon}
                />
              </View>
            </View>

            {error ? (
              <ThemedText type="small" style={styles.errorText}>
                {error}
              </ThemedText>
            ) : null}

            <Pressable
              style={[styles.mainButton, isLoading && styles.mainButtonDisabled]}
              onPress={handleContinue}
              disabled={isLoading}
              testID="button-continue"
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <ThemedText type="h4" style={styles.buttonText}>
                  إرسال رمز التحقق
                </ThemedText>
              )}
            </Pressable>

            <ThemedText type="small" style={styles.termsText}>
              بالمتابعة، أنت توافق على شروط الخدمة وسياسة الخصوصية
            </ThemedText>
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
    paddingBottom: 50,
    minHeight: 280,
  },
  logoContainer: {
    width: 150,
    height: 150,
    borderRadius: 75,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  logoImage: {
    width: 150,
    height: 150,
  },
  whiteCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    paddingHorizontal: 28,
    paddingTop: 32,
    marginTop: -28,
  },
  formInner: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  welcomeTitle: {
    textAlign: "center",
    fontWeight: "700",
    color: "#1A1A1A",
    fontSize: 24,
    marginBottom: 6,
  },
  welcomeSubtitle: {
    textAlign: "center",
    color: "#888",
    marginBottom: 28,
    fontSize: 14,
    lineHeight: 22,
  },
  inputLabel: {
    color: "#555",
    fontWeight: "600",
    fontSize: 13,
    marginBottom: 8,
    textAlign: "right",
  },
  phoneInputRow: {
    flexDirection: "row",
    backgroundColor: "#F6F6F8",
    borderRadius: 14,
    height: 56,
    alignItems: "center",
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: "#ECECEC",
  },
  textInput: {
    flex: 1,
    fontSize: 18,
    color: "#222",
    textAlign: "left",
    fontWeight: "600",
    letterSpacing: 1,
  },
  prefixContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 12,
    borderLeftWidth: 1,
    borderLeftColor: "#E0E0E0",
    marginLeft: 8,
    paddingRight: 4,
  },
  countryCode: {
    fontSize: 15,
    fontWeight: "700",
    color: "#333",
    marginRight: 8,
  },
  flagIcon: {
    width: 28,
    height: 19,
    borderRadius: 3,
  },
  errorText: {
    color: AppColors.error,
    textAlign: "center",
    marginTop: 10,
    fontSize: 13,
  },
  mainButton: {
    backgroundColor: BRAND_ORANGE,
    height: 56,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 24,
    shadowColor: BRAND_ORANGE,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  mainButtonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
  termsText: {
    color: "#B0B0B0",
    textAlign: "center",
    fontSize: 11,
    marginTop: 20,
    lineHeight: 18,
  },
});
