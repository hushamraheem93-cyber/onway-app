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
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { AppColors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";

// @ts-ignore
import deliveryManImage from "../assets/images/delivery-man.png";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function PhoneLoginScreen() {
  const insets = useSafeAreaInsets();
  const { sendOtp } = useAuth();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const slideUpAnim = useRef(new Animated.Value(50)).current;
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
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.imageSection}>
        <View style={styles.yellowBg} />
        <Image
          source={deliveryManImage}
          style={styles.deliveryImage}
          contentFit="contain"
        />
      </View>

      <Animated.View
        style={[
          styles.formSection,
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
          <View style={styles.brandRow}>
            <ThemedText type="h1" style={styles.brandOn}>On</ThemedText>
            <ThemedText type="h1" style={styles.brandWay}>way</ThemedText>
          </View>

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
            <View style={styles.verticalDivider} />
            <View style={styles.countryContainer}>
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
    backgroundColor: "#FFFFFF",
  },
  imageSection: {
    height: "38%",
    position: "relative",
    alignItems: "center",
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  yellowBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#FFD233",
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  deliveryImage: {
    width: SCREEN_WIDTH * 0.65,
    height: "100%",
    zIndex: 2,
  },
  formSection: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    marginTop: -30,
    zIndex: 3,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  formInner: {
    flex: 1,
  },
  brandRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  brandOn: {
    fontSize: 36,
    fontWeight: "800",
    color: "#2D2D2D",
  },
  brandWay: {
    fontSize: 36,
    fontWeight: "800",
    color: AppColors.primary,
  },
  welcomeTitle: {
    textAlign: "center",
    fontWeight: "700",
    color: "#2D2D2D",
    marginBottom: 4,
  },
  welcomeSubtitle: {
    textAlign: "center",
    color: "#888",
    marginBottom: 24,
    fontSize: 14,
  },
  phoneInputRow: {
    flexDirection: "row",
    backgroundColor: "#F6F6F6",
    borderRadius: 16,
    height: 58,
    alignItems: "center",
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#ECECEC",
  },
  textInput: {
    flex: 1,
    fontSize: 18,
    color: "#333",
    textAlign: "left",
    fontWeight: "500",
  },
  verticalDivider: {
    width: 1,
    height: "55%",
    backgroundColor: "#DDD",
    marginHorizontal: 12,
  },
  countryContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  countryCode: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginRight: 8,
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
    backgroundColor: AppColors.primary,
    height: 56,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
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
    fontSize: 12,
    marginTop: 16,
  },
});
