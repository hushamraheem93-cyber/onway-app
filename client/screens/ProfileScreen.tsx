import React, { useState } from "react";
import { StyleSheet, View, Pressable, Switch, Modal, ActivityIndicator } from "react-native";
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
  const { phoneNumber, userProfile, logout, deleteAccount } = useAuth();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const navigation = useNavigation<NavigationProp>();

  const profileImageUrl = userProfile?.profileImage || null;

  const handleLogout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await logout();
  };

  const handleDeleteAccount = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccount();
    } catch (e: any) {
      setDeleteError(e.message || "حدث خطأ، حاول مجدداً");
      setIsDeleting(false);
    }
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

      <Pressable
        testID="button-delete-account"
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setShowDeleteModal(true);
        }}
        style={({ pressed }) => [
          styles.settingsItem,
          styles.deleteItem,
          { opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <View style={[styles.iconContainer, { backgroundColor: "#FEE2E2" }]}>
          <Feather name="trash-2" size={20} color="#EF4444" />
        </View>
        <View style={styles.settingsContent}>
          <ThemedText type="body" style={[styles.settingsTitle, { color: "#EF4444" }]}>
            مسح حسابي
          </ThemedText>
          <ThemedText type="small" style={[styles.settingsSubtitle, { color: "#F87171" }]}>
            حذف الحساب وجميع البيانات نهائياً
          </ThemedText>
        </View>
        <Feather name="chevron-left" size={20} color="#F87171" />
      </Pressable>

      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.backgroundDefault }]}>
            <View style={styles.modalIconWrap}>
              <Feather name="alert-triangle" size={32} color="#EF4444" />
            </View>
            <ThemedText type="h3" style={styles.modalTitle}>
              مسح الحساب
            </ThemedText>
            <ThemedText type="body" style={[styles.modalBody, { color: theme.textSecondary }]}>
              سيتم حذف حسابك وجميع بياناتك الشخصية بشكل نهائي ولا يمكن التراجع عن هذا الإجراء.
            </ThemedText>
            {deleteError ? (
              <ThemedText type="small" style={styles.errorText}>
                {deleteError}
              </ThemedText>
            ) : null}
            <Pressable
              testID="button-confirm-delete"
              onPress={handleDeleteAccount}
              disabled={isDeleting}
              style={({ pressed }) => [
                styles.modalDeleteBtn,
                { opacity: pressed || isDeleting ? 0.7 : 1 },
              ]}
            >
              {isDeleting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <ThemedText type="body" style={styles.modalDeleteBtnText}>
                  نعم، امسح حسابي
                </ThemedText>
              )}
            </Pressable>
            <Pressable
              testID="button-cancel-delete"
              onPress={() => {
                setShowDeleteModal(false);
                setDeleteError(null);
              }}
              disabled={isDeleting}
              style={({ pressed }) => [
                styles.modalCancelBtn,
                { borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <ThemedText type="body" style={{ textAlign: "center" }}>
                إلغاء
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </Modal>

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
  deleteItem: {
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  modalCard: {
    width: "100%",
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: "center",
  },
  modalIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  modalBody: {
    textAlign: "center",
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  errorText: {
    color: "#EF4444",
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  modalDeleteBtn: {
    width: "100%",
    backgroundColor: "#EF4444",
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    alignItems: "center",
    marginBottom: Spacing.sm,
    minHeight: 48,
    justifyContent: "center",
  },
  modalDeleteBtnText: {
    color: "#fff",
    fontFamily: "Cairo_700Bold",
    textAlign: "center",
  },
  modalCancelBtn: {
    width: "100%",
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
});
