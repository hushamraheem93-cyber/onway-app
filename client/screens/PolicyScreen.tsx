import React from "react";
import { StyleSheet, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";

export default function PolicyScreen() {
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
        <ThemedText type="h3" style={styles.title}>سياسة الخصوصية</ThemedText>
        
        <ThemedText type="body" style={styles.paragraph}>
          نحن في OnWay نحترم خصوصيتك ونلتزم بحماية بياناتك الشخصية. توضح هذه السياسة كيفية جمع واستخدام وحماية المعلومات التي تقدمها لنا.
        </ThemedText>

        <ThemedText type="h4" style={styles.sectionTitle}>جمع المعلومات</ThemedText>
        <ThemedText type="body" style={styles.paragraph}>
          نقوم بجمع المعلومات التالية عند استخدامك لتطبيقنا:
        </ThemedText>
        <ThemedText type="body" style={styles.listItem}>- رقم الهاتف للتسجيل والتواصل</ThemedText>
        <ThemedText type="body" style={styles.listItem}>- عنوان التوصيل لإتمام الطلبات</ThemedText>
        <ThemedText type="body" style={styles.listItem}>- تفاصيل الطلبات وتاريخ الشراء</ThemedText>

        <ThemedText type="h4" style={styles.sectionTitle}>استخدام المعلومات</ThemedText>
        <ThemedText type="body" style={styles.paragraph}>
          نستخدم معلوماتك للأغراض التالية:
        </ThemedText>
        <ThemedText type="body" style={styles.listItem}>- معالجة وتوصيل طلباتك</ThemedText>
        <ThemedText type="body" style={styles.listItem}>- التواصل معك بخصوص طلباتك</ThemedText>
        <ThemedText type="body" style={styles.listItem}>- تحسين خدماتنا وتجربة المستخدم</ThemedText>
        <ThemedText type="body" style={styles.listItem}>- إرسال العروض والتحديثات (بموافقتك)</ThemedText>

        <ThemedText type="h4" style={styles.sectionTitle}>حماية البيانات</ThemedText>
        <ThemedText type="body" style={styles.paragraph}>
          نتخذ إجراءات أمنية مناسبة لحماية بياناتك من الوصول غير المصرح به أو التعديل أو الإفشاء. لن نشارك معلوماتك الشخصية مع أطراف ثالثة إلا بموافقتك أو عند الضرورة لتقديم الخدمة.
        </ThemedText>

        <ThemedText type="h4" style={styles.sectionTitle}>حقوقك</ThemedText>
        <ThemedText type="body" style={styles.paragraph}>
          يحق لك طلب الوصول إلى بياناتك الشخصية أو تصحيحها أو حذفها في أي وقت عن طريق التواصل معنا.
        </ThemedText>

        <ThemedText type="h4" style={styles.sectionTitle}>التواصل معنا</ThemedText>
        <ThemedText type="body" style={styles.paragraph}>
          إذا كان لديك أي استفسارات حول سياسة الخصوصية، يرجى التواصل معنا عبر واتساب على الرقم: +9647702891104
        </ThemedText>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
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
});
