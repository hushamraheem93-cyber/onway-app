/**
 * The admin manual driver-assignment modal (H-65).
 *
 * `renderAssignDriverModal` moved verbatim out of AdminScreen. The mutation that
 * performs the assignment stays in AdminScreen and arrives as a prop, so there is
 * still exactly one writer for it; likewise `approvedDrivers`, which AdminScreen
 * memoises from the ungated drivers query.
 *
 * Dispatch behaviour — batching, route order, `maxBatchSize` — is untouched: this
 * modal only calls the same mutation the inline version called.
 */
import React from "react";
import { View, Pressable, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { Spacing, AppColors, FontWeight } from "@/constants/theme";
import { styles } from "@/screens/admin/adminStyles";

interface Props {
  assigningOrderId: string | null;
  setAssigningOrderId: (v: string | null) => void;
  assignError: string | null;
  setAssignError: (v: string | null) => void;
  approvedDrivers: any[];
  assignDriverMutation: any;
  theme: any;
}

function AssignDriverModalInner({
  assigningOrderId,
  setAssigningOrderId,
  assignError,
  setAssignError,
  approvedDrivers,
  assignDriverMutation,
  theme,
}: Props) {
  const renderAssignDriverModal = () => {
    if (!assigningOrderId) return null;
    return (
      <View style={styles.modalOverlay}>
        <View
          style={[
            styles.modalBox,
            { backgroundColor: theme.backgroundDefault },
          ]}
        >
          <ThemedText
            type="h4"
            style={{ textAlign: "center", marginBottom: Spacing.md }}
          >
            اختر السائق
          </ThemedText>
          {assignError ? (
            <ThemedText
              type="small"
              style={{
                color: AppColors.error,
                textAlign: "center",
                marginBottom: Spacing.sm,
              }}
            >
              {assignError}
            </ThemedText>
          ) : null}
          {approvedDrivers.length === 0 ? (
            <ThemedText
              type="body"
              style={{
                color: theme.textSecondary,
                textAlign: "center",
                marginBottom: Spacing.lg,
              }}
            >
              لا يوجد سائقون مفعّلون
            </ThemedText>
          ) : (
            approvedDrivers.map((drv) => {
              const name =
                [drv.firstName, drv.secondName].filter(Boolean).join(" ") ||
                drv.fullName ||
                drv.phoneNumber;
              return (
                <Pressable
                  key={drv.id}
                  style={[
                    styles.driverPickerRow,
                    { backgroundColor: theme.backgroundSecondary },
                  ]}
                  onPress={() => {
                    setAssignError(null);
                    assignDriverMutation.mutate({
                      orderId: assigningOrderId,
                      driverPhone: drv.phoneNumber,
                    });
                  }}
                  disabled={assignDriverMutation.isPending}
                >
                  <Feather name="user" size={18} color={AppColors.primary} />
                  <View style={{ flex: 1, marginRight: Spacing.sm }}>
                    <ThemedText
                      type="body"
                      style={{ fontWeight: FontWeight.bold }}
                    >
                      {name}
                    </ThemedText>
                    <ThemedText
                      type="small"
                      style={{ color: theme.textSecondary }}
                    >
                      {drv.phoneNumber}
                    </ThemedText>
                  </View>
                  {assignDriverMutation.isPending ? (
                    <ActivityIndicator size="small" color={AppColors.primary} />
                  ) : (
                    <Feather
                      name="chevron-left"
                      size={18}
                      color={theme.textSecondary}
                    />
                  )}
                </Pressable>
              );
            })
          )}
          <Pressable
            style={[
              styles.statusBtn,
              {
                backgroundColor: AppColors.gray500,
                marginTop: Spacing.md,
                alignSelf: "center",
                paddingHorizontal: Spacing.xl,
              },
            ]}
            onPress={() => {
              setAssigningOrderId(null);
              setAssignError(null);
            }}
          >
            <ThemedText type="small" style={{ color: AppColors.white }}>
              إلغاء
            </ThemedText>
          </Pressable>
        </View>
      </View>
    );
  };

  return renderAssignDriverModal();
}

export const AssignDriverModal = React.memo(AssignDriverModalInner);
