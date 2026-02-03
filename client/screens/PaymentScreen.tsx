import React from "react";
import { StyleSheet, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Shadows, AppColors } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";

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
        <ThemedText type="h4" style={styles.infoTitle}>قريباً</ThemedText>
        
        <View style={styles.comingSoonItem}>
          <ThemedText type="body" style={[styles.comingSoonText, { color: theme.textSecondary }]}>
            بطاقات الائتمان والخصم
          </ThemedText>
          <View style={[styles.smallIcon, { backgroundColor: AppColors.primary + "15" }]}>
            <Feather name="credit-card" size={16} color={AppColors.primary} />
          </View>
        </View>

        <View style={styles.comingSoonItem}>
          <ThemedText type="body" style={[styles.comingSoonText, { color: theme.textSecondary }]}>
            المحافظ الإلكترونية
          </ThemedText>
          <View style={[styles.smallIcon, { backgroundColor: AppColors.primary + "15" }]}>
            <Feather name="smartphone" size={16} color={AppColors.primary} />
          </View>
        </View>

        <View style={styles.comingSoonItem}>
          <ThemedText type="body" style={[styles.comingSoonText, { color: theme.textSecondary }]}>
            التحويل البنكي
          </ThemedText>
          <View style={[styles.smallIcon, { backgroundColor: AppColors.primary + "15" }]}>
            <Feather name="briefcase" size={16} color={AppColors.primary} />
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
  infoTitle: {
    textAlign: "right",
    marginBottom: Spacing.lg,
  },
  comingSoonItem: {
    flexDirection: "row-reverse",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  smallIcon: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  comingSoonText: {
    flex: 1,
    textAlign: "right",
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
