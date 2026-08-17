/**
 * The admin "الطلبات" (orders) tab (H-65).
 *
 * `renderOrdersTab` moved verbatim out of AdminScreen. Everything financial or
 * operational it displays is read, not computed: the frozen `appSharePercent` and
 * `orderKind` on each order, the delivery fee, and the owner-earnings aggregate
 * all arrive as props from AdminScreen's queries.
 *
 * The status transitions still go through the one `updateOrderStatus` mutation in
 * AdminScreen — including the `picked_up` / `in_delivery` states H-64 settled — and
 * no retry was added to it. The 6-second orders poll and the new-order sound alert
 * stay in AdminScreen, so they keep firing whatever tab is open.
 */
import React from "react";
import { View, Pressable, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import {
  Spacing,
  BorderRadius,
  AppColors,
  FontWeight,
} from "@/constants/theme";
import { formatPrice } from "@/constants/currency";
import { styles } from "@/screens/admin/adminStyles";

interface Props {
  adminOrders: any[];
  ordersLoading: boolean;
  ownerEarnings?: {
    totalOwnerEarnings: number;
    totalDriverEarnings: number;
    totalDeliveryFees: number;
    ordersWithEarnings: number;
    totalDeliveredOrders: number;
  };
  getStatusColor: (status: any) => string;
  getStatusLabel: (status: any) => string;
  updateOrderStatus: any;
  setAssigningOrderId: (v: string | null) => void;
  setAssignError: (v: string | null) => void;
  openTrackingModal: (orderId: string) => void;
  theme: any;
}

function OrdersTabInner({
  adminOrders,
  ordersLoading,
  ownerEarnings,
  getStatusColor,
  getStatusLabel,
  updateOrderStatus,
  setAssigningOrderId,
  setAssignError,
  openTrackingModal,
  theme,
}: Props) {
  const renderOrdersTab = () => (
    <View>
      {ownerEarnings ? (
        <View
          style={[
            styles.formCard,
            {
              backgroundColor: theme.backgroundSecondary,
              marginBottom: Spacing.lg,
            },
          ]}
        >
          <ThemedText
            type="h4"
            style={{
              textAlign: "right",
              color: theme.text,
              marginBottom: Spacing.md,
            }}
          >
            ملخص الأرباح والعمولات
          </ThemedText>

          {/* Stats row */}
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: Spacing.sm,
              marginBottom: Spacing.lg,
            }}
          >
            <View
              style={{
                flex: 1,
                minWidth: 120,
                backgroundColor: "#4CAF5015",
                padding: Spacing.md,
                borderRadius: BorderRadius.lg,
                alignItems: "center",
              }}
            >
              <Feather name="trending-up" size={20} color={AppColors.success} />
              <ThemedText
                type="h3"
                style={{ color: AppColors.success, marginTop: Spacing.xs }}
              >
                {formatPrice(ownerEarnings.totalOwnerEarnings)}
              </ThemedText>
              <ThemedText
                type="small"
                style={{ color: theme.textSecondary, textAlign: "center" }}
              >
                عمولة التطبيق
              </ThemedText>
            </View>
            <View
              style={{
                flex: 1,
                minWidth: 120,
                backgroundColor: "#2196F315",
                padding: Spacing.md,
                borderRadius: BorderRadius.lg,
                alignItems: "center",
              }}
            >
              <Feather name="truck" size={20} color={AppColors.info} />
              <ThemedText
                type="h3"
                style={{ color: AppColors.info, marginTop: Spacing.xs }}
              >
                {formatPrice(ownerEarnings.totalDriverEarnings)}
              </ThemedText>
              <ThemedText
                type="small"
                style={{ color: theme.textSecondary, textAlign: "center" }}
              >
                أرباح السائقين
              </ThemedText>
            </View>
            <View
              style={{
                flex: 1,
                minWidth: 120,
                backgroundColor: "#FF962215",
                padding: Spacing.md,
                borderRadius: BorderRadius.lg,
                alignItems: "center",
              }}
            >
              <Feather
                name="check-circle"
                size={20}
                color={AppColors.primary}
              />
              <ThemedText
                type="h3"
                style={{ color: AppColors.primary, marginTop: Spacing.xs }}
              >
                {ownerEarnings.totalDeliveredOrders}
              </ThemedText>
              <ThemedText
                type="small"
                style={{ color: theme.textSecondary, textAlign: "center" }}
              >
                طلبات مكتملة
              </ThemedText>
            </View>
          </View>

          {/* Commission split visualization */}
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: AppColors.divider,
              paddingTop: Spacing.md,
            }}
          >
            <View
              style={{
                flexDirection: "row-reverse",
                alignItems: "center",
                gap: Spacing.sm,
                marginBottom: Spacing.sm,
              }}
            >
              <Feather name="percent" size={13} color={theme.textSecondary} />
              <ThemedText
                type="small"
                style={{ color: theme.text, fontWeight: FontWeight.bold }}
              >
                توزيع العمولة لكل طلب
              </ThemedText>
            </View>

            {/* Restaurant */}
            <View style={{ marginBottom: Spacing.sm }}>
              <View
                style={{
                  flexDirection: "row-reverse",
                  justifyContent: "space-between",
                  marginBottom: 4,
                }}
              >
                <ThemedText type="small" style={{ color: theme.text }}>
                  مطعم (1,000 د.ع)
                </ThemedText>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <ThemedText
                    style={{ fontSize: 10, color: AppColors.primary }}
                  >
                    25% للتطبيق
                  </ThemedText>
                  <ThemedText
                    style={{ fontSize: 10, color: AppColors.success }}
                  >
                    75% للسائق
                  </ThemedText>
                </View>
              </View>
              <View
                style={{
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: AppColors.divider,
                  overflow: "hidden",
                  flexDirection: "row-reverse",
                }}
              >
                <View
                  style={{
                    width: "75%",
                    height: "100%",
                    backgroundColor: AppColors.success,
                  }}
                />
                <View
                  style={{
                    width: "25%",
                    height: "100%",
                    backgroundColor: AppColors.primary,
                  }}
                />
              </View>
            </View>

            {/* Marketing */}
            <View>
              <View
                style={{
                  flexDirection: "row-reverse",
                  justifyContent: "space-between",
                  marginBottom: 4,
                }}
              >
                <ThemedText type="small" style={{ color: theme.text }}>
                  تسويق (3,000 د.ع)
                </ThemedText>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <ThemedText
                    style={{ fontSize: 10, color: AppColors.primary }}
                  >
                    33% للتطبيق
                  </ThemedText>
                  <ThemedText
                    style={{ fontSize: 10, color: AppColors.success }}
                  >
                    67% للسائق
                  </ThemedText>
                </View>
              </View>
              <View
                style={{
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: AppColors.divider,
                  overflow: "hidden",
                  flexDirection: "row-reverse",
                }}
              >
                <View
                  style={{
                    width: "67%",
                    height: "100%",
                    backgroundColor: AppColors.success,
                  }}
                />
                <View
                  style={{
                    width: "33%",
                    height: "100%",
                    backgroundColor: AppColors.primary,
                  }}
                />
              </View>
            </View>

            {/* Legend */}
            <View
              style={{
                flexDirection: "row-reverse",
                gap: Spacing.lg,
                marginTop: Spacing.sm,
              }}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
              >
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: AppColors.primary,
                  }}
                />
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  التطبيق
                </ThemedText>
              </View>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
              >
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: AppColors.success,
                  }}
                />
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  السائق
                </ThemedText>
              </View>
            </View>
          </View>
        </View>
      ) : null}

      <ThemedText type="h4" style={styles.listTitle}>
        الطلبات
      </ThemedText>

      {ordersLoading ? (
        <ActivityIndicator color={AppColors.primary} />
      ) : adminOrders.length === 0 ? (
        <ThemedText
          type="body"
          style={{ textAlign: "center", color: theme.textSecondary }}
        >
          لا توجد طلبات حالياً
        </ThemedText>
      ) : (
        adminOrders.map((order) => (
          <View
            key={order.id}
            style={[
              styles.orderCard,
              { backgroundColor: theme.backgroundSecondary },
            ]}
          >
            <View style={styles.orderHeader}>
              <ThemedText type="body" style={{ fontWeight: FontWeight.bold }}>
                #{order.id.slice(-6)}
              </ThemedText>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: getStatusColor(order.status) + "20" },
                ]}
              >
                <ThemedText
                  type="small"
                  style={{
                    color: getStatusColor(order.status),
                    fontWeight: FontWeight.semiBold,
                  }}
                >
                  {getStatusLabel(order.status)}
                </ThemedText>
              </View>
            </View>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              📞 {order.phoneNumber}
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              📍 {order.region} - {order.address}
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              🛒 {order.items.length} منتجات
            </ThemedText>
            {order.status === "in_delivery" || order.status === "picked_up" ? (
              <Pressable
                style={[styles.trackBtn]}
                onPress={() => openTrackingModal(order.id)}
              >
                <Feather name="map-pin" size={14} color={AppColors.white} />
                <ThemedText
                  type="small"
                  style={{
                    color: AppColors.white,
                    fontWeight: FontWeight.bold,
                  }}
                >
                  تتبع المندوب مباشر
                </ThemedText>
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: AppColors.success,
                  }}
                />
              </Pressable>
            ) : null}
            <View style={styles.orderFooter}>
              <ThemedText
                type="body"
                style={{
                  color: AppColors.primary,
                  fontWeight: FontWeight.bold,
                }}
              >
                {formatPrice(order.total)}
              </ThemedText>
              <View style={styles.statusButtons}>
                {order.status !== "delivered" &&
                order.status !== "cancelled" ? (
                  <>
                    {order.status === "pending" ? (
                      <Pressable
                        style={[
                          styles.statusBtn,
                          { backgroundColor: AppColors.info },
                        ]}
                        onPress={() =>
                          updateOrderStatus.mutate({
                            id: order.id,
                            status: "confirmed",
                          })
                        }
                      >
                        <ThemedText
                          type="small"
                          style={{ color: AppColors.white }}
                        >
                          تأكيد
                        </ThemedText>
                      </Pressable>
                    ) : null}
                    {order.status === "confirmed" ? (
                      <Pressable
                        style={[
                          styles.statusBtn,
                          { backgroundColor: AppColors.statusPurple },
                        ]}
                        onPress={() =>
                          updateOrderStatus.mutate({
                            id: order.id,
                            status: "preparing",
                          })
                        }
                      >
                        <ThemedText
                          type="small"
                          style={{ color: AppColors.white }}
                        >
                          تحضير
                        </ThemedText>
                      </Pressable>
                    ) : null}
                    {order.status === "preparing" ? (
                      <Pressable
                        style={[
                          styles.statusBtn,
                          { backgroundColor: AppColors.statusCyan },
                        ]}
                        onPress={() =>
                          updateOrderStatus.mutate({
                            id: order.id,
                            status: "in_delivery",
                          })
                        }
                      >
                        <ThemedText
                          type="small"
                          style={{ color: AppColors.white }}
                        >
                          توصيل
                        </ThemedText>
                      </Pressable>
                    ) : null}
                    {order.status === "in_delivery" ? (
                      <Pressable
                        style={[
                          styles.statusBtn,
                          { backgroundColor: AppColors.success },
                        ]}
                        onPress={() =>
                          updateOrderStatus.mutate({
                            id: order.id,
                            status: "delivered",
                          })
                        }
                      >
                        <ThemedText
                          type="small"
                          style={{ color: AppColors.white }}
                        >
                          تم
                        </ThemedText>
                      </Pressable>
                    ) : null}
                    <Pressable
                      style={[
                        styles.statusBtn,
                        { backgroundColor: AppColors.error },
                      ]}
                      onPress={() =>
                        updateOrderStatus.mutate({
                          id: order.id,
                          status: "cancelled",
                        })
                      }
                    >
                      <ThemedText
                        type="small"
                        style={{ color: AppColors.white }}
                      >
                        إلغاء
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.statusBtn,
                        {
                          backgroundColor: AppColors.primary,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                        },
                      ]}
                      onPress={() => {
                        setAssigningOrderId(order.id);
                        setAssignError(null);
                      }}
                    >
                      <Feather
                        name="user-plus"
                        size={12}
                        color={AppColors.white}
                      />
                      <ThemedText
                        type="small"
                        style={{ color: AppColors.white }}
                      >
                        تعيين سائق
                      </ThemedText>
                    </Pressable>
                  </>
                ) : null}
              </View>
            </View>
          </View>
        ))
      )}
    </View>
  );

  return renderOrdersTab();
}

export const OrdersTab = React.memo(OrdersTabInner);
