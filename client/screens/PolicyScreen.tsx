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
          نحن في OnWay نحترم خصوصيتك ونلتزم بحماية بياناتك الشخصية. تم تطوير هذا التطبيق بواسطة HUSHAM ALOBAIDY لخدمة أهالي قضاء الضلوعية في محافظة صلاح الدين. توضح هذه السياسة كيفية جمع واستخدام وحماية المعلومات التي تقدمها لنا.
        </ThemedText>

        <ThemedText type="h4" style={styles.sectionTitle}>1. المعلومات التي نجمعها</ThemedText>
        <ThemedText type="body" style={styles.paragraph}>
          نقوم بجمع المعلومات التالية عند استخدامك لتطبيق OnWay:
        </ThemedText>
        <ThemedText type="body" style={styles.listItem}>- رقم الهاتف: للتسجيل وتأكيد الهوية والتواصل بخصوص الطلبات</ThemedText>
        <ThemedText type="body" style={styles.listItem}>- الاسم: لتخصيص تجربتك والتواصل معك</ThemedText>
        <ThemedText type="body" style={styles.listItem}>- عنوان التوصيل: لإيصال طلباتك إلى الموقع الصحيح داخل قضاء الضلوعية</ThemedText>
        <ThemedText type="body" style={styles.listItem}>- تفاصيل الطلبات: لمعالجة الطلبات وتحسين الخدمة</ThemedText>

        <ThemedText type="h4" style={styles.sectionTitle}>2. كيف نستخدم معلوماتك</ThemedText>
        <ThemedText type="body" style={styles.paragraph}>
          نستخدم المعلومات التي نجمعها للأغراض التالية:
        </ThemedText>
        <ThemedText type="body" style={styles.listItem}>- معالجة وتوصيل طلباتك بشكل صحيح</ThemedText>
        <ThemedText type="body" style={styles.listItem}>- التواصل معك بخصوص حالة الطلبات والتحديثات</ThemedText>
        <ThemedText type="body" style={styles.listItem}>- تحسين خدماتنا وتجربة المستخدم</ThemedText>
        <ThemedText type="body" style={styles.listItem}>- إرسال العروض والتحديثات (بموافقتك المسبقة)</ThemedText>
        <ThemedText type="body" style={styles.listItem}>- الامتثال للمتطلبات القانونية</ThemedText>

        <ThemedText type="h4" style={styles.sectionTitle}>3. حماية البيانات</ThemedText>
        <ThemedText type="body" style={styles.paragraph}>
          نتخذ إجراءات أمنية مناسبة لحماية بياناتك الشخصية من الوصول غير المصرح به أو التعديل أو الإفشاء أو الإتلاف. تشمل هذه الإجراءات:
        </ThemedText>
        <ThemedText type="body" style={styles.listItem}>- تشفير البيانات الحساسة</ThemedText>
        <ThemedText type="body" style={styles.listItem}>- تقييد الوصول للمعلومات الشخصية</ThemedText>
        <ThemedText type="body" style={styles.listItem}>- المراجعة الدورية لممارسات الأمان</ThemedText>

        <ThemedText type="h4" style={styles.sectionTitle}>4. مشاركة المعلومات</ThemedText>
        <ThemedText type="body" style={styles.paragraph}>
          لن نبيع أو نؤجر أو نتبادل معلوماتك الشخصية مع أطراف ثالثة لأغراض تسويقية. قد نشارك معلوماتك فقط في الحالات التالية:
        </ThemedText>
        <ThemedText type="body" style={styles.listItem}>- مع مندوبي التوصيل لإتمام عملية التسليم</ThemedText>
        <ThemedText type="body" style={styles.listItem}>- عند الضرورة للامتثال للقانون</ThemedText>
        <ThemedText type="body" style={styles.listItem}>- بموافقتك الصريحة</ThemedText>

        <ThemedText type="h4" style={styles.sectionTitle}>5. الاحتفاظ بالبيانات</ThemedText>
        <ThemedText type="body" style={styles.paragraph}>
          نحتفظ ببياناتك الشخصية طالما كان حسابك نشطاً أو حسب الحاجة لتقديم الخدمات لك. يمكنك طلب حذف بياناتك في أي وقت.
        </ThemedText>

        <ThemedText type="h4" style={styles.sectionTitle}>6. حقوقك</ThemedText>
        <ThemedText type="body" style={styles.paragraph}>
          يحق لك:
        </ThemedText>
        <ThemedText type="body" style={styles.listItem}>- الوصول إلى بياناتك الشخصية المحفوظة لدينا</ThemedText>
        <ThemedText type="body" style={styles.listItem}>- طلب تصحيح أي معلومات غير دقيقة</ThemedText>
        <ThemedText type="body" style={styles.listItem}>- طلب حذف بياناتك الشخصية</ThemedText>
        <ThemedText type="body" style={styles.listItem}>- الاعتراض على معالجة بياناتك</ThemedText>
        <ThemedText type="body" style={styles.listItem}>- سحب موافقتك على الاتصالات التسويقية</ThemedText>

        <ThemedText type="h4" style={styles.sectionTitle}>7. ملفات تعريف الارتباط والتتبع</ThemedText>
        <ThemedText type="body" style={styles.paragraph}>
          قد نستخدم تقنيات التتبع لتحسين أداء التطبيق وتجربة المستخدم. لا نستخدم هذه التقنيات لأغراض إعلانية من أطراف ثالثة.
        </ThemedText>

        <ThemedText type="h4" style={styles.sectionTitle}>8. خصوصية الأطفال</ThemedText>
        <ThemedText type="body" style={styles.paragraph}>
          تطبيق OnWay غير موجه للأطفال دون سن 18 عاماً. لا نجمع معلومات شخصية عن قصد من الأطفال. إذا علمنا أننا جمعنا معلومات من طفل، سنتخذ خطوات لحذفها فوراً.
        </ThemedText>

        <ThemedText type="h4" style={styles.sectionTitle}>9. التعديلات على هذه السياسة</ThemedText>
        <ThemedText type="body" style={styles.paragraph}>
          قد نقوم بتحديث سياسة الخصوصية من وقت لآخر. سنقوم بإخطارك بأي تغييرات جوهرية من خلال التطبيق أو وسائل أخرى مناسبة. استمرارك في استخدام التطبيق بعد التعديلات يعني موافقتك على السياسة المحدثة.
        </ThemedText>

        <ThemedText type="h4" style={styles.sectionTitle}>10. التواصل معنا</ThemedText>
        <ThemedText type="body" style={styles.paragraph}>
          إذا كان لديك أي استفسارات حول سياسة الخصوصية أو ترغب في ممارسة حقوقك، يرجى التواصل معنا:
        </ThemedText>
        <ThemedText type="body" style={styles.listItem}>- واتساب: +9647702891104</ThemedText>
        <ThemedText type="body" style={styles.listItem}>- الموقع: قضاء الضلوعية، محافظة صلاح الدين، العراق</ThemedText>
        <ThemedText type="body" style={styles.listItem}>- المطور: HUSHAM ALOBAIDY</ThemedText>

        <ThemedText type="small" style={[styles.footer, { color: theme.textSecondary }]}>
          آخر تحديث: فبراير 2026
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
  footer: {
    textAlign: "center",
    marginTop: Spacing.xl,
  },
});
