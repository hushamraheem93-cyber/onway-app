import React from "react";
import { StyleSheet, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import Svg, { Path, Rect, Circle } from "react-native-svg";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Shadows, AppColors } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";

function MastercardIcon({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 0.6} viewBox="0 0 60 36">
      <Rect width="60" height="36" rx="4" fill="#1A1F71" />
      <Circle cx="22" cy="18" r="11" fill="#EB001B" />
      <Circle cx="38" cy="18" r="11" fill="#F79E1B" />
      <Path
        d="M30 9.5c2.5 2 4 5.1 4 8.5s-1.5 6.5-4 8.5c-2.5-2-4-5.1-4-8.5s1.5-6.5 4-8.5z"
        fill="#FF5F00"
      />
    </Svg>
  );
}

function ZainCashIcon({ size = 50 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 0.65} viewBox="0 0 70 45">
      <Rect width="70" height="45" rx="6" fill="#662D91" />
      <Circle cx="55" cy="10" r="18" fill="#7B3FA0" opacity="0.5" />
      <Circle cx="10" cy="38" r="12" fill="#552380" opacity="0.5" />
      <Circle cx="12" cy="14" r="4" fill="#FFFFFF" />
      <Path d="M20 10 L20 22 L24 22 L24 15 L30 22 L35 22 L35 10 L31 10 L31 17 L25 10 Z" fill="#FFFFFF" />
      <Rect x="8" y="28" width="28" height="11" rx="3" fill="#00A651" />
      <Path d="M12 36.5 L12 31 L15.5 31 L15.5 32.3 L13.5 32.3 L13.5 33 L15 33 L15 34.2 L13.5 34.2 L13.5 36.5 Z" fill="#FFFFFF" />
      <Path d="M18 36.5 L18 31 L20.5 31 L22 33 L23.5 31 L26 31 L26 36.5 L24.3 36.5 L24.3 33.5 L22 36.5 L20.3 33.5 L20.3 36.5 Z" fill="#FFFFFF" />
      <Circle cx="30" cy="33.5" r="3" fill="#FFFFFF" />
      <Circle cx="30" cy="33.5" r="1.5" fill="#00A651" />
    </Svg>
  );
}

export default function PaymentScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();

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
      <View style={[styles.card, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
        <View style={[styles.iconContainer, { backgroundColor: "#25D366" + "20" }]}>
          <Feather name="dollar-sign" size={32} color="#25D366" />
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
              <ZainCashIcon size={50} />
            </View>
            <View style={styles.paymentInfo}>
              <ThemedText type="body" style={styles.paymentTitle}>زين كاش</ThemedText>
              <ThemedText type="small" style={[styles.paymentDesc, { color: theme.textSecondary }]}>
                الدفع عبر محفظة زين كاش
              </ThemedText>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: "#662D91" + "15" }]}>
            <ThemedText type="small" style={[styles.statusText, { color: "#662D91" }]}>قريباً</ThemedText>
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
    backgroundColor: "#25D366",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.lg,
  },
  badgeText: {
    color: "#fff",
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
    backgroundColor: "#FFB800",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  comingSoonBadgeText: {
    color: "#000",
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
    backgroundColor: "#E5E5E5",
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
