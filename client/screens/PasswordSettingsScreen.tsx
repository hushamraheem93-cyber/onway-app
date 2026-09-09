/**
 * Create or change the account password.
 *
 * One screen for both, because from the account's point of view they are the
 * same act with one extra proof. An account with no password sees two fields; an
 * account that already has one is asked for the current password first, since a
 * valid session on an unlocked phone must not be enough to lock the real owner
 * out.
 *
 * Nothing here is compulsory. An OTP-only account keeps working exactly as it
 * did — this screen is an offer, reached from the profile, never a gate.
 */
import React, { useState } from "react";
import {
  View,
  TextInput,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { AppColors, Spacing } from "@/constants/theme";

/** Must match PASSWORD_MIN_LENGTH in server/authCredentials.ts. */
const MIN_LENGTH = 8;

export default function PasswordSettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { accountHasPassword, createPassword, changePassword } = useAuth();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isChange = accountHasPassword;

  const submit = async () => {
    Keyboard.dismiss();
    setError("");
    if (isChange && !current) {
      setError("أدخل كلمة المرور الحالية");
      return;
    }
    if (next.length < MIN_LENGTH) {
      setError(`كلمة المرور يجب أن تكون ${MIN_LENGTH} أحرف على الأقل`);
      return;
    }
    // Checked here as well as on the server: catching a typo before a round trip
    // is the difference between "try again" and "your password is now something
    // you did not intend".
    if (next !== confirm) {
      setError("كلمتا المرور غير متطابقتين");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBusy(true);
    try {
      if (isChange) await changePassword(current, next);
      else await createPassword(next);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.goBack();
    } catch (err: any) {
      setError(err?.message || "تعذّر حفظ كلمة المرور");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setBusy(false);
    }
  };

  const field = (
    label: string,
    value: string,
    onChange: (t: string) => void,
    testID: string,
  ) => (
    <>
      <ThemedText style={styles.label}>{label}</ThemedText>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={(t) => {
            onChange(t);
            if (error) setError("");
          }}
          secureTextEntry={!reveal}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={label}
          placeholderTextColor="rgba(0,0,0,0.30)"
          testID={testID}
          accessibilityLabel={label}
        />
        <Pressable
          onPress={() => setReveal((v) => !v)}
          hitSlop={8}
          style={styles.eye}
          testID={`${testID}-toggle`}
          accessibilityRole="button"
          accessibilityLabel={reveal ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
        >
          <Feather name={reveal ? "eye-off" : "eye"} size={19} color={AppColors.gray500} />
        </Pressable>
      </View>
    </>
  );

  return (
    <ScrollView
      style={[styles.screen, { paddingTop: insets.top + Spacing.md }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <ThemedText style={styles.title}>
        {isChange ? "تغيير كلمة المرور" : "إنشاء كلمة مرور"}
      </ThemedText>
      <ThemedText style={styles.subtitle}>
        {isChange
          ? "ستحتاج كلمة المرور الجديدة في المرات القادمة."
          : "بعد إنشائها تستطيع الدخول بها مباشرةً بدل انتظار رمز التحقق."}
      </ThemedText>

      {isChange ? field("كلمة المرور الحالية", current, setCurrent, "input-current-password") : null}
      {field("كلمة المرور الجديدة", next, setNext, "input-new-password")}
      {field("تأكيد كلمة المرور", confirm, setConfirm, "input-confirm-password")}

      <ThemedText style={styles.hint}>
        {MIN_LENGTH} أحرف على الأقل. جملة تتذكّرها أقوى من كلمة قصيرة معقّدة.
      </ThemedText>

      {error ? (
        <View style={styles.errorRow}>
          <Feather name="alert-circle" size={14} color={AppColors.error} />
          <ThemedText style={styles.errorText}>{error}</ThemedText>
        </View>
      ) : null}

      <Pressable
        style={({ pressed }) => [
          styles.submit,
          busy ? styles.submitDisabled : undefined,
          pressed && !busy ? styles.submitPressed : undefined,
        ]}
        onPress={submit}
        disabled={busy}
        testID="button-save-password"
        accessibilityRole="button"
        accessibilityLabel={isChange ? "تغيير كلمة المرور" : "حفظ كلمة المرور"}
        accessibilityState={{ disabled: busy, busy }}
      >
        {busy ? (
          <ActivityIndicator size="small" color={AppColors.white} />
        ) : (
          <ThemedText style={styles.submitText}>
            {isChange ? "تغيير كلمة المرور" : "حفظ كلمة المرور"}
          </ThemedText>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppColors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xl * 2 },
  title: {
    fontFamily: "Cairo_700Bold",
    fontSize: 22,
    color: AppColors.textPrimary,
    textAlign: "right",
  },
  subtitle: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: AppColors.gray500,
    textAlign: "right",
    marginTop: 6,
    marginBottom: Spacing.lg,
    lineHeight: 22,
  },
  label: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 13,
    color: AppColors.gray700,
    textAlign: "right",
    marginBottom: 6,
    marginTop: Spacing.md,
  },
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: AppColors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: AppColors.gray200,
    paddingHorizontal: 14,
  },
  input: {
    flex: 1,
    height: 52,
    fontFamily: "Cairo_400Regular",
    fontSize: 15,
    color: AppColors.textPrimary,
    textAlign: "right",
  },
  eye: { paddingHorizontal: 6, paddingVertical: 10 },
  hint: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    color: AppColors.gray500,
    textAlign: "right",
    marginTop: 10,
    lineHeight: 20,
  },
  errorRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
  },
  errorText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: AppColors.error,
    textAlign: "right",
  },
  submit: {
    marginTop: Spacing.xl,
    height: 54,
    borderRadius: 16,
    backgroundColor: AppColors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  submitDisabled: { opacity: 0.6 },
  submitPressed: { transform: [{ scale: 0.98 }] },
  submitText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    color: AppColors.white,
  },
});
