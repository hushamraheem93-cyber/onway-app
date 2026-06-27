import React from "react";
import { StyleSheet, ScrollView, View, Pressable, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Constants from "expo-constants";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Shadows, AppColors } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { GradientBackground } from "@/components/GradientBackground";

export default function AboutScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();

  const appVersion = Constants.expoConfig?.version ?? "1.0.0";
  const buildNumber =
    Constants.expoConfig?.ios?.buildNumber ??
    String(Constants.expoConfig?.android?.versionCode ?? "1");

  const handleWhatsApp = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL("https://wa.me/9647702891104");
  };

  const handleCall = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL("tel:+9647702891104");
  };

  const handleEmail = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL("mailto:contact@onway.iq");
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
        {/* شعار التطبيق */}
        <View style={[styles.logoCard, { backgroundColor: AppColors.primary }, Shadows.md]}>
          <ThemedText type="h1" style={styles.logoText}>OnWay</ThemedText>
          <ThemedText type="body" style={styles.logoSubtext}>اون وي - قضاء الضلوعية</ThemedText>
        </View>

        {/* معلومات الإصدار */}
        <View style={[styles.card, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
          <ThemedText type="h3" style={styles.title}>معلومات الإصدار</ThemedText>
          <View style={styles.versionRow}>
            <View style={[styles.versionIcon, { backgroundColor: AppColors.primary + "15" }]}>
              <Feather name="smartphone" size={18} color={AppColors.primary} />
            </View>
            <View style={styles.versionContent}>
              <ThemedText type="small" style={[styles.versionLabel, { color: theme.textSecondary }]}>
                إصدار التطبيق
              </ThemedText>
              <ThemedText type="body" style={styles.versionValue}>
                {appVersion}
              </ThemedText>
            </View>
          </View>
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <View style={styles.versionRow}>
            <View style={[styles.versionIcon, { backgroundColor: AppColors.primary + "15" }]}>
              <Feather name="hash" size={18} color={AppColors.primary} />
            </View>
            <View style={styles.versionContent}>
              <ThemedText type="small" style={[styles.versionLabel, { color: theme.textSecondary }]}>
                رقم البناء
              </ThemedText>
              <ThemedText type="body" style={styles.versionValue}>
                {buildNumber}
              </ThemedText>
            </View>
          </View>
        </View>

        {/* نبذة عن التطبيق */}
        <View style={[styles.card, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
          <ThemedText type="h3" style={styles.title}>من نحن</ThemedText>

          <ThemedText type="body" style={styles.paragraph}>
            تطبيق OnWay هو مشروع محلي تم تطويره بالكامل من قبل المطور العراقي هشام العبيدي (HUSHAM ALOBAIDY) بهدف خدمة أهالي قضاء الضلوعية في محافظة صلاح الدين.
          </ThemedText>

          <ThemedText type="body" style={styles.paragraph}>
            انطلقت فكرة التطبيق من إيماننا بأن عوائل الضلوعية تستحق خدمة توصيل احترافية وموثوقة توفر عليهم الوقت والجهد. نسعى لتقديم تجربة تسوق سهلة وسريعة تصل إلى باب منزلك.
          </ThemedText>

          <ThemedText type="h4" style={styles.sectionTitle}>رسالتنا</ThemedText>
          <ThemedText type="body" style={styles.paragraph}>
            نحن نؤمن بأن التكنولوجيا يجب أن تخدم المجتمع المحلي. لذلك قمنا ببناء هذا التطبيق ليكون جسراً بين المتاجر المحلية والعوائل في قضاء الضلوعية، مما يساهم في دعم الاقتصاد المحلي وتسهيل الحياة اليومية لأهالي القضاء.
          </ThemedText>

          <ThemedText type="h4" style={styles.sectionTitle}>نطاق الخدمة</ThemedText>
          <ThemedText type="body" style={styles.paragraph}>
            خدمة التوصيل متاحة حصرياً لسكان قضاء الضلوعية والمناطق التابعة له في محافظة صلاح الدين. نحرص على توصيل طلباتكم بأسرع وقت ممكن مع الحفاظ على جودة المنتجات.
          </ThemedText>

          <ThemedText type="h4" style={styles.sectionTitle}>قيمنا</ThemedText>
          <ThemedText type="body" style={styles.listItem}>- خدمة المجتمع: نعمل من أجل راحة عوائل الضلوعية</ThemedText>
          <ThemedText type="body" style={styles.listItem}>- الأمانة والشفافية: أسعار واضحة وخدمة صادقة</ThemedText>
          <ThemedText type="body" style={styles.listItem}>- الجودة: نختار أفضل المنتجات لعملائنا</ThemedText>
          <ThemedText type="body" style={styles.listItem}>- السرعة: توصيل سريع وموثوق</ThemedText>

          <ThemedText type="h4" style={styles.sectionTitle}>المطور</ThemedText>
          <ThemedText type="body" style={styles.paragraph}>
            تم تصميم وتطوير هذا التطبيق بواسطة: HUSHAM ALOBAIDY
          </ThemedText>
        </View>

        {/* التواصل */}
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

          <Pressable
            onPress={handleEmail}
            style={({ pressed }) => [
              styles.contactButton,
              { backgroundColor: "#6366F1", opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <ThemedText type="body" style={styles.contactButtonText}>راسلنا بالبريد</ThemedText>
            <Feather name="mail" size={20} color="#FFFFFF" />
          </Pressable>

          <ThemedText type="small" style={[styles.info, { color: theme.textSecondary }]}>
            +964 770 289 1104
          </ThemedText>
          <ThemedText type="small" style={[styles.info, { color: theme.textSecondary }]}>
            contact@onway.iq
          </ThemedText>
          <ThemedText type="small" style={[styles.info, { color: theme.textSecondary }]}>
            قضاء الضلوعية - محافظة صلاح الدين - العراق
          </ThemedText>
        </View>
      </ScrollView>
    </View>
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
    fontFamily: "Montserrat_800ExtraBold",
    color: "#FFFFFF",
    fontSize: 28,
    letterSpacing: 1,
    writingDirection: "ltr",
    lineHeight: 48,
    includeFontPadding: true,
  },
  logoSubtext: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
    marginTop: Spacing.xs,
    lineHeight: 30,
    includeFontPadding: true,
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
  versionRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  versionIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: Spacing.md,
  },
  versionContent: {
    flex: 1,
    alignItems: "flex-end",
  },
  versionLabel: {
    marginBottom: 2,
  },
  versionValue: {
    fontFamily: "Cairo_700Bold",
    writingDirection: "ltr",
  },
  divider: {
    height: 1,
    marginVertical: Spacing.xs,
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
  info: {
    textAlign: "center",
    marginTop: Spacing.xs,
  },
});
