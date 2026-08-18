/**
 * The admin "الرئيسية" (dashboard) tab (H-65).
 *
 * `renderDashboardTab` moved verbatim out of AdminScreen: same cards, same
 * totals, same urgency-threshold form, same navigation shortcuts. Nothing about
 * what it computes or displays changed — only where the code lives.
 *
 * It uses none of AdminScreen's shared StyleSheet (every style is inline), which
 * is why it could be lifted without dragging 94 style keys along.
 *
 * Memoised: it reads six query results and one small form, and re-rendered on
 * every keystroke in every unrelated admin form before this split.
 */
import React from "react";
import { View, Pressable, TextInput, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { Spacing, BorderRadius, AppColors } from "@/constants/theme";
import { formatPrice } from "@/constants/currency";
import type { TabType } from "@/screens/admin/types";

interface UrgencyForm {
  confirmed: string;
  preparing: string;
  ready: string;
}

interface Props {
  adminOrders: any[];
  drivers: any[];
  approvedDrivers: any[];
  dashboardStats?: { users: number; products: number };
  ownerEarnings?: {
    totalOwnerEarnings: number;
    totalDriverEarnings: number;
    totalDeliveryFees: number;
    ordersWithEarnings: number;
    totalDeliveredOrders: number;
  };
  getStatusColor: (status: any) => string;
  getStatusLabel: (status: any) => string;
  urgencyForm: UrgencyForm;
  setUrgencyForm: React.Dispatch<React.SetStateAction<UrgencyForm>>;
  saveUrgencyThresholds: () => void;
  isSavingUrgency: boolean;
  urgencySaveOk: boolean;
  urgencySaveError: string | null;
  setActiveTab: (tab: TabType) => void;
  resetForm: () => void;
  ADMIN_RED: string;
  theme: any;
}

function DashboardTabInner({
  adminOrders,
  drivers,
  approvedDrivers,
  dashboardStats,
  ownerEarnings,
  getStatusColor,
  getStatusLabel,
  urgencyForm,
  setUrgencyForm,
  saveUrgencyThresholds,
  isSavingUrgency,
  urgencySaveOk,
  urgencySaveError,
  setActiveTab,
  resetForm,
  ADMIN_RED,
  theme,
}: Props) {
  const renderDashboardTab = () => {
    const ADMIN_RED = AppColors.error;
    const totalOrders = adminOrders.length;
    const pendingOrders = adminOrders.filter(
      (o) => o.status === "pending",
    ).length;
    const activeOrders = adminOrders.filter((o) =>
      ["confirmed", "preparing", "ready", "picked_up", "in_delivery"].includes(
        o.status,
      ),
    ).length;
    const deliveredOrders = adminOrders.filter(
      (o) => o.status === "delivered",
    ).length;
    const approvedDrivers = drivers.filter(
      (d) => d.status === "approved",
    ).length;
    const pendingDrivers = drivers.filter((d) => d.status === "pending").length;
    const todayRevenue = ownerEarnings?.totalOwnerEarnings ?? 0;
    const recentOrders = [...adminOrders]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, 5);

    const kpiCards = [
      {
        label: "طلبات اليوم",
        value: totalOrders,
        icon: "shopping-cart" as const,
        color: AppColors.info,
        bg: AppColors.infoLight,
      },
      {
        label: "بانتظار القبول",
        value: pendingOrders,
        icon: "clock" as const,
        color: AppColors.warning,
        bg: AppColors.warningLight,
      },
      {
        label: "قيد التوصيل",
        value: activeOrders,
        icon: "navigation" as const,
        color: AppColors.statusPurple,
        bg: AppColors.vendorPurpleLight,
      },
      {
        label: "تمت التوصيل",
        value: deliveredOrders,
        icon: "check-circle" as const,
        color: AppColors.success,
        bg: AppColors.successLight,
      },
      {
        label: "إجمالي السائقين",
        value: approvedDrivers,
        icon: "truck" as const,
        color: ADMIN_RED,
        bg: AppColors.secondary,
      },
      {
        label: "طلبات السائقين",
        value: pendingDrivers,
        icon: "user-check" as const,
        color: AppColors.statusPurple,
        bg: AppColors.vendorPurpleLight,
      },
      {
        label: "المستخدمون",
        value: dashboardStats?.users ?? 0,
        icon: "users" as const,
        color: AppColors.info,
        bg: AppColors.infoLight,
      },
      {
        label: "عمولة التطبيق",
        value: formatPrice(todayRevenue),
        icon: "trending-up" as const,
        color: AppColors.success,
        bg: AppColors.successLight,
        isText: true,
      },
    ];

    const getStatusColor = (s: string) => {
      const m: Record<string, string> = {
        pending: AppColors.warning,
        confirmed: AppColors.info,
        preparing: AppColors.statusPurple,
        ready: AppColors.primary,
        picked_up: AppColors.primary,
        in_delivery: AppColors.statusCyan,
        delivered: AppColors.success,
        cancelled: AppColors.error,
        issue: AppColors.error,
      };
      return m[s] || AppColors.gray500;
    };
    const getStatusLabel = (s: string) => {
      const m: Record<string, string> = {
        pending: "انتظار",
        confirmed: "مؤكد",
        preparing: "يتحضر",
        ready: "جاهز",
        picked_up: "استُلم",
        in_delivery: "بالطريق",
        delivered: "وصل",
        cancelled: "ملغي",
        issue: "مشكلة",
      };
      return m[s] || s;
    };

    const quickLinks: {
      label: string;
      tab: TabType;
      icon: keyof typeof Feather.glyphMap;
      color: string;
    }[] = [
      {
        label: "البانرات",
        tab: "banners",
        icon: "image",
        color: AppColors.info,
      },
      {
        label: "الأقسام",
        tab: "categories",
        icon: "grid",
        color: AppColors.statusPurple,
      },
      {
        label: "المنتجات",
        tab: "products",
        icon: "package",
        color: AppColors.warning,
      },
      {
        label: "المناطق",
        tab: "areas",
        icon: "map-pin",
        color: AppColors.success,
      },
      {
        label: "أكواد الخصم",
        tab: "promoCodes",
        icon: "tag",
        color: AppColors.error,
      },
      {
        label: "الإشعارات",
        tab: "notifications",
        icon: "bell",
        color: AppColors.statusPurple,
      },
    ];

    return (
      <View style={{ gap: Spacing.lg }}>
        {/* Welcome strip */}
        <View
          style={{
            borderRadius: BorderRadius.xl,
            overflow: "hidden",
            backgroundColor: AppColors.primary,
          }}
        >
          <View
            style={{
              padding: Spacing.lg,
              flexDirection: "row-reverse",
              alignItems: "center",
              gap: Spacing.md,
            }}
          >
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: "rgba(255,255,255,0.2)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="shield" size={24} color={AppColors.white} />
            </View>
            <View style={{ flex: 1, alignItems: "flex-end" }}>
              <ThemedText
                style={{
                  color: AppColors.white,
                  fontSize: 18,
                  fontFamily: "Cairo_700Bold",
                }}
              >
                لوحة التحكم
              </ThemedText>
              <ThemedText
                style={{
                  color: AppColors.textOnBrandMuted,
                  fontSize: 13,
                  fontFamily: "Cairo_400Regular",
                }}
              >
                مرحباً بك في نظام إدارة أونواي
              </ThemedText>
            </View>
          </View>
          {/* Mini status bar */}
          <View
            style={{
              flexDirection: "row-reverse",
              backgroundColor: "rgba(0,0,0,0.15)",
              paddingHorizontal: Spacing.lg,
              paddingVertical: Spacing.sm,
              gap: Spacing.lg,
            }}
          >
            <View
              style={{
                flexDirection: "row-reverse",
                alignItems: "center",
                gap: 4,
              }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor:
                    pendingOrders > 0 ? AppColors.warning : AppColors.success,
                }}
              />
              <ThemedText
                style={{
                  color: AppColors.white,
                  fontSize: 12,
                  fontFamily: "Cairo_400Regular",
                }}
              >
                {pendingOrders > 0
                  ? `${pendingOrders} طلب ينتظر`
                  : "لا طلبات معلقة"}
              </ThemedText>
            </View>
            <View
              style={{
                flexDirection: "row-reverse",
                alignItems: "center",
                gap: 4,
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
              <ThemedText
                style={{
                  color: AppColors.white,
                  fontSize: 12,
                  fontFamily: "Cairo_400Regular",
                }}
              >
                {approvedDrivers} سائق نشط
              </ThemedText>
            </View>
          </View>
        </View>

        {/* KPI grid */}
        <View>
          <ThemedText
            style={{
              fontFamily: "Cairo_700Bold",
              fontSize: 14,
              color: theme.textSecondary,
              textAlign: "right",
              marginBottom: Spacing.sm,
            }}
          >
            الإحصائيات الرئيسية
          </ThemedText>
          <View
            style={{ flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm }}
          >
            {kpiCards.map((card, i) => (
              <View
                key={i}
                style={{
                  width: "47%",
                  backgroundColor: AppColors.white,
                  borderRadius: 20,
                  padding: Spacing.md + 2,
                  gap: 6,
                  borderWidth: 1,
                  borderColor: "rgba(16,24,40,0.05)",
                  shadowColor: AppColors.black,
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.05,
                  shadowRadius: 8,
                  elevation: 1,
                }}
              >
                <View
                  style={{
                    flexDirection: "row-reverse",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 11,
                      backgroundColor: card.color + "18",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Feather name={card.icon} size={18} color={card.color} />
                  </View>
                  {card.isText ? (
                    <ThemedText
                      style={{
                        fontFamily: "Cairo_700Bold",
                        fontSize: 15,
                        color: AppColors.gray800,
                      }}
                    >
                      {card.value as string}
                    </ThemedText>
                  ) : (
                    <ThemedText
                      style={{
                        fontFamily: "Cairo_700Bold",
                        fontSize: 26,
                        lineHeight: 36,
                        includeFontPadding: true,
                        color: AppColors.gray800,
                      }}
                    >
                      {card.value as number}
                    </ThemedText>
                  )}
                </View>
                <ThemedText
                  style={{
                    fontFamily: "Cairo_600SemiBold",
                    fontSize: 12.5,
                    color: AppColors.gray500,
                    textAlign: "right",
                  }}
                >
                  {card.label}
                </ThemedText>
              </View>
            ))}
          </View>
        </View>

        {/* Quick links */}
        <View>
          <ThemedText
            style={{
              fontFamily: "Cairo_700Bold",
              fontSize: 14,
              color: theme.textSecondary,
              textAlign: "right",
              marginBottom: Spacing.sm,
            }}
          >
            وصول سريع
          </ThemedText>
          <View
            style={{ flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm }}
          >
            {quickLinks.map((ql, i) => (
              <Pressable
                accessibilityRole="button"
                key={i}
                onPress={() => {
                  setActiveTab(ql.tab);
                  resetForm();
                }}
                style={{
                  width: "30%",
                  backgroundColor: theme.backgroundSecondary,
                  borderRadius: BorderRadius.lg,
                  padding: Spacing.md,
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    backgroundColor: ql.color + "15",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Feather name={ql.icon} size={20} color={ql.color} />
                </View>
                <ThemedText
                  style={{
                    fontFamily: "Cairo_400Regular",
                    fontSize: 12,
                    color: theme.text,
                    textAlign: "center",
                  }}
                >
                  {ql.label}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Recent orders */}
        <View>
          <View
            style={{
              flexDirection: "row-reverse",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: Spacing.sm,
            }}
          >
            <ThemedText
              style={{
                fontFamily: "Cairo_700Bold",
                fontSize: 14,
                color: theme.textSecondary,
              }}
            >
              آخر الطلبات
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setActiveTab("orders");
                resetForm();
              }}
            >
              <ThemedText
                style={{
                  fontFamily: "Cairo_400Regular",
                  fontSize: 13,
                  color: ADMIN_RED,
                }}
              >
                عرض الكل
              </ThemedText>
            </Pressable>
          </View>
          {recentOrders.length === 0 ? (
            <View style={{ padding: Spacing.xl, alignItems: "center" }}>
              <ThemedText
                style={{
                  color: theme.textSecondary,
                  fontFamily: "Cairo_400Regular",
                  fontSize: 13,
                }}
              >
                لا توجد طلبات بعد
              </ThemedText>
            </View>
          ) : (
            <View style={{ gap: Spacing.sm }}>
              {recentOrders.map((order) => (
                <Pressable
                  accessibilityRole="button"
                  key={order.id}
                  onPress={() => {
                    setActiveTab("orders");
                    resetForm();
                  }}
                  style={{
                    backgroundColor: theme.backgroundSecondary,
                    borderRadius: BorderRadius.lg,
                    padding: Spacing.md,
                    flexDirection: "row-reverse",
                    alignItems: "center",
                    gap: Spacing.md,
                  }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      backgroundColor: getStatusColor(order.status) + "15",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Feather
                      name="shopping-bag"
                      size={18}
                      color={getStatusColor(order.status)}
                    />
                  </View>
                  <View style={{ flex: 1, alignItems: "flex-end", gap: 2 }}>
                    <ThemedText
                      style={{
                        fontFamily: "Cairo_700Bold",
                        fontSize: 13,
                        color: theme.text,
                      }}
                    >
                      #{order.id.slice(-6)}
                    </ThemedText>
                    <ThemedText
                      style={{
                        fontFamily: "Cairo_400Regular",
                        fontSize: 12,
                        color: theme.textSecondary,
                      }}
                    >
                      {order.phoneNumber}
                    </ThemedText>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 2 }}>
                    <View
                      style={{
                        paddingHorizontal: Spacing.sm,
                        paddingVertical: 2,
                        borderRadius: 100,
                        backgroundColor: getStatusColor(order.status) + "20",
                      }}
                    >
                      <ThemedText
                        style={{
                          fontSize: 11,
                          fontFamily: "Cairo_700Bold",
                          color: getStatusColor(order.status),
                        }}
                      >
                        {getStatusLabel(order.status)}
                      </ThemedText>
                    </View>
                    <ThemedText
                      style={{
                        fontSize: 13,
                        fontFamily: "Cairo_700Bold",
                        color: theme.text,
                      }}
                    >
                      {formatPrice(order.total)}
                    </ThemedText>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Urgency Thresholds Settings */}
        <View
          style={{
            backgroundColor: theme.backgroundSecondary,
            borderRadius: BorderRadius.xl,
            padding: Spacing.lg,
            gap: Spacing.md,
          }}
        >
          <View
            style={{
              flexDirection: "row-reverse",
              alignItems: "center",
              gap: Spacing.sm,
              marginBottom: 2,
            }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: "#FEE2E220",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="clock" size={18} color={AppColors.error} />
            </View>
            <View style={{ flex: 1, alignItems: "flex-end" }}>
              <ThemedText
                style={{
                  fontFamily: "Cairo_700Bold",
                  fontSize: 14,
                  color: theme.text,
                }}
              >
                حدود تنبيه الوقت للبائعين
              </ThemedText>
              <ThemedText
                style={{
                  fontFamily: "Cairo_400Regular",
                  fontSize: 12,
                  color: theme.textSecondary,
                }}
              >
                عدد الدقائق قبل تحوّل المؤقت إلى اللون الأحمر
              </ThemedText>
            </View>
          </View>
          <View style={{ gap: Spacing.sm }}>
            {[
              { key: "confirmed" as const, label: "بعد التأكيد (مؤكد)" },
              { key: "preparing" as const, label: "أثناء التحضير" },
              { key: "ready" as const, label: "جاهز وينتظر السائق" },
            ].map(({ key, label }) => (
              <View
                key={key}
                style={{
                  flexDirection: "row-reverse",
                  alignItems: "center",
                  gap: Spacing.sm,
                }}
              >
                <ThemedText
                  style={{
                    flex: 1,
                    fontFamily: "Cairo_400Regular",
                    fontSize: 13,
                    color: theme.text,
                    textAlign: "right",
                  }}
                >
                  {label}
                </ThemedText>
                <View
                  style={{
                    flexDirection: "row-reverse",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <TextInput
                    accessibilityLabel={label}
                    value={urgencyForm[key]}
                    onChangeText={(t) =>
                      setUrgencyForm((prev) => ({
                        ...prev,
                        [key]: t.replace(/[^0-9]/g, ""),
                      }))
                    }
                    keyboardType="number-pad"
                    style={{
                      width: 60,
                      textAlign: "center",
                      fontFamily: "Cairo_700Bold",
                      fontSize: 15,
                      color: theme.text,
                      backgroundColor: theme.backgroundDefault,
                      borderRadius: BorderRadius.md,
                      borderWidth: 1,
                      borderColor: theme.border ?? AppColors.divider,
                      paddingVertical: 6,
                      paddingHorizontal: 8,
                    }}
                    testID={`urgency-input-${key}`}
                  />
                  <ThemedText
                    style={{
                      fontFamily: "Cairo_400Regular",
                      fontSize: 12,
                      color: theme.textSecondary,
                    }}
                  >
                    دقيقة
                  </ThemedText>
                </View>
              </View>
            ))}
          </View>
          {urgencySaveError ? (
            <ThemedText
              style={{
                fontFamily: "Cairo_400Regular",
                fontSize: 13,
                color: AppColors.error,
                textAlign: "right",
              }}
            >
              {urgencySaveError}
            </ThemedText>
          ) : null}
          {urgencySaveOk ? (
            <ThemedText
              style={{
                fontFamily: "Cairo_400Regular",
                fontSize: 13,
                color: AppColors.success,
                textAlign: "right",
              }}
            >
              تم الحفظ بنجاح
            </ThemedText>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={saveUrgencyThresholds}
            disabled={isSavingUrgency}
            testID="button-save-urgency"
            style={{
              backgroundColor: ADMIN_RED,
              borderRadius: BorderRadius.lg,
              paddingVertical: 10,
              alignItems: "center",
            }}
          >
            {isSavingUrgency ? (
              <ActivityIndicator color={AppColors.white} size="small" />
            ) : (
              <ThemedText
                style={{
                  fontFamily: "Cairo_700Bold",
                  fontSize: 14,
                  color: AppColors.white,
                }}
              >
                حفظ الحدود الزمنية
              </ThemedText>
            )}
          </Pressable>
        </View>

        {/* Commission summary shortcut */}
        {ownerEarnings ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setActiveTab("orders");
              resetForm();
            }}
            style={{
              backgroundColor: AppColors.secondary,
              borderRadius: BorderRadius.xl,
              padding: Spacing.lg,
              flexDirection: "row-reverse",
              alignItems: "center",
              gap: Spacing.md,
              borderWidth: 1,
              borderColor: AppColors.errorLight,
            }}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                backgroundColor: AppColors.errorLight,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="dollar-sign" size={22} color={ADMIN_RED} />
            </View>
            <View style={{ flex: 1, alignItems: "flex-end" }}>
              <ThemedText
                style={{
                  fontFamily: "Cairo_700Bold",
                  fontSize: 15,
                  color: ADMIN_RED,
                }}
              >
                {formatPrice(ownerEarnings.totalOwnerEarnings)}
              </ThemedText>
              <ThemedText
                style={{
                  fontFamily: "Cairo_400Regular",
                  fontSize: 12,
                  color: AppColors.gray500,
                }}
              >
                إجمالي عمولة التطبيق — {ownerEarnings.totalDeliveredOrders} طلب
                مكتمل
              </ThemedText>
            </View>
            <Feather name="chevron-left" size={16} color={ADMIN_RED} />
          </Pressable>
        ) : null}
      </View>
    );
  };

  return renderDashboardTab();
}

export const DashboardTab = React.memo(DashboardTabInner);
