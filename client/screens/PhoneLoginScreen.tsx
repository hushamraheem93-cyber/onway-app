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
        <View style={styles.logoContainer}>
          <ThemedText type="h1" style={styles.logoText}>
            OnWay
          </ThemedText>
          <ThemedText type="body" style={styles.logoSubText}>
            أون وي
          </ThemedText>
        </View>

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
            <View style={styles.countryContainer}>
              <ThemedText type="body" style={styles.countryCode}>+964</ThemedText>
              <Image
                source={{ uri: "https://flagcdn.com/w40/iq.png" }}
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
    width: 25,
    height: 18,
    borderRadius: 2,
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
