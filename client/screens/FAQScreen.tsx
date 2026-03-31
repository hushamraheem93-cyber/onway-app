import React, { useState } from "react";
import { StyleSheet, ScrollView, View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Shadows, AppColors } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { GradientBackground } from "@/components/GradientBackground";

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
    question: "ما هو تطبيق OnWay؟",
    answer: "OnWay هو تطبيق توصيل محلي مصمم خصيصاً لخدمة أهالي قضاء الضلوعية في محافظة صلاح الدين. يمكنك من خلاله طلب المنتجات الغذائية والمستلزمات اليومية وتوصيلها إلى باب منزلك.",
  },
  {
    question: "ما هي مناطق التوصيل المتاحة؟",
    answer: "خدمة التوصيل متاحة حصرياً لسكان قضاء الضلوعية والمناطق التابعة له في محافظة صلاح الدين. نحن نخدم جميع أحياء ومناطق القضاء.",
  },
  {
    question: "كيف يمكنني الطلب؟",
    answer: "يمكنك تصفح الأقسام واختيار المنتجات التي تريدها، ثم إضافتها إلى السلة. بعد ذلك، اختر منطقة التوصيل من القائمة المتاحة وأكمل عملية الطلب. سيتم التواصل معك لتأكيد التفاصيل.",
  },
  {
    question: "كم يستغرق التوصيل؟",
    answer: "نسعى لتوصيل طلبك في أسرع وقت ممكن. عادة ما يتم التوصيل خلال 1-3 ساعات حسب الموقع وحجم الطلب وتوفر المنتجات.",
  },
  {
    question: "ما هي طرق الدفع المتاحة؟",
    answer: "حالياً نقبل الدفع نقداً عند الاستلام. نعمل على إضافة طرق دفع إلكترونية مثل ماستركارد وزين كاش قريباً.",
  },
  {
    question: "كيف يتم حساب رسوم التوصيل؟",
    answer: "تختلف رسوم التوصيل حسب منطقتك داخل قضاء الضلوعية. يمكنك رؤية رسوم التوصيل عند اختيار منطقتك في صفحة إتمام الطلب.",
  },
  {
    question: "هل يمكنني إلغاء طلبي؟",
    answer: "نعم، يمكنك إلغاء طلبك قبل أن يتم تأكيده من قبلنا. بعد التأكيد والبدء بتجهيز الطلب، يرجى التواصل معنا عبر واتساب لمناقشة الإلغاء.",
  },
  {
    question: "ماذا أفعل إذا استلمت منتجاً تالفاً أو خاطئاً؟",
    answer: "نعتذر عن أي إزعاج. يرجى التواصل معنا خلال 24 ساعة مع صورة للمنتج وتفاصيل المشكلة، وسنقوم باستبداله أو استرداد المبلغ حسب الحالة.",
  },
  {
    question: "هل يمكنني تتبع طلبي؟",
    answer: "نعم، بعد تأكيد الطلب ستتلقى تحديثات على واتساب حول حالة طلبك ووقت التوصيل المتوقع.",
  },
  {
    question: "هل يوجد حد أدنى للطلب؟",
    answer: "نعم، الحد الأدنى للطلب هو 10,000 دينار عراقي لضمان جودة الخدمة وكفاءة التوصيل.",
  },
  {
    question: "كيف يمكنني التواصل مع خدمة العملاء؟",
    answer: "يمكنك التواصل معنا عبر واتساب على الرقم +9647702891104 أو من خلال قسم 'من نحن' في التطبيق. نحن متواجدون لخدمتك.",
  },
  {
    question: "من هو مطور التطبيق؟",
    answer: "تم تطوير تطبيق OnWay بهدف خدمة أهالي قضاء الضلوعية وتسهيل حياتهم اليومية. للمزيد من المعلومات، يرجى زيارة قسم 'من نحن'.",
  },
];

export default function FAQScreen() {
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
      <ThemedText type="body" style={[styles.intro, { color: theme.textSecondary }]}>
        إليك إجابات على الأسئلة الأكثر شيوعاً حول تطبيق OnWay وخدمات التوصيل في قضاء الضلوعية. إذا لم تجد إجابة لسؤالك، تواصل معنا عبر واتساب.
      </ThemedText>
      
      {FAQ_DATA.map((faq, index) => (
        <FAQItem key={index} question={faq.question} answer={faq.answer} />
      ))}
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  intro: {
    textAlign: "right",
    marginBottom: Spacing.lg,
    lineHeight: 24,
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
