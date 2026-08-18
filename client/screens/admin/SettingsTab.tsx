/**
 * The admin "الإعدادات" (settings) tab (H-65).
 *
 * `renderSettingsTab` moved verbatim out of AdminScreen. This is the tab that
 * carries the D-3 delivery-pricing card, the driver-payout rule, the auto-suspend
 * threshold, the max-batch-size control and the H-64 security/change-password
 * card — none of which changed here. Same inputs, same validation, same API
 * calls, same saved values.
 *
 * It has the widest prop surface of the extracted tabs (its controls are backed
 * by a lot of separate parent state), but it also uses zero shared styles, so
 * lifting it is a pure scope change.
 *
 * Memoised: settings is a form-heavy tab, and before this split every keystroke
 * anywhere else in the panel re-rendered all 815 lines of it.
 */
import React from "react";
import {
  View,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { Spacing, BorderRadius, AppColors } from "@/constants/theme";
import { formatPrice } from "@/constants/currency";
import { getApiUrl } from "@/lib/query-client";
import { splitDeliveryFee, driverSharePercent } from "@shared/deliveryPricing";

interface Props {
  feesSettings?: { serviceFee: number };
  refetchFees: () => void;
  serviceFeeInput: string;
  setServiceFeeInput: (v: string) => void;
  isSavingFee: boolean;
  setIsSavingFee: (v: boolean) => void;
  deliveryAreas: any[];
  dpRestaurantShare: string;
  setDpRestaurantShare: (v: string) => void;
  dpShoppingShare: string;
  setDpShoppingShare: (v: string) => void;
  saveDeliveryPricing: () => void;
  isSavingDeliveryPricing: boolean;
  payoutRuleType: "flat" | "percent";
  setPayoutRuleType: (v: "flat" | "percent") => void;
  payoutFlatRestaurant: string;
  setPayoutFlatRestaurant: (v: string) => void;
  payoutFlatDefault: string;
  setPayoutFlatDefault: (v: string) => void;
  payoutPercent: string;
  setPayoutPercent: (v: string) => void;
  saveDriverPayoutRule: () => void;
  isSavingPayout: boolean;
  autoSuspendInput: string;
  setAutoSuspendInput: (v: string) => void;
  saveAutoSuspendThreshold: () => void;
  isSavingSuspend: boolean;
  maxBatchInput: number;
  saveMaxBatchSize: (v: number) => void;
  isSavingMaxBatch: boolean;
  emergencyRedistribute: () => void;
  isRedistributing: boolean;
  handleAdminLogout: () => void;
  queryClient: any;
  theme: any;
}

function SettingsTabInner({
  feesSettings,
  refetchFees,
  serviceFeeInput,
  setServiceFeeInput,
  isSavingFee,
  setIsSavingFee,
  deliveryAreas,
  dpRestaurantShare,
  setDpRestaurantShare,
  dpShoppingShare,
  setDpShoppingShare,
  saveDeliveryPricing,
  isSavingDeliveryPricing,
  payoutRuleType,
  setPayoutRuleType,
  payoutFlatRestaurant,
  setPayoutFlatRestaurant,
  payoutFlatDefault,
  setPayoutFlatDefault,
  payoutPercent,
  setPayoutPercent,
  saveDriverPayoutRule,
  isSavingPayout,
  autoSuspendInput,
  setAutoSuspendInput,
  saveAutoSuspendThreshold,
  isSavingSuspend,
  maxBatchInput,
  saveMaxBatchSize,
  isSavingMaxBatch,
  emergencyRedistribute,
  isRedistributing,
  handleAdminLogout,
  queryClient,
  theme,
}: Props) {
  const renderSettingsTab = () => {
    const currentFee = feesSettings?.serviceFee ?? 500;
    const handleSaveFee = async () => {
      const parsed = parseInt(serviceFeeInput, 10);
      if (isNaN(parsed) || parsed < 0) {
        Alert.alert("خطأ", "الرجاء إدخال قيمة صحيحة");
        return;
      }
      setIsSavingFee(true);
      try {
        const res = await fetch(`${getApiUrl()}/api/admin/settings/fees`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ serviceFee: parsed }),
        });
        if (!res.ok) throw new Error("failed");
        await refetchFees();
        queryClient.invalidateQueries({ queryKey: ["/api/settings/fees"] });
        setServiceFeeInput("");
        Alert.alert("تم", "تم تحديث رسوم الخدمة بنجاح");
      } catch {
        Alert.alert("خطأ", "فشل تحديث رسوم الخدمة");
      } finally {
        setIsSavingFee(false);
      }
    };

    return (
      <View style={{ gap: Spacing.lg }}>
        <ThemedText
          style={{
            fontFamily: "Cairo_700Bold",
            fontSize: 18,
            textAlign: "right",
          }}
        >
          إعدادات التطبيق
        </ThemedText>

        <View
          style={{
            backgroundColor: theme.backgroundSecondary,
            borderRadius: BorderRadius.lg,
            padding: Spacing.lg,
            gap: Spacing.md,
          }}
        >
          <View
            style={{
              flexDirection: "row-reverse",
              alignItems: "center",
              gap: Spacing.sm,
            }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: "#F59E0B20",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="dollar-sign" size={20} color={AppColors.warning} />
            </View>
            <View style={{ flex: 1, alignItems: "flex-end" }}>
              <ThemedText style={{ fontFamily: "Cairo_700Bold", fontSize: 15 }}>
                رسوم الخدمة
              </ThemedText>
              <ThemedText
                style={{
                  fontFamily: "Cairo_400Regular",
                  fontSize: 13,
                  color: theme.textSecondary,
                }}
              >
                القيمة الحالية: {formatPrice(currentFee)}
              </ThemedText>
            </View>
          </View>

          <View
            style={{
              flexDirection: "row-reverse",
              gap: Spacing.sm,
              alignItems: "center",
            }}
          >
            <TextInput
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: BorderRadius.md,
                padding: Spacing.md,
                fontFamily: "Cairo_400Regular",
                fontSize: 15,
                color: theme.text,
                backgroundColor: theme.backgroundDefault,
                textAlign: "right",
              }}
              placeholder="أدخل القيمة الجديدة (دينار)"
              placeholderTextColor={theme.textSecondary}
              keyboardType="numeric"
              value={serviceFeeInput}
              onChangeText={setServiceFeeInput}
              testID="input-service-fee"
            />
            <Pressable
              accessibilityRole="button"
              onPress={handleSaveFee}
              disabled={isSavingFee || serviceFeeInput.trim() === ""}
              style={{
                backgroundColor:
                  isSavingFee || serviceFeeInput.trim() === ""
                    ? theme.border
                    : AppColors.warning,
                borderRadius: BorderRadius.md,
                paddingHorizontal: Spacing.lg,
                paddingVertical: Spacing.md,
                alignItems: "center",
                justifyContent: "center",
              }}
              testID="button-save-service-fee"
            >
              {isSavingFee ? (
                <ActivityIndicator size="small" color={AppColors.white} />
              ) : (
                <ThemedText
                  style={{
                    fontFamily: "Cairo_700Bold",
                    fontSize: 14,
                    color: AppColors.white,
                  }}
                >
                  حفظ
                </ThemedText>
              )}
            </Pressable>
          </View>
        </View>

        {/* Electronic payment removed — the app is cash-on-delivery only. The backend
            onlinePaymentEnabled flag is kept so the toggle can be restored later. */}

        {/* Sign out (H-64 / A-1) */}
        <Pressable
          accessibilityRole="button"
          onPress={handleAdminLogout}
          style={{
            backgroundColor: theme.backgroundSecondary,
            borderRadius: BorderRadius.lg,
            padding: Spacing.lg,
            flexDirection: "row-reverse",
            alignItems: "center",
            gap: Spacing.sm,
            borderWidth: 1,
            borderColor: "#EF444440",
          }}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: "#EF444420",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name="log-out" size={20} color="#EF4444" />
          </View>
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <ThemedText
              style={{
                fontFamily: "Cairo_700Bold",
                fontSize: 15,
                color: "#EF4444",
              }}
            >
              تسجيل الخروج
            </ThemedText>
            <ThemedText
              style={{
                fontFamily: "Cairo_400Regular",
                fontSize: 13,
                color: theme.textSecondary,
              }}
            >
              يُنهي الجلسة على الخادم أيضاً
            </ThemedText>
          </View>
        </Pressable>

        {/* Delivery Pricing + revenue split (D-3) */}
        <View
          style={{
            backgroundColor: theme.backgroundSecondary,
            borderRadius: BorderRadius.lg,
            padding: Spacing.lg,
            gap: Spacing.md,
          }}
        >
          <View
            style={{
              flexDirection: "row-reverse",
              alignItems: "center",
              gap: Spacing.sm,
            }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: "#0891B220",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="percent" size={20} color="#0891B2" />
            </View>
            <View style={{ flex: 1, alignItems: "flex-end" }}>
              <ThemedText style={{ fontFamily: "Cairo_700Bold", fontSize: 15 }}>
                تقسيم أجرة التوصيل
              </ThemedText>
              <ThemedText
                style={{
                  fontFamily: "Cairo_400Regular",
                  fontSize: 13,
                  color: theme.textSecondary,
                }}
              >
                الأجرة من مناطق التوصيل · حصة السائق = 100٪ − حصة التطبيق
              </ThemedText>
            </View>
          </View>

          {[
            {
              key: "restaurant" as const,
              label: "مطاعم",
              share: dpRestaurantShare,
              setShare: setDpRestaurantShare,
            },
            {
              key: "shopping" as const,
              label: "تسوّق",
              share: dpShoppingShare,
              setShare: setDpShoppingShare,
            },
          ].map((row) => {
            const sharePct = parseInt(row.share, 10);
            const valid =
              Number.isFinite(sharePct) && sharePct >= 0 && sharePct <= 100;
            return (
              <View key={row.key} style={{ gap: Spacing.xs }}>
                <ThemedText
                  style={{
                    fontFamily: "Cairo_700Bold",
                    fontSize: 14,
                    textAlign: "right",
                  }}
                >
                  {row.label}
                </ThemedText>
                <TextInput
                  style={{
                    borderWidth: 1,
                    borderColor: theme.border,
                    borderRadius: BorderRadius.md,
                    padding: Spacing.md,
                    fontFamily: "Cairo_400Regular",
                    fontSize: 14,
                    color: theme.text,
                    backgroundColor: theme.backgroundDefault,
                    textAlign: "right",
                  }}
                  placeholder="حصة التطبيق %"
                  placeholderTextColor={theme.textSecondary}
                  keyboardType="numeric"
                  value={row.share}
                  onChangeText={row.setShare}
                />
                <ThemedText
                  style={{
                    fontFamily: "Cairo_400Regular",
                    fontSize: 12.5,
                    color: valid ? theme.textSecondary : "#EF4444",
                    textAlign: "right",
                  }}
                >
                  {valid
                    ? `حصة السائق ${driverSharePercent(sharePct)}٪ (تُحسب تلقائياً)`
                    : "أدخل نسبة بين 0 و100"}
                </ThemedText>
              </View>
            );
          })}

          {/* What each configured area would actually pay out. The fees come from
              the SAME /api/admin/delivery-areas the server prices from. */}
          <ThemedText
            style={{
              fontFamily: "Cairo_700Bold",
              fontSize: 13,
              textAlign: "right",
              marginTop: Spacing.sm,
            }}
          >
            الأثر على كل منطقة
          </ThemedText>
          {deliveryAreas.length === 0 ? (
            <ThemedText
              style={{
                fontFamily: "Cairo_400Regular",
                fontSize: 12.5,
                color: theme.textSecondary,
                textAlign: "right",
              }}
            >
              لا توجد مناطق توصيل
            </ThemedText>
          ) : (
            [...deliveryAreas]
              .sort((a, b) => (a.fee || 0) - (b.fee || 0))
              .map((area) => {
                const r = splitDeliveryFee(
                  area.fee,
                  parseInt(dpRestaurantShare, 10),
                );
                const sh = splitDeliveryFee(
                  area.fee,
                  parseInt(dpShoppingShare, 10),
                );
                return (
                  <View
                    key={area.id}
                    style={{
                      borderTopWidth: 1,
                      borderTopColor: theme.border,
                      paddingVertical: Spacing.xs,
                    }}
                  >
                    <ThemedText
                      style={{
                        fontFamily: "Cairo_700Bold",
                        fontSize: 12.5,
                        textAlign: "right",
                      }}
                    >
                      {area.name} — {formatPrice(area.fee)}
                    </ThemedText>
                    <ThemedText
                      style={{
                        fontFamily: "Cairo_400Regular",
                        fontSize: 12,
                        color: theme.textSecondary,
                        textAlign: "right",
                      }}
                    >
                      مطاعم: التطبيق {formatPrice(r.appShare)} · السائق{" "}
                      {formatPrice(r.driverEarning)}
                    </ThemedText>
                    <ThemedText
                      style={{
                        fontFamily: "Cairo_400Regular",
                        fontSize: 12,
                        color: theme.textSecondary,
                        textAlign: "right",
                      }}
                    >
                      تسوّق: التطبيق {formatPrice(sh.appShare)} · السائق{" "}
                      {formatPrice(sh.driverEarning)}
                    </ThemedText>
                  </View>
                );
              })
          )}

          <Pressable
            accessibilityRole="button"
            onPress={saveDeliveryPricing}
            disabled={isSavingDeliveryPricing}
            style={{
              backgroundColor: isSavingDeliveryPricing
                ? theme.border
                : "#0891B2",
              borderRadius: BorderRadius.md,
              paddingVertical: Spacing.md,
              alignItems: "center",
            }}
          >
            {isSavingDeliveryPricing ? (
              <ActivityIndicator color={AppColors.white} />
            ) : (
              <ThemedText
                style={{
                  fontFamily: "Cairo_700Bold",
                  fontSize: 14,
                  color: AppColors.white,
                }}
              >
                حفظ تقسيم الأجرة
              </ThemedText>
            )}
          </Pressable>
        </View>

        {/* Driver Payout Rule */}
        <View
          style={{
            backgroundColor: theme.backgroundSecondary,
            borderRadius: BorderRadius.lg,
            padding: Spacing.lg,
            gap: Spacing.md,
          }}
        >
          <View
            style={{
              flexDirection: "row-reverse",
              alignItems: "center",
              gap: Spacing.sm,
            }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: "#3B82F620",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="truck" size={20} color="#3B82F6" />
            </View>
            <View style={{ flex: 1, alignItems: "flex-end" }}>
              <ThemedText style={{ fontFamily: "Cairo_700Bold", fontSize: 15 }}>
                مكافأة السائق لكل رحلة
              </ThemedText>
              <ThemedText
                style={{
                  fontFamily: "Cairo_400Regular",
                  fontSize: 13,
                  color: theme.textSecondary,
                }}
              >
                {payoutRuleType === "flat"
                  ? `ثابت: مطعم ${formatPrice(parseInt(payoutFlatRestaurant, 10) || 750)} / عام ${formatPrice(parseInt(payoutFlatDefault, 10) || 2000)}`
                  : `نسبة ${payoutPercent}% من التوصيل`}
              </ThemedText>
            </View>
          </View>
          {/* Payout type selector */}
          <View style={{ flexDirection: "row-reverse", gap: Spacing.sm }}>
            {(["flat", "percent"] as const).map((t) => (
              <Pressable
                accessibilityRole="button"
                key={t}
                onPress={() => setPayoutRuleType(t)}
                style={{
                  flex: 1,
                  paddingVertical: Spacing.sm,
                  borderRadius: BorderRadius.md,
                  alignItems: "center",
                  backgroundColor:
                    payoutRuleType === t ? "#3B82F6" : theme.backgroundDefault,
                  borderWidth: 1,
                  borderColor: payoutRuleType === t ? "#3B82F6" : theme.border,
                }}
              >
                <ThemedText
                  style={{
                    fontFamily: "Cairo_700Bold",
                    fontSize: 13,
                    color: payoutRuleType === t ? AppColors.white : theme.text,
                  }}
                >
                  {t === "flat" ? "مبلغ ثابت" : "نسبة %"}
                </ThemedText>
              </Pressable>
            ))}
          </View>
          {payoutRuleType === "flat" ? (
            <View style={{ gap: Spacing.sm }}>
              <TextInput
                style={{
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: BorderRadius.md,
                  padding: Spacing.md,
                  fontFamily: "Cairo_400Regular",
                  fontSize: 14,
                  color: theme.text,
                  backgroundColor: theme.backgroundDefault,
                  textAlign: "right",
                }}
                placeholder="مكافأة طلبات المطاعم (دينار)"
                placeholderTextColor={theme.textSecondary}
                keyboardType="numeric"
                value={payoutFlatRestaurant}
                onChangeText={setPayoutFlatRestaurant}
              />
              <TextInput
                style={{
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: BorderRadius.md,
                  padding: Spacing.md,
                  fontFamily: "Cairo_400Regular",
                  fontSize: 14,
                  color: theme.text,
                  backgroundColor: theme.backgroundDefault,
                  textAlign: "right",
                }}
                placeholder="مكافأة التوصيل العام (دينار)"
                placeholderTextColor={theme.textSecondary}
                keyboardType="numeric"
                value={payoutFlatDefault}
                onChangeText={setPayoutFlatDefault}
              />
            </View>
          ) : (
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: BorderRadius.md,
                padding: Spacing.md,
                fontFamily: "Cairo_400Regular",
                fontSize: 14,
                color: theme.text,
                backgroundColor: theme.backgroundDefault,
                textAlign: "right",
              }}
              placeholder="النسبة % من رسوم التوصيل"
              placeholderTextColor={theme.textSecondary}
              keyboardType="numeric"
              value={payoutPercent}
              onChangeText={setPayoutPercent}
            />
          )}
          <Pressable
            accessibilityRole="button"
            onPress={saveDriverPayoutRule}
            disabled={isSavingPayout}
            style={{
              backgroundColor: isSavingPayout ? theme.border : "#3B82F6",
              borderRadius: BorderRadius.md,
              paddingVertical: Spacing.md,
              alignItems: "center",
            }}
          >
            {isSavingPayout ? (
              <ActivityIndicator size="small" color={AppColors.white} />
            ) : (
              <ThemedText
                style={{
                  fontFamily: "Cairo_700Bold",
                  fontSize: 14,
                  color: AppColors.white,
                }}
              >
                حفظ
              </ThemedText>
            )}
          </Pressable>
        </View>

        {/* Auto-suspend Threshold */}
        <View
          style={{
            backgroundColor: theme.backgroundSecondary,
            borderRadius: BorderRadius.lg,
            padding: Spacing.lg,
            gap: Spacing.md,
          }}
        >
          <View
            style={{
              flexDirection: "row-reverse",
              alignItems: "center",
              gap: Spacing.sm,
            }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: "#EF444420",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="shield-off" size={20} color="#EF4444" />
            </View>
            <View style={{ flex: 1, alignItems: "flex-end" }}>
              <ThemedText style={{ fontFamily: "Cairo_700Bold", fontSize: 15 }}>
                حد الحجب التلقائي للسائق
              </ThemedText>
              <ThemedText
                style={{
                  fontFamily: "Cairo_400Regular",
                  fontSize: 13,
                  color: theme.textSecondary,
                }}
              >
                الحد الحالي:{" "}
                {formatPrice(parseInt(autoSuspendInput, 10) || 100000)}
              </ThemedText>
            </View>
          </View>
          <View
            style={{
              flexDirection: "row-reverse",
              gap: Spacing.sm,
              alignItems: "center",
            }}
          >
            <TextInput
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: BorderRadius.md,
                padding: Spacing.md,
                fontFamily: "Cairo_400Regular",
                fontSize: 15,
                color: theme.text,
                backgroundColor: theme.backgroundDefault,
                textAlign: "right",
              }}
              placeholder="الحد بالدينار العراقي"
              placeholderTextColor={theme.textSecondary}
              keyboardType="numeric"
              value={autoSuspendInput}
              onChangeText={setAutoSuspendInput}
            />
            <Pressable
              accessibilityRole="button"
              onPress={saveAutoSuspendThreshold}
              disabled={isSavingSuspend}
              style={{
                backgroundColor: isSavingSuspend ? theme.border : "#EF4444",
                borderRadius: BorderRadius.md,
                paddingHorizontal: Spacing.lg,
                paddingVertical: Spacing.md,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {isSavingSuspend ? (
                <ActivityIndicator size="small" color={AppColors.white} />
              ) : (
                <ThemedText
                  style={{
                    fontFamily: "Cairo_700Bold",
                    fontSize: 14,
                    color: AppColors.white,
                  }}
                >
                  حفظ
                </ThemedText>
              )}
            </Pressable>
          </View>
        </View>

        {/* Max batch size (dispatch A3) */}
        <View
          style={{
            backgroundColor: theme.backgroundSecondary,
            borderRadius: BorderRadius.lg,
            padding: Spacing.lg,
            gap: Spacing.md,
          }}
        >
          <View
            style={{
              flexDirection: "row-reverse",
              alignItems: "center",
              gap: Spacing.sm,
            }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: "#7C3AED20",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="layers" size={20} color="#7C3AED" />
            </View>
            <View style={{ flex: 1, alignItems: "flex-end" }}>
              <ThemedText style={{ fontFamily: "Cairo_700Bold", fontSize: 15 }}>
                الحد الأقصى لطلبات السائق
              </ThemedText>
              <ThemedText
                style={{
                  fontFamily: "Cairo_400Regular",
                  fontSize: 13,
                  color: theme.textSecondary,
                  textAlign: "right",
                }}
              >
                أقصى عدد طلبات في رحلة واحدة (لا تُدمج إلا الطلبات المتوافقة)
              </ThemedText>
            </View>
          </View>
          <View style={{ flexDirection: "row-reverse", gap: Spacing.sm }}>
            {[1, 2, 3, 4].map((n) => (
              <Pressable
                accessibilityRole="button"
                key={n}
                onPress={() => saveMaxBatchSize(n)}
                disabled={isSavingMaxBatch}
                style={{
                  flex: 1,
                  backgroundColor:
                    maxBatchInput === n ? "#7C3AED" : theme.backgroundDefault,
                  borderWidth: 1,
                  borderColor: maxBatchInput === n ? "#7C3AED" : theme.border,
                  borderRadius: BorderRadius.md,
                  paddingVertical: Spacing.md,
                  alignItems: "center",
                }}
              >
                <ThemedText
                  style={{
                    fontFamily: "Cairo_700Bold",
                    fontSize: 16,
                    color: maxBatchInput === n ? AppColors.white : theme.text,
                  }}
                >
                  {n}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Emergency redistribute (dispatch A4) */}
        <View
          style={{
            backgroundColor: theme.backgroundSecondary,
            borderRadius: BorderRadius.lg,
            padding: Spacing.lg,
            gap: Spacing.md,
          }}
        >
          <View
            style={{
              flexDirection: "row-reverse",
              alignItems: "center",
              gap: Spacing.sm,
            }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: "#EF444420",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="shuffle" size={20} color="#EF4444" />
            </View>
            <View style={{ flex: 1, alignItems: "flex-end" }}>
              <ThemedText style={{ fontFamily: "Cairo_700Bold", fontSize: 15 }}>
                إعادة توزيع طارئة
              </ThemedText>
              <ThemedText
                style={{
                  fontFamily: "Cairo_400Regular",
                  fontSize: 13,
                  color: theme.textSecondary,
                  textAlign: "right",
                }}
              >
                تُلغى الدفعات غير المقبولة وتُعاد للتوزيع الذكي (لا تتأثر
                الدفعات قيد التوصيل)
              </ThemedText>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={emergencyRedistribute}
            disabled={isRedistributing}
            style={{
              backgroundColor: isRedistributing ? theme.border : "#EF4444",
              borderRadius: BorderRadius.md,
              paddingVertical: Spacing.md,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {isRedistributing ? (
              <ActivityIndicator size="small" color={AppColors.white} />
            ) : (
              <ThemedText
                style={{
                  fontFamily: "Cairo_700Bold",
                  fontSize: 14,
                  color: AppColors.white,
                }}
              >
                إعادة التوزيع الآن
              </ThemedText>
            )}
          </Pressable>
        </View>
      </View>
    );
  };

  return renderSettingsTab();
}

export const SettingsTab = React.memo(SettingsTabInner);
