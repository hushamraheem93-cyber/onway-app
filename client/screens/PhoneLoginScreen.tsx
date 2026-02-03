import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  View,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Animated,
  Easing,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { FontAwesome } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { AppColors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";

const SOCIAL_LINKS = {
  facebook: "https://facebook.com/onwayiq",
  instagram: "https://instagram.com/onwayiq",
};

export default function PhoneLoginScreen() {
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.5)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 4,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -10,
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const validatePhone = (phone: string) => {
    const cleanPhone = phone.replace(/\s/g, "");
    if (cleanPhone.length < 10) {
      return false;
    }
    return true;
  };

  const formatPhoneForLogin = (phone: string) => {
    const cleanPhone = phone.replace(/\s/g, "");
    return `00964${cleanPhone}`;
  };

  const handleLogin = async () => {
    setError("");
    
    if (!phoneNumber.trim()) {
      setError("الرجاء إدخال رقم الهاتف");
      return;
    }

    if (!validatePhone(phoneNumber)) {
      setError("رقم الهاتف غير صحيح");
      return;
    }

    setIsLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const fullPhone = formatPhoneForLogin(phoneNumber);
      await login(fullPhone);
    } catch (err) {
      setError("حدث خطأ، الرجاء المحاولة مرة أخرى");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={["#FF8C00", "#FF6B00"]}
      style={styles.container}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.inner}
      >
        <Animated.View style={[styles.logoContainer, { transform: [{ translateY: floatAnim }] }]}>
          <ThemedText type="h1" style={styles.logoText}>
            OnWay
          </ThemedText>
          <ThemedText type="body" style={styles.logoSubText}>
            أون وي
          </ThemedText>
        </Animated.View>

        <View style={styles.formContainer}>
          <ThemedText type="body" style={styles.inputLabel}>
            سجل برقم هاتفك
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
            />
            <View style={styles.verticalDivider} />
            <Animated.View
              style={[
                styles.countryContainer,
                { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
              ]}
            >
              <ThemedText type="body" style={styles.countryCode}>+964</ThemedText>
              <Image
                source={{ uri: "https://flagcdn.com/w80/iq.png" }}
                style={styles.flagIcon}
              />
            </Animated.View>
          </View>

          {error ? (
            <ThemedText type="small" style={styles.errorText}>
              {error}
            </ThemedText>
          ) : null}

          <Pressable
            style={[styles.mainButton, isLoading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FF6B00" />
            ) : (
              <ThemedText type="h4" style={styles.buttonText}>
                متابعة
              </ThemedText>
            )}
          </Pressable>
        </View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
          <ThemedText type="small" style={styles.termsText}>
            بالمتابعة، أنت توافق على شروط الخدمة وسياسة الخصوصية
          </ThemedText>

          <View style={styles.socialRow}>
            <Pressable
              style={styles.socialIcon}
              onPress={() => Linking.openURL(SOCIAL_LINKS.facebook)}
            >
              <FontAwesome name="facebook" size={24} color="white" />
            </Pressable>
            <Pressable
              style={styles.socialIcon}
              onPress={() => Linking.openURL(SOCIAL_LINKS.instagram)}
            >
              <FontAwesome name="instagram" size={24} color="white" />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  inner: {
    flex: 1,
    justifyContent: "center",
    padding: 30,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 50,
    marginTop: 20,
    overflow: "visible",
  },
  logoText: {
    fontSize: 55,
    fontWeight: "bold",
    color: "#FFF",
    letterSpacing: 1,
    lineHeight: 70,
    textAlign: "center",
    fontFamily: "Poppins_700Bold",
  },
  logoSubText: {
    fontSize: 20,
    color: "#FFF",
    marginTop: -5,
    opacity: 0.9,
    fontFamily: "Cairo_400Regular",
  },
  formContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 20,
    padding: 20,
    width: "100%",
  },
  inputLabel: {
    color: "#FFF",
    textAlign: "right",
    marginBottom: 10,
    fontSize: 14,
    fontWeight: "600",
  },
  phoneInputRow: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    borderRadius: 15,
    height: 60,
    alignItems: "center",
    paddingHorizontal: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 5,
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
    height: "60%",
    backgroundColor: "#EEE",
    marginHorizontal: 10,
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
    color: "#FFE0E0",
    textAlign: "center",
    marginTop: 10,
  },
  mainButton: {
    backgroundColor: "white",
    height: 55,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 20,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#FF6B00",
    fontSize: 18,
    fontWeight: "bold",
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: 30,
  },
  termsText: {
    color: "white",
    textAlign: "center",
    fontSize: 12,
    opacity: 0.8,
    marginBottom: 20,
  },
  socialRow: {
    flexDirection: "row",
    gap: 20,
  },
  socialIcon: {
    padding: 10,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 50,
  },
});
