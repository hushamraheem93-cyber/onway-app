import React, { useState, useEffect } from "react";
import { StyleSheet, ScrollView, View, Switch, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Shadows, AppColors } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";

const NOTIFICATIONS_KEY = "@onway_notifications";

interface NotificationSettings {
  orderUpdates: boolean;
  offers: boolean;
  newProducts: boolean;
  deliveryAlerts: boolean;
}

interface NotificationSettingProps {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}

function NotificationSetting({ icon, title, subtitle, value, onValueChange }: NotificationSettingProps) {
  const { theme } = useTheme();

  const handleChange = (newValue: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onValueChange(newValue);
  };

  return (
    <View style={[styles.settingItem, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
      <Switch
        value={value}
        onValueChange={handleChange}
        trackColor={{ false: "#ccc", true: AppColors.primary }}
        thumbColor="#fff"
      />
      <View style={styles.settingContent}>
        <ThemedText type="body" style={styles.settingTitle}>{title}</ThemedText>
        <ThemedText type="small" style={[styles.settingSubtitle, { color: theme.textSecondary }]}>
          {subtitle}
        </ThemedText>
      </View>
      <View style={[styles.iconContainer, { backgroundColor: AppColors.primary + "15" }]}>
        <Feather name={icon} size={20} color={AppColors.primary} />
      </View>
    </View>
  );
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();

  const [settings, setSettings] = useState<NotificationSettings>({
    orderUpdates: true,
    offers: true,
    newProducts: false,
    deliveryAlerts: true,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const stored = await AsyncStorage.getItem(NOTIFICATIONS_KEY);
      if (stored) {
        setSettings(JSON.parse(stored));
      }
    } catch (error) {
      console.error("Error loading notification settings:", error);
    }
  };

  const saveSettings = async (newSettings: NotificationSettings) => {
    try {
      await AsyncStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(newSettings));
      setSettings(newSettings);
    } catch (error) {
      console.error("Error saving notification settings:", error);
      Alert.alert("خطأ", "حدث خطأ أثناء حفظ الإعدادات");
    }
  };

  const updateSetting = (key: keyof NotificationSettings, value: boolean) => {
    const newSettings = { ...settings, [key]: value };
    saveSettings(newSettings);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
      showsVerticalScrollIndicator={false}
    >
      <ThemedText type="body" style={[styles.intro, { color: theme.textSecondary }]}>
        قم بتخصيص الإشعارات التي ترغب في استلامها
      </ThemedText>

      <NotificationSetting
        icon="package"
        title="تحديثات الطلبات"
        subtitle="احصل على إشعارات حول حالة طلباتك"
        value={settings.orderUpdates}
        onValueChange={(value) => updateSetting("orderUpdates", value)}
      />

      <NotificationSetting
        icon="percent"
        title="العروض والخصومات"
        subtitle="تنبيهات عن العروض الحصرية"
        value={settings.offers}
        onValueChange={(value) => updateSetting("offers", value)}
      />

      <NotificationSetting
        icon="shopping-bag"
        title="المنتجات الجديدة"
        subtitle="إشعارات عند إضافة منتجات جديدة"
        value={settings.newProducts}
        onValueChange={(value) => updateSetting("newProducts", value)}
      />

      <NotificationSetting
        icon="truck"
        title="تنبيهات التوصيل"
        subtitle="إشعارات عند اقتراب موعد التوصيل"
        value={settings.deliveryAlerts}
        onValueChange={(value) => updateSetting("deliveryAlerts", value)}
      />

      <View style={[styles.infoCard, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
        <Feather name="info" size={20} color={AppColors.primary} />
        <ThemedText type="small" style={[styles.infoText, { color: theme.textSecondary }]}>
          سيتم إرسال الإشعارات المهمة عبر واتساب على رقم هاتفك المسجل
        </ThemedText>
      </View>

      <View style={[styles.savedBadge, { backgroundColor: "#4CAF50" + "15" }]}>
        <Feather name="check-circle" size={16} color="#4CAF50" />
        <ThemedText type="small" style={{ color: "#4CAF50", fontWeight: "600" }}>
          يتم حفظ الإعدادات تلقائياً
        </ThemedText>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  intro: {
    textAlign: "right",
    marginBottom: Spacing.lg,
  },
  settingItem: {
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
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    textAlign: "right",
    fontWeight: "600",
  },
  settingSubtitle: {
    textAlign: "right",
    marginTop: Spacing.xs,
  },
  infoCard: {
    flexDirection: "row-reverse",
    alignItems: "center",
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginTop: Spacing.lg,
    gap: Spacing.md,
  },
  infoText: {
    flex: 1,
    textAlign: "right",
    lineHeight: 20,
  },
  savedBadge: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
});
