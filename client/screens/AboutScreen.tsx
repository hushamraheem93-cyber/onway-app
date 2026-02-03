import React from "react";
import { StyleSheet, ScrollView, View, Pressable, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Shadows, AppColors } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";

export default function AboutScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();

  const handleWhatsApp = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL("https://wa.me/9647702891104");
  };

  const handleCall = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL("tel:+9647702891104");
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
      <View style={[styles.logoCard, { backgroundColor: AppColors.primary }, Shadows.md]}>
        <ThemedText type="h1" style={styles.logoText}>OnWay</ThemedText>
        <ThemedText type="body" style={styles.logoSubtext}>اون وي</ThemedText>
      </View>

      <View style={[styles.card, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
        <ThemedText type="h3" style={styles.title}>من نحن</ThemedText>
        
        <ThemedText type="body" style={styles.paragraph}>
          OnWay هو تطبيق توصيل وتسوق محلي يهدف إلى تسهيل حياتك اليومية. نوفر لك تجربة تسوق سلسة وسريعة من خلال توصيل جميع احتياجاتك إلى باب منزلك.
        </ThemedText>

        <ThemedText type="body" style={styles.paragraph}>
          نحن نؤمن بأن الجودة والسرعة هما أساس خدمتنا. فريقنا المتفاني يعمل على مدار الساعة لضمان وصول طلباتك في أفضل حالة وفي أسرع وقت ممكن.
        </ThemedText>

        <ThemedText type="h4" style={styles.sectionTitle}>رؤيتنا</ThemedText>
        <ThemedText type="body" style={styles.paragraph}>
          أن نكون الخيار الأول للتسوق والتوصيل في العراق، مع الحفاظ على أعلى معايير الجودة والخدمة.
        </ThemedText>

        <ThemedText type="h4" style={styles.sectionTitle}>قيمنا</ThemedText>
        <ThemedText type="body" style={styles.listItem}>- الجودة: نختار أفضل المنتجات لعملائنا</ThemedText>
        <ThemedText type="body" style={styles.listItem}>- السرعة: توصيل سريع وموثوق</ThemedText>
        <ThemedText type="body" style={styles.listItem}>- الأمانة: نتعامل بشفافية مع عملائنا</ThemedText>
        <ThemedText type="body" style={styles.listItem}>- الابتكار: نسعى دائماً لتحسين خدماتنا</ThemedText>
      </View>

      <View style={[styles.card, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
        <ThemedText type="h3" style={styles.title}>تواصل معنا</ThemedText>
        
        <Pressable
          onPress={handleWhatsApp}
          style={({ pressed }) => [
            styles.contactButton,
            { backgroundColor: "#25D366", opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <ThemedText type="body" style={styles.contactButtonText}>تواصل عبر واتساب</ThemedText>
          <Feather name="message-circle" size={20} color="#FFFFFF" />
        </Pressable>

        <Pressable
          onPress={handleCall}
          style={({ pressed }) => [
            styles.contactButton,
            { backgroundColor: AppColors.primary, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <ThemedText type="body" style={styles.contactButtonText}>اتصل بنا</ThemedText>
          <Feather name="phone" size={20} color="#FFFFFF" />
        </Pressable>

        <ThemedText type="small" style={[styles.phone, { color: theme.textSecondary }]}>
          +964 770 289 1104
        </ThemedText>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  logoCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  logoText: {
    color: "#FFFFFF",
    fontSize: 36,
    fontWeight: "700",
  },
  logoSubtext: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 20,
    marginTop: Spacing.xs,
  },
  card: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  title: {
    textAlign: "right",
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    textAlign: "right",
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  paragraph: {
    textAlign: "right",
    lineHeight: 24,
    marginBottom: Spacing.sm,
  },
  listItem: {
    textAlign: "right",
    lineHeight: 24,
    marginBottom: Spacing.xs,
  },
  contactButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  contactButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  phone: {
    textAlign: "center",
    marginTop: Spacing.sm,
  },
});
