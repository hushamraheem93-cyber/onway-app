import React, { useState } from "react";
import { View, StyleSheet, Modal, Pressable, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { getApiUrl } from "@/lib/query-client";
import { AppColors, FontFamily, Shadows } from "@/constants/theme";

// Auto-popup shown after an order is delivered so the customer can rate the driver
// (1–5 stars, skippable). Posts to /api/orders/:id/rate-driver. onDone fires whether
// the user rated or skipped, so the caller can mark this order handled and not re-ask.
export function DriverRatingModal({
  visible,
  orderId,
  driverName,
  authHeader,
  onDone,
}: {
  visible: boolean;
  orderId: string;
  driverName?: string;
  authHeader?: Record<string, string>;
  onDone: (rated: boolean) => void;
}) {
  const [stars, setStars] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (stars < 1 || submitting) return;
    setSubmitting(true);
    try {
      await fetch(new URL(`/api/orders/${orderId}/rate-driver`, getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(authHeader || {}) },
        body: JSON.stringify({ rating: stars }),
      });
    } catch {
      // Silent: rating is best-effort; never block the customer.
    } finally {
      setSubmitting(false);
      setStars(0);
      onDone(true);
    }
  };

  const skip = () => {
    setStars(0);
    onDone(false);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={skip}>
      <View style={s.overlay}>
        <View style={s.card}>
          <View style={s.iconCircle}>
            <Feather name="check" size={28} color={AppColors.white} />
          </View>
          <ThemedText style={s.title}>تم توصيل طلبك</ThemedText>
          <ThemedText style={s.subtitle}>
            كيف كانت خدمة {driverName ? `المندوب ${driverName}` : "المندوب"}؟
          </ThemedText>

          <View style={s.starsRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => setStars(n)} hitSlop={6} accessibilityRole="button">
                <Feather
                  name="star"
                  size={38}
                  color={n <= stars ? "#F59E0B" : AppColors.gray300}
                  style={{ marginHorizontal: 4 }}
                />
              </Pressable>
            ))}
          </View>

          <Pressable
            style={[s.submitBtn, { opacity: stars < 1 || submitting ? 0.5 : 1 }]}
            onPress={submit}
            disabled={stars < 1 || submitting}
            accessibilityRole="button"
          >
            {submitting ? (
              <ActivityIndicator color={AppColors.white} />
            ) : (
              <ThemedText style={s.submitText}>إرسال التقييم</ThemedText>
            )}
          </Pressable>

          <Pressable onPress={skip} hitSlop={8} accessibilityRole="button">
            <ThemedText style={s.skipText}>تخطّي</ThemedText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: AppColors.white,
    borderRadius: 22,
    padding: 24,
    alignItems: "center",
    ...Shadows.lg,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: AppColors.success,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: { fontFamily: FontFamily.cairoBold, fontSize: 18, color: AppColors.gray800 },
  subtitle: {
    fontFamily: FontFamily.tajawal,
    fontSize: 14,
    color: AppColors.gray600,
    textAlign: "center",
    marginTop: 6,
  },
  starsRow: { flexDirection: "row-reverse", marginVertical: 20 },
  submitBtn: {
    backgroundColor: AppColors.primary,
    borderRadius: 14,
    paddingVertical: 13,
    width: "100%",
    alignItems: "center",
  },
  submitText: { fontFamily: FontFamily.cairoBold, fontSize: 15, color: AppColors.white },
  skipText: { fontFamily: FontFamily.tajawal, fontSize: 14, color: AppColors.gray500, marginTop: 14 },
});
