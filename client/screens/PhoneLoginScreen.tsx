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
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { useNavigation } from "@react-navigation/native";

const BRAND_ORANGE = "#FF7622";

export default function PhoneLoginScreen() {
  const { sendOtp } = useAuth();
  const navigation = useNavigation();
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
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {navigation.canGoBack() ? (
          <Pressable
            style={styles.backBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.goBack();
            }}
            testID="button-back"
          >
            <Feather name="arrow-right" size={22} color="#FFFFFF" />
          </Pressable>
        ) : null}
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
                <Feather name="alert-circle" size={14} color="#FFFFFF" />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BRAND_ORANGE,
  },
  keyboardView: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  logoWrap: {
    direction: "ltr",
    marginBottom: 30,
  },
  logoText: {
    fontFamily: "Montserrat_800ExtraBold",
    fontSize: 30,
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: 1,
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
  backBtn: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
});
