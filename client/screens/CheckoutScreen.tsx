import React, { useState } from "react";
import { StyleSheet, View, TextInput, Alert, Modal, Pressable, FlatList, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";

import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, AppColors, Shadows } from "@/constants/theme";
import { useCart } from "@/context/CartContext";
import { formatPrice } from "@/constants/currency";
import { useOrders } from "@/context/OrderContext";
import { useAuth } from "@/context/AuthContext";
import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { getApiUrl } from "@/lib/query-client";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

import { useQuery } from "@tanstack/react-query";

interface DeliveryArea {
  id: string;
  name: string;
  fee: number;
  isActive: boolean;
}

export default function CheckoutScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const { items, getTotal, clearCart } = useCart();
  const { addOrder } = useOrders();
  const { phoneNumber } = useAuth();

  const { data: deliveryAreas = [] } = useQuery<DeliveryArea[]>({
    queryKey: ["/api/delivery-areas"],
  });

  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedArea, setSelectedArea] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAreaPicker, setShowAreaPicker] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [promoError, setPromoError] = useState("");
  const [promoSuccess, setPromoSuccess] = useState("");
  const [isApplyingPromo, setIsApplyingPromo] = useState(false);
  const [appliedPromoCode, setAppliedPromoCode] = useState("");

  const handleSelectArea = (areaId: string) => {
    setSelectedArea(areaId);
    setShowAreaPicker(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const applyPromoCode = async () => {
    if (!promoCode.trim()) return;
    setIsApplyingPromo(true);
    try {
      const res = await fetch(new URL("/api/promo-codes/apply", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: promoCode, userId: phoneNumber, cartTotal: subtotal }),
      });
      if (res.ok) {
        const data = await res.json();
        setPromoDiscount(data.discountAmount);
        setPromoSuccess(`تم تطبيق الخصم: ${formatPrice(data.discountAmount)}`);
        setAppliedPromoCode(promoCode.toUpperCase());
        setPromoError("");
      } else {
        const errorData = await res.json();
        const errorMsg = errorData.error || "كود الخصم غير صالح";
        setPromoError(errorMsg);
        setPromoDiscount(0);
        setPromoSuccess("");
      }
    } catch {
      setPromoError("حدث خطأ أثناء التحقق من الكود");
      setPromoDiscount(0);
      setPromoSuccess("");
    } finally {
      setIsApplyingPromo(false);
    }
  };

  const subtotal = getTotal();
  const selectedAreaData = deliveryAreas.find(a => a.id === selectedArea);
  const isRestaurantOrder = items.length > 0 && items.every(item => item.product.categoryId === "restaurants");
  const deliveryFee = isRestaurantOrder ? 1000 : (selectedAreaData?.fee || 0);
  const total = subtotal + deliveryFee - promoDiscount;

  const handleSubmit = async () => {
    if (!customerName.trim()) {
      Alert.alert("خطأ", "يرجى إدخال الاسم");
      return;
    }
    if (!phone.trim()) {
      Alert.alert("خطأ", "يرجى إدخال رقم الهاتف");
      return;
    }
    if (!selectedArea) {
      Alert.alert("خطأ", "يرجى اختيار منطقة التوصيل");
      return;
    }
    if (!address.trim()) {
      Alert.alert("خطأ", "يرجى إدخال تفاصيل العنوان");
      return;
    }

    setIsSubmitting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const areaName = selectedAreaData?.name || "";
    const fullAddress = `${areaName} - ${address.trim()}`;

    try {
      const orderPayload: any = {
        items: [...items],
        total,
        deliveryFee,
        address: fullAddress,
        region: areaName,
        customerName: customerName.trim(),
        latitude: selectedLocation?.latitude,
        longitude: selectedLocation?.longitude,
      };
      if (appliedPromoCode) {
        orderPayload.promoCode = appliedPromoCode;
        orderPayload.promoDiscount = promoDiscount;
      }
      const order = await addOrder(orderPayload);

      if (order) {
        clearCart();
        navigation.replace("OrderConfirmation", { order });
      } else {
        Alert.alert("خطأ", "فشل في إنشاء الطلب");
      }
    } catch (error) {
      console.error("Error creating order:", error);
      Alert.alert("خطأ", "فشل في إنشاء الطلب");
    } finally {
      setIsSubmitting(false);
    }
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
          placeholder="009647xxxxxxxxx"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text }]}
          textAlign="right"
          keyboardType="phone-pad"
        />
      </View>

      <View style={[styles.inputContainer, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
        <ThemedText type="small" style={[styles.label, { color: theme.textSecondary }]}>
          منطقة التوصيل
        </ThemedText>
        <Pressable
          onPress={() => setShowAreaPicker(true)}
          style={[
            styles.dropdownButton,
            { 
              borderColor: selectedArea ? AppColors.primary : theme.border,
              backgroundColor: selectedArea ? AppColors.secondary : "transparent"
            }
          ]}
        >
          <Feather name="chevron-down" size={20} color={theme.textSecondary} />
          <ThemedText 
            type="body" 
            style={{ 
              flex: 1, 
              textAlign: "right",
              color: selectedArea ? AppColors.primary : theme.textSecondary,
              fontWeight: selectedArea ? "600" : "400"
            }}
          >
            {selectedAreaData?.id 
              ? selectedAreaData.name
              : "اختر المنطقة"}
          </ThemedText>
        </Pressable>
      </View>

      <Modal
        visible={showAreaPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAreaPicker(false)}
      >
        <Pressable 
          style={styles.modalOverlay}
          onPress={() => setShowAreaPicker(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.backgroundDefault }]}>
            <ThemedText type="h4" style={styles.modalTitle}>
              اختر منطقة التوصيل
            </ThemedText>
            <FlatList
              data={deliveryAreas}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => handleSelectArea(item.id)}
                  style={[
                    styles.areaItem,
                    selectedArea === item.id && { backgroundColor: AppColors.secondary }
                  ]}
                >
                  <View style={styles.areaItemContent}>
                    <ThemedText 
                      type="body" 
                      style={[
                        styles.areaName,
                        selectedArea === item.id && { color: AppColors.primary, fontWeight: "700" }
                      ]}
                    >
                      {item.name}
                    </ThemedText>
                  </View>
                  {selectedArea === item.id ? (
                    <Feather name="check-circle" size={22} color={AppColors.primary} />
                  ) : null}
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>

      <View style={[styles.inputContainer, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
        <ThemedText type="small" style={[styles.label, { color: theme.textSecondary }]}>
          تفاصيل العنوان
        </ThemedText>
        <TextInput
          value={address}
          onChangeText={setAddress}
          placeholder="أدخل تفاصيل عنوانك (الشارع، المحلة، أقرب نقطة دالة)"
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

      <View style={[styles.inputContainer, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
        <ThemedText type="small" style={[styles.label, { color: theme.textSecondary }]}>
          كود الخصم (اختياري)
        </ThemedText>
        <View style={{ flexDirection: "row", gap: Spacing.sm }}>
          <Pressable
            onPress={applyPromoCode}
            disabled={isApplyingPromo}
            style={{
              backgroundColor: AppColors.primary,
              borderRadius: BorderRadius.md,
              paddingHorizontal: Spacing.lg,
              paddingVertical: Spacing.md,
              justifyContent: "center",
            }}
          >
            {isApplyingPromo ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <ThemedText type="body" style={{ color: "#FFFFFF", fontWeight: "600" }}>
                تطبيق
              </ThemedText>
            )}
          </Pressable>
          <TextInput
            value={promoCode}
            onChangeText={setPromoCode}
            placeholder="أدخل كود الخصم"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, flex: 1, textAlign: "right" }]}
          />
        </View>
        {promoError ? (
          <ThemedText type="small" style={{ color: "#EF4444", textAlign: "right", marginTop: Spacing.sm }}>
            {promoError}
          </ThemedText>
        ) : null}
        {promoSuccess ? (
          <ThemedText type="small" style={{ color: "#4CAF50", textAlign: "right", marginTop: Spacing.sm }}>
            {promoSuccess}
          </ThemedText>
        ) : null}
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
            المجموع الفرعي
          </ThemedText>
          <ThemedText type="body">{formatPrice(subtotal)}</ThemedText>
        </View>
        <View style={styles.summaryRow}>
          <ThemedText type="body" style={{ color: theme.textSecondary }}>
            أجور التوصيل
          </ThemedText>
          <ThemedText type="body" style={{ color: deliveryFee > 0 ? AppColors.primary : "#4CAF50" }}>
            {isRestaurantOrder ? formatPrice(1000) : (deliveryFee > 0 ? formatPrice(deliveryFee) : "اختر المنطقة")}
          </ThemedText>
        </View>
        {promoDiscount > 0 ? (
          <View style={styles.summaryRow}>
            <ThemedText type="body" style={{ color: theme.textSecondary }}>الخصم</ThemedText>
            <ThemedText type="body" style={{ color: "#4CAF50" }}>- {formatPrice(promoDiscount)}</ThemedText>
          </View>
        ) : null}
        <View style={[styles.summaryRow, styles.totalRow]}>
          <ThemedText type="h4">المجموع الكلي</ThemedText>
          <ThemedText type="h2" style={{ color: AppColors.primary }}>
            {formatPrice(total)}
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
  dropdownButton: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  modalContent: {
    width: "100%",
    maxHeight: "60%",
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
  },
  modalTitle: {
    textAlign: "center",
    marginBottom: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  areaItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  areaItemContent: {
    flex: 1,
    alignItems: "flex-end",
  },
  areaName: {
    textAlign: "right",
    marginBottom: 2,
  },
  areaFee: {
    textAlign: "right",
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
