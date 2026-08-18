/**
 * The admin live driver-tracking modal (H-65).
 *
 * `renderTrackingModal` moved verbatim out of AdminScreen. The map HTML is still
 * built by AdminScreen (`getAdminTrackingMapHTML`) and still refreshed by the one
 * `setInterval` that lives there — this component only renders the WebView it is
 * handed, and calls back to close. It owns no polling and no state.
 */
import React from "react";
import {
  View,
  Pressable,
  Modal,
  ActivityIndicator,
  Platform,
} from "react-native";
import { WebView } from "react-native-webview";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { Spacing, AppColors } from "@/constants/theme";

interface Props {
  trackingOrderId: string | null;
  trackingMapHtml: string | null;
  trackingDriverName: string;
  trackingWebViewRef: React.RefObject<any>;
  closeTrackingModal: () => void;
}

function TrackingModalInner({
  trackingOrderId,
  trackingMapHtml,
  trackingDriverName,
  trackingWebViewRef,
  closeTrackingModal,
}: Props) {
  const renderTrackingModal = () => {
    if (!trackingOrderId) return null;
    return (
      <Modal visible animationType="slide" onRequestClose={closeTrackingModal}>
        <View style={{ flex: 1, backgroundColor: AppColors.black }}>
          <View
            style={{
              flexDirection: "row-reverse",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: AppColors.black,
              paddingHorizontal: Spacing.lg,
              paddingTop: 50,
              paddingBottom: Spacing.md,
            }}
          >
            <Pressable
              onPress={closeTrackingModal}
              style={{ padding: 8 }}
              accessibilityRole="button"
              accessibilityLabel="إغلاق التتبع"
            >
              <Feather name="x" size={24} color={AppColors.white} />
            </Pressable>
            <View
              style={{
                flexDirection: "row-reverse",
                alignItems: "center",
                gap: Spacing.sm,
              }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: AppColors.success,
                }}
              />
              <ThemedText type="h4" style={{ color: AppColors.white }}>
                تتبع المندوب{" "}
                {trackingDriverName ? `— ${trackingDriverName}` : ""}
              </ThemedText>
            </View>
          </View>
          {Platform.OS === "web" ? (
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="smartphone" size={48} color={AppColors.primary} />
              <ThemedText
                type="body"
                style={{
                  color: AppColors.white,
                  marginTop: Spacing.md,
                  textAlign: "center",
                  paddingHorizontal: Spacing.xl,
                }}
              >
                التتبع المباشر متاح في تطبيق الجوال فقط
              </ThemedText>
            </View>
          ) : trackingMapHtml ? (
            <WebView
              ref={trackingWebViewRef}
              source={{ html: trackingMapHtml }}
              style={{ flex: 1 }}
              javaScriptEnabled
              originWhitelist={["*"]}
              scrollEnabled={false}
            />
          ) : (
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ActivityIndicator size="large" color={AppColors.primary} />
              <ThemedText
                type="body"
                style={{ color: AppColors.white, marginTop: Spacing.md }}
              >
                جاري تحديد موقع المندوب...
              </ThemedText>
            </View>
          )}
        </View>
      </Modal>
    );
  };

  return renderTrackingModal();
}

export const TrackingModal = React.memo(TrackingModalInner);
