import React, { useState } from "react";
import {
  StyleSheet,
  View,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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

  const validatePhone = (phone: string) => {
    const cleanPhone = phone.replace(/\s/g, "");
    if (!cleanPhone.startsWith("00964") && !cleanPhone.startsWith("07")) {
      return false;
    }
    if (cleanPhone.startsWith("00964") && cleanPhone.length < 14) {
      return false;
    }
    if (cleanPhone.startsWith("07") && cleanPhone.length < 11) {
      return false;
    }
    return true;
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
      await login(phoneNumber);
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
        <View style={styles.logoContainer}>
          <ThemedText type="h1" style={styles.logoText}>
            OnWay
          </ThemedText>
          <ThemedText type="body" style={styles.logoSubText}>
            أون وي
          </ThemedText>
        </View>

        <View style={styles.formContainer}>
          <ThemedText type="h4" style={styles.loginTitle}>
            تسجيل الدخول
          </ThemedText>

          <View style={styles.inputWrapper}>
            <TextInput
              placeholder="009647xxxxxxxxx"
              placeholderTextColor="#AAA"
              keyboardType="phone-pad"
              style={styles.input}
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              maxLength={15}
            />
            <FontAwesome name="phone" size={20} color="#FF6B00" style={styles.inputIcon} />
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
  },
  logoText: {
    fontSize: 45,
    fontWeight: "900",
    color: "white",
    letterSpacing: 2,
    fontFamily: "Poppins_700Bold",
  },
  logoSubText: {
    fontSize: 20,
    color: "white",
    marginTop: -5,
    opacity: 0.9,
    fontFamily: "Cairo_400Regular",
  },
  formContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    padding: 25,
    borderRadius: 25,
  },
  loginTitle: {
    color: "white",
    fontSize: 18,
    textAlign: "center",
    marginBottom: 20,
    fontWeight: "bold",
  },
  inputWrapper: {
    flexDirection: "row",
    backgroundColor: "white",
    borderRadius: 15,
    alignItems: "center",
    paddingHorizontal: 15,
    height: 55,
  },
  input: {
    flex: 1,
    textAlign: "right",
    fontSize: 16,
    color: "#333",
    fontFamily: "Tajawal_500Medium",
  },
  inputIcon: {
    marginLeft: 10,
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
