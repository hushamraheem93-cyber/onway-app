import React from "react";
import { StyleSheet, View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { Spacing, BorderRadius, Shadows, AppColors } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { ProfileStackParamList } from "@/navigation/ProfileStackNavigator";

interface SettingsItemProps {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle?: string;
  onPress?: () => void;
}

function SettingsItem({ icon, title, subtitle, onPress }: SettingsItemProps) {
  const { theme } = useTheme();

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.();
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.settingsItem,
        { backgroundColor: theme.backgroundDefault, opacity: pressed ? 0.8 : 1 },
        Shadows.sm,
      ]}
    >
      <View style={[styles.iconContainer, { backgroundColor: AppColors.primary + "15" }]}>
        <Feather name={icon} size={20} color={AppColors.primary} />
      </View>
      <View style={styles.settingsContent}>
        <ThemedText type="body" style={styles.settingsTitle}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText type="small" style={[styles.settingsSubtitle, { color: theme.textSecondary }]}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      <Feather name="chevron-left" size={20} color={theme.textSecondary} />
    </Pressable>
  );
}

type NavigationProp = NativeStackNavigationProp<ProfileStackParamList>;

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const { phoneNumber, logout } = useAuth();
  const navigation = useNavigation<NavigationProp>();

  const handleLogout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await logout();
  };

  return (
    <KeyboardAwareScrollViewCompat
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: tabBarHeight + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
    >
      <View style={[styles.profileCard, { backgroundColor: theme.backgroundDefault }, Shadows.md]}>
        <View style={[styles.avatar, { backgroundColor: AppColors.primary }]}>
          <Feather name="user" size={40} color="#FFFFFF" />
        </View>
        <ThemedText type="h2" style={styles.name}>
          {phoneNumber || "مستخدم زائر"}
        </ThemedText>
        <ThemedText type="body" style={[styles.email, { color: theme.textSecondary }]}>
          مرحباً بك في Onway
        </ThemedText>
      </View>

      <ThemedText type="h4" style={styles.sectionTitle}>
        الإعدادات
      </ThemedText>

      <SettingsItem
        icon="settings"
        title="لوحة التحكم"
        subtitle="إدارة البانرات والأقسام"
        onPress={() => navigation.navigate("Admin")}
      />
      <SettingsItem
        icon="bell"
        title="الإشعارات"
        subtitle="إدارة إشعارات التطبيق"
      />
      <SettingsItem
        icon="map-pin"
        title="العناوين المحفوظة"
        subtitle="إدارة عناوين التوصيل"
      />
      <SettingsItem
        icon="credit-card"
        title="طرق الدفع"
        subtitle="إدارة بطاقات الدفع"
      />
      <SettingsItem
        icon="globe"
        title="اللغة"
        subtitle="العربية"
      />

      <ThemedText type="h4" style={styles.sectionTitle}>
        المساعدة
      </ThemedText>

      <SettingsItem
        icon="help-circle"
        title="الأسئلة الشائعة"
      />
      <SettingsItem
        icon="message-circle"
        title="تواصل معنا"
      />
      <SettingsItem
        icon="file-text"
        title="الشروط والأحكام"
      />
      <SettingsItem
        icon="shield"
        title="سياسة الخصوصية"
      />

      <SettingsItem
        icon="log-out"
        title="تسجيل الخروج"
        onPress={handleLogout}
      />

      <View style={styles.versionContainer}>
        <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: "center" }}>
          الإصدار 1.0.0
        </ThemedText>
      </View>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  profileCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  name: {
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  email: {
    textAlign: "center",
  },
  sectionTitle: {
    textAlign: "right",
    marginBottom: Spacing.md,
    marginTop: Spacing.lg,
  },
  settingsItem: {
    flexDirection: "row-reverse",
    alignItems: "center",
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: Spacing.md,
  },
  settingsContent: {
    flex: 1,
  },
  settingsTitle: {
    textAlign: "right",
  },
  settingsSubtitle: {
    textAlign: "right",
    marginTop: Spacing.xs,
  },
  versionContainer: {
    marginTop: Spacing.xl,
    paddingVertical: Spacing.lg,
  },
});
