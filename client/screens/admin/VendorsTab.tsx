/**
 * The admin "المتاجر" (vendor partners) tab (H-65).
 *
 * At 1,517 lines this was the single largest block inside AdminScreen — the
 * vendor list, the status filters, the vendor detail sheet, the per-vendor
 * product list and the add-product modal. It moved out verbatim: same approval
 * flow, same status transitions, same image handling, same API calls.
 *
 * The three label/colour maps below came with it. They were being rebuilt as
 * fresh objects on every AdminScreen render even though they are constants; at
 * module scope they are allocated once.
 */
import React from "react";
import {
  View,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Modal,
  Alert,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { Spacing, BorderRadius, AppColors } from "@/constants/theme";
import { CATEGORY_MAP } from "@/constants/businessCategories";
import { formatPrice } from "@/constants/currency";
import { getApiUrl } from "@/lib/query-client";
import { resolveImageUrl } from "@/utils/imageUtils";
import type { VendorPartner, VendorProduct } from "@/screens/admin/types";

const VENDOR_STATUS_LABELS: Record<string, string> = {
  all: "الكل",
  active: "نشط",
  pending: "قيد المراجعة",
  rejected: "مرفوض",
  suspended: "موقوف",
};
const VENDOR_STATUS_COLORS: Record<string, string> = {
  active: AppColors.success,
  pending: AppColors.warning,
  rejected: AppColors.error,
  suspended: AppColors.gray500,
};
const BUSINESS_TYPE_LABELS: Record<string, string> = {
  restaurant: "مطعم",
  supermarket: "سوبرماركت",
  pharmacy: "صيدلية",
  bakery: "مخبز",
  other: "أخرى",
};

interface VendorProductForm {
  name: string;
  category: string;
  price: string;
  description: string;
  stock: string;
  unit: string;
  imageUri: string;
  imageUrl: string;
}

interface Props {
  vendorPartners: VendorPartner[];
  vendorsLoading: boolean;
  refetchVendors: () => void;
  vendorStatusFilter: string;
  setVendorStatusFilter: (v: any) => void;
  selectedVendor: VendorPartner | null;
  setSelectedVendor: React.Dispatch<React.SetStateAction<VendorPartner | null>>;
  isUpdatingVendorStatus: boolean;
  setIsUpdatingVendorStatus: (v: boolean) => void;
  deleteVendor: any;
  allVendorProducts?: { products: VendorProduct[]; total: number };
  refetchVendorProducts: () => void;
  deleteProductImage: any;
  deletingImageKey: string | null;
  setDeletingImageKey: (v: string | null) => void;
  addVendorProductOpen: boolean;
  setAddVendorProductOpen: (v: boolean) => void;
  vendorProductForm: VendorProductForm;
  setVendorProductForm: React.Dispatch<React.SetStateAction<VendorProductForm>>;
  saveVendorProduct: (vendorId: string) => void;
  savingVendorProduct: boolean;
  pickImage: (setter: (uri: string) => void) => void;
  queryClient: any;
  ADMIN_RED: string;
  theme: any;
}

function VendorsTabInner({
  vendorPartners,
  vendorsLoading,
  refetchVendors,
  vendorStatusFilter,
  setVendorStatusFilter,
  selectedVendor,
  setSelectedVendor,
  isUpdatingVendorStatus,
  setIsUpdatingVendorStatus,
  deleteVendor,
  allVendorProducts,
  refetchVendorProducts,
  deleteProductImage,
  deletingImageKey,
  setDeletingImageKey,
  addVendorProductOpen,
  setAddVendorProductOpen,
  vendorProductForm,
  setVendorProductForm,
  saveVendorProduct,
  savingVendorProduct,
  pickImage,
  queryClient,
  ADMIN_RED,
  theme,
}: Props) {
  const renderVendorsTab = () => {
    const filtered =
      vendorStatusFilter === "all"
        ? vendorPartners
        : vendorPartners.filter((v) => v.status === vendorStatusFilter);

    const vendorProductsMap: Record<string, VendorProduct[]> = {};
    (allVendorProducts?.products ?? []).forEach((p) => {
      if (!vendorProductsMap[p.vendorId]) vendorProductsMap[p.vendorId] = [];
      vendorProductsMap[p.vendorId].push(p);
    });

    const selectedProducts = selectedVendor
      ? (vendorProductsMap[selectedVendor.id] ?? [])
      : [];

    const handleDeleteVendor = (vendor: VendorPartner) => {
      const message = `هل أنت متأكد من حذف "${vendor.storeName}"؟ سيتم حذف المتجر وجميع منتجاته نهائياً من التطبيق وقاعدة البيانات.`;
      if (Platform.OS === "web") {
        if (window.confirm(message)) {
          deleteVendor.mutate(vendor.id);
        }
      } else {
        Alert.alert("تأكيد حذف المتجر", message, [
          { text: "إلغاء", style: "cancel" },
          {
            text: "حذف نهائياً",
            style: "destructive",
            onPress: () => deleteVendor.mutate(vendor.id),
          },
        ]);
      }
    };

    const handleUpdateVendorStatus = async (
      vendorId: string,
      status: "active" | "rejected" | "suspended",
      reason?: string,
    ) => {
      setIsUpdatingVendorStatus(true);
      try {
        const res = await fetch(
          `${getApiUrl()}/api/admin/vendor-partners/${vendorId}/status`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ status, reason }),
          },
        );
        if (!res.ok) throw new Error("failed");
        await refetchVendors();
        queryClient.invalidateQueries({
          queryKey: ["/api/admin/vendor-partners"],
        });
        setSelectedVendor((prev) =>
          prev && prev.id === vendorId ? { ...prev, status } : prev,
        );
        setSelectedVendor(null);
      } catch {
        Alert.alert("خطأ", "فشل تحديث حالة المتجر");
      } finally {
        setIsUpdatingVendorStatus(false);
      }
    };

    return (
      <View style={{ gap: Spacing.md }}>
        {/* Summary row */}
        <View style={{ flexDirection: "row-reverse", gap: Spacing.sm }}>
          {[
            { label: "الكل", count: vendorPartners.length, color: ADMIN_RED },
            {
              label: "نشط",
              count: vendorPartners.filter((v) => v.status === "active").length,
              color: AppColors.success,
            },
            {
              label: "قيد المراجعة",
              count: vendorPartners.filter((v) => v.status === "pending")
                .length,
              color: AppColors.warning,
            },
          ].map((s) => (
            <View
              key={s.label}
              style={{
                flex: 1,
                backgroundColor: s.color + "15",
                borderRadius: 14,
                padding: Spacing.md,
                alignItems: "center",
                gap: 4,
              }}
            >
              <ThemedText
                style={{
                  fontFamily: "Cairo_700Bold",
                  fontSize: 18,
                  color: s.color,
                }}
              >
                {s.count}
              </ThemedText>
              <ThemedText
                style={{
                  fontFamily: "Cairo_400Regular",
                  fontSize: 11,
                  color: s.color,
                  textAlign: "center",
                }}
              >
                {s.label}
              </ThemedText>
            </View>
          ))}
        </View>

        {/* Filter tabs */}
        <View
          style={{ flexDirection: "row-reverse", gap: 6, flexWrap: "wrap" }}
        >
          {(["all", "active", "pending", "rejected", "suspended"] as const).map(
            (f) => (
              <Pressable
                accessibilityRole="button"
                key={f}
                onPress={() => setVendorStatusFilter(f)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  borderRadius: 20,
                  backgroundColor:
                    vendorStatusFilter === f
                      ? ADMIN_RED
                      : theme.backgroundDefault,
                  borderWidth: 1,
                  borderColor:
                    vendorStatusFilter === f
                      ? ADMIN_RED
                      : (theme.border ?? AppColors.divider),
                }}
                testID={`vendor-filter-${f}`}
              >
                <ThemedText
                  style={{
                    fontFamily: "Cairo_700Bold",
                    fontSize: 12,
                    color:
                      vendorStatusFilter === f
                        ? AppColors.white
                        : theme.textSecondary,
                  }}
                >
                  {VENDOR_STATUS_LABELS[f]}
                </ThemedText>
              </Pressable>
            ),
          )}
        </View>

        {/* Store cards */}
        {vendorsLoading ? (
          <ActivityIndicator
            size="large"
            color={ADMIN_RED}
            style={{ paddingVertical: 40 }}
          />
        ) : filtered.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 40, gap: 8 }}>
            <Feather
              name="briefcase"
              size={40}
              color={ADMIN_RED}
              style={{ opacity: 0.3 }}
            />
            <ThemedText
              style={{
                fontFamily: "Cairo_700Bold",
                color: theme.textSecondary,
              }}
            >
              لا متاجر في هذه الفئة
            </ThemedText>
          </View>
        ) : (
          filtered.map((vendor) => {
            const products = vendorProductsMap[vendor.id] ?? [];
            const approvedCount = products.filter(
              (p) => p.status === "approved",
            ).length;
            return (
              <View
                key={vendor.id}
                style={{
                  backgroundColor: theme.backgroundDefault,
                  borderRadius: 16,
                  overflow: "hidden",
                  shadowColor: AppColors.black,
                  shadowOpacity: 0.05,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: 2,
                }}
              >
                {/* Cover — tappable to open detail */}
                <Pressable
                  onPress={() => setSelectedVendor(vendor)}
                  testID={`vendor-card-${vendor.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`فتح متجر ${vendor.storeName}`}
                >
                  {vendor.coverImageUrl ? (
                    <Image
                      source={{ uri: resolveImageUrl(vendor.coverImageUrl) }}
                      style={{ width: "100%", height: 72, resizeMode: "cover" }}
                    />
                  ) : (
                    <View
                      style={{
                        width: "100%",
                        height: 72,
                        backgroundColor: ADMIN_RED + "20",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Feather
                        name="briefcase"
                        size={28}
                        color={ADMIN_RED}
                        style={{ opacity: 0.5 }}
                      />
                    </View>
                  )}
                </Pressable>

                <View style={{ padding: Spacing.md, gap: Spacing.sm }}>
                  <View
                    style={{
                      flexDirection: "row-reverse",
                      alignItems: "center",
                      gap: Spacing.sm,
                    }}
                  >
                    {/* Logo */}
                    <Pressable
                      onPress={() => setSelectedVendor(vendor)}
                      accessibilityRole="button"
                      accessibilityLabel={`شعار متجر ${vendor.storeName}`}
                    >
                      {vendor.profileImageUrl ? (
                        <Image
                          source={{
                            uri: resolveImageUrl(vendor.profileImageUrl),
                          }}
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 12,
                            borderWidth: 2,
                            borderColor: AppColors.white,
                            marginTop: -20,
                          }}
                        />
                      ) : (
                        <View
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 12,
                            backgroundColor: ADMIN_RED + "30",
                            alignItems: "center",
                            justifyContent: "center",
                            marginTop: -20,
                            borderWidth: 2,
                            borderColor: AppColors.white,
                          }}
                        >
                          <Feather
                            name="briefcase"
                            size={20}
                            color={ADMIN_RED}
                          />
                        </View>
                      )}
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      style={{ flex: 1 }}
                      onPress={() => setSelectedVendor(vendor)}
                    >
                      <ThemedText
                        style={{
                          fontFamily: "Cairo_700Bold",
                          fontSize: 15,
                          color: theme.text,
                          textAlign: "right",
                        }}
                      >
                        {vendor.storeName}
                      </ThemedText>
                      <ThemedText
                        style={{
                          fontFamily: "Cairo_400Regular",
                          fontSize: 12,
                          color: theme.textSecondary,
                          textAlign: "right",
                        }}
                      >
                        {BUSINESS_TYPE_LABELS[vendor.businessType] ||
                          vendor.businessType}{" "}
                        · {vendor.phoneNumber}
                      </ThemedText>
                    </Pressable>
                    {/* Status badge */}
                    <View
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 20,
                        backgroundColor:
                          (VENDOR_STATUS_COLORS[vendor.status] ??
                            AppColors.gray500) + "20",
                      }}
                    >
                      <ThemedText
                        style={{
                          fontFamily: "Cairo_700Bold",
                          fontSize: 11,
                          color:
                            VENDOR_STATUS_COLORS[vendor.status] ??
                            AppColors.gray500,
                        }}
                      >
                        {VENDOR_STATUS_LABELS[vendor.status] ?? vendor.status}
                      </ThemedText>
                    </View>
                  </View>

                  {/* Stats row + delete button */}
                  <View
                    style={{
                      flexDirection: "row-reverse",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row-reverse",
                        gap: Spacing.lg,
                        flex: 1,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row-reverse",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <Feather
                          name="package"
                          size={13}
                          color={theme.textSecondary}
                        />
                        <ThemedText
                          style={{
                            fontFamily: "Cairo_400Regular",
                            fontSize: 12,
                            color: theme.textSecondary,
                          }}
                        >
                          {approvedCount} منتج
                        </ThemedText>
                      </View>
                      {vendor.deliveryTime ? (
                        <View
                          style={{
                            flexDirection: "row-reverse",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <Feather
                            name="clock"
                            size={13}
                            color={theme.textSecondary}
                          />
                          <ThemedText
                            style={{
                              fontFamily: "Cairo_400Regular",
                              fontSize: 12,
                              color: theme.textSecondary,
                            }}
                          >
                            {vendor.deliveryTime}
                          </ThemedText>
                        </View>
                      ) : null}
                      {vendor.createdAt ? (
                        <View
                          style={{
                            flexDirection: "row-reverse",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <Feather
                            name="calendar"
                            size={13}
                            color={theme.textSecondary}
                          />
                          <ThemedText
                            style={{
                              fontFamily: "Cairo_400Regular",
                              fontSize: 12,
                              color: theme.textSecondary,
                            }}
                          >
                            {new Date(vendor.createdAt).toLocaleDateString(
                              "ar-IQ",
                              {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              },
                            )}
                          </ThemedText>
                        </View>
                      ) : null}
                    </View>
                    {/* Quick delete button */}
                    <Pressable
                      onPress={() => handleDeleteVendor(vendor)}
                      disabled={
                        deleteVendor.isPending &&
                        deleteVendor.variables === vendor.id
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`حذف متجر ${vendor.storeName}`}
                      accessibilityHint="يفتح تأكيداً قبل الحذف"
                      accessibilityState={{
                        disabled:
                          deleteVendor.isPending &&
                          deleteVendor.variables === vendor.id,
                      }}
                      style={({ pressed }) => ({
                        width: 34,
                        height: 34,
                        borderRadius: 10,
                        backgroundColor: pressed
                          ? AppColors.error + "25"
                          : AppColors.error + "15",
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: Spacing.xs,
                      })}
                    >
                      <Feather
                        name="trash-2"
                        size={16}
                        color={AppColors.error}
                      />
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          })
        )}

        {/* Vendor Detail Modal */}
        {selectedVendor ? (
          <Modal
            transparent
            animationType="slide"
            visible
            onRequestClose={() => setSelectedVendor(null)}
          >
            <View style={{ flex: 1, backgroundColor: AppColors.overlay }}>
              <Pressable
                style={{ flex: 1 }}
                onPress={() => setSelectedVendor(null)}
                accessibilityRole="button"
                accessibilityLabel="إغلاق"
              />
              <View
                style={{
                  backgroundColor: theme.backgroundDefault,
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 24,
                  maxHeight: "85%",
                }}
              >
                {/* Header */}
                <View
                  style={{
                    flexDirection: "row-reverse",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: Spacing.lg,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.border ?? AppColors.divider,
                  }}
                >
                  <ThemedText
                    style={{
                      fontFamily: "Cairo_700Bold",
                      fontSize: 17,
                      color: theme.text,
                    }}
                  >
                    {selectedVendor.storeName}
                  </ThemedText>
                  <Pressable
                    onPress={() => setSelectedVendor(null)}
                    accessibilityRole="button"
                    accessibilityLabel={`إغلاق ${selectedVendor.storeName}`}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: AppColors.gray100,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Feather name="x" size={18} color={AppColors.gray700} />
                  </Pressable>
                </View>
                <ScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={{
                    padding: Spacing.lg,
                    gap: Spacing.md,
                  }}
                >
                  {/* Cover + logo */}
                  {selectedVendor.coverImageUrl ? (
                    <Image
                      source={{
                        uri: resolveImageUrl(selectedVendor.coverImageUrl),
                      }}
                      style={{
                        width: "100%",
                        height: 130,
                        borderRadius: 14,
                        resizeMode: "cover",
                      }}
                    />
                  ) : null}

                  {/* Info card */}
                  <View
                    style={{
                      backgroundColor: theme.backgroundRoot,
                      borderRadius: 14,
                      padding: Spacing.md,
                      gap: 10,
                    }}
                  >
                    {[
                      {
                        label: "نوع المتجر",
                        value:
                          BUSINESS_TYPE_LABELS[selectedVendor.businessType] ||
                          selectedVendor.businessType,
                      },
                      {
                        label: "رقم الهاتف",
                        value: selectedVendor.phoneNumber,
                      },
                      {
                        label: "العنوان",
                        value: selectedVendor.address || "—",
                      },
                      {
                        label: "وقت التوصيل",
                        value: selectedVendor.deliveryTime || "—",
                      },
                      {
                        label: "رسوم التوصيل",
                        value:
                          selectedVendor.deliveryPrice != null
                            ? formatPrice(selectedVendor.deliveryPrice)
                            : "—",
                      },
                      {
                        label: "تاريخ التسجيل",
                        value: selectedVendor.createdAt
                          ? new Date(
                              selectedVendor.createdAt,
                            ).toLocaleDateString("ar-IQ", {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            })
                          : "—",
                      },
                      {
                        label: "تاريخ الموافقة",
                        value: selectedVendor.approvedAt
                          ? new Date(
                              selectedVendor.approvedAt,
                            ).toLocaleDateString("ar-IQ", {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            })
                          : "—",
                      },
                    ].map((item) => (
                      <View
                        key={item.label}
                        style={{
                          flexDirection: "row-reverse",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                        }}
                      >
                        <ThemedText
                          style={{
                            fontFamily: "Cairo_700Bold",
                            fontSize: 13,
                            color: theme.textSecondary,
                          }}
                        >
                          {item.label}
                        </ThemedText>
                        <ThemedText
                          style={{
                            fontFamily: "Cairo_400Regular",
                            fontSize: 13,
                            color: theme.text,
                            textAlign: "left",
                            flex: 1,
                            marginLeft: 8,
                          }}
                        >
                          {item.value}
                        </ThemedText>
                      </View>
                    ))}
                    {selectedVendor.bio ? (
                      <View style={{ gap: 4 }}>
                        <ThemedText
                          style={{
                            fontFamily: "Cairo_700Bold",
                            fontSize: 13,
                            color: theme.textSecondary,
                            textAlign: "right",
                          }}
                        >
                          نبذة عن المتجر
                        </ThemedText>
                        <ThemedText
                          style={{
                            fontFamily: "Cairo_400Regular",
                            fontSize: 13,
                            color: theme.text,
                            textAlign: "right",
                          }}
                        >
                          {selectedVendor.bio}
                        </ThemedText>
                      </View>
                    ) : null}
                  </View>

                  {/* Status badge */}
                  <View
                    style={{
                      flexDirection: "row-reverse",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <ThemedText
                      style={{
                        fontFamily: "Cairo_700Bold",
                        fontSize: 13,
                        color: theme.textSecondary,
                      }}
                    >
                      الحالة:
                    </ThemedText>
                    <View
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 5,
                        borderRadius: 20,
                        backgroundColor:
                          (VENDOR_STATUS_COLORS[selectedVendor.status] ??
                            AppColors.gray500) + "20",
                      }}
                    >
                      <ThemedText
                        style={{
                          fontFamily: "Cairo_700Bold",
                          fontSize: 13,
                          color:
                            VENDOR_STATUS_COLORS[selectedVendor.status] ??
                            AppColors.gray500,
                        }}
                      >
                        {VENDOR_STATUS_LABELS[selectedVendor.status] ??
                          selectedVendor.status}
                      </ThemedText>
                    </View>
                  </View>

                  {/* Action buttons */}
                  <View
                    style={{ flexDirection: "row-reverse", gap: Spacing.sm }}
                  >
                    {selectedVendor.status === "pending" ? (
                      <>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() =>
                            handleUpdateVendorStatus(
                              selectedVendor.id,
                              "active",
                            )
                          }
                          disabled={isUpdatingVendorStatus}
                          testID={`button-approve-vendor-${selectedVendor.id}`}
                          style={{
                            flex: 1,
                            backgroundColor: AppColors.success,
                            borderRadius: BorderRadius.md,
                            paddingVertical: Spacing.md,
                            alignItems: "center",
                            justifyContent: "center",
                            opacity: isUpdatingVendorStatus ? 0.6 : 1,
                          }}
                        >
                          {isUpdatingVendorStatus ? (
                            <ActivityIndicator
                              size="small"
                              color={AppColors.white}
                            />
                          ) : (
                            <ThemedText
                              style={{
                                fontFamily: "Cairo_700Bold",
                                fontSize: 14,
                                color: AppColors.white,
                              }}
                            >
                              موافقة
                            </ThemedText>
                          )}
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() =>
                            handleUpdateVendorStatus(
                              selectedVendor.id,
                              "rejected",
                              "لا يستوفي الشروط",
                            )
                          }
                          disabled={isUpdatingVendorStatus}
                          testID={`button-reject-vendor-${selectedVendor.id}`}
                          style={{
                            flex: 1,
                            backgroundColor: AppColors.error,
                            borderRadius: BorderRadius.md,
                            paddingVertical: Spacing.md,
                            alignItems: "center",
                            justifyContent: "center",
                            opacity: isUpdatingVendorStatus ? 0.6 : 1,
                          }}
                        >
                          <ThemedText
                            style={{
                              fontFamily: "Cairo_700Bold",
                              fontSize: 14,
                              color: AppColors.white,
                            }}
                          >
                            رفض
                          </ThemedText>
                        </Pressable>
                      </>
                    ) : selectedVendor.status === "active" ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() =>
                          handleUpdateVendorStatus(
                            selectedVendor.id,
                            "suspended",
                          )
                        }
                        disabled={isUpdatingVendorStatus}
                        testID={`button-suspend-vendor-${selectedVendor.id}`}
                        style={{
                          flex: 1,
                          backgroundColor: AppColors.warning,
                          borderRadius: BorderRadius.md,
                          paddingVertical: Spacing.md,
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: isUpdatingVendorStatus ? 0.6 : 1,
                        }}
                      >
                        {isUpdatingVendorStatus ? (
                          <ActivityIndicator
                            size="small"
                            color={AppColors.white}
                          />
                        ) : (
                          <ThemedText
                            style={{
                              fontFamily: "Cairo_700Bold",
                              fontSize: 14,
                              color: AppColors.white,
                            }}
                          >
                            تعليق المتجر
                          </ThemedText>
                        )}
                      </Pressable>
                    ) : (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() =>
                          handleUpdateVendorStatus(selectedVendor.id, "active")
                        }
                        disabled={isUpdatingVendorStatus}
                        testID={`button-reactivate-vendor-${selectedVendor.id}`}
                        style={{
                          flex: 1,
                          backgroundColor: AppColors.success,
                          borderRadius: BorderRadius.md,
                          paddingVertical: Spacing.md,
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: isUpdatingVendorStatus ? 0.6 : 1,
                        }}
                      >
                        {isUpdatingVendorStatus ? (
                          <ActivityIndicator
                            size="small"
                            color={AppColors.white}
                          />
                        ) : (
                          <ThemedText
                            style={{
                              fontFamily: "Cairo_700Bold",
                              fontSize: 14,
                              color: AppColors.white,
                            }}
                          >
                            إعادة تفعيل المتجر
                          </ThemedText>
                        )}
                      </Pressable>
                    )}
                  </View>

                  {/* Delete vendor */}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => handleDeleteVendor(selectedVendor)}
                    disabled={deleteVendor.isPending}
                    testID={`button-delete-vendor-${selectedVendor.id}`}
                    accessibilityLabel={`حذف متجر ${selectedVendor.storeName}`}
                    accessibilityHint="يفتح تأكيداً قبل الحذف"
                    accessibilityState={{
                      disabled: deleteVendor.isPending,
                      busy: deleteVendor.isPending,
                    }}
                    style={{
                      flexDirection: "row-reverse",
                      gap: 8,
                      backgroundColor: AppColors.error + "15",
                      borderRadius: BorderRadius.md,
                      paddingVertical: Spacing.md,
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: deleteVendor.isPending ? 0.6 : 1,
                    }}
                  >
                    {deleteVendor.isPending ? (
                      <ActivityIndicator size="small" color={AppColors.error} />
                    ) : (
                      <>
                        <Feather
                          name="trash-2"
                          size={16}
                          color={AppColors.error}
                        />
                        <ThemedText
                          style={{
                            fontFamily: "Cairo_700Bold",
                            fontSize: 14,
                            color: AppColors.error,
                          }}
                        >
                          حذف المتجر نهائياً
                        </ThemedText>
                      </>
                    )}
                  </Pressable>

                  {/* Products section */}
                  <View style={{ gap: Spacing.sm }}>
                    <View
                      style={{
                        flexDirection: "row-reverse",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <Feather name="package" size={16} color={ADMIN_RED} />
                      <ThemedText
                        style={{
                          fontFamily: "Cairo_700Bold",
                          fontSize: 15,
                          color: theme.text,
                          flex: 1,
                        }}
                      >
                        المنتجات ({selectedProducts.length})
                      </ThemedText>
                      <Pressable
                        onPress={() => refetchVendorProducts()}
                        style={{ padding: 6 }}
                        accessibilityRole="button"
                        accessibilityLabel="تحديث قائمة المنتجات"
                      >
                        <Feather
                          name="refresh-cw"
                          size={14}
                          color={theme.textSecondary}
                        />
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                          setVendorProductForm({
                            name: "",
                            category: "",
                            price: "",
                            description: "",
                            stock: "0",
                            unit: "قطعة",
                            imageUri: "",
                            imageUrl: "",
                          });
                          setAddVendorProductOpen(true);
                        }}
                        style={{
                          flexDirection: "row-reverse",
                          alignItems: "center",
                          gap: 4,
                          backgroundColor: ADMIN_RED,
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 8,
                        }}
                      >
                        <Feather
                          name="plus"
                          size={13}
                          color={AppColors.white}
                        />
                        <ThemedText
                          style={{
                            fontFamily: "Cairo_700Bold",
                            fontSize: 12,
                            color: AppColors.white,
                          }}
                        >
                          إضافة منتج
                        </ThemedText>
                      </Pressable>
                    </View>
                    {selectedProducts.length === 0 ? (
                      <ThemedText
                        style={{
                          fontFamily: "Cairo_400Regular",
                          fontSize: 13,
                          color: theme.textSecondary,
                          textAlign: "right",
                        }}
                      >
                        لا توجد منتجات بعد
                      </ThemedText>
                    ) : (
                      selectedProducts.map((prod) => {
                        const allImages: string[] = prod.imageUrls?.length
                          ? prod.imageUrls
                          : prod.imageUrl
                            ? [prod.imageUrl]
                            : [];
                        return (
                          <View
                            key={prod.id}
                            style={{
                              backgroundColor: theme.backgroundRoot,
                              borderRadius: 12,
                              padding: Spacing.md,
                              gap: Spacing.sm,
                            }}
                          >
                            {/* Product header row */}
                            <View
                              style={{
                                flexDirection: "row-reverse",
                                alignItems: "center",
                                gap: Spacing.md,
                              }}
                            >
                              {allImages[0] ? (
                                <Image
                                  source={{
                                    uri: resolveImageUrl(allImages[0]),
                                  }}
                                  style={{
                                    width: 52,
                                    height: 52,
                                    borderRadius: 10,
                                    resizeMode: "cover",
                                  }}
                                />
                              ) : (
                                <View
                                  style={{
                                    width: 52,
                                    height: 52,
                                    borderRadius: 10,
                                    backgroundColor: ADMIN_RED + "15",
                                    alignItems: "center",
                                    justifyContent: "center",
                                  }}
                                >
                                  <Feather
                                    name="image"
                                    size={20}
                                    color={ADMIN_RED}
                                    style={{ opacity: 0.5 }}
                                  />
                                </View>
                              )}
                              <View style={{ flex: 1, gap: 2 }}>
                                <ThemedText
                                  style={{
                                    fontFamily: "Cairo_700Bold",
                                    fontSize: 14,
                                    color: theme.text,
                                    textAlign: "right",
                                  }}
                                >
                                  {prod.name}
                                </ThemedText>
                                <ThemedText
                                  style={{
                                    fontFamily: "Cairo_700Bold",
                                    fontSize: 13,
                                    color: ADMIN_RED,
                                    textAlign: "right",
                                  }}
                                >
                                  {formatPrice(prod.price)}
                                </ThemedText>
                                {prod.description ? (
                                  <ThemedText
                                    style={{
                                      fontFamily: "Cairo_400Regular",
                                      fontSize: 11,
                                      color: theme.textSecondary,
                                      textAlign: "right",
                                    }}
                                    numberOfLines={2}
                                  >
                                    {prod.description}
                                  </ThemedText>
                                ) : null}
                              </View>
                              <View
                                style={{
                                  paddingHorizontal: 8,
                                  paddingVertical: 3,
                                  borderRadius: 8,
                                  backgroundColor:
                                    prod.status === "approved"
                                      ? AppColors.success + "20"
                                      : prod.status === "pending"
                                        ? AppColors.warning + "20"
                                        : AppColors.error + "20",
                                }}
                              >
                                <ThemedText
                                  style={{
                                    fontFamily: "Cairo_700Bold",
                                    fontSize: 10,
                                    color:
                                      prod.status === "approved"
                                        ? AppColors.success
                                        : prod.status === "pending"
                                          ? AppColors.warning
                                          : AppColors.error,
                                  }}
                                >
                                  {prod.status === "approved"
                                    ? "نشط"
                                    : prod.status === "pending"
                                      ? "قيد المراجعة"
                                      : "مرفوض"}
                                </ThemedText>
                              </View>
                            </View>
                            {/* All images with delete buttons */}
                            {allImages.length > 0 ? (
                              <View
                                style={{
                                  flexDirection: "row-reverse",
                                  flexWrap: "wrap",
                                  gap: 8,
                                }}
                              >
                                {allImages.map((imgUrl, idx) => {
                                  const imgKey = `${prod.id}_${idx}`;
                                  const isDeleting =
                                    deletingImageKey === imgKey;
                                  return (
                                    <View
                                      key={imgUrl}
                                      style={{
                                        position: "relative",
                                        overflow: "visible" as any,
                                      }}
                                    >
                                      <Image
                                        source={{
                                          uri: resolveImageUrl(imgUrl),
                                        }}
                                        style={{
                                          width: 64,
                                          height: 64,
                                          borderRadius: 8,
                                          resizeMode: "cover",
                                        }}
                                      />
                                      <Pressable
                                        onPress={() => {
                                          const confirm =
                                            Platform.OS === "web"
                                              ? window.confirm(
                                                  "حذف هذه الصورة؟",
                                                )
                                              : true;
                                          if (confirm) {
                                            setDeletingImageKey(imgKey);
                                            deleteProductImage.mutate({
                                              pid: prod.id,
                                              imageUrl: imgUrl,
                                            });
                                          }
                                        }}
                                        disabled={isDeleting}
                                        accessibilityRole="button"
                                        accessibilityLabel={`حذف صورة من ${prod.name}`}
                                        accessibilityState={{
                                          disabled: isDeleting,
                                          busy: isDeleting,
                                        }}
                                        style={{
                                          position: "absolute",
                                          top: -6,
                                          right: -6,
                                          backgroundColor: AppColors.error,
                                          borderRadius: 10,
                                          width: 20,
                                          height: 20,
                                          alignItems: "center",
                                          justifyContent: "center",
                                        }}
                                      >
                                        {isDeleting ? (
                                          <ActivityIndicator
                                            size="small"
                                            color={AppColors.white}
                                          />
                                        ) : (
                                          <Feather
                                            name="x"
                                            size={11}
                                            color={AppColors.white}
                                          />
                                        )}
                                      </Pressable>
                                    </View>
                                  );
                                })}
                              </View>
                            ) : null}
                          </View>
                        );
                      })
                    )}
                  </View>
                </ScrollView>
              </View>
            </View>
          </Modal>
        ) : null}

        {/* Add Vendor Product Modal */}
        {addVendorProductOpen && selectedVendor ? (
          <Modal
            transparent
            animationType="slide"
            visible
            onRequestClose={() => setAddVendorProductOpen(false)}
          >
            <View style={{ flex: 1, backgroundColor: AppColors.overlay }}>
              <Pressable
                style={{ flex: 1 }}
                onPress={() => setAddVendorProductOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="إغلاق"
              />
              <View
                style={{
                  backgroundColor: theme.backgroundDefault,
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 24,
                  maxHeight: "90%",
                }}
              >
                {/* Header */}
                <View
                  style={{
                    flexDirection: "row-reverse",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: Spacing.lg,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.border ?? AppColors.divider,
                  }}
                >
                  <ThemedText
                    style={{
                      fontFamily: "Cairo_700Bold",
                      fontSize: 16,
                      color: theme.text,
                    }}
                  >
                    إضافة منتج لـ {selectedVendor.storeName}
                  </ThemedText>
                  <Pressable
                    onPress={() => setAddVendorProductOpen(false)}
                    accessibilityRole="button"
                    accessibilityLabel="إغلاق إضافة منتج"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: AppColors.gray100,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Feather name="x" size={18} color={AppColors.gray700} />
                  </Pressable>
                </View>
                <ScrollView
                  contentContainerStyle={{
                    padding: Spacing.lg,
                    gap: Spacing.md,
                  }}
                >
                  {/* Name */}
                  <TextInput
                    style={[
                      {
                        backgroundColor: theme.backgroundSecondary,
                        color: theme.text,
                        borderRadius: 10,
                        padding: 12,
                        fontFamily: "Cairo_400Regular",
                        fontSize: 14,
                        textAlign: "right",
                        borderWidth: 1,
                        borderColor: theme.border ?? AppColors.divider,
                      },
                    ]}
                    placeholder={
                      (CATEGORY_MAP as any)[selectedVendor.businessType]
                        ? `مثال: ${(CATEGORY_MAP as any)[selectedVendor.businessType][0]}`
                        : "اسم المنتج"
                    }
                    placeholderTextColor={theme.textSecondary}
                    value={vendorProductForm.name}
                    onChangeText={(t) =>
                      setVendorProductForm({ ...vendorProductForm, name: t })
                    }
                  />
                  {/* Category chips */}
                  <View style={{ gap: 6 }}>
                    <ThemedText
                      style={{
                        fontFamily: "Cairo_700Bold",
                        fontSize: 13,
                        color: theme.textSecondary,
                        textAlign: "right",
                      }}
                    >
                      الفئة *
                    </ThemedText>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{
                        gap: 8,
                        flexDirection: "row-reverse",
                      }}
                    >
                      {(
                        (CATEGORY_MAP as any)[selectedVendor.businessType] ??
                        (CATEGORY_MAP as any).other ??
                        []
                      ).map((cat: string) => (
                        <Pressable
                          accessibilityRole="button"
                          key={cat}
                          onPress={() =>
                            setVendorProductForm({
                              ...vendorProductForm,
                              category: cat,
                            })
                          }
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 20,
                            backgroundColor:
                              vendorProductForm.category === cat
                                ? ADMIN_RED
                                : theme.backgroundSecondary,
                            borderWidth: 1,
                            borderColor:
                              vendorProductForm.category === cat
                                ? ADMIN_RED
                                : (theme.border ?? AppColors.divider),
                          }}
                        >
                          <ThemedText
                            style={{
                              fontFamily: "Cairo_700Bold",
                              fontSize: 12,
                              color:
                                vendorProductForm.category === cat
                                  ? AppColors.white
                                  : theme.text,
                            }}
                          >
                            {cat}
                          </ThemedText>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                  {/* Price & Stock row */}
                  <View style={{ flexDirection: "row-reverse", gap: 10 }}>
                    <TextInput
                      style={[
                        {
                          flex: 1,
                          backgroundColor: theme.backgroundSecondary,
                          color: theme.text,
                          borderRadius: 10,
                          padding: 12,
                          fontFamily: "Cairo_400Regular",
                          fontSize: 14,
                          textAlign: "right",
                          borderWidth: 1,
                          borderColor: theme.border ?? AppColors.divider,
                        },
                      ]}
                      placeholder="السعر (د.ع) *"
                      placeholderTextColor={theme.textSecondary}
                      value={vendorProductForm.price}
                      onChangeText={(t) =>
                        setVendorProductForm({ ...vendorProductForm, price: t })
                      }
                      keyboardType="numeric"
                    />
                    <TextInput
                      style={[
                        {
                          flex: 1,
                          backgroundColor: theme.backgroundSecondary,
                          color: theme.text,
                          borderRadius: 10,
                          padding: 12,
                          fontFamily: "Cairo_400Regular",
                          fontSize: 14,
                          textAlign: "right",
                          borderWidth: 1,
                          borderColor: theme.border ?? AppColors.divider,
                        },
                      ]}
                      placeholder="المخزون"
                      placeholderTextColor={theme.textSecondary}
                      value={vendorProductForm.stock}
                      onChangeText={(t) =>
                        setVendorProductForm({ ...vendorProductForm, stock: t })
                      }
                      keyboardType="numeric"
                    />
                  </View>
                  {/* Unit */}
                  <TextInput
                    style={[
                      {
                        backgroundColor: theme.backgroundSecondary,
                        color: theme.text,
                        borderRadius: 10,
                        padding: 12,
                        fontFamily: "Cairo_400Regular",
                        fontSize: 14,
                        textAlign: "right",
                        borderWidth: 1,
                        borderColor: theme.border ?? AppColors.divider,
                      },
                    ]}
                    placeholder="الوحدة (قطعة، كيلو، لتر...)"
                    placeholderTextColor={theme.textSecondary}
                    value={vendorProductForm.unit}
                    onChangeText={(t) =>
                      setVendorProductForm({ ...vendorProductForm, unit: t })
                    }
                  />
                  {/* Description */}
                  <TextInput
                    style={[
                      {
                        backgroundColor: theme.backgroundSecondary,
                        color: theme.text,
                        borderRadius: 10,
                        padding: 12,
                        fontFamily: "Cairo_400Regular",
                        fontSize: 14,
                        textAlign: "right",
                        borderWidth: 1,
                        borderColor: theme.border ?? AppColors.divider,
                        minHeight: 80,
                        textAlignVertical: "top",
                      },
                    ]}
                    placeholder="وصف المنتج (اختياري)"
                    placeholderTextColor={theme.textSecondary}
                    value={vendorProductForm.description}
                    onChangeText={(t) =>
                      setVendorProductForm({
                        ...vendorProductForm,
                        description: t,
                      })
                    }
                    multiline
                    numberOfLines={3}
                  />
                  {/* Image picker */}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      pickImage((uri) =>
                        setVendorProductForm({
                          ...vendorProductForm,
                          imageUri: uri,
                          imageUrl: "",
                        }),
                      )
                    }
                    style={{
                      borderWidth: 1.5,
                      borderColor: theme.border ?? AppColors.divider,
                      borderStyle: "dashed",
                      borderRadius: 12,
                      height: 110,
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                    }}
                  >
                    {vendorProductForm.imageUri ||
                    vendorProductForm.imageUrl ? (
                      <Image
                        source={{
                          uri:
                            vendorProductForm.imageUri ||
                            resolveImageUrl(vendorProductForm.imageUrl),
                        }}
                        style={
                          {
                            width: "100%",
                            height: "100%",
                            resizeMode: "cover",
                          } as any
                        }
                      />
                    ) : (
                      <View style={{ alignItems: "center", gap: 6 }}>
                        <Feather
                          name="camera"
                          size={28}
                          color={theme.textSecondary}
                        />
                        <ThemedText
                          style={{
                            fontFamily: "Cairo_400Regular",
                            fontSize: 13,
                            color: theme.textSecondary,
                          }}
                        >
                          إضافة صورة (اختياري)
                        </ThemedText>
                      </View>
                    )}
                  </Pressable>
                  {/* Save button */}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => saveVendorProduct(selectedVendor.id)}
                    disabled={savingVendorProduct}
                    style={{
                      backgroundColor: ADMIN_RED,
                      borderRadius: 12,
                      paddingVertical: 14,
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: savingVendorProduct ? 0.6 : 1,
                      marginBottom: Spacing.lg,
                    }}
                  >
                    {savingVendorProduct ? (
                      <ActivityIndicator color={AppColors.white} />
                    ) : (
                      <ThemedText
                        style={{
                          fontFamily: "Cairo_700Bold",
                          fontSize: 15,
                          color: AppColors.white,
                        }}
                      >
                        إضافة المنتج
                      </ThemedText>
                    )}
                  </Pressable>
                </ScrollView>
              </View>
            </View>
          </Modal>
        ) : null}
      </View>
    );
  };

  return renderVendorsTab();
}

export const VendorsTab = React.memo(VendorsTabInner);
