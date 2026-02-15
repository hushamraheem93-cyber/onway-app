import React, { useState, useRef } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  TextInput,
  Keyboard,
  ActivityIndicator,
  Dimensions,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { AppColors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";

const { width, height } = Dimensions.get("window");

const BRAND_ORANGE = "#FF6B35";
const BRAND_ORANGE_LIGHT = "#FF8C61";

export default function PhoneLoginScreen() {
  const { sendOtp } = useAuth();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<TextInput>(null);

  const formatPhoneNumber = (text: string) => {
    const cleaned = text.replace(/\D/g, "");
    return cleaned.substring(0, 10);
  };

  const handleContinue = async () => {
    if (phoneNumber.length < 9) {
      setError("الرجاء إدخال رقم هاتف صحيح");
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    setError("");

    try {
      const fullPhone = `00964${phoneNumber}`;
      await sendOtp(fullPhone);
    } catch (err: any) {
      setError(err.message || "حدث خطأ أثناء إرسال رمز التحقق");
    } finally {
      setLoading(false);
    }
  };

  const isDisabled = phoneNumber.length < 9;

  return (
    <Pressable style={styles.container} onPress={Keyboard.dismiss}>
      <SafeAreaView style={styles.safeArea}>
        <LinearGradient
          colors={[BRAND_ORANGE, BRAND_ORANGE_LIGHT]}
          style={styles.topSection}
        >
          <View style={styles.logoContainer}>
            <View style={styles.logoBox}>
              <Feather name="truck" size={22} color={BRAND_ORANGE} />
            </View>
            <View style={styles.logoTextContainer}>
              <ThemedText style={styles.logoOn}>On</ThemedText>
              <ThemedText style={styles.logoWay}>Way</ThemedText>
            </View>
          </View>

          <View style={styles.headerContainer}>
            <ThemedText style={styles.title}>مرحباً بك</ThemedText>
            <ThemedText style={styles.subtitle}>
              سجل دخولك للبدء بالتسوق والتوصيل
            </ThemedText>
          </View>
        </LinearGradient>

        <View style={styles.card}>
          <ThemedText style={styles.label}>رقم الهاتف</ThemedText>

          <View style={styles.inputWrapper}>
            <View style={styles.countryCode}>
              <Image
                source={{ uri: "https://flagcdn.com/w80/iq.png" }}
                style={styles.flag}
              />
              <ThemedText style={styles.code}>964+</ThemedText>
            </View>

            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder="7XX XXX XXXX"
              placeholderTextColor="#BDC3C7"
              keyboardType="phone-pad"
              value={phoneNumber}
              onChangeText={(text) => {
                setPhoneNumber(formatPhoneNumber(text));
                if (error) setError("");
              }}
              maxLength={10}
              testID="input-phone"
            />
          </View>

          {error ? (
            <View style={styles.errorRow}>
              <Feather name="alert-circle" size={14} color={AppColors.error} />
              <ThemedText style={styles.errorText}>{error}</ThemedText>
            </View>
          ) : null}

          <Pressable
            style={({ pressed }) => [
              styles.continueButton,
              isDisabled ? styles.continueButtonDisabled : undefined,
              pressed && !isDisabled ? styles.continuePressed : undefined,
            ]}
            onPress={handleContinue}
            disabled={isDisabled || loading}
            testID="button-continue"
          >
            <LinearGradient
              colors={
                isDisabled
                  ? ["#BDC3C7", "#95A5A6"]
                  : [BRAND_ORANGE, BRAND_ORANGE_LIGHT]
              }
              style={styles.continueGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <ThemedText style={styles.continueText}>
                    إرسال رمز التحقق
                  </ThemedText>
                  <View style={styles.continueArrow}>
                    <Feather
                      name="arrow-left"
                      size={16}
                      color={isDisabled ? "#95A5A6" : BRAND_ORANGE}
                    />
                  </View>
                </>
              )}
            </LinearGradient>
          </Pressable>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <ThemedText style={styles.dividerText}>أو</ThemedText>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.featuresContainer}>
            <View style={styles.feature}>
              <View style={styles.featureIcon}>
                <Feather name="zap" size={24} color={BRAND_ORANGE} />
              </View>
              <ThemedText style={styles.featureText}>توصيل سريع</ThemedText>
            </View>

            <View style={styles.feature}>
              <View style={styles.featureIcon}>
                <Feather name="shield" size={24} color={BRAND_ORANGE} />
              </View>
              <ThemedText style={styles.featureText}>دفع آمن</ThemedText>
            </View>

            <View style={styles.feature}>
              <View style={styles.featureIcon}>
                <Feather name="map-pin" size={24} color={BRAND_ORANGE} />
              </View>
              <ThemedText style={styles.featureText}>تتبع مباشر</ThemedText>
            </View>
          </View>

          <ThemedText style={styles.terms}>
            بالمتابعة، أنت توافق على{" "}
            <ThemedText style={styles.link}>شروط الخدمة</ThemedText>
            {"\n"}و
            <ThemedText style={styles.link}> سياسة الخصوصية</ThemedText>
          </ThemedText>
        </View>
      </SafeAreaView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  safeArea: {
    flex: 1,
  },
  topSection: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
  },
  logoContainer: {
    flexDirection: "row",
    writingDirection: "ltr",
    alignItems: "center",
    gap: 12,
    marginBottom: 32,
  },
  logoBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
  },
  logoTextContainer: {
    flexDirection: "row",
    writingDirection: "ltr",
    alignItems: "baseline",
  },
  logoOn: {
    fontFamily: "Kanit_700Bold",
    fontSize: 28,
    color: "#FFFFFF",
    letterSpacing: -1,
    writingDirection: "ltr",
  },
  logoWay: {
    fontFamily: "Kanit_700Bold",
    fontSize: 28,
    color: "#FFFFFF",
    opacity: 0.85,
    letterSpacing: -1,
    writingDirection: "ltr",
  },
  headerContainer: {
    marginTop: 8,
  },
  title: {
    fontFamily: "Cairo_700Bold",
    fontSize: 30,
    color: "#FFFFFF",
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: "Cairo_400Regular",
    fontSize: 15,
    color: "rgba(255, 255, 255, 0.9)",
    lineHeight: 24,
  },
  card: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 28,
    marginTop: -20,
  },
  label: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 16,
    color: "#2C3E50",
    marginBottom: 12,
    textAlign: "right",
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8F9FA",
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#ECF0F1",
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginBottom: 8,
  },
  countryCode: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 12,
    borderLeftWidth: 1,
    borderLeftColor: "#ECF0F1",
    gap: 8,
  },
  flag: {
    width: 28,
    height: 18,
    borderRadius: 2,
  },
  code: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 16,
    color: "#2C3E50",
  },
  input: {
    flex: 1,
    fontFamily: "Cairo_600SemiBold",
    fontSize: 18,
    color: "#2C3E50",
    paddingVertical: 14,
    paddingHorizontal: 16,
    textAlign: "left",
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
    justifyContent: "flex-end",
  },
  errorText: {
    fontFamily: "Cairo_400Regular",
    color: AppColors.error,
    fontSize: 13,
  },
  continueButton: {
    borderRadius: 16,
    overflow: "hidden",
    marginTop: 16,
    marginBottom: 24,
    ...Platform.select({
      ios: {
        shadowColor: BRAND_ORANGE,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  continueButtonDisabled: {
    ...Platform.select({
      ios: { shadowOpacity: 0.1 },
      android: { elevation: 2 },
      default: {},
    }),
  },
  continuePressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.9,
  },
  continueGradient: {
    flexDirection: "row",
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  continueText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 18,
    color: "#FFFFFF",
  },
  continueArrow: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#ECF0F1",
  },
  dividerText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: "#95A5A6",
  },
  featuresContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 28,
  },
  feature: {
    alignItems: "center",
    gap: 8,
  },
  featureIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#FFF5F0",
    justifyContent: "center",
    alignItems: "center",
  },
  featureText: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
    color: "#7F8C8D",
  },
  terms: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    color: "#95A5A6",
    textAlign: "center",
    lineHeight: 20,
  },
  link: {
    color: BRAND_ORANGE,
  },
});
