import React from "react";
import { StyleSheet, View, Pressable, Switch } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";

import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { useThemeMode } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { Spacing, BorderRadius, Shadows, AppColors } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { ProfileStackParamList } from "@/navigation/ProfileStackNavigator";
import { GradientBackground } from "@/components/GradientBackground";

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
  const { theme, isDark } = useTheme();
  const { themeMode, setThemeMode } = useThemeMode();
  const { phoneNumber, userProfile, logout } = useAuth();
  const navigation = useNavigation<NavigationProp>();

  const profileImageUrl = userProfile?.profileImage || null;

  const handleLogout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await logout();
  };

  const handleThemeToggle = (value: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setThemeMode(value ? "dark" : "light");
  };

  return (
    <View style={{ flex: 1 }}>
      <GradientBackground />
    <KeyboardAwareScrollViewCompat
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: tabBarHeight,
        paddingHorizontal: Spacing.lg,
      }}
    >
      <View style={[styles.profileCard, { backgroundColor: theme.backgroundDefault }, Shadows.md]}>
        <Pressable 
          style={styles.editButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.navigate("EditProfile");
          }}
        >
          <Feather name="edit-2" size={18} color={AppColors.primary} />
        </Pressable>
        {profileImageUrl ? (
          <Image
            source={{ uri: profileImageUrl }}
            style={styles.avatarImage}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.avatar, { backgroundColor: AppColors.primary }]}>
            <Feather name="user" size={40} color="#FFFFFF" />
          </View>
        )}
        <ThemedText type="h2" style={styles.name}>
          {userProfile?.fullName || "مستخدم زائر"}
        </ThemedText>
        <ThemedText type="body" style={[styles.email, { color: theme.textSecondary }]}>
          {phoneNumber || "مرحباً بك في Onway"}
        </ThemedText>
        {userProfile?.region ? (
          <ThemedText type="small" style={[styles.region, { color: theme.textSecondary }]}>
            📍 {userProfile.region}
          </ThemedText>
        ) : null}
      </View>

      <ThemedText type="h4" style={styles.sectionTitle}>
        طلباتي
      </ThemedText>

      <SettingsItem
        icon="package"
        title="طلباتي"
        subtitle="متابعة حالة الطلبات"
        onPress={() => navigation.navigate("Orders")}
      />

      <ThemedText type="h4" style={styles.sectionTitle}>
        الإعدادات
      </ThemedText>

      <SettingsItem
        icon="bell"
        title="الإشعارات"
        subtitle="إدارة إشعارات التطبيق"
        onPress={() => navigation.navigate("Notifications")}
      />
      <SettingsItem
        icon="map-pin"
        title="العناوين المحفوظة"
        subtitle="إدارة عناوين التوصيل"
        onPress={() => navigation.navigate("Addresses")}
      />
      <SettingsItem
        icon="credit-card"
        title="طرق الدفع"
        subtitle="إدارة بطاقات الدفع"
        onPress={() => navigation.navigate("Payment")}
      />
      <View style={[styles.settingsItem, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
        <View style={[styles.iconContainer, { backgroundColor: AppColors.primary + "15" }]}>
          <Feather name={isDark ? "moon" : "sun"} size={20} color={AppColors.primary} />
        </View>
        <View style={styles.settingsContent}>
          <ThemedText type="body" style={styles.settingsTitle}>
            الوضع الليلي
          </ThemedText>
          <ThemedText type="small" style={[styles.settingsSubtitle, { color: theme.textSecondary }]}>
            {isDark ? "مفعّل" : "غير مفعّل"}
          </ThemedText>
        </View>
        <Switch
          value={isDark}
          onValueChange={handleThemeToggle}
          trackColor={{ false: "#ccc", true: AppColors.primary }}
          thumbColor="#fff"
        />
      </View>
      <SettingsItem
        icon="globe"
        title="اللغة"
        subtitle="العربية"
      />

      <ThemedText type="h4" style={styles.sectionTitle}>
        المساعدة
      </ThemedText>

      <SettingsItem
        icon="message-circle"
        title="تواصل مع الدعم"
        subtitle="تحدث مع فريق الدعم مباشرة"
        onPress={() => (navigation as any).navigate("SupportChat")}
      />
      <SettingsItem
        icon="help-circle"
        title="الأسئلة الشائعة"
        onPress={() => navigation.navigate("FAQ")}
      />
      <SettingsItem
        icon="message-circle"
        title="من نحن"
        subtitle="تعرف علينا وتواصل معنا"
        onPress={() => navigation.navigate("About")}
      />
      <SettingsItem
        icon="file-text"
        title="الشروط والأحكام"
        onPress={() => navigation.navigate("Terms")}
      />
      <SettingsItem
        icon="shield"
        title="سياسة الخصوصية"
        onPress={() => navigation.navigate("Policy")}
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
    </View>
  );
}

const styles = StyleSheet.create({
  profileCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: "center",
    marginBottom: Spacing.xl,
    position: "relative",
  },
  editButton: {
    position: "absolute",
    top: Spacing.md,
    left: Spacing.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 122, 0, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    overflow: "hidden",
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: Spacing.lg,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    overflow: "hidden",
  },
  name: {
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  email: {
    textAlign: "center",
  },
  region: {
    textAlign: "center",
    marginTop: Spacing.xs,
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
