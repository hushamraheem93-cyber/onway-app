import React, { useState } from "react";
import {
  StyleSheet,
  View,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";

const BRAND_ORANGE = "#FF7622";

export default function PhoneLoginScreen() {
  const insets = useSafeAreaInsets();
  const { sendOtp } = useAuth();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

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
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.centered}>
        <View style={styles.logoWrap}>
          <ThemedText style={styles.logoText}>OnWay</ThemedText>
        </View>

        <View style={styles.formBlock}>
          <View style={styles.phoneRow}>
            <TextInput
              placeholder="رقم الهاتف"
              placeholderTextColor="rgba(0,0,0,0.35)"
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
              <Feather name="alert-circle" size={14} color="#FF3B30" />
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
            {isLoading ? (
              <ActivityIndicator size="small" color={BRAND_ORANGE} />
            ) : (
              <ThemedText style={styles.submitText}>إرسال رمز التحقق</ThemedText>
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND_ORANGE,
    paddingHorizontal: 24,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  logoWrap: {
    direction: "ltr",
    marginBottom: 30,
  },
  logoText: {
    fontFamily: "Kanit_700Bold",
    fontSize: 30,
    color: "#FFFFFF",
    fontWeight: "bold",
    textAlign: "center",
  },
  formBlock: {
    width: "100%",
    gap: 20,
  },
  phoneRow: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    height: 56,
    alignItems: "center",
    paddingHorizontal: 16,
  },
  phoneInput: {
    flex: 1,
    fontSize: 16,
    color: "#333",
    textAlign: "left",
    fontFamily: "Cairo_600SemiBold",
  },
  prefixBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 12,
    borderLeftWidth: 1,
    borderLeftColor: "#EEE",
  },
  countryCode: {
    fontFamily: "Cairo_700Bold",
    fontSize: 14,
    color: "#333",
  },
  flag: {
    width: 22,
    height: 15,
    borderRadius: 2,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    justifyContent: "flex-end",
    marginTop: -10,
  },
  errorText: {
    fontFamily: "Cairo_400Regular",
    color: "#FFFFFF",
    fontSize: 13,
  },
  submitBtn: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
      },
      android: { elevation: 4 },
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
  submitText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    color: BRAND_ORANGE,
  },
});
