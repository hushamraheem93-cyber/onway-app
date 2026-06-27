import React, { useState, useRef } from "react";
import { StyleSheet, View, TextInput, Modal, Pressable, FlatList, ActivityIndicator } from "react-native";
import Svg, { Circle } from "react-native-svg";
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
import { useLocation } from "@/context/LocationContext";
import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { getApiUrl } from "@/lib/query-client";
import { GradientBackground } from "@/components/GradientBackground";

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
  const { savedLocation } = useLocation();

  const { data: deliveryAreas = [] } = useQuery<DeliveryArea[]>({
    queryKey: ["/api/delivery-areas"],
  });

  const { data: feesData } = useQuery<{ serviceFee: number }>({
    queryKey: ["/api/settings/fees"],
  });

  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState(phoneNumber || "");
  const [selectedArea, setSelectedArea] = useState("");
  const [address, setAddress] = useState("");
  const [landmark, setLandmark] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAreaPicker, setShowAreaPicker] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isNetworkError, setIsNetworkError] = useState(false);
  const lastOrderPayloadRef = useRef<any>(null);
  const [selectedLocation, setSelectedLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [promoError, setPromoError] = useState("");
  const [promoSuccess, setPromoSuccess] = useState("");
  const [isApplyingPromo, setIsApplyingPromo] = useState(false);
  const [appliedPromoCode, setAppliedPromoCode] = useState("");
  const [locationAutoFilled, setLocationAutoFilled] = useState(false);

  React.useEffect(() => {
    if (savedLocation && !locationAutoFilled) {
      setSelectedLocation({
        latitude: savedLocation.latitude,
        longitude: savedLocation.longitude,
      });

      if (savedLocation.address) {
        setAddress(savedLocation.address);

        const addressLower = savedLocation.address.toLowerCase();
        const matchedArea = deliveryAreas.find(area => {
          const areaName = area.name.toLowerCase();
          return addressLower.includes(areaName) || areaName.includes(addressLower.split("،")[0]?.trim() || "");
        });
        if (matchedArea) {
          setSelectedArea(matchedArea.id);
        }
      }

      setLocationAutoFilled(true);
    }
  }, [savedLocation, deliveryAreas, locationAutoFilled]);

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
  const SERVICE_FEE = feesData?.serviceFee ?? 500;
  const total = subtotal + deliveryFee + SERVICE_FEE - promoDiscount;

  const submitOrderPayload = async (payload: any) => {
    setIsSubmitting(true);
    try {
      const order = await addOrder(payload);
      clearCart();
      navigation.replace("OrderConfirmation", { order });
    } catch (error: any) {
      setIsNetworkError(error?.isNetworkError === true);
      setErrorMessage(error?.message || "فشل في إنشاء الطلب");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    lastOrderPayloadRef.current = null;
    if (!customerName.trim()) {
      setErrorMessage("يرجى إدخال الاسم الكامل");
      return;
    }
    if (!phone.trim()) {
      setErrorMessage("يرجى إدخال رقم الهاتف");
      return;
    }
    if (!selectedArea) {
      setErrorMessage("يرجى اختيار منطقة التوصيل");
      return;
    }
    if (!address.trim()) {
      setErrorMessage("يرجى إدخال تفاصيل العنوان");
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const areaName = selectedAreaData?.name || "";
    const landmarkText = landmark.trim() ? ` (${landmark.trim()})` : "";
    const fullAddress = `${areaName} - ${address.trim()}${landmarkText}`;

    const orderPayload: any = {
      items: [...items],
      total,
      deliveryFee,
      serviceFee: SERVICE_FEE,
      address: fullAddress,
      region: areaName,
      customerName: customerName.trim(),
      customerPhone: phone.trim(),
      latitude: selectedLocation?.latitude,
      longitude: selectedLocation?.longitude,
    };
    if (notes.trim()) orderPayload.notes = notes.trim();
    if (appliedPromoCode) {
      orderPayload.promoCode = appliedPromoCode;
      orderPayload.promoDiscount = promoDiscount;
    }

    lastOrderPayloadRef.current = orderPayload;
    await submitOrderPayload(orderPayload);
  };

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
        <View style={styles.labelRow}>
          <ThemedText type="small" style={[styles.label, { color: theme.textSecondary }]}>
            تفاصيل العنوان
          </ThemedText>
          {savedLocation ? (
            <View style={styles.autoFilledBadge}>
              <Feather name="map-pin" size={12} color={AppColors.primary} />
              <ThemedText type="small" style={{ color: AppColors.primary, fontWeight: "600", fontSize: 11 }}>
                من الخريطة
              </ThemedText>
            </View>
          ) : null}
        </View>
        <TextInput
          value={address}
          onChangeText={setAddress}
          placeholder="أدخل تفاصيل عنوانك (الشارع، المحلة)"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, styles.multilineInput, { color: theme.text }]}
          textAlign="right"
          multiline
          numberOfLines={3}
        />
      </View>

      <View style={[styles.inputContainer, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
        <ThemedText type="small" style={[styles.label, { color: theme.textSecondary }]}>
          أقرب نقطة دالة (اختياري)
        </ThemedText>
        <TextInput
          value={landmark}
          onChangeText={setLandmark}
          placeholder="مثال: قرب جامع الرحمن، مقابل سوق الخضار"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text }]}
          textAlign="right"
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
              <ActivityIndicator size="small" color={AppColors.white} />
            ) : (
              <ThemedText type="body" style={{ color: AppColors.white, fontWeight: "600" }}>
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
          <ThemedText type="small" style={{ color: AppColors.error, textAlign: "right", marginTop: Spacing.sm }}>
            {promoError}
          </ThemedText>
        ) : null}
        {promoSuccess ? (
          <ThemedText type="small" style={{ color: AppColors.success, textAlign: "right", marginTop: Spacing.sm }}>
            {promoSuccess}
          </ThemedText>
        ) : null}
      </View>

      <ThemedText type="h3" style={styles.sectionTitle}>
        طريقة الدفع
      </ThemedText>

      <View style={[styles.paymentCard, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
        <View style={styles.paymentRow}>
          <View style={styles.paymentMethodItem}>
            <Svg width={44} height={28}>
              <Circle cx={15} cy={14} r={13} fill={AppColors.error} opacity={0.9} />
              <Circle cx={29} cy={14} r={13} fill={AppColors.warning} opacity={0.9} />
            </Svg>
            <ThemedText type="small" style={[styles.paymentLabel, { color: theme.text }]}>
              ماستر كارد
            </ThemedText>
          </View>

          <View style={styles.paymentMethodItem}>
            <View style={styles.dinarCashIcon}>
              <ThemedText type="small" style={styles.dinarCashText}>IQD</ThemedText>
            </View>
            <ThemedText type="small" style={[styles.paymentLabel, { color: theme.text }]}>
              الدينار كاش
            </ThemedText>
          </View>

          <View style={[styles.paymentMethodItem, styles.paymentMethodDisabled]}>
            <View style={[styles.cardIcon, { borderColor: theme.border }]}>
              <Feather name="credit-card" size={20} color={theme.textSecondary} />
            </View>
            <ThemedText type="small" style={[styles.paymentLabel, { color: theme.textSecondary }]}>
              بواسطة البطاقة
            </ThemedText>
            <View style={styles.comingSoonBadge}>
              <ThemedText style={styles.comingSoonText}>قريباً</ThemedText>
            </View>
          </View>
        </View>

        <View style={[styles.cashNote, { backgroundColor: AppColors.primary + "10", borderColor: AppColors.primary + "30" }]}>
          <Feather name="check-circle" size={16} color={AppColors.primary} />
          <ThemedText type="small" style={{ color: AppColors.primary, fontWeight: "600", textAlign: "right" }}>
            الدفع نقداً عند الاستلام
          </ThemedText>
        </View>
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
          <ThemedText type="body" style={{ color: deliveryFee > 0 ? AppColors.primary : AppColors.success }}>
            {isRestaurantOrder ? formatPrice(1000) : (deliveryFee > 0 ? formatPrice(deliveryFee) : "اختر المنطقة")}
          </ThemedText>
        </View>
        <View style={styles.summaryRow}>
          <ThemedText type="body" style={{ color: theme.textSecondary }}>
            نسبة الخدمة
          </ThemedText>
          <ThemedText type="body" style={{ color: AppColors.primary }}>
            {formatPrice(SERVICE_FEE)}
          </ThemedText>
        </View>
        {promoDiscount > 0 ? (
          <View style={styles.summaryRow}>
            <ThemedText type="body" style={{ color: theme.textSecondary }}>الخصم</ThemedText>
            <ThemedText type="body" style={{ color: AppColors.success }}>- {formatPrice(promoDiscount)}</ThemedText>
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

    {/* Error Modal */}
    <Modal
      visible={errorMessage !== null}
      transparent
      animationType="fade"
      onRequestClose={() => setErrorMessage(null)}
    >
      <Pressable style={styles.errorOverlay} onPress={() => setErrorMessage(null)}>
        <Pressable style={[styles.errorCard, { backgroundColor: theme.backgroundDefault }]}>
          <View style={styles.errorIconRow}>
            <Feather name="alert-circle" size={28} color={AppColors.error} />
          </View>
          <ThemedText type="h4" style={styles.errorTitle}>
            تنبيه
          </ThemedText>
          <ThemedText type="body" style={[styles.errorBody, { color: theme.textSecondary }]}>
            {errorMessage}
          </ThemedText>
          <View style={styles.errorActions}>
            <Pressable
              style={[styles.errorBtn, styles.errorBtnDismiss, { borderColor: theme.border }]}
              onPress={() => { setErrorMessage(null); setIsNetworkError(false); }}
            >
              <ThemedText type="body">إغلاق</ThemedText>
            </Pressable>
            {isNetworkError && lastOrderPayloadRef.current ? (
              <Pressable
                style={[styles.errorBtn, styles.errorBtnRetry]}
                onPress={() => {
                  setErrorMessage(null);
                  setIsNetworkError(false);
                  submitOrderPayload(lastOrderPayloadRef.current);
                }}
              >
                <ThemedText type="body" style={{ color: AppColors.white }}>إعادة المحاولة</ThemedText>
              </Pressable>
            ) : null}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
    </View>
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
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  autoFilledBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: AppColors.secondary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  input: {
    fontSize: 13,
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
    backgroundColor: AppColors.overlay,
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
    borderBottomColor: AppColors.border,
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
  paymentCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  paymentRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-around",
    alignItems: "flex-start",
    marginBottom: Spacing.md,
  },
  paymentMethodItem: {
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  paymentMethodDisabled: {
    opacity: 0.5,
  },
  paymentLabel: {
    textAlign: "center",
    fontSize: 11,
    fontWeight: "600",
  },
  dinarCashIcon: {
    width: 44,
    height: 28,
    borderRadius: 6,
    backgroundColor: AppColors.success,
    alignItems: "center",
    justifyContent: "center",
  },
  dinarCashText: {
    color: AppColors.white,
    fontWeight: "700",
    fontSize: 13,
    letterSpacing: 0.5,
  },
  cardIcon: {
    width: 44,
    height: 28,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  comingSoonBadge: {
    backgroundColor: AppColors.gray100,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  comingSoonText: {
    fontSize: 9,
    color: AppColors.gray400,
    fontWeight: "700",
  },
  cashNote: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
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
    borderTopColor: AppColors.border,
    marginTop: Spacing.sm,
    paddingTop: Spacing.lg,
  },
  submitButton: {
    marginTop: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  errorOverlay: {
    flex: 1,
    backgroundColor: AppColors.overlay,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  errorCard: {
    width: "100%",
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: "center",
  },
  errorIconRow: {
    marginBottom: Spacing.md,
  },
  errorTitle: {
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  errorBody: {
    textAlign: "center",
    lineHeight: 22,
    marginBottom: Spacing.xl,
  },
  errorActions: {
    flexDirection: "row-reverse",
    gap: Spacing.md,
    width: "100%",
  },
  errorBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  errorBtnDismiss: {
    borderWidth: 1.5,
  },
  errorBtnRetry: {
    backgroundColor: AppColors.primary,
  },
});
