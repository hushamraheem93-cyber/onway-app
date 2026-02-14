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

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const DART_ORANGE = "#FF7622";
const LIGHT_ORANGE = "#FF9A5C";

export default function PhoneLoginScreen() {
  const insets = useSafeAreaInsets();
  const { sendOtp } = useAuth();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const slideUpAnim = useRef(new Animated.Value(60)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideUpAnim, {
        toValue: 0,
        duration: 800,
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
        colors={[DART_ORANGE, LIGHT_ORANGE]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[styles.gradientSection, { paddingTop: insets.top + 40 }]}
      >
        <View style={styles.iconCircle}>
          <Feather name="truck" size={80} color="#FFFFFF" />
        </View>
      </LinearGradient>

      <Animated.View
        style={[
          styles.whiteCard,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideUpAnim }],
            paddingBottom: insets.bottom + 20,
          },
        ]}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.formInner}
        >
          <ThemedText type="h1" style={styles.brandText}>
            way<ThemedText type="h1" style={styles.brandOn}>On</ThemedText>
          </ThemedText>

          <ThemedText type="h3" style={styles.welcomeTitle}>
            مرحباً بك في أون وي
          </ThemedText>
          <ThemedText type="body" style={styles.welcomeSubtitle}>
            أدخل رقم هاتفك للبدء في التسوق أو التوصيل
          </ThemedText>

          <View style={styles.phoneInputRow}>
            <TextInput
              placeholder="780 000 0000"
              placeholderTextColor="#BCBCBC"
              keyboardType="phone-pad"
              style={styles.textInput}
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              maxLength={12}
              testID="input-phone"
            />
            <View style={styles.prefixContainer}>
              <ThemedText type="body" style={styles.countryCode}>+964</ThemedText>
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
        </KeyboardAvoidingView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DART_ORANGE,
  },
  gradientSection: {
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 60,
  },
  iconCircle: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  whiteCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    paddingHorizontal: 30,
    paddingTop: 40,
    marginTop: -30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 10,
  },
  formInner: {
    flex: 1,
  },
  brandText: {
    fontSize: 32,
    fontWeight: "800",
    color: DART_ORANGE,
    textAlign: "center",
    marginBottom: 10,
  },
  brandOn: {
    fontSize: 32,
    fontWeight: "800",
    color: DART_ORANGE,
  },
  welcomeTitle: {
    textAlign: "center",
    fontWeight: "600",
    color: "#2D2D2D",
    fontSize: 20,
    marginBottom: 4,
  },
  welcomeSubtitle: {
    textAlign: "center",
    color: "#999",
    marginBottom: 30,
    fontSize: 14,
  },
  phoneInputRow: {
    flexDirection: "row",
    backgroundColor: "#F5F5F5",
    borderRadius: 15,
    height: 55,
    alignItems: "center",
    paddingHorizontal: 14,
  },
  textInput: {
    flex: 1,
    fontSize: 18,
    color: "#333",
    textAlign: "left",
    fontWeight: "500",
  },
  prefixContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 10,
  },
  countryCode: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginRight: 6,
  },
  flagIcon: {
    width: 30,
    height: 20,
    borderRadius: 3,
  },
  errorText: {
    color: AppColors.error,
    textAlign: "center",
    marginTop: 10,
  },
  mainButton: {
    backgroundColor: DART_ORANGE,
    height: 55,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 25,
    shadowColor: DART_ORANGE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  mainButtonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
  },
  termsText: {
    color: "#AAA",
    textAlign: "center",
    fontSize: 11,
    marginTop: 20,
  },
});
