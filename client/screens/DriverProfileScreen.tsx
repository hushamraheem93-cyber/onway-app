import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  Pressable,
  Switch,
  ActivityIndicator,
  Linking,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { GradientBackground } from "@/components/GradientBackground";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { useThemeMode } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { AppColors, Spacing, BorderRadius, Shadows, FontWeight} from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

type NavProp = NativeStackNavigationProp<RootStackParamList>;

interface DriverInfo {
  fullName: string;
  phoneNumber: string;
  status: string;
  firstName: string;
  secondName: string;
  thirdName: string;
  fourthName: string;
}

export default function DriverProfileScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme, isDark } = useTheme();
  const { themeMode, setThemeMode } = useThemeMode();
  const { phoneNumber, logout } = useAuth();
  const navigation = useNavigation<NavProp>();

  const [driverInfo, setDriverInfo] = useState<DriverInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDriver = async () => {
      if (!phoneNumber) return;
      try {
        const res = await fetch(
          new URL(`/api/driver/profile?phoneNumber=${encodeURIComponent(phoneNumber)}`, getApiUrl()).toString()
        );
        if (res.ok) {
          const data = await res.json();
          setDriverInfo(data);
        }
      } catch (e) {
      } finally {
        setLoading(false);
      }
    };
    fetchDriver();
  }, [phoneNumber]);

  const handleLogout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await logout();
  };

  const handleThemeToggle = (value: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setThemeMode(value ? "dark" : "light");
  };

  const handleWhatsApp = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL("https://wa.me/9647700000000").catch(() =>
      Alert.alert("خطأ", "تعذّر فتح واتساب")
    );
  };

  const handleSupportChat = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    (navigation as any).navigate("SupportChat");
  };

  const statusLabels: Record<string, { label: string; color: string }> = {
    pending: { label: "قيد المراجعة", color: AppColors.warning },
    approved: { label: "معتمد", color: AppColors.success },
    rejected: { label: "مرفوض", color: AppColors.error },
  };

  const statusInfo = statusLabels[driverInfo?.status || "pending"] || statusLabels.pending;

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot, justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={AppColors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container]}>
      <GradientBackground />
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md, backgroundColor: AppColors.primary }]}>
        <View style={styles.avatarCircle}>
          <Feather name="user" size={36} color={AppColors.primary} />
        </View>
        <ThemedText type="h3" style={styles.driverName}>
          {driverInfo?.fullName || "سائق"}
        </ThemedText>
        <ThemedText type="small" style={styles.driverPhone}>{phoneNumber}</ThemedText>
        <View style={[styles.statusPill, { backgroundColor: statusInfo.color + "30" }]}>
          <ThemedText type="small" style={{ color: statusInfo.color, fontWeight: FontWeight.bold }}>
            {statusInfo.label}
          </ThemedText>
        </View>
      </View>

      <KeyboardAwareScrollViewCompat
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: Spacing.lg,
          paddingBottom: tabBarHeight + Spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
          <View style={styles.settingRow}>
            <Switch
              value={themeMode === "dark"}
              onValueChange={handleThemeToggle}
              trackColor={{ false: AppColors.border, true: AppColors.primary }}
              thumbColor={AppColors.white}
            />
            <View style={styles.settingInfo}>
              <ThemedText type="body" style={{ color: theme.text }}>الوضع الداكن</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>تغيير مظهر التطبيق</ThemedText>
            </View>
            <View style={[styles.settingIcon, { backgroundColor: "#9C27B015" }]}>
              <Feather name="moon" size={20} color={AppColors.vendorPurple} />
            </View>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
          <ThemedText type="h4" style={[styles.cardTitle, { color: theme.text }]}>معلومات السائق</ThemedText>
          <View style={styles.infoRow}>
            <ThemedText type="body" style={{ color: theme.text }}>{driverInfo?.firstName || "-"}</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>الاسم الأول</ThemedText>
          </View>
          <View style={styles.infoRow}>
            <ThemedText type="body" style={{ color: theme.text }}>{driverInfo?.secondName || "-"}</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>اسم الأب</ThemedText>
          </View>
          <View style={styles.infoRow}>
            <ThemedText type="body" style={{ color: theme.text }}>{driverInfo?.thirdName || "-"}</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>اسم الجد</ThemedText>
          </View>
          <View style={styles.infoRow}>
            <ThemedText type="body" style={{ color: theme.text }}>{driverInfo?.fourthName || "-"}</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>اللقب</ThemedText>
          </View>
        </View>

        {/* معلومات الحساب */}
        <View style={[styles.card, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
          <ThemedText type="h4" style={[styles.cardTitle, { color: theme.text }]}>معلومات الحساب</ThemedText>
          <View style={styles.menuRow}>
            <View style={[styles.menuIcon, { backgroundColor: AppColors.driverBlueLight }]}>
              <Feather name="phone" size={18} color={AppColors.info} />
            </View>
            <View style={{ flex: 1, alignItems: "flex-end" }}>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>رقم الهاتف</ThemedText>
              <ThemedText type="body" style={{ color: theme.text }}>{phoneNumber || "—"}</ThemedText>
            </View>
          </View>
          <View style={[styles.menuRow, { borderBottomWidth: 0 }]}>
            <View style={[styles.menuIcon, { backgroundColor: statusInfo.color + "18" }]}>
              <Feather name="shield" size={18} color={statusInfo.color} />
            </View>
            <View style={{ flex: 1, alignItems: "flex-end" }}>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>حالة الحساب</ThemedText>
              <ThemedText type="body" style={{ color: statusInfo.color, fontWeight: FontWeight.bold }}>{statusInfo.label}</ThemedText>
            </View>
          </View>
        </View>

        {/* الدعم الفني */}
        <View style={[styles.card, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
          <ThemedText type="h4" style={[styles.cardTitle, { color: theme.text }]}>الدعم الفني</ThemedText>
          <Pressable style={styles.menuRow} onPress={handleSupportChat} testID="button-support-chat">
            <Feather name="chevron-left" size={18} color={theme.textSecondary} />
            <View style={{ flex: 1, alignItems: "flex-end" }}>
              <ThemedText type="body" style={{ color: theme.text }}>الدردشة مع الدعم</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>تحدث مع فريق أون وي</ThemedText>
            </View>
            <View style={[styles.menuIcon, { backgroundColor: AppColors.primary + "15" }]}>
              <Feather name="message-circle" size={18} color={AppColors.primary} />
            </View>
          </Pressable>
          <Pressable style={[styles.menuRow, { borderBottomWidth: 0 }]} onPress={handleWhatsApp} testID="button-support-whatsapp">
            <Feather name="chevron-left" size={18} color={theme.textSecondary} />
            <View style={{ flex: 1, alignItems: "flex-end" }}>
              <ThemedText type="body" style={{ color: theme.text }}>واتساب</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>تواصل معنا عبر واتساب</ThemedText>
            </View>
            <View style={[styles.menuIcon, { backgroundColor: AppColors.successLight }]}>
              <Feather name="message-square" size={18} color={AppColors.whatsapp} />
            </View>
          </Pressable>
        </View>

        <Pressable
          style={[styles.logoutButton, { borderColor: AppColors.error }]}
          onPress={handleLogout}
          testID="button-logout"
        >
          <Feather name="log-out" size={20} color={AppColors.error} />
          <ThemedText type="h4" style={{ color: AppColors.error }}>تسجيل الخروج</ThemedText>
        </Pressable>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
    alignItems: "center",
  },
  avatarCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: AppColors.white,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  driverName: {
    color: AppColors.white,
    fontWeight: FontWeight.bold,
  },
  driverPhone: {
    color: AppColors.textOnBrandMuted,
    marginTop: 2,
  },
  statusPill: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: 20,
    marginTop: Spacing.sm,
  },
  card: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  cardTitle: {
    textAlign: "right",
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.md,
  },
  settingRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.md,
  },
  settingInfo: {
    flex: 1,
    alignItems: "flex-end",
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  infoRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: AppColors.border,
  },
  logoutButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    marginTop: Spacing.md,
  },
  menuRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: AppColors.border,
  },
  menuIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
  },
});
