import React from "react";
import { StyleSheet, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { GradientBackground } from "@/components/GradientBackground";

export default function TermsScreen() {
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
        <ThemedText type="h3" style={styles.title}>الشروط والأحكام</ThemedText>
        
        <ThemedText type="body" style={styles.paragraph}>
          مرحباً بك في تطبيق OnWay لخدمات التوصيل في قضاء الضلوعية، محافظة صلاح الدين. باستخدامك لهذا التطبيق، فإنك توافق على الالتزام بهذه الشروط والأحكام. يرجى قراءتها بعناية.
        </ThemedText>

        <ThemedText type="h4" style={styles.sectionTitle}>1. نطاق الخدمة</ThemedText>
        <ThemedText type="body" style={styles.paragraph}>
          تقتصر خدمات التوصيل المقدمة من خلال تطبيق OnWay على سكان قضاء الضلوعية والمناطق التابعة له في محافظة صلاح الدين فقط. لا نقدم خدمات التوصيل خارج هذا النطاق الجغرافي.
        </ThemedText>

        <ThemedText type="h4" style={styles.sectionTitle}>2. أهلية الاستخدام</ThemedText>
        <ThemedText type="body" style={styles.paragraph}>
          يجب أن يكون عمرك 18 عاماً على الأقل لاستخدام هذا التطبيق وإجراء الطلبات. باستخدامك للتطبيق، فإنك تقر بأنك تستوفي هذا الشرط. أنت مسؤول عن الحفاظ على سرية حسابك ورقم هاتفك المسجل.
        </ThemedText>

        <ThemedText type="h4" style={styles.sectionTitle}>3. الطلبات والأسعار</ThemedText>
        <ThemedText type="body" style={styles.paragraph}>
          جميع الأسعار المعروضة في التطبيق بالدينار العراقي. نحتفظ بالحق في تعديل الأسعار دون إشعار مسبق بسبب تغيرات السوق.
        </ThemedText>
        <ThemedText type="body" style={styles.listItem}>- الأسعار المعروضة هي أسعار المنتجات ولا تشمل رسوم التوصيل</ThemedText>
        <ThemedText type="body" style={styles.listItem}>- رسوم التوصيل تحدد حسب منطقتك داخل قضاء الضلوعية</ThemedText>
        <ThemedText type="body" style={styles.listItem}>- العروض والخصومات صالحة لفترة محدودة وقد تنتهي دون إشعار</ThemedText>
        <ThemedText type="body" style={styles.listItem}>- نحتفظ بالحق في رفض أي طلب لأسباب تشغيلية</ThemedText>

        <ThemedText type="h4" style={styles.sectionTitle}>4. التوصيل</ThemedText>
        <ThemedText type="body" style={styles.paragraph}>
          نسعى لتوصيل طلبك في أسرع وقت ممكن. أوقات التوصيل المذكورة تقديرية وقد تتأثر بعوامل خارجة عن إرادتنا مثل الظروف الجوية أو الازدحام المروري. سيتم إبلاغك بأي تأخير متوقع.
        </ThemedText>

        <ThemedText type="h4" style={styles.sectionTitle}>5. الدفع</ThemedText>
        <ThemedText type="body" style={styles.paragraph}>
          حالياً نقبل الدفع نقداً عند الاستلام. يجب توفر المبلغ الكامل للطلب شاملاً رسوم التوصيل عند استلام الطلب. نعمل على إضافة طرق دفع إلكترونية مستقبلاً.
        </ThemedText>

        <ThemedText type="h4" style={styles.sectionTitle}>6. الإلغاء والاسترجاع</ThemedText>
        <ThemedText type="body" style={styles.paragraph}>
          يمكنك إلغاء طلبك مجاناً قبل أن يتم تأكيده من قبل فريقنا. بعد التأكيد والبدء بتجهيز الطلب، قد لا يكون الإلغاء ممكناً أو قد يترتب عليه رسوم. للمنتجات التالفة أو الخاطئة، يرجى التواصل معنا خلال 24 ساعة مع توثيق المشكلة بالصور.
        </ThemedText>

        <ThemedText type="h4" style={styles.sectionTitle}>7. جودة المنتجات</ThemedText>
        <ThemedText type="body" style={styles.paragraph}>
          نحرص على توفير منتجات طازجة وعالية الجودة. في حال استلام منتج تالف أو منتهي الصلاحية، يحق لك الاستبدال أو استرداد المبلغ وفقاً لسياستنا.
        </ThemedText>

        <ThemedText type="h4" style={styles.sectionTitle}>8. المسؤولية</ThemedText>
        <ThemedText type="body" style={styles.paragraph}>
          تطبيق OnWay غير مسؤول عن أي أضرار غير مباشرة أو تبعية ناتجة عن استخدام التطبيق أو عدم توفر الخدمة. نسعى لتقديم أفضل خدمة ممكنة ولكن لا نضمن استمرارية الخدمة بدون انقطاع.
        </ThemedText>

        <ThemedText type="h4" style={styles.sectionTitle}>9. حقوق الملكية الفكرية</ThemedText>
        <ThemedText type="body" style={styles.paragraph}>
          جميع حقوق الملكية الفكرية للتطبيق بما في ذلك التصميم والشعار والمحتوى محفوظة لمالك التطبيق. لا يجوز نسخ أو استخدام أي جزء من التطبيق دون إذن خطي مسبق.
        </ThemedText>

        <ThemedText type="h4" style={styles.sectionTitle}>10. التعديلات</ThemedText>
        <ThemedText type="body" style={styles.paragraph}>
          نحتفظ بالحق في تعديل هذه الشروط والأحكام في أي وقت. سيتم نشر التعديلات في التطبيق وتصبح سارية فور نشرها. استمرارك في استخدام التطبيق بعد التعديلات يعني موافقتك على الشروط المحدثة.
        </ThemedText>

        <ThemedText type="h4" style={styles.sectionTitle}>11. القانون الواجب التطبيق</ThemedText>
        <ThemedText type="body" style={styles.paragraph}>
          تخضع هذه الشروط والأحكام للقوانين المعمول بها في جمهورية العراق. أي نزاع ينشأ عن استخدام التطبيق يخضع للاختصاص القضائي للمحاكم العراقية المختصة.
        </ThemedText>

        <ThemedText type="h4" style={styles.sectionTitle}>12. التواصل</ThemedText>
        <ThemedText type="body" style={styles.paragraph}>
          لأي استفسارات حول هذه الشروط والأحكام، يرجى التواصل معنا عبر واتساب: +9647702891104
        </ThemedText>

        <ThemedText type="small" style={[styles.footer, { color: theme.textSecondary }]}>
          آخر تحديث: فبراير 2026
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
