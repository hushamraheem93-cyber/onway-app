import React from "react";
import { StyleSheet, View, Pressable } from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Shadows, AppColors } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { GradientBackground } from "@/components/GradientBackground";
import { ProfileStackParamList } from "@/navigation/ProfileStackNavigator";

type NavigationProp = NativeStackNavigationProp<ProfileStackParamList>;

interface HelpItemProps {
  icon: keyof typeof Feather.glyphMap;
  iconBg: string;
  title: string;
  subtitle: string;
  onPress: () => void;
}

function HelpItem({ icon, iconBg, title, subtitle, onPress }: HelpItemProps) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${title}، ${subtitle}`}
      style={({ pressed }) => [
        styles.item,
        { backgroundColor: theme.backgroundDefault, opacity: pressed ? 0.8 : 1 },
        Shadows.sm,
      ]}
    >
      <View style={[styles.iconContainer, { backgroundColor: iconBg }]}>
        <Feather name={icon} size={20} color={AppColors.primary} />
      </View>
      <View style={styles.content}>
        <ThemedText type="body" style={styles.title}>{title}</ThemedText>
        <ThemedText type="small" style={[styles.subtitle, { color: theme.textSecondary }]}>
          {subtitle}
        </ThemedText>
      </View>
      <Feather name="chevron-left" size={20} color={theme.textSecondary} />
    </Pressable>
  );
}

export default function HelpCenterScreen() {
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();

  return (
    <View style={{ flex: 1 }}>
      <GradientBackground />
      <KeyboardAwareScrollViewCompat
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.lg,
          paddingBottom: insets.bottom + Spacing.xl,
          paddingHorizontal: Spacing.lg,
        }}
      >
        <HelpItem
          icon="help-circle"
          iconBg={AppColors.primary + "15"}
          title="الأسئلة الشائعة"
          subtitle="أكثر الأسئلة شيوعاً حول الخدمة"
          onPress={() => navigation.navigate("FAQ")}
        />
        <HelpItem
          icon="file-text"
          iconBg={AppColors.primary + "15"}
          title="الشروط والأحكام"
          subtitle="شروط استخدام تطبيق OnWay"
          onPress={() => navigation.navigate("Terms")}
        />
        <HelpItem
          icon="shield"
          iconBg={AppColors.primary + "15"}
          title="سياسة الخصوصية"
          subtitle="كيف نحمي بياناتك الشخصية"
          onPress={() => navigation.navigate("Policy")}
        />
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: "row-reverse",
    alignItems: "center",
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: Spacing.md,
  },
  content: {
    flex: 1,
  },
  title: {
    textAlign: "right",
  },
  subtitle: {
    textAlign: "right",
    marginTop: Spacing.xs,
  },
});
