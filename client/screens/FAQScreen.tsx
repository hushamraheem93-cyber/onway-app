import React, { useState } from "react";
import { StyleSheet, ScrollView, View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Shadows, AppColors } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";

interface FAQItemProps {
  question: string;
  answer: string;
}

function FAQItem({ question, answer }: FAQItemProps) {
  const { theme } = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsExpanded(!isExpanded);
  };

  return (
    <Pressable
      onPress={handlePress}
      style={[styles.faqItem, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}
    >
      <View style={styles.faqHeader}>
        <Feather
          name={isExpanded ? "chevron-up" : "chevron-down"}
          size={20}
          color={AppColors.primary}
        />
        <ThemedText type="body" style={styles.question}>{question}</ThemedText>
      </View>
      {isExpanded ? (
        <ThemedText type="body" style={[styles.answer, { color: theme.textSecondary }]}>
          {answer}
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

const FAQ_DATA: FAQItemProps[] = [
  {
    question: "كيف يمكنني الطلب؟",
    answer: "يمكنك تصفح الأقسام واختيار المنتجات التي تريدها، ثم إضافتها إلى السلة والمتابعة لإتمام الطلب. بعد تأكيد الطلب، سيتم التواصل معك لتأكيد التفاصيل.",
  },
  {
    question: "ما هي مناطق التوصيل؟",
    answer: "نقوم بالتوصيل إلى جميع مناطق بغداد والمحافظات المجاورة. رسوم التوصيل تختلف حسب المنطقة.",
  },
  {
    question: "كم يستغرق التوصيل؟",
    answer: "عادة ما يتم التوصيل خلال 1-3 ساعات داخل بغداد، وخلال 24-48 ساعة للمحافظات الأخرى.",
  },
  {
    question: "ما هي طرق الدفع المتاحة؟",
    answer: "نقبل الدفع نقداً عند الاستلام. سيتم إضافة طرق دفع إلكترونية قريباً.",
  },
  {
    question: "هل يمكنني إلغاء طلبي؟",
    answer: "نعم، يمكنك إلغاء طلبك قبل أن يتم تأكيده من قبلنا. بعد التأكيد، يرجى التواصل معنا عبر واتساب لإلغاء الطلب.",
  },
  {
    question: "ماذا أفعل إذا استلمت منتجاً تالفاً؟",
    answer: "نعتذر عن أي إزعاج. يرجى التواصل معنا خلال 24 ساعة مع صورة للمنتج وسنقوم باستبداله أو استرداد المبلغ.",
  },
  {
    question: "هل يمكنني تتبع طلبي؟",
    answer: "نعم، بعد تأكيد الطلب ستتلقى تحديثات على واتساب حول حالة طلبك ووقت التوصيل المتوقع.",
  },
  {
    question: "هل الأسعار شاملة رسوم التوصيل؟",
    answer: "لا، الأسعار المعروضة هي أسعار المنتجات فقط. رسوم التوصيل تضاف عند إتمام الطلب حسب منطقة التوصيل.",
  },
  {
    question: "كيف يمكنني التواصل مع خدمة العملاء؟",
    answer: "يمكنك التواصل معنا عبر واتساب على الرقم +9647702891104 أو من خلال قسم 'من نحن' في التطبيق.",
  },
  {
    question: "هل يوجد حد أدنى للطلب؟",
    answer: "نعم، الحد الأدنى للطلب هو 10,000 دينار عراقي لضمان جودة الخدمة.",
  },
];

export default function FAQScreen() {
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
      <ThemedText type="body" style={[styles.intro, { color: theme.textSecondary }]}>
        إليك إجابات على الأسئلة الأكثر شيوعاً. إذا لم تجد إجابة لسؤالك، تواصل معنا عبر واتساب.
      </ThemedText>
      
      {FAQ_DATA.map((faq, index) => (
        <FAQItem key={index} question={faq.question} answer={faq.answer} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  intro: {
    textAlign: "right",
    marginBottom: Spacing.lg,
  },
  faqItem: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  faqHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.sm,
  },
  question: {
    flex: 1,
    textAlign: "right",
    fontWeight: "600",
  },
  answer: {
    textAlign: "right",
    marginTop: Spacing.md,
    lineHeight: 24,
  },
});
