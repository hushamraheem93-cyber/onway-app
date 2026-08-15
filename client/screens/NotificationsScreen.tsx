import React, { useState, useEffect, useRef, useCallback } from "react";
import { StyleSheet, ScrollView, View, Switch, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import {
  Spacing,
  BorderRadius,
  Shadows,
  AppColors,
  FontWeight,
} from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { GradientBackground } from "@/components/GradientBackground";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import {
  DEFAULT_NOTIFICATION_PREFS,
  NOTIFICATION_PREFS_KEY,
  NotificationPrefs,
  PREFS_STATE_TEXT,
  PrefsSyncState,
  fetchNotificationPrefs,
  normalizeNotificationPrefs,
  saveNotificationPrefs,
} from "@/lib/notificationPrefs";

type NotificationSettings = NotificationPrefs;

/** Icon and colour per sync state — only a confirmed save shows the success tick. */
const SYNC_BADGE: Record<
  PrefsSyncState,
  { icon: keyof typeof Feather.glyphMap; color: string }
> = {
  loading: { icon: "loader", color: AppColors.gray500 },
  synced: { icon: "check-circle", color: AppColors.success },
  saving: { icon: "upload-cloud", color: AppColors.gray500 },
  saved: { icon: "check-circle", color: AppColors.success },
  error: { icon: "alert-triangle", color: AppColors.error },
  anonymous: { icon: "user-x", color: AppColors.gray500 },
};

interface NotificationSettingProps {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (value: boolean) => void;
}

function NotificationSetting({
  icon,
  title,
  subtitle,
  value,
  disabled,
  onValueChange,
}: NotificationSettingProps) {
  const { theme } = useTheme();

  const handleChange = (newValue: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onValueChange(newValue);
  };

  return (
    <View
      style={[
        styles.settingItem,
        { backgroundColor: theme.backgroundDefault },
        Shadows.sm,
      ]}
    >
      <Switch
        value={value}
        onValueChange={handleChange}
        disabled={disabled}
        trackColor={{ false: AppColors.gray300, true: AppColors.primary }}
        thumbColor={AppColors.white}
        accessibilityLabel={title}
        accessibilityHint={subtitle}
      />
      <View style={styles.settingContent}>
        <ThemedText type="body" style={styles.settingTitle}>
          {title}
        </ThemedText>
        <ThemedText
          type="small"
          style={[styles.settingSubtitle, { color: theme.textSecondary }]}
        >
          {subtitle}
        </ThemedText>
      </View>
      <View
        style={[
          styles.iconContainer,
          { backgroundColor: AppColors.primary + "15" },
        ]}
      >
        <Feather name={icon} size={20} color={AppColors.primary} />
      </View>
    </View>
  );
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();

  const { customerToken, isGuest } = useAuth();
  // Without a customer JWT the endpoints answer 401, so there is no honest way to
  // record a choice — the screen says so instead of pretending to save one.
  const canSync = !!customerToken && !isGuest;

  const [settings, setSettings] = useState<NotificationSettings>(
    DEFAULT_NOTIFICATION_PREFS,
  );
  const [syncState, setSyncState] = useState<PrefsSyncState>("loading");

  // The last state the SERVER confirmed. A failed save reverts to this, so the
  // switch can never rest in a position the server did not agree to.
  const confirmedRef = useRef<NotificationSettings>(DEFAULT_NOTIFICATION_PREFS);
  // Toggling several switches quickly fires overlapping PUTs, and responses can
  // arrive out of order. Only the newest request may touch state; older ones —
  // success or failure — are ignored rather than overwriting a fresher choice.
  const requestSeqRef = useRef(0);

  const transport = useCallback(
    () => ({ fetchImpl: fetch, baseUrl: getApiUrl(), token: customerToken }),
    [customerToken],
  );

  const cachePrefs = useCallback(async (prefs: NotificationSettings) => {
    // A display cache only, so the switches paint immediately on the next visit.
    // It is never the source of truth and never counts as "saved".
    try {
      await AsyncStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(prefs));
    } catch {}
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const cached = await AsyncStorage.getItem(NOTIFICATION_PREFS_KEY);
        if (cached && !cancelled) {
          setSettings(normalizeNotificationPrefs(JSON.parse(cached)));
        }
      } catch {}

      if (!canSync) {
        if (!cancelled) setSyncState("anonymous");
        return;
      }

      if (!cancelled) setSyncState("loading");
      try {
        const { preferences } = await fetchNotificationPrefs(transport());
        if (cancelled) return;
        confirmedRef.current = preferences;
        setSettings(preferences);
        setSyncState("synced");
        cachePrefs(preferences);
      } catch {
        if (!cancelled) setSyncState("error");
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [canSync, transport, cachePrefs]);

  const updateSetting = async (
    key: keyof NotificationSettings,
    value: boolean,
  ) => {
    if (!canSync) {
      // Do not move the switch: nothing would record it.
      Alert.alert(
        "تسجيل الدخول مطلوب",
        "لحفظ تفضيلات الإشعارات تحتاج إلى حساب داخل التطبيق.",
      );
      return;
    }

    const previous = confirmedRef.current;
    const next = { ...settings, [key]: value };
    const seq = ++requestSeqRef.current;

    setSettings(next);
    setSyncState("saving");

    try {
      const stored = await saveNotificationPrefs(transport(), next);
      if (seq !== requestSeqRef.current) return; // a newer change supersedes this
      confirmedRef.current = stored;
      setSettings(stored);
      setSyncState("saved");
      cachePrefs(stored);
    } catch {
      if (seq !== requestSeqRef.current) return;
      setSettings(previous);
      setSyncState("error");
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <GradientBackground />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.lg,
          paddingBottom: insets.bottom + Spacing.xl,
          paddingHorizontal: Spacing.lg,
        }}
        showsVerticalScrollIndicator={false}
      >
        <ThemedText
          type="body"
          style={[styles.intro, { color: theme.textSecondary }]}
        >
          قم بتخصيص الإشعارات التي ترغب في استلامها
        </ThemedText>

        <NotificationSetting
          icon="package"
          title="تحديثات الطلبات"
          subtitle="احصل على إشعارات حول حالة طلباتك"
          value={settings.orderUpdates}
          disabled={!canSync}
          onValueChange={(value) => updateSetting("orderUpdates", value)}
        />

        <NotificationSetting
          icon="percent"
          title="العروض والخصومات"
          subtitle="تنبيهات عن العروض الحصرية"
          value={settings.offers}
          disabled={!canSync}
          onValueChange={(value) => updateSetting("offers", value)}
        />

        <NotificationSetting
          icon="shopping-bag"
          title="المنتجات الجديدة"
          subtitle="إشعارات عند إضافة منتجات جديدة"
          value={settings.newProducts}
          disabled={!canSync}
          onValueChange={(value) => updateSetting("newProducts", value)}
        />

        <NotificationSetting
          icon="truck"
          title="تنبيهات التوصيل"
          subtitle="إشعارات عند اقتراب موعد التوصيل"
          value={settings.deliveryAlerts}
          disabled={!canSync}
          onValueChange={(value) => updateSetting("deliveryAlerts", value)}
        />

        <View
          style={[
            styles.infoCard,
            { backgroundColor: theme.backgroundDefault },
            Shadows.sm,
          ]}
        >
          <Feather name="info" size={20} color={AppColors.primary} />
          <ThemedText
            type="small"
            style={[styles.infoText, { color: theme.textSecondary }]}
          >
            سيتم إرسال الإشعارات المهمة عبر واتساب على رقم هاتفك المسجل
          </ThemedText>
        </View>

        {/* The badge reports what actually happened. It used to read "يتم حفظ
            الإعدادات تلقائياً" at all times, including when nothing had been sent
            anywhere — the false confirmation at the centre of H-57. */}
        <View
          style={[
            styles.savedBadge,
            { backgroundColor: SYNC_BADGE[syncState].color + "15" },
          ]}
        >
          <Feather
            name={SYNC_BADGE[syncState].icon}
            size={16}
            color={SYNC_BADGE[syncState].color}
          />
          <ThemedText
            type="small"
            style={{
              color: SYNC_BADGE[syncState].color,
              fontWeight: FontWeight.semiBold,
              flexShrink: 1,
              textAlign: "center",
            }}
          >
            {PREFS_STATE_TEXT[syncState]}
          </ThemedText>
        </View>
      </ScrollView>
    </View>
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
    fontWeight: FontWeight.semiBold,
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
