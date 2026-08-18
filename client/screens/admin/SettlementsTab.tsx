/**
 * The admin "التسويات" (settlements) tab (H-65).
 *
 * `renderSettlementsTab` and its private helper `renderSettlementCard` moved
 * verbatim out of AdminScreen. The card helper was called from nowhere else, so
 * it travels with the tab and stays a local of this component rather than
 * becoming another prop.
 *
 * Nothing here was rewritten: same markup, same handlers, same Firestore/API
 * calls, same settlement maths. Only the surrounding scope changed.
 *
 * Memoised, because AdminScreen re-renders on every keystroke in every other
 * tab's forms and none of that affects settlements.
 */
import React from "react";
import {
  View,
  Pressable,
  ScrollView,
  TextInput,
  Switch,
  Modal,
  ActivityIndicator,
  Alert,
  Linking,
} from "react-native";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { Spacing, AppColors } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";

type SettleView = "requests" | "driver" | "vendor" | "config";

interface Props {
  settleView: SettleView;
  setSettleView: (v: SettleView) => void;
  settlementRequests: any[];
  settlementAccounts: any[];
  settlementConfig: any;
  saveSettlementConfig: (
    accountType: "driver" | "vendor",
    thresholdEnabled: boolean,
    thresholdAmount: number,
  ) => void;
  submitSettlement: (a: any, amount: number, requestId?: string) => void;
  openSettlementDetails: (a: any) => void;
  printSettlementReport: () => void;
  detailTarget: any | null;
  setDetailTarget: (v: any | null) => void;
  detailData: any | null;
  detailBusy: boolean;
  completeTarget: any | null;
  setCompleteTarget: (v: any | null) => void;
  completeAmount: string;
  setCompleteAmount: (v: string) => void;
  completeBusy: boolean;
  theme: any;
}

function SettlementsTabInner({
  settleView,
  setSettleView,
  settlementRequests,
  settlementAccounts,
  settlementConfig,
  saveSettlementConfig,
  submitSettlement,
  openSettlementDetails,
  printSettlementReport,
  detailTarget,
  setDetailTarget,
  detailData,
  detailBusy,
  completeTarget,
  setCompleteTarget,
  completeAmount,
  setCompleteAmount,
  completeBusy,
  theme,
}: Props) {
  const renderSettlementCard = (a: {
    accountType: "driver" | "vendor";
    accountId: string;
    accountName: string;
    outstanding: number;
    orders: number;
    lastSettlementAt?: any;
    status: string;
    requestId?: string;
  }) => {
    const fmt = (n: number) => `${(n || 0).toLocaleString("ar-IQ")} د.ع`;
    const chip =
      a.status === "settled"
        ? { bg: "#E8F7EE", fg: "#1B7A3D", txt: "🟢 الحساب مسوّى" }
        : a.status === "under_review"
          ? { bg: "#FFF9E0", fg: "#8A6D00", txt: "🟡 بانتظار التسوية" }
          : { bg: "#FFF3E6", fg: "#9A5B00", txt: "🟠 بانتظار التسوية" };
    const last = a.lastSettlementAt?.toDate?.()
      ? a.lastSettlementAt.toDate()
      : a.lastSettlementAt?._seconds
        ? new Date(a.lastSettlementAt._seconds * 1000)
        : null;
    const canSettle = a.outstanding > 0;
    const doFull = () => {
      Alert.alert(
        "تسوية كاملة",
        `تأكيد استلام ${fmt(a.outstanding)} من ${a.accountName}؟`,
        [
          { text: "إلغاء", style: "cancel" },
          {
            text: "تأكيد",
            onPress: () => submitSettlement(a, a.outstanding, a.requestId),
          },
        ],
      );
    };
    const doPartial = () => {
      setCompleteTarget(a);
      setCompleteAmount("");
    };
    return (
      <View
        key={`${a.accountType}:${a.accountId}:${a.requestId ?? ""}`}
        style={{
          borderRadius: 14,
          padding: Spacing.md,
          backgroundColor: theme.backgroundDefault,
          gap: 8,
        }}
      >
        <View
          style={{
            flexDirection: "row-reverse",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <View
            style={{
              flexDirection: "row-reverse",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Feather
              name={a.accountType === "vendor" ? "briefcase" : "user"}
              size={16}
              color={theme.text}
            />
            <ThemedText
              style={{
                fontFamily: "Cairo_700Bold",
                fontSize: 15,
                color: theme.text,
              }}
            >
              {a.accountName}
            </ThemedText>
          </View>
          <View
            style={{
              backgroundColor: chip.bg,
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 8,
            }}
          >
            <ThemedText style={{ fontSize: 11, color: chip.fg }}>
              {chip.txt}
            </ThemedText>
          </View>
        </View>
        <View
          style={{
            flexDirection: "row-reverse",
            justifyContent: "space-between",
          }}
        >
          <ThemedText style={{ color: theme.textSecondary, fontSize: 13 }}>
            عدد الطلبات: {a.orders}
          </ThemedText>
          <ThemedText
            style={{
              color: AppColors.primary,
              fontFamily: "Cairo_700Bold",
              fontSize: 16,
            }}
          >
            {fmt(a.outstanding)}
          </ThemedText>
        </View>
        <ThemedText
          style={{
            color: theme.textSecondary,
            fontSize: 12,
            textAlign: "right",
          }}
        >
          آخر تسوية: {last ? last.toLocaleDateString("ar-IQ") : "—"}
        </ThemedText>
        <View style={{ flexDirection: "row-reverse", gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            onPress={() => openSettlementDetails(a)}
            style={{
              flex: 1,
              backgroundColor: theme.backgroundRoot,
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: 10,
              paddingVertical: 9,
              alignItems: "center",
            }}
          >
            <ThemedText
              style={{
                color: theme.text,
                fontFamily: "Cairo_700Bold",
                fontSize: 13,
              }}
            >
              تفاصيل
            </ThemedText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={doFull}
            disabled={!canSettle}
            style={{
              flex: 1,
              backgroundColor: canSettle ? AppColors.success : theme.border,
              borderRadius: 10,
              paddingVertical: 9,
              alignItems: "center",
            }}
          >
            <ThemedText
              style={{
                color: AppColors.white,
                fontFamily: "Cairo_700Bold",
                fontSize: 13,
              }}
            >
              كاملة
            </ThemedText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={doPartial}
            disabled={!canSettle}
            style={{
              flex: 1,
              backgroundColor: canSettle ? AppColors.primary : theme.border,
              borderRadius: 10,
              paddingVertical: 9,
              alignItems: "center",
            }}
          >
            <ThemedText
              style={{
                color: AppColors.white,
                fontFamily: "Cairo_700Bold",
                fontSize: 13,
              }}
            >
              جزئية
            </ThemedText>
          </Pressable>
        </View>
      </View>
    );
  };

  const renderSettlementsTab = () => {
    const subTabs: { key: typeof settleView; label: string }[] = [
      { key: "requests", label: `الطلبات (${settlementRequests.length})` },
      { key: "driver", label: "السائقون" },
      { key: "vendor", label: "المتاجر" },
      { key: "config", label: "الإعدادات" },
    ];
    const cfg = settlementConfig ?? {
      driver: { thresholdEnabled: true, thresholdAmount: 50000 },
      vendor: { thresholdEnabled: true, thresholdAmount: 50000 },
    };
    return (
      <View style={{ gap: Spacing.md }}>
        {/* Sub-tab selector */}
        <View style={{ flexDirection: "row-reverse", gap: 6 }}>
          {subTabs.map((t) => (
            <Pressable
              accessibilityRole="button"
              key={t.key}
              onPress={() => setSettleView(t.key)}
              style={{
                flex: 1,
                paddingVertical: 8,
                borderRadius: 10,
                alignItems: "center",
                backgroundColor:
                  settleView === t.key
                    ? AppColors.primary
                    : theme.backgroundDefault,
              }}
            >
              <ThemedText
                style={{
                  fontSize: 12,
                  fontFamily: "Cairo_700Bold",
                  color:
                    settleView === t.key
                      ? AppColors.white
                      : theme.textSecondary,
                }}
              >
                {t.label}
              </ThemedText>
            </Pressable>
          ))}
        </View>

        {/* Requests inbox */}
        {settleView === "requests" ? (
          settlementRequests.length === 0 ? (
            <View
              style={{
                borderRadius: 14,
                padding: Spacing.xl,
                backgroundColor: theme.backgroundDefault,
                alignItems: "center",
              }}
            >
              <Feather
                name="check-circle"
                size={28}
                color={AppColors.success}
              />
              <ThemedText
                style={{ color: theme.textSecondary, marginTop: Spacing.sm }}
              >
                لا توجد طلبات تسوية معلّقة
              </ThemedText>
            </View>
          ) : (
            settlementRequests.map((r) =>
              renderSettlementCard({
                accountType: r.accountType,
                accountId: r.accountId,
                accountName: r.accountName,
                outstanding: r.outstandingSnapshot,
                orders: r.pendingOrderCount || 0,
                status: "under_review",
                requestId: r.id,
              }),
            )
          )
        ) : null}

        {/* Driver / Vendor account dashboards */}
        {settleView === "driver" || settleView === "vendor" ? (
          <>
            <View style={{ flexDirection: "row-reverse", gap: 8 }}>
              <Pressable
                accessibilityRole="button"
                onPress={printSettlementReport}
                style={{
                  flexDirection: "row-reverse",
                  alignItems: "center",
                  gap: 6,
                  backgroundColor: theme.backgroundDefault,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <Feather name="printer" size={15} color={theme.text} />
                <ThemedText style={{ fontSize: 12, color: theme.text }}>
                  طباعة / PDF
                </ThemedText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  Linking.openURL(
                    `${getApiUrl()}/api/admin/settlement-export?accountType=${settleView}`,
                  )
                }
                style={{
                  flexDirection: "row-reverse",
                  alignItems: "center",
                  gap: 6,
                  backgroundColor: theme.backgroundDefault,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <Feather name="download" size={15} color={theme.text} />
                <ThemedText style={{ fontSize: 12, color: theme.text }}>
                  تصدير Excel
                </ThemedText>
              </Pressable>
            </View>
            {settlementAccounts.length === 0 ? (
              <View
                style={{
                  borderRadius: 14,
                  padding: Spacing.xl,
                  backgroundColor: theme.backgroundDefault,
                  alignItems: "center",
                }}
              >
                <ThemedText style={{ color: theme.textSecondary }}>
                  لا توجد حسابات
                </ThemedText>
              </View>
            ) : (
              settlementAccounts.map((a) =>
                renderSettlementCard({
                  accountType: a.accountType,
                  accountId: a.accountId,
                  accountName: a.accountName,
                  outstanding: a.outstanding,
                  orders: a.totalOrders || 0,
                  lastSettlementAt: a.lastSettlementAt,
                  status: a.status,
                }),
              )
            )}
          </>
        ) : null}

        {/* Threshold configuration */}
        {settleView === "config"
          ? (["driver", "vendor"] as const).map((t) => {
              const c = cfg[t];
              return (
                <View
                  key={t}
                  style={{
                    borderRadius: 14,
                    padding: Spacing.md,
                    backgroundColor: theme.backgroundDefault,
                    gap: 10,
                  }}
                >
                  <ThemedText
                    style={{
                      fontFamily: "Cairo_700Bold",
                      fontSize: 15,
                      color: theme.text,
                      textAlign: "right",
                    }}
                  >
                    حدّ التسوية — {t === "driver" ? "السائقون" : "المتاجر"}
                  </ThemedText>
                  <View
                    style={{
                      flexDirection: "row-reverse",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <ThemedText
                      style={{ color: theme.textSecondary, fontSize: 13 }}
                    >
                      تفعيل الحظر عند تجاوز الحدّ
                    </ThemedText>
                    <Switch
                      accessibilityLabel="تفعيل الحظر عند تجاوز الحدّ"
                      value={c.thresholdEnabled}
                      onValueChange={(v) =>
                        saveSettlementConfig(t, v, c.thresholdAmount)
                      }
                    />
                  </View>
                  <View
                    style={{
                      flexDirection: "row-reverse",
                      gap: 6,
                      flexWrap: "wrap",
                    }}
                  >
                    {[50000, 100000, 200000].map((amt) => (
                      <Pressable
                        accessibilityRole="button"
                        key={amt}
                        onPress={() =>
                          saveSettlementConfig(t, c.thresholdEnabled, amt)
                        }
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: 10,
                          backgroundColor:
                            c.thresholdAmount === amt
                              ? AppColors.primary
                              : theme.backgroundRoot,
                          borderWidth: 1,
                          borderColor: theme.border,
                        }}
                      >
                        <ThemedText
                          style={{
                            fontSize: 12,
                            color:
                              c.thresholdAmount === amt
                                ? AppColors.white
                                : theme.text,
                          }}
                        >
                          {amt.toLocaleString("ar-IQ")}
                        </ThemedText>
                      </Pressable>
                    ))}
                  </View>
                  <ThemedText
                    style={{
                      fontSize: 11,
                      color: theme.textSecondary,
                      textAlign: "right",
                    }}
                  >
                    الحدّ الحالي:{" "}
                    {c.thresholdEnabled
                      ? `${c.thresholdAmount.toLocaleString("ar-IQ")} د.ع`
                      : "مُعطّل"}
                  </ThemedText>
                </View>
              );
            })
          : null}

        {/* Account details: settlement history + payment history */}
        <Modal
          visible={!!detailTarget}
          transparent
          animationType="slide"
          onRequestClose={() => setDetailTarget(null)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.45)",
              justifyContent: "flex-end",
            }}
          >
            <View
              style={{
                backgroundColor: theme.backgroundDefault,
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                padding: 20,
                maxHeight: "80%",
              }}
            >
              <View
                style={{
                  flexDirection: "row-reverse",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <ThemedText
                  style={{
                    fontFamily: "Cairo_700Bold",
                    fontSize: 16,
                    color: theme.text,
                  }}
                >
                  {detailTarget?.accountName}
                </ThemedText>
                <Pressable
                  onPress={() => setDetailTarget(null)}
                  accessibilityRole="button"
                  accessibilityLabel="إغلاق التفاصيل"
                >
                  <Feather name="x" size={22} color={theme.textSecondary} />
                </Pressable>
              </View>
              {detailBusy ? (
                <ActivityIndicator
                  size="large"
                  color={AppColors.primary}
                  style={{ marginVertical: 24 }}
                />
              ) : (
                <ScrollView>
                  <ThemedText
                    style={{
                      color: AppColors.primary,
                      fontFamily: "Cairo_700Bold",
                      fontSize: 18,
                      textAlign: "right",
                    }}
                  >
                    المستحق:{" "}
                    {(
                      detailData?.view?.outstanding ??
                      detailTarget?.outstanding ??
                      0
                    ).toLocaleString("ar-IQ")}{" "}
                    د.ع
                  </ThemedText>

                  <ThemedText
                    style={{
                      fontFamily: "Cairo_700Bold",
                      fontSize: 14,
                      color: theme.text,
                      textAlign: "right",
                      marginTop: 16,
                      marginBottom: 6,
                    }}
                  >
                    سجلّ الدفعات
                  </ThemedText>
                  {(detailData?.payments ?? []).length === 0 ? (
                    <ThemedText
                      style={{
                        color: theme.textSecondary,
                        fontSize: 12,
                        textAlign: "right",
                      }}
                    >
                      لا توجد دفعات بعد
                    </ThemedText>
                  ) : (
                    (detailData?.payments ?? []).map((p: any) => (
                      <View
                        key={p.id}
                        style={{
                          flexDirection: "row-reverse",
                          justifyContent: "space-between",
                          paddingVertical: 6,
                          borderBottomWidth: 1,
                          borderBottomColor: theme.border,
                        }}
                      >
                        <ThemedText
                          style={{ color: AppColors.success, fontSize: 13 }}
                        >
                          {(p.amount ?? 0).toLocaleString("ar-IQ")} د.ع
                        </ThemedText>
                        <ThemedText
                          style={{ color: theme.textSecondary, fontSize: 11 }}
                        >
                          {p.receiptNumber ?? ""}
                        </ThemedText>
                      </View>
                    ))
                  )}

                  <ThemedText
                    style={{
                      fontFamily: "Cairo_700Bold",
                      fontSize: 14,
                      color: theme.text,
                      textAlign: "right",
                      marginTop: 16,
                      marginBottom: 6,
                    }}
                  >
                    سجلّ التسويات (الطلبات)
                  </ThemedText>
                  {(detailData?.history?.settlements ?? []).length === 0 ? (
                    <ThemedText
                      style={{
                        color: theme.textSecondary,
                        fontSize: 12,
                        textAlign: "right",
                      }}
                    >
                      لا توجد سجلّات
                    </ThemedText>
                  ) : (
                    (detailData?.history?.settlements ?? [])
                      .slice(0, 40)
                      .map((s: any) => (
                        <View
                          key={s.id}
                          style={{
                            flexDirection: "row-reverse",
                            justifyContent: "space-between",
                            paddingVertical: 6,
                            borderBottomWidth: 1,
                            borderBottomColor: theme.border,
                          }}
                        >
                          <ThemedText
                            style={{ color: theme.text, fontSize: 12 }}
                          >
                            {(s.outstandingAmount ?? 0).toLocaleString("ar-IQ")}{" "}
                            د.ع
                          </ThemedText>
                          <ThemedText
                            style={{
                              color:
                                s.status === "settled"
                                  ? AppColors.success
                                  : theme.textSecondary,
                              fontSize: 11,
                            }}
                          >
                            {s.status === "settled" ? "مسوّى" : "مستحق"}
                          </ThemedText>
                        </View>
                      ))
                  )}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>

        {/* Partial-settlement modal */}
        <Modal
          visible={!!completeTarget}
          transparent
          animationType="fade"
          onRequestClose={() => setCompleteTarget(null)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.45)",
              justifyContent: "center",
              padding: 24,
            }}
          >
            <View
              style={{
                backgroundColor: theme.backgroundDefault,
                borderRadius: 16,
                padding: 20,
                gap: 12,
              }}
            >
              <ThemedText
                style={{
                  fontFamily: "Cairo_700Bold",
                  fontSize: 16,
                  color: theme.text,
                  textAlign: "right",
                }}
              >
                تسوية جزئية
              </ThemedText>
              <ThemedText
                style={{
                  color: theme.textSecondary,
                  fontSize: 13,
                  textAlign: "right",
                }}
              >
                {completeTarget?.accountName} · المستحق{" "}
                {(completeTarget?.outstanding ?? 0).toLocaleString("ar-IQ")} د.ع
              </ThemedText>
              <TextInput
                value={completeAmount}
                onChangeText={setCompleteAmount}
                keyboardType="number-pad"
                placeholder="المبلغ المستلم"
                placeholderTextColor={theme.textSecondary}
                style={{
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 10,
                  padding: 12,
                  color: theme.text,
                  textAlign: "right",
                }}
              />
              <View style={{ flexDirection: "row-reverse", gap: 8 }}>
                <Pressable
                  accessibilityRole="button"
                  disabled={completeBusy}
                  onPress={() => {
                    const amt = Math.round(Number(completeAmount));
                    if (!amt || amt <= 0) {
                      Alert.alert("قيمة غير صحيحة", "أدخل مبلغاً صحيحاً");
                      return;
                    }
                    if (completeTarget)
                      submitSettlement(
                        completeTarget,
                        amt,
                        completeTarget.requestId,
                      );
                  }}
                  style={{
                    flex: 1,
                    backgroundColor: AppColors.primary,
                    borderRadius: 10,
                    paddingVertical: 11,
                    alignItems: "center",
                  }}
                >
                  {completeBusy ? (
                    <ActivityIndicator size="small" color={AppColors.white} />
                  ) : (
                    <ThemedText
                      style={{
                        color: AppColors.white,
                        fontFamily: "Cairo_700Bold",
                      }}
                    >
                      تأكيد
                    </ThemedText>
                  )}
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setCompleteTarget(null)}
                  style={{
                    flex: 1,
                    backgroundColor: theme.backgroundRoot,
                    borderRadius: 10,
                    paddingVertical: 11,
                    alignItems: "center",
                  }}
                >
                  <ThemedText style={{ color: theme.text }}>إلغاء</ThemedText>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  };

  return renderSettlementsTab();
}

export const SettlementsTab = React.memo(SettlementsTabInner);
