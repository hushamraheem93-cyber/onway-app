/**
 * The admin "السائقون" (drivers) tab (H-65).
 *
 * `renderDriversTab` moved verbatim out of AdminScreen. Two mutations reach money
 * and access: the approval/suspension status change and the wallet recharge. Both
 * stay declared in AdminScreen and arrive as props, so there is still exactly one
 * definition of each and no retry was added to either.
 *
 * The drivers query itself stays ungated in AdminScreen — it feeds the tab-bar
 * badge on every tab — which is why it is not moved here.
 */
import React from "react";
import { View, Pressable, TextInput, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import {
  Spacing,
  BorderRadius,
  AppColors,
  FontWeight,
} from "@/constants/theme";
import { styles } from "@/screens/admin/adminStyles";

interface Props {
  drivers: any[];
  driversLoading: boolean;
  getDriverStatusColor: (status: string) => string;
  getDriverStatusText: (status: string) => string;
  updateDriverStatusMutation: any;
  rechargeDriver: string | null;
  setRechargeDriver: (v: string | null) => void;
  rechargeAmount: string;
  setRechargeAmount: (v: string) => void;
  rechargeWalletMutation: any;
  theme: any;
}

function DriversTabInner({
  drivers,
  driversLoading,
  getDriverStatusColor,
  getDriverStatusText,
  updateDriverStatusMutation,
  rechargeDriver,
  setRechargeDriver,
  rechargeAmount,
  setRechargeAmount,
  rechargeWalletMutation,
  theme,
}: Props) {
  const renderDriversTab = () => (
    <View>
      <ThemedText type="h4" style={styles.formTitle}>
        سائقي التوصيل ({drivers.length})
      </ThemedText>

      {driversLoading ? (
        <ActivityIndicator size="large" color={AppColors.primary} />
      ) : drivers.length === 0 ? (
        <View style={styles.formCard}>
          <ThemedText
            type="body"
            style={{ textAlign: "center", color: AppColors.gray400 }}
          >
            لا يوجد سائقين مسجلين
          </ThemedText>
        </View>
      ) : (
        drivers.map((driver) => (
          <View key={driver.id} style={styles.formCard}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: Spacing.md,
              }}
            >
              <View
                style={{
                  backgroundColor: getDriverStatusColor(driver.status) + "20",
                  paddingHorizontal: Spacing.md,
                  paddingVertical: 4,
                  borderRadius: BorderRadius.full,
                }}
              >
                <ThemedText
                  type="small"
                  style={{
                    color: getDriverStatusColor(driver.status),
                    fontWeight: FontWeight.bold,
                  }}
                >
                  {getDriverStatusText(driver.status)}
                </ThemedText>
              </View>
              <ThemedText
                type="h4"
                style={{ textAlign: "right", flex: 1, marginRight: Spacing.sm }}
              >
                {driver.fullName}
              </ThemedText>
            </View>

            <View style={{ gap: Spacing.xs, marginBottom: Spacing.md }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "flex-end",
                  gap: Spacing.sm,
                }}
              >
                <ThemedText type="body" style={{ color: AppColors.gray500 }}>
                  {driver.phoneNumber}
                </ThemedText>
                <Feather name="phone" size={16} color={AppColors.gray500} />
              </View>
              {typeof (driver as any).rating === "number" &&
              (driver as any).ratingCount ? (
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "flex-end",
                    alignItems: "center",
                    gap: Spacing.xs,
                  }}
                >
                  <ThemedText type="body" style={{ color: AppColors.gray500 }}>
                    ({(driver as any).ratingCount})
                  </ThemedText>
                  <ThemedText
                    type="body"
                    style={{ color: "#F59E0B", fontWeight: FontWeight.bold }}
                  >
                    {(driver as any).rating.toFixed(1)}
                  </ThemedText>
                  <Feather name="star" size={16} color="#F59E0B" />
                </View>
              ) : null}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "flex-end",
                  gap: Spacing.sm,
                }}
              >
                <ThemedText type="body" style={{ color: AppColors.gray500 }}>
                  {driver.firstName} {driver.secondName} {driver.thirdName}{" "}
                  {driver.fourthName}
                </ThemedText>
                <Feather name="user" size={16} color={AppColors.gray500} />
              </View>
              {driver.createdAt ? (
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "flex-end",
                    gap: Spacing.sm,
                  }}
                >
                  <ThemedText type="small" style={{ color: AppColors.gray400 }}>
                    {new Date(driver.createdAt).toLocaleDateString("ar-IQ")}
                  </ThemedText>
                  <Feather
                    name="calendar"
                    size={14}
                    color={AppColors.gray400}
                  />
                </View>
              ) : null}
            </View>

            {driver.nationalIdImage ? (
              <View style={{ marginBottom: Spacing.md }}>
                <ThemedText
                  type="body"
                  style={{
                    textAlign: "right",
                    marginBottom: Spacing.xs,
                    fontWeight: FontWeight.semiBold,
                  }}
                >
                  البطاقة الوطنية:
                </ThemedText>
                <Image
                  source={{ uri: driver.nationalIdImage }}
                  style={{
                    width: "100%",
                    height: 200,
                    borderRadius: BorderRadius.md,
                  }}
                  contentFit="contain"
                />
              </View>
            ) : null}

            {driver.driverLicenseImage ? (
              <View style={{ marginBottom: Spacing.md }}>
                <ThemedText
                  type="body"
                  style={{
                    textAlign: "right",
                    marginBottom: Spacing.xs,
                    fontWeight: FontWeight.semiBold,
                  }}
                >
                  إجازة السوق:
                </ThemedText>
                <Image
                  source={{ uri: driver.driverLicenseImage }}
                  style={{
                    width: "100%",
                    height: 200,
                    borderRadius: BorderRadius.md,
                  }}
                  contentFit="contain"
                />
              </View>
            ) : (
              <View style={{ marginBottom: Spacing.md }}>
                <ThemedText
                  type="body"
                  style={{ textAlign: "right", color: AppColors.gray400 }}
                >
                  لم يتم رفع إجازة السوق
                </ThemedText>
              </View>
            )}

            {driver.status === "pending" ? (
              <View style={{ flexDirection: "row", gap: Spacing.sm }}>
                <Pressable
                  accessibilityRole="button"
                  style={{
                    flex: 1,
                    minHeight: 48,
                    backgroundColor: AppColors.error,
                    borderRadius: BorderRadius.lg,
                    alignItems: "center",
                    justifyContent: "center",
                    paddingVertical: Spacing.md,
                  }}
                  onPress={() =>
                    updateDriverStatusMutation.mutate({
                      id: driver.id,
                      status: "rejected",
                    })
                  }
                >
                  <ThemedText
                    type="body"
                    style={{
                      color: AppColors.white,
                      fontWeight: FontWeight.semiBold,
                    }}
                  >
                    رفض
                  </ThemedText>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  style={{
                    flex: 1,
                    minHeight: 48,
                    backgroundColor: AppColors.success,
                    borderRadius: BorderRadius.lg,
                    alignItems: "center",
                    justifyContent: "center",
                    paddingVertical: Spacing.md,
                  }}
                  onPress={() =>
                    updateDriverStatusMutation.mutate({
                      id: driver.id,
                      status: "approved",
                    })
                  }
                >
                  <ThemedText
                    type="body"
                    style={{
                      color: AppColors.white,
                      fontWeight: FontWeight.semiBold,
                    }}
                  >
                    قبول
                  </ThemedText>
                </Pressable>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                style={{
                  minHeight: 48,
                  backgroundColor:
                    driver.status === "approved"
                      ? AppColors.warning
                      : AppColors.success,
                  borderRadius: BorderRadius.lg,
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: Spacing.md,
                }}
                onPress={() =>
                  updateDriverStatusMutation.mutate({
                    id: driver.id,
                    status:
                      driver.status === "approved" ? "pending" : "approved",
                  })
                }
              >
                <ThemedText
                  type="body"
                  style={{
                    color: AppColors.white,
                    fontWeight: FontWeight.semiBold,
                  }}
                >
                  {driver.status === "approved" ? "تعليق" : "قبول"}
                </ThemedText>
              </Pressable>
            )}

            <View
              style={{
                marginTop: Spacing.md,
                borderTopWidth: 1,
                borderTopColor: AppColors.divider,
                paddingTop: Spacing.md,
              }}
            >
              <View
                style={{
                  flexDirection: "row-reverse",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: Spacing.sm,
                }}
              >
                <View
                  style={{
                    flexDirection: "row-reverse",
                    alignItems: "center",
                    gap: Spacing.xs,
                  }}
                >
                  <Feather
                    name="credit-card"
                    size={16}
                    color={AppColors.primary}
                  />
                  <ThemedText
                    type="body"
                    style={{
                      fontWeight: FontWeight.semiBold,
                      textAlign: "right",
                    }}
                  >
                    المحفظة
                  </ThemedText>
                </View>
                <Pressable
                  accessibilityRole="button"
                  style={{
                    backgroundColor: AppColors.primary,
                    paddingHorizontal: Spacing.md,
                    paddingVertical: 6,
                    borderRadius: BorderRadius.md,
                  }}
                  onPress={() =>
                    setRechargeDriver(
                      rechargeDriver === driver.phoneNumber
                        ? null
                        : driver.phoneNumber,
                    )
                  }
                >
                  <ThemedText
                    type="small"
                    style={{
                      color: AppColors.white,
                      fontWeight: FontWeight.semiBold,
                    }}
                  >
                    تسجيل دفعة
                  </ThemedText>
                </Pressable>
              </View>
              {rechargeDriver === driver.phoneNumber ? (
                <View style={{ flexDirection: "row", gap: Spacing.sm }}>
                  <Pressable
                    accessibilityRole="button"
                    style={{
                      backgroundColor: AppColors.primary,
                      paddingHorizontal: Spacing.lg,
                      paddingVertical: Spacing.sm,
                      borderRadius: BorderRadius.md,
                      justifyContent: "center",
                    }}
                    onPress={() => {
                      if (rechargeAmount && Number(rechargeAmount) > 0) {
                        rechargeWalletMutation.mutate({
                          phoneNumber: driver.phoneNumber,
                          amount: Number(rechargeAmount),
                        });
                      }
                    }}
                  >
                    <ThemedText
                      type="small"
                      style={{
                        color: AppColors.white,
                        fontWeight: FontWeight.semiBold,
                      }}
                    >
                      تأكيد
                    </ThemedText>
                  </Pressable>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        flex: 1,
                        backgroundColor: theme.backgroundSecondary,
                        color: theme.text,
                        marginBottom: 0,
                      },
                    ]}
                    placeholder="المبلغ (د.ع)"
                    placeholderTextColor={theme.textSecondary}
                    keyboardType="numeric"
                    value={rechargeAmount}
                    onChangeText={setRechargeAmount}
                  />
                </View>
              ) : null}
            </View>
          </View>
        ))
      )}
    </View>
  );

  return renderDriversTab();
}

export const DriversTab = React.memo(DriversTabInner);
