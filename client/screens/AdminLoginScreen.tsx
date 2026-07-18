import React, { useState } from "react";
import { StyleSheet, View, TextInput, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { ThemedText } from "@/components/ThemedText";
import { GradientBackground } from "@/components/GradientBackground";
import { useTheme } from "@/hooks/useTheme";
import { AppColors, Spacing, BorderRadius, Shadows, FontWeight } from "@/constants/theme";
import { loginAdmin } from "@/lib/adminAuth";

export default function AdminLoginScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const navigation = useNavigation<any>();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = username.trim().length > 0 && password.length > 0 && !loading;

  const handleLogin = async () => {
    if (!canSubmit) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    setError(null);
    try {
      await loginAdmin(username.trim(), password);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.replace("Admin");
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(e?.message || "تعذّر تسجيل الدخول");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <GradientBackground />
      <KeyboardAwareScrollViewCompat
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.xl,
          paddingBottom: insets.bottom + Spacing.xl,
          paddingHorizontal: Spacing.lg,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={[styles.iconBadge, { backgroundColor: AppColors.primary }]}>
            <Feather name="shield" size={34} color={AppColors.white} />
          </View>
          <ThemedText type="h2" style={styles.title}>لوحة التحكم</ThemedText>
          <ThemedText type="body" style={[styles.subtitle, { color: theme.textSecondary }]}>
            تسجيل دخول المشرف
          </ThemedText>
        </View>

        <View style={[styles.card, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
          <ThemedText type="body" style={styles.label}>اسم المستخدم</ThemedText>
          <View style={[styles.inputRow, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
            <Feather name="user" size={18} color={theme.textSecondary} />
            <TextInput
              style={[styles.input, { color: theme.text }]}
              placeholder="أدخل اسم المستخدم"
              placeholderTextColor={theme.textSecondary}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              textAlign="right"
              accessibilityLabel="اسم المستخدم"
            />
          </View>

          <ThemedText type="body" style={[styles.label, { marginTop: Spacing.md }]}>كلمة المرور</ThemedText>
          <View style={[styles.inputRow, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
            <Pressable
              onPress={() => setShowPassword((s) => !s)}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
              hitSlop={8}
            >
              <Feather name={showPassword ? "eye-off" : "eye"} size={18} color={theme.textSecondary} />
            </Pressable>
            <TextInput
              style={[styles.input, { color: theme.text }]}
              placeholder="أدخل كلمة المرور"
              placeholderTextColor={theme.textSecondary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              textAlign="right"
              accessibilityLabel="كلمة المرور"
              onSubmitEditing={handleLogin}
              returnKeyType="go"
            />
          </View>

          {error ? (
            <View style={styles.errorRow}>
              <Feather name="alert-circle" size={15} color={AppColors.error} />
              <ThemedText type="small" style={styles.errorText}>{error}</ThemedText>
            </View>
          ) : null}

          <Pressable
            style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
            onPress={handleLogin}
            disabled={!canSubmit}
            accessibilityRole="button"
            accessibilityLabel="تسجيل الدخول"
            accessibilityState={{ disabled: !canSubmit, busy: loading }}
          >
            {loading ? (
              <ActivityIndicator color={AppColors.white} />
            ) : (
              <ThemedText type="h4" style={styles.submitText}>تسجيل الدخول</ThemedText>
            )}
          </Pressable>
        </View>

        <ThemedText type="small" style={[styles.note, { color: theme.textSecondary }]}>
          الدخول متاح للمشرفين المصرّح لهم فقط.
        </ThemedText>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  iconBadge: {
    width: 76,
    height: 76,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  title: {
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  subtitle: {
    textAlign: "center",
  },
  card: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
  },
  label: {
    textAlign: "right",
    fontWeight: FontWeight.semiBold,
    marginBottom: Spacing.sm,
  },
  inputRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    minHeight: 54,
  },
  input: {
    flex: 1,
    fontSize: 16, // ≥16 for readability + prevents iOS auto-zoom on focus
    paddingVertical: Spacing.md,
  },
  errorRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    marginTop: Spacing.md,
  },
  errorText: {
    color: AppColors.error,
    textAlign: "right",
    flex: 1,
  },
  submitBtn: {
    backgroundColor: AppColors.primary,
    borderRadius: BorderRadius.lg,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.xl,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitText: {
    color: AppColors.white,
    fontWeight: FontWeight.bold,
  },
  note: {
    textAlign: "center",
    marginTop: Spacing.lg,
  },
});
