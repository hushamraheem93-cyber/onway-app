import React, { useState, useRef } from "react";
import { StyleSheet, View, TextInput, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";

import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { GradientBackground } from "@/components/GradientBackground";
import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { SectionTitle } from "@/components/checkout/SectionTitle";
import { AreaPickerModal } from "@/components/checkout/AreaPickerModal";
import { SavedAddressPicker } from "@/components/checkout/SavedAddressPicker";
import { PromoCodeInput } from "@/components/checkout/PromoCodeInput";
import { PaymentMethodsCard } from "@/components/checkout/PaymentMethodsCard";
import { OrderSummaryCard } from "@/components/checkout/OrderSummaryCard";
import { ErrorModal } from "@/components/checkout/ErrorModal";

import { useTheme } from "@/hooks/useTheme";
import {
  Spacing,
  BorderRadius,
  AppColors,
  Shadows,
  FontWeight,
} from "@/constants/theme";
import { formatPrice } from "@/constants/currency";
import { getStoreClosure, CLOSURE_MESSAGE } from "@/lib/storeStatus";
import {
  canStartCheckout,
  GUEST_BLOCKED_TITLE,
  GUEST_CHECKOUT_MESSAGE,
  GUEST_SUBMIT_MESSAGE,
} from "@/lib/guestGuard";
import { useCart } from "@/context/CartContext";
import { useOrders } from "@/context/OrderContext";
import { useAuth } from "@/context/AuthContext";
import { useSystemSettings } from "@/context/SystemSettingsContext";
import { useLocation } from "@/context/LocationContext";
import { getApiUrl } from "@/lib/query-client";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface DeliveryArea {
  id: string;
  name: string;
  fee: number;
  isActive: boolean;
}

// Consolidated error state — canRetry=true shows a retry button in the modal.
interface ErrorState {
  message: string;
  canRetry: boolean;
}

export default function CheckoutScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const { items, getTotal, clearCart, cartVendorId } = useCart();
  const { addOrder } = useOrders();
  const { phoneNumber, userProfile, customerToken, isGuest, exitGuestMode } =
    useAuth();
  const { savedLocation } = useLocation();
  const { settings: systemSettings } = useSystemSettings();

  const { data: deliveryAreas = [] } = useQuery<DeliveryArea[]>({
    queryKey: ["/api/delivery-areas"],
    staleTime: 0,
    refetchOnMount: true,
  });

  const { data: feesData } = useQuery<{ serviceFee: number }>({
    queryKey: ["/api/settings/fees"],
  });

  // Form fields
  const [customerName, setCustomerName] = useState(userProfile?.fullName || "");
  const [phone, setPhone] = useState(phoneNumber || "");
  const [selectedArea, setSelectedArea] = useState("");
  const [address, setAddress] = useState("");
  const [landmark, setLandmark] = useState("");
  const [notes, setNotes] = useState("");

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAreaPicker, setShowAreaPicker] = useState(false);
  const [error, setError] = useState<ErrorState | null>(null);

  // Promo code
  const [promoCode, setPromoCode] = useState("");
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [promoError, setPromoError] = useState("");
  const [promoSuccess, setPromoSuccess] = useState("");
  const [isApplyingPromo, setIsApplyingPromo] = useState(false);
  const [appliedPromoCode, setAppliedPromoCode] = useState("");

  // Saved addresses
  const [savedAddresses, setSavedAddresses] = useState<
    {
      id: string;
      title: string;
      region: string;
      address: string;
      isDefault?: boolean;
    }[]
  >([]);

  // Refs — don't need to trigger re-renders
  const lastOrderPayloadRef = useRef<any>(null);
  const locationAutoFilledRef = useRef(false);
  const [selectedLocation, setSelectedLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  // Sync full name from profile on mount
  React.useEffect(() => {
    if (userProfile?.fullName && !customerName)
      setCustomerName(userProfile.fullName);
  }, [userProfile?.fullName]);

  // Load saved addresses
  React.useEffect(() => {
    if (!phoneNumber) return;
    (async () => {
      try {
        const res = await fetch(
          new URL(
            `/api/users/${encodeURIComponent(phoneNumber)}/addresses`,
            getApiUrl(),
          ).toString(),
          {
            headers: customerToken
              ? { Authorization: `Bearer ${customerToken}` }
              : {},
          },
        );
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.addresses)) setSavedAddresses(data.addresses);
        }
      } catch {}
    })();
  }, [phoneNumber, customerToken]);

  // Auto-fill address from saved GPS location (once)
  React.useEffect(() => {
    if (!savedLocation || locationAutoFilledRef.current) return;
    locationAutoFilledRef.current = true;
    setSelectedLocation({
      latitude: savedLocation.latitude,
      longitude: savedLocation.longitude,
    });
    if (savedLocation.address) {
      setAddress(savedLocation.address);
      const lower = savedLocation.address.toLowerCase();
      const match = deliveryAreas.find((a) => {
        const n = a.name.toLowerCase();
        return (
          lower.includes(n) || n.includes(lower.split("،")[0]?.trim() || "")
        );
      });
      if (match) setSelectedArea(match.id);
    }
  }, [savedLocation, deliveryAreas]);

  // Fetch vendor info for minOrder check
  const { data: allStores = [] } = useQuery<any[]>({
    queryKey: ["/api/stores"],
    staleTime: 5 * 60 * 1000,
    select: (data: any) => data?.stores ?? data ?? [],
  });
  const cartVendorData = cartVendorId
    ? allStores.find((s: any) => s.id === cartVendorId)
    : null;
  const vendorMinOrder: number = cartVendorData?.minOrder ?? 0;
  // H-54: the last client-side stop before a submit the server would refuse. The
  // cart is left intact either way — the server stays the final authority, and its
  // rejection is surfaced by submitOrderPayload's catch (which does NOT clearCart).
  const checkoutClosure = getStoreClosure(cartVendorData ?? null);
  // #9: store-specific flat delivery fee override (null/undefined ⇒ use default).
  const vendorDeliveryFee: number | null =
    typeof cartVendorData?.deliveryFee === "number"
      ? cartVendorData.deliveryFee
      : null;

  // Derived values
  const subtotal = getTotal();
  const selectedAreaData = deliveryAreas.find((a) => a.id === selectedArea);
  // Precedence mirrors the server (#9): store override → the selected area's fee.
  //
  // D-3: there is no kind-dependent branch here any more, and no literal fee. The
  // screen used to carry its own hardcoded 1000 for restaurant baskets behind a
  // third `categoryId === "restaurants"` rule of its own, so what the customer was
  // SHOWN could differ from what the server CHARGED. Both sides now read the same
  // two sources — the store document and /api/delivery-areas.
  const deliveryFee =
    vendorDeliveryFee != null ? vendorDeliveryFee : selectedAreaData?.fee || 0;
  const SERVICE_FEE = feesData?.serviceFee ?? 500;
  const isBelowMinOrder = vendorMinOrder > 0 && subtotal < vendorMinOrder;

  // Handlers
  const applySavedAddress = (a: { region: string; address: string }) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAddress(a.address || "");
    const hay = `${a.region || ""} ${a.address || ""}`.toLowerCase();
    const match = deliveryAreas.find((area) => {
      const n = area.name.toLowerCase();
      return (
        hay.includes(n) || n.includes((a.region || "").toLowerCase().trim())
      );
    });
    if (match) setSelectedArea(match.id);
  };

  const applyPromoCode = async () => {
    if (!promoCode.trim()) return;
    setIsApplyingPromo(true);
    try {
      const res = await fetch(
        new URL("/api/promo-codes/apply", getApiUrl()).toString(),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: promoCode,
            userId: phoneNumber,
            cartTotal: subtotal,
          }),
        },
      );
      const data = await res.json();
      if (res.ok) {
        setPromoDiscount(data.discountAmount);
        setPromoSuccess(`تم تطبيق الخصم: ${formatPrice(data.discountAmount)}`);
        setAppliedPromoCode(promoCode.toUpperCase());
        setPromoError("");
      } else {
        setPromoError(data.error || "كود الخصم غير صالح");
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

  const submitOrderPayload = async (payload: any) => {
    setIsSubmitting(true);
    try {
      const order = await addOrder(payload);
      clearCart();
      navigation.replace("OrderConfirmation", { order });
    } catch (err: any) {
      setError({
        message: err?.message || "فشل في إنشاء الطلب",
        canRetry: err?.isNetworkError === true,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    lastOrderPayloadRef.current = null;
    // H-55: the screen below is not rendered for a guest, so this is unreachable
    // through the UI — it is here so the guard is a property of the submit path
    // itself and not of what happens to be on screen. POST /api/orders is behind
    // requireCustomerAuth and would answer 401; the cart is left untouched.
    if (!canStartCheckout({ isGuest }))
      return setError({ message: GUEST_SUBMIT_MESSAGE, canRetry: false });
    if (!customerName.trim())
      return setError({ message: "يرجى إدخال الاسم الكامل", canRetry: false });
    if (!phone.trim())
      return setError({ message: "يرجى إدخال رقم الهاتف", canRetry: false });
    if (checkoutClosure)
      return setError({
        message: `${CLOSURE_MESSAGE[checkoutClosure]} سلتك محفوظة.`,
        canRetry: false,
      });
    if (isBelowMinOrder)
      return setError({
        message: `الحد الأدنى للطلب هو ${formatPrice(vendorMinOrder)} — أضف المزيد من المنتجات`,
        canRetry: false,
      });
    if (!selectedArea)
      return setError({
        message: "يرجى اختيار منطقة التوصيل",
        canRetry: false,
      });
    if (!address.trim())
      return setError({
        message: "يرجى إدخال تفاصيل العنوان",
        canRetry: false,
      });

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const areaName = selectedAreaData?.name || "";
    const fullAddress = `${areaName} - ${address.trim()}${landmark.trim() ? ` (${landmark.trim()})` : ""}`;

    const payload: any = {
      items: [...items],
      total: subtotal + deliveryFee + SERVICE_FEE - promoDiscount,
      deliveryFee,
      serviceFee: SERVICE_FEE,
      address: fullAddress,
      region: areaName,
      customerName: customerName.trim(),
      customerPhone: phone.trim(),
      latitude: selectedLocation?.latitude,
      longitude: selectedLocation?.longitude,
    };
    if (notes.trim()) payload.notes = notes.trim();
    if (cartVendorId) payload.vendorId = cartVendorId;
    if (appliedPromoCode) {
      payload.promoCode = appliedPromoCode;
      payload.promoDiscount = promoDiscount;
    }

    lastOrderPayloadRef.current = payload;
    await submitOrderPayload(payload);
  };

  // H-55: a guest reaching this screen — from the cart button, a future call site,
  // or straight through navigation — gets the notice instead of the form. Nothing
  // is rendered that could collect an address, a phone or a note, so there is no
  // typed state for the navigator remount that follows signing in to lose. Placed
  // after every hook so hook order is stable, and it never touches the cart.
  if (!canStartCheckout({ isGuest })) {
    return (
      <View style={{ flex: 1 }}>
        <GradientBackground />
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: Spacing.xl,
            paddingTop: headerHeight,
            gap: Spacing.lg,
          }}
        >
          <Feather name="user-plus" size={48} color={AppColors.primary} />
          <ThemedText type="h3" style={{ textAlign: "center" }}>
            {GUEST_BLOCKED_TITLE}
          </ThemedText>
          <ThemedText
            type="body"
            style={{ textAlign: "center", color: theme.textSecondary }}
          >
            {GUEST_CHECKOUT_MESSAGE}
          </ThemedText>
          <Pressable
            style={{
              backgroundColor: AppColors.primary,
              paddingHorizontal: Spacing.xl,
              paddingVertical: Spacing.md,
              borderRadius: 14,
            }}
            onPress={() => exitGuestMode()}
            testID="button-guest-create-account"
            accessibilityRole="button"
          >
            <ThemedText style={{ color: AppColors.white }}>
              إنشاء حساب
            </ThemedText>
          </Pressable>
        </View>
      </View>
    );
  }

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
        <SectionTitle title="معلومات التوصيل" />

        <FormField label="الاسم الكامل">
          <TextInput
            value={customerName}
            onChangeText={setCustomerName}
            placeholder="أدخل اسمك الكامل"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text }]}
            textAlign="right"
          />
        </FormField>

        <FormField label="رقم الهاتف">
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="009647xxxxxxxxx"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text }]}
            textAlign="right"
            keyboardType="phone-pad"
          />
        </FormField>

        <SavedAddressPicker
          addresses={savedAddresses}
          activeAddress={address}
          onSelect={applySavedAddress}
        />

        {/* Area selector */}
        <FormField label="منطقة التوصيل">
          <Pressable
            onPress={() => setShowAreaPicker(true)}
            accessibilityRole="button"
            accessibilityLabel={
              selectedAreaData?.name
                ? `منطقة التوصيل: ${selectedAreaData.name}`
                : "اختر منطقة التوصيل"
            }
            accessibilityState={{ expanded: showAreaPicker }}
            style={[
              styles.dropdownButton,
              { borderColor: selectedArea ? AppColors.primary : theme.border },
              selectedArea
                ? { backgroundColor: AppColors.secondary }
                : undefined,
            ]}
          >
            <Feather
              name="chevron-down"
              size={20}
              color={theme.textSecondary}
            />
            <ThemedText
              type="body"
              style={{
                flex: 1,
                textAlign: "right",
                color: selectedArea ? AppColors.primary : theme.textSecondary,
                fontWeight: selectedArea
                  ? FontWeight.semiBold
                  : FontWeight.regular,
              }}
            >
              {selectedAreaData?.name || "اختر المنطقة"}
            </ThemedText>
          </Pressable>
        </FormField>

        <AreaPickerModal
          visible={showAreaPicker}
          areas={deliveryAreas}
          selectedAreaId={selectedArea}
          onSelect={setSelectedArea}
          onClose={() => setShowAreaPicker(false)}
        />

        {/* Address */}
        <FormField
          label="تفاصيل العنوان"
          badge={
            savedLocation ? (
              <View style={styles.badge}>
                <Feather name="map-pin" size={12} color={AppColors.primary} />
                <ThemedText
                  type="small"
                  style={{
                    color: AppColors.primary,
                    fontWeight: FontWeight.semiBold,
                    fontSize: 11,
                  }}
                >
                  من الخريطة
                </ThemedText>
              </View>
            ) : undefined
          }
        >
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
        </FormField>

        <FormField label="أقرب نقطة دالة (اختياري)">
          <TextInput
            value={landmark}
            onChangeText={setLandmark}
            placeholder="مثال: قرب جامع الرحمن، مقابل سوق الخضار"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text }]}
            textAlign="right"
          />
        </FormField>

        <FormField label="ملاحظات إضافية (اختياري)">
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
        </FormField>

        <PromoCodeInput
          code={promoCode}
          onChangeCode={setPromoCode}
          onApply={applyPromoCode}
          isApplying={isApplyingPromo}
          error={promoError}
          success={promoSuccess}
        />

        <SectionTitle title="طريقة الدفع" />
        <PaymentMethodsCard
          onlinePaymentEnabled={systemSettings.onlinePaymentEnabled}
        />

        <SectionTitle title="ملخص الطلب" />
        <OrderSummaryCard
          itemCount={items.length}
          subtotal={subtotal}
          deliveryFee={deliveryFee}
          serviceFee={SERVICE_FEE}
          promoDiscount={promoDiscount}
          feeResolved={vendorDeliveryFee != null || !!selectedArea}
        />

        <Button
          onPress={handleSubmit}
          disabled={isSubmitting}
          style={styles.submitButton}
        >
          {isSubmitting ? "جاري التأكيد..." : "تأكيد الطلب"}
        </Button>
      </KeyboardAwareScrollViewCompat>

      <ErrorModal
        message={error?.message ?? null}
        canRetry={
          error?.canRetry === true && lastOrderPayloadRef.current !== null
        }
        onDismiss={() => setError(null)}
        onRetry={() => {
          setError(null);
          submitOrderPayload(lastOrderPayloadRef.current);
        }}
      />
    </View>
  );
}

// Lightweight wrapper that provides the card chrome (background, shadow, padding)
// and an optional label + badge row above the child input.
function FormField({
  label,
  badge,
  children,
}: {
  label: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.fieldCard,
        { backgroundColor: theme.backgroundDefault },
        Shadows.sm,
      ]}
    >
      <View style={styles.labelRow}>
        <ThemedText
          type="small"
          style={[styles.label, { color: theme.textSecondary }]}
        >
          {label}
        </ThemedText>
        {badge}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fieldCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  label: {
    textAlign: "right",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: AppColors.secondary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
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
  submitButton: {
    marginTop: Spacing.xl,
    marginBottom: Spacing.xl,
  },
});
