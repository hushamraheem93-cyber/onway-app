import React from "react";
import { StyleSheet, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";

export default function TermsScreen() {
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
        <ThemedText type="h3" style={styles.title}>الشروط والأحكام</ThemedText>
        
        <ThemedText type="body" style={styles.paragraph}>
          مرحباً بك في تطبيق OnWay. باستخدامك لهذا التطبيق، فإنك توافق على الالتزام بهذه الشروط والأحكام.
        </ThemedText>

        <ThemedText type="h4" style={styles.sectionTitle}>1. استخدام التطبيق</ThemedText>
        <ThemedText type="body" style={styles.paragraph}>
          يجب أن يكون عمرك 18 عاماً على الأقل لاستخدام هذا التطبيق. أنت مسؤول عن الحفاظ على سرية حسابك ورقم هاتفك.
        </ThemedText>

        <ThemedText type="h4" style={styles.sectionTitle}>2. الطلبات والأسعار</ThemedText>
        <ThemedText type="body" style={styles.paragraph}>
          جميع الأسعار المعروضة بالدينار العراقي وقابلة للتغيير دون إشعار مسبق. نحتفظ بالحق في رفض أي طلب لأي سبب.
        </ThemedText>
        <ThemedText type="body" style={styles.listItem}>- الأسعار لا تشمل رسوم التوصيل إلا إذا ذكر غير ذلك</ThemedText>
        <ThemedText type="body" style={styles.listItem}>- قد تختلف الأسعار حسب المنطقة</ThemedText>
        <ThemedText type="body" style={styles.listItem}>- العروض والخصومات لفترة محدودة</ThemedText>

        <ThemedText type="h4" style={styles.sectionTitle}>3. التوصيل</ThemedText>
        <ThemedText type="body" style={styles.paragraph}>
          نسعى لتوصيل طلبك في أسرع وقت ممكن. قد تتأخر بعض الطلبات بسبب ظروف خارجة عن إرادتنا مثل الطقس أو الازدحام المروري.
        </ThemedText>

        <ThemedText type="h4" style={styles.sectionTitle}>4. الإلغاء والاسترجاع</ThemedText>
        <ThemedText type="body" style={styles.paragraph}>
          يمكنك إلغاء طلبك قبل أن يتم تأكيده من قبل المتجر. بعد التأكيد، قد لا يكون الإلغاء ممكناً. للمنتجات التالفة أو الخاطئة، يرجى التواصل معنا خلال 24 ساعة.
        </ThemedText>

        <ThemedText type="h4" style={styles.sectionTitle}>5. المسؤولية</ThemedText>
        <ThemedText type="body" style={styles.paragraph}>
          نحن غير مسؤولين عن أي أضرار غير مباشرة ناتجة عن استخدام التطبيق. نسعى لتقديم أفضل خدمة ممكنة ولكن لا نضمن خلو الخدمة من الأخطاء.
        </ThemedText>

        <ThemedText type="h4" style={styles.sectionTitle}>6. التعديلات</ThemedText>
        <ThemedText type="body" style={styles.paragraph}>
          نحتفظ بالحق في تعديل هذه الشروط في أي وقت. استمرارك في استخدام التطبيق بعد التعديلات يعني موافقتك على الشروط الجديدة.
        </ThemedText>

        <ThemedText type="h4" style={styles.sectionTitle}>7. التواصل</ThemedText>
        <ThemedText type="body" style={styles.paragraph}>
          لأي استفسارات حول هذه الشروط، يرجى التواصل معنا عبر واتساب: +9647702891104
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
