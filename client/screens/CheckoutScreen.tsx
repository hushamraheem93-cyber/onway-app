import React, { useState } from "react";
import { StyleSheet, View, TextInput, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";

import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, AppColors, Shadows } from "@/constants/theme";
import { useCart } from "@/context/CartContext";
import { useOrders } from "@/context/OrderContext";
import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function CheckoutScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const { items, getTotal, clearCart } = useCart();
  const { addOrder } = useOrders();

  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const total = getTotal();

  const handleSubmit = async () => {
    if (!customerName.trim()) {
      Alert.alert("خطأ", "يرجى إدخال الاسم");
      return;
    }
    if (!phone.trim()) {
      Alert.alert("خطأ", "يرجى إدخال رقم الهاتف");
      return;
    }
    if (!address.trim()) {
      Alert.alert("خطأ", "يرجى إدخال العنوان");
      return;
    }

    setIsSubmitting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const order = addOrder({
      items: [...items],
      total,
      customerName: customerName.trim(),
      phone: phone.trim(),
      address: address.trim(),
      notes: notes.trim(),
    });

    clearCart();

    Alert.alert(
      "تم تأكيد الطلب",
      `شكراً لك! رقم طلبك هو ${order.id}\nسيتم التواصل معك قريباً.`,
      [
        {
          text: "حسناً",
          onPress: () => navigation.navigate("Main"),
        },
      ]
    );

    setIsSubmitting(false);
  };

  return (
    <KeyboardAwareScrollViewCompat
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
    >
      <ThemedText type="h3" style={styles.sectionTitle}>
        معلومات التوصيل
      </ThemedText>

      <View style={[styles.inputContainer, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
        <ThemedText type="small" style={[styles.label, { color: theme.textSecondary }]}>
          الاسم الكامل
        </ThemedText>
        <TextInput
          value={customerName}
          onChangeText={setCustomerName}
          placeholder="أدخل اسمك الكامل"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text }]}
          textAlign="right"
        />
      </View>

      <View style={[styles.inputContainer, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
        <ThemedText type="small" style={[styles.label, { color: theme.textSecondary }]}>
          رقم الهاتف
        </ThemedText>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder="05xxxxxxxx"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text }]}
          textAlign="right"
          keyboardType="phone-pad"
        />
      </View>

      <View style={[styles.inputContainer, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
        <ThemedText type="small" style={[styles.label, { color: theme.textSecondary }]}>
          عنوان التوصيل
        </ThemedText>
        <TextInput
          value={address}
          onChangeText={setAddress}
          placeholder="أدخل عنوانك بالتفصيل"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, styles.multilineInput, { color: theme.text }]}
          textAlign="right"
          multiline
          numberOfLines={3}
        />
      </View>

      <View style={[styles.inputContainer, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
        <ThemedText type="small" style={[styles.label, { color: theme.textSecondary }]}>
          ملاحظات إضافية (اختياري)
        </ThemedText>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="أي ملاحظات خاصة بالطلب"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, styles.multilineInput, { color: theme.text }]}
          textAlign="right"
          multiline
          numberOfLines={2}
        />
      </View>

      <ThemedText type="h3" style={styles.sectionTitle}>
        ملخص الطلب
      </ThemedText>

      <View style={[styles.summaryCard, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
        <View style={styles.summaryRow}>
          <ThemedText type="body" style={{ color: theme.textSecondary }}>
            عدد المنتجات
          </ThemedText>
          <ThemedText type="body">{items.length} منتج</ThemedText>
        </View>
        <View style={styles.summaryRow}>
          <ThemedText type="body" style={{ color: theme.textSecondary }}>
            التوصيل
          </ThemedText>
          <ThemedText type="body" style={{ color: AppColors.success }}>
            مجاني
          </ThemedText>
        </View>
        <View style={[styles.summaryRow, styles.totalRow]}>
          <ThemedText type="h4">المجموع الكلي</ThemedText>
          <ThemedText type="h2" style={{ color: AppColors.primary }}>
            {total.toFixed(2)} ر.س
          </ThemedText>
        </View>
      </View>

      <Button
        onPress={handleSubmit}
        disabled={isSubmitting}
        style={styles.submitButton}
      >
        {isSubmitting ? "جاري التأكيد..." : "تأكيد الطلب"}
      </Button>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    textAlign: "right",
    marginBottom: Spacing.lg,
    marginTop: Spacing.lg,
  },
  inputContainer: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  label: {
    textAlign: "right",
    marginBottom: Spacing.sm,
  },
  input: {
    fontSize: 16,
    paddingVertical: Spacing.sm,
  },
  multilineInput: {
    minHeight: 60,
    textAlignVertical: "top",
  },
  summaryCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  summaryRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
    marginTop: Spacing.sm,
    paddingTop: Spacing.lg,
  },
  submitButton: {
    marginTop: Spacing.xl,
    marginBottom: Spacing.xl,
  },
});
