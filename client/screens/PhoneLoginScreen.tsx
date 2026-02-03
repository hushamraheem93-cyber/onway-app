import React, { useState } from "react";
import {
  StyleSheet,
  View,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { Spacing, BorderRadius, AppColors } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";

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
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <Image
            source={require("../../assets/images/icon.png")}
            style={styles.logo}
            contentFit="contain"
          />
          <ThemedText type="h1" style={styles.appName}>
            Onway
          </ThemedText>
          <ThemedText type="body" style={styles.tagline}>
            توصيل سريع لباب بيتك
          </ThemedText>
        </View>

        <View style={styles.formContainer}>
          <ThemedText type="h3" style={styles.formTitle}>
            تسجيل الدخول
          </ThemedText>
          
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              placeholder="009647xxxxxxxxx"
              placeholderTextColor="rgba(255,255,255,0.5)"
              keyboardType="phone-pad"
              textAlign="center"
              maxLength={15}
            />
          </View>

          {error ? (
            <ThemedText type="small" style={styles.errorText}>
              {error}
            </ThemedText>
          ) : null}

          <Pressable
            style={[styles.loginButton, isLoading && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={AppColors.primary} />
            ) : (
              <ThemedText type="h4" style={styles.loginButtonText}>
                متابعة
              </ThemedText>
            )}
          </Pressable>

          <ThemedText type="small" style={styles.termsText}>
            بالمتابعة، أنت توافق على شروط الخدمة وسياسة الخصوصية
          </ThemedText>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.primary,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: Spacing["2xl"],
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: Spacing.lg,
  },
  appName: {
    color: "#FFFFFF",
    fontSize: 42,
    fontWeight: "700",
    marginBottom: Spacing.sm,
  },
  tagline: {
    color: "rgba(255,255,255,0.8)",
    textAlign: "center",
  },
  formContainer: {
    alignItems: "center",
  },
  formTitle: {
    color: "#FFFFFF",
    marginBottom: Spacing.lg,
  },
  inputContainer: {
    width: "100%",
    marginBottom: Spacing.md,
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    fontSize: 18,
    color: "#FFFFFF",
    fontFamily: "Tajawal_500Medium",
    textAlign: "center",
  },
  errorText: {
    color: "#FFE0E0",
    marginBottom: Spacing.md,
    textAlign: "center",
  },
  loginButton: {
    backgroundColor: "#FFFFFF",
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing["2xl"],
    width: "100%",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: AppColors.primary,
    fontWeight: "700",
  },
  termsText: {
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
    paddingHorizontal: Spacing.lg,
  },
});
