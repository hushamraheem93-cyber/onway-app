import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  Pressable,
  Switch,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { useThemeMode } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { AppColors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";

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
        console.error("Error fetching driver profile:", e);
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

  const statusLabels: Record<string, { label: string; color: string }> = {
    pending: { label: "قيد المراجعة", color: "#FF9800" },
    approved: { label: "معتمد", color: "#4CAF50" },
    rejected: { label: "مرفوض", color: "#F44336" },
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
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md, backgroundColor: AppColors.primary }]}>
        <View style={styles.avatarCircle}>
          <Feather name="user" size={36} color={AppColors.primary} />
        </View>
        <ThemedText type="h3" style={styles.driverName}>
          {driverInfo?.fullName || "سائق"}
        </ThemedText>
        <ThemedText type="small" style={styles.driverPhone}>{phoneNumber}</ThemedText>
        <View style={[styles.statusPill, { backgroundColor: statusInfo.color + "30" }]}>
          <ThemedText type="small" style={{ color: statusInfo.color, fontWeight: "700" }}>
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
              trackColor={{ false: "#E0E0E0", true: AppColors.primary }}
              thumbColor="#FFFFFF"
            />
            <View style={styles.settingInfo}>
              <ThemedText type="body" style={{ color: theme.text }}>الوضع الداكن</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>تغيير مظهر التطبيق</ThemedText>
            </View>
            <View style={[styles.settingIcon, { backgroundColor: "#9C27B015" }]}>
              <Feather name="moon" size={20} color="#9C27B0" />
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

        <Pressable
          style={[styles.logoutButton, { borderColor: "#F44336" }]}
          onPress={handleLogout}
          testID="button-logout"
        >
          <Feather name="log-out" size={20} color="#F44336" />
          <ThemedText type="h4" style={{ color: "#F44336" }}>تسجيل الخروج</ThemedText>
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
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  driverName: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  driverPhone: {
    color: "rgba(255,255,255,0.8)",
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
    fontWeight: "700",
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
    borderBottomColor: "#E0E0E0",
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
});
