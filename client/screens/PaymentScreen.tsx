import React from "react";
import { StyleSheet, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import Svg, { Path, Rect, Circle } from "react-native-svg";
import { Image } from "expo-image";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Shadows, AppColors } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { GradientBackground } from "@/components/GradientBackground";

const ZainCashLogo = require("../../assets/images/zaincash-logo.png");

function MastercardIcon({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 0.6} viewBox="0 0 60 36">
      <Rect width="60" height="36" rx="4" fill="#1A1F71" />
      <Circle cx="22" cy="18" r="11" fill="#EB001B" />
      <Circle cx="38" cy="18" r="11" fill={AppColors.warning} />
      <Path
        d="M30 9.5c2.5 2 4 5.1 4 8.5s-1.5 6.5-4 8.5c-2.5-2-4-5.1-4-8.5s1.5-6.5 4-8.5z"
        fill="#FF5F00"
      />
    </Svg>
  );
}

export default function PaymentScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();

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
      <View style={[styles.card, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
        <View style={[styles.iconContainer, { backgroundColor: AppColors.whatsapp + "20" }]}>
          <Feather name="dollar-sign" size={32} color={AppColors.whatsapp} />
        </View>
        <ThemedText type="h3" style={styles.title}>الدفع عند الاستلام</ThemedText>
        <ThemedText type="body" style={[styles.description, { color: theme.textSecondary }]}>
          نحن نقبل الدفع نقداً عند استلام طلبك. سيقوم مندوب التوصيل بتحصيل المبلغ عند الوصول.
        </ThemedText>
        <View style={styles.badge}>
          <ThemedText type="small" style={styles.badgeText}>الطريقة الحالية</ThemedText>
        </View>
      </View>

      <View style={[styles.infoCard, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
        <View style={styles.headerRow}>
          <ThemedText type="h4" style={styles.infoTitle}>قريباً</ThemedText>
          <View style={styles.comingSoonBadge}>
            <ThemedText type="small" style={styles.comingSoonBadgeText}>Coming Soon</ThemedText>
          </View>
        </View>
        
        <View style={styles.paymentMethod}>
          <View style={styles.paymentMethodContent}>
            <View style={styles.logoContainer}>
              <MastercardIcon size={50} />
            </View>
            <View style={styles.paymentInfo}>
              <ThemedText type="body" style={styles.paymentTitle}>ماستركارد</ThemedText>
              <ThemedText type="small" style={[styles.paymentDesc, { color: theme.textSecondary }]}>
                الدفع ببطاقة ماستركارد
              </ThemedText>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: AppColors.primary + "15" }]}>
            <ThemedText type="small" style={[styles.statusText, { color: AppColors.primary }]}>قريباً</ThemedText>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.paymentMethod}>
          <View style={styles.paymentMethodContent}>
            <View style={styles.logoContainer}>
              <Image 
                source={ZainCashLogo} 
                style={styles.zainLogo}
                contentFit="contain"
              />
            </View>
            <View style={styles.paymentInfo}>
              <ThemedText type="body" style={styles.paymentTitle}>زين كاش</ThemedText>
              <ThemedText type="small" style={[styles.paymentDesc, { color: theme.textSecondary }]}>
                الدفع عبر محفظة زين كاش
              </ThemedText>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: AppColors.vendorPurple + "15" }]}>
            <ThemedText type="small" style={[styles.statusText, { color: AppColors.vendorPurple }]}>قريباً</ThemedText>
          </View>
        </View>
      </View>

      <View style={[styles.noteCard, { backgroundColor: AppColors.primary + "10" }]}>
        <Feather name="info" size={20} color={AppColors.primary} />
        <ThemedText type="small" style={[styles.noteText, { color: AppColors.primary }]}>
          نعمل على إضافة طرق دفع إلكترونية متعددة لتسهيل تجربة التسوق. ترقبوا التحديثات القادمة!
        </ThemedText>
      </View>
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  title: {
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  description: {
    textAlign: "center",
    lineHeight: 24,
  },
  badge: {
    backgroundColor: AppColors.whatsapp,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.lg,
  },
  badgeText: {
    color: AppColors.white,
    fontWeight: "600",
  },
  infoCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  headerRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
  },
  infoTitle: {
    textAlign: "right",
  },
  comingSoonBadge: {
    backgroundColor: AppColors.warning,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  comingSoonBadgeText: {
    color: AppColors.black,
    fontWeight: "700",
    fontSize: 10,
  },
  paymentMethod: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
  },
  paymentMethodContent: {
    flexDirection: "row-reverse",
    alignItems: "center",
    flex: 1,
    gap: Spacing.md,
  },
  logoContainer: {
    width: 56,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
  },
  zainLogo: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  paymentInfo: {
    flex: 1,
    alignItems: "flex-end",
  },
  paymentTitle: {
    fontWeight: "700",
    textAlign: "right",
    marginBottom: 2,
  },
  paymentDesc: {
    textAlign: "right",
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  statusText: {
    fontWeight: "600",
    fontSize: 11,
  },
  divider: {
    height: 1,
    backgroundColor: AppColors.divider,
    marginVertical: Spacing.xs,
  },
  noteCard: {
    flexDirection: "row-reverse",
    alignItems: "center",
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  noteText: {
    flex: 1,
    textAlign: "right",
    lineHeight: 20,
  },
});
