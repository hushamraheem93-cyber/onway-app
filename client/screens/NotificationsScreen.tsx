import React from "react";
import { StyleSheet, ScrollView, View, Switch } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Shadows, AppColors } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";

interface NotificationSettingProps {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}

function NotificationSetting({ icon, title, subtitle, value, onValueChange }: NotificationSettingProps) {
  const { theme } = useTheme();

  return (
    <View style={[styles.settingItem, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
      <Switch
        value={value}
        onValueChange={onValueChange}
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

  const [orderUpdates, setOrderUpdates] = React.useState(true);
  const [offers, setOffers] = React.useState(true);
  const [newProducts, setNewProducts] = React.useState(false);
  const [deliveryAlerts, setDeliveryAlerts] = React.useState(true);

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
        value={orderUpdates}
        onValueChange={setOrderUpdates}
      />

      <NotificationSetting
        icon="percent"
        title="العروض والخصومات"
        subtitle="تنبيهات عن العروض الحصرية"
        value={offers}
        onValueChange={setOffers}
      />

      <NotificationSetting
        icon="shopping-bag"
        title="المنتجات الجديدة"
        subtitle="إشعارات عند إضافة منتجات جديدة"
        value={newProducts}
        onValueChange={setNewProducts}
      />

      <NotificationSetting
        icon="truck"
        title="تنبيهات التوصيل"
        subtitle="إشعارات عند اقتراب موعد التوصيل"
        value={deliveryAlerts}
        onValueChange={setDeliveryAlerts}
      />

      <View style={[styles.infoCard, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
        <Feather name="info" size={20} color={AppColors.primary} />
        <ThemedText type="small" style={[styles.infoText, { color: theme.textSecondary }]}>
          سيتم إرسال الإشعارات المهمة عبر واتساب على رقم هاتفك المسجل
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
});
