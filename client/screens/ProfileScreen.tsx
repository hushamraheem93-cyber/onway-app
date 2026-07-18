import React, { useState } from "react";
import { StyleSheet, View, Pressable, Modal, ActivityIndicator } from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";

import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { Spacing, BorderRadius, Shadows, AppColors } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { ProfileStackParamList } from "@/navigation/ProfileStackNavigator";
import { GradientBackground } from "@/components/GradientBackground";

interface SettingsItemProps {
  icon: keyof typeof Feather.glyphMap;
  iconBg?: string;
  iconColor?: string;
  title: string;
  titleColor?: string;
  subtitle?: string;
  onPress?: () => void;
}

function SettingsItem({ icon, iconBg, iconColor, title, titleColor, subtitle, onPress }: SettingsItemProps) {
  const { theme } = useTheme();
  const resolvedIconBg = iconBg ?? AppColors.primary + "15";
  const resolvedIconColor = iconColor ?? AppColors.primary;

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}، ${subtitle}` : title}
      style={({ pressed }) => [
        styles.settingsItem,
        { backgroundColor: theme.backgroundDefault, opacity: pressed ? 0.8 : 1 },
        Shadows.sm,
      ]}
    >
      <View style={[styles.iconContainer, { backgroundColor: resolvedIconBg }]}>
        <Feather name={icon} size={20} color={resolvedIconColor} />
      </View>
      <View style={styles.settingsContent}>
        <ThemedText type="body" style={[styles.settingsTitle, titleColor ? { color: titleColor } : null]}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText type="small" style={[styles.settingsSubtitle, { color: theme.textSecondary }]}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      <Feather name="chevron-left" size={20} color={titleColor ?? theme.textSecondary} />
    </Pressable>
  );
}

type NavigationProp = NativeStackNavigationProp<ProfileStackParamList>;

export default function ProfileScreen() {
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
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

  const renderSectionTitle = (title: string) => (
    <View style={styles.sectionTitleRow}>
      <View style={styles.sectionAccent} />
      <ThemedText type="h4" style={styles.sectionTitle}>{title}</ThemedText>
    </View>
  );

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
        {/* بطاقة الملف الشخصي */}
        <View style={[styles.profileCard, { backgroundColor: theme.backgroundDefault }, Shadows.md]}>
          <Pressable
            style={styles.editButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate("EditProfile");
            }}
            accessibilityRole="button"
            accessibilityLabel="تعديل الملف الشخصي"
          >
            <Feather name="edit-2" size={18} color={AppColors.primary} />
          </Pressable>
          {/* Long-press the avatar to reach the admin panel (still gated by an
              admin username/password login — this is only a discreet entry point). */}
          <Pressable
            onLongPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              (navigation as any).navigate("AdminLogin");
            }}
            delayLongPress={800}
            accessibilityRole="image"
            accessibilityLabel="الصورة الشخصية"
          >
            {profileImageUrl ? (
              <Image
                source={{ uri: profileImageUrl }}
                style={styles.avatarImage}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.avatar, { backgroundColor: AppColors.primary }]}>
                <Feather name="user" size={40} color={AppColors.white} />
              </View>
            )}
          </Pressable>
          <ThemedText type="h2" style={styles.name}>
            {userProfile?.fullName || "مستخدم زائر"}
          </ThemedText>
          <ThemedText type="body" style={[styles.email, { color: theme.textSecondary }]}>
            {phoneNumber || "مرحباً بك في Onway"}
          </ThemedText>
          {userProfile?.region ? (
            <ThemedText type="small" style={[styles.region, { color: theme.textSecondary }]}>
              {userProfile.region}
            </ThemedText>
          ) : null}
        </View>

        {/* قسم: طلباتي */}
        {renderSectionTitle("طلباتي")}
        <SettingsItem
          icon="package"
          title="طلباتي"
          subtitle="متابعة حالة الطلبات"
          onPress={() => navigation.navigate("Orders")}
        />

        {/* قسم: الإعدادات */}
        {renderSectionTitle("الإعدادات")}
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
          icon="globe"
          title="اللغة"
          subtitle="العربية"
        />

        {/* قسم: المساعدة */}
        {renderSectionTitle("المساعدة")}
        <SettingsItem
          icon="message-circle"
          title="تواصل مع الدعم"
          subtitle="تحدث مع فريق الدعم مباشرة"
          onPress={() => (navigation as any).navigate("SupportChat")}
        />
        <SettingsItem
          icon="life-buoy"
          title="مركز المساعدة"
          subtitle="الأسئلة الشائعة، الشروط، الخصوصية"
          onPress={() => navigation.navigate("HelpCenter")}
        />
        <SettingsItem
          icon="info"
          title="حول OnWay"
          subtitle="معلومات التطبيق والتواصل"
          onPress={() => navigation.navigate("About")}
        />

        {/* قسم: الحساب */}
        {renderSectionTitle("الحساب")}
        <SettingsItem
          icon="log-out"
          title="تسجيل الخروج"
          onPress={handleLogout}
        />
        <SettingsItem
          icon="trash-2"
          iconBg={AppColors.errorLight}
          iconColor={AppColors.error}
          title="حذف الحساب"
          titleColor={AppColors.error}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setShowDeleteModal(true);
          }}
        />

        {/* مودال تأكيد الحذف */}
        <Modal
          visible={showDeleteModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowDeleteModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: theme.backgroundDefault }]}>
              <View style={styles.modalIconWrap}>
                <Feather name="alert-triangle" size={32} color={AppColors.error} />
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
                accessibilityRole="button"
                accessibilityLabel="نعم، امسح حسابي"
                accessibilityState={{ disabled: isDeleting, busy: isDeleting }}
                style={({ pressed }) => [
                  styles.modalDeleteBtn,
                  { opacity: pressed || isDeleting ? 0.7 : 1 },
                ]}
              >
                {isDeleting ? (
                  <ActivityIndicator color={AppColors.white} size="small" />
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
                accessibilityRole="button"
                accessibilityLabel="إلغاء"
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: AppColors.primary + "15",
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
    borderColor: AppColors.white,
    shadowColor: AppColors.black,
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
    borderColor: AppColors.white,
    shadowColor: AppColors.black,
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
  },
  // Signature: short rounded brand accent bar at the reading-start (RTL) of every
  // section title — consistent with the Home screen's section rhythm.
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
  },
  sectionAccent: {
    width: 4,
    height: 18,
    borderRadius: 2,
    backgroundColor: AppColors.primary,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: AppColors.overlay,
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
    backgroundColor: AppColors.errorLight,
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
    color: AppColors.error,
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  modalDeleteBtn: {
    width: "100%",
    backgroundColor: AppColors.error,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    alignItems: "center",
    marginBottom: Spacing.sm,
    minHeight: 48,
    justifyContent: "center",
  },
  modalDeleteBtnText: {
    color: AppColors.white,
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
