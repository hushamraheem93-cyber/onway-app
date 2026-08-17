/**
 * The admin "التخزين" (storage) tab (H-65).
 *
 * The JSX below is the former `renderStorageTab` moved verbatim out of
 * AdminScreen — no markup, style or condition was changed. It referenced only
 * five bindings from the parent and zero entries of AdminScreen's shared
 * StyleSheet, which is what made it the safest of the fourteen tabs to lift out.
 *
 * Memoised: the parent re-renders on every keystroke in any of its ~40 form
 * inputs, and none of those touch storage. With stable props this tab now
 * re-renders only when the storage stats themselves change.
 */
import React from "react";
import { View, Pressable, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { Spacing, BorderRadius, AppColors } from "@/constants/theme";

interface Props {
  storageStats: any | null;
  storageStatsLoading: boolean;
  storageStatsError: string | null;
  loadStorageStats: () => void;
  theme: any;
}

function StorageTabInner({
  storageStats,
  storageStatsLoading,
  storageStatsError,
  loadStorageStats,
  theme,
}: Props) {
  return (
    <View style={{ gap: Spacing.lg }}>
      {/* Header */}
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
            <Feather name="hard-drive" size={24} color={AppColors.white} />
          </View>
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <ThemedText
              style={{
                color: AppColors.white,
                fontSize: 18,
                fontFamily: "Cairo_700Bold",
              }}
            >
              إحصائيات التخزين
            </ThemedText>
            <ThemedText
              style={{
                color: AppColors.textOnBrandMuted,
                fontSize: 13,
                fontFamily: "Cairo_400Regular",
              }}
            >
              صور منتجات المتاجر — للقراءة فقط
            </ThemedText>
          </View>
        </View>
      </View>

      {storageStatsLoading ? (
        <ActivityIndicator
          color={AppColors.primary}
          style={{ marginTop: 40 }}
        />
      ) : storageStatsError ? (
        <View
          style={{
            backgroundColor: AppColors.errorLight,
            borderRadius: BorderRadius.lg,
            padding: Spacing.lg,
            alignItems: "center",
            gap: Spacing.sm,
          }}
        >
          <Feather name="alert-circle" size={24} color={AppColors.error} />
          <ThemedText
            style={{ color: AppColors.error, fontFamily: "Cairo_400Regular" }}
          >
            {storageStatsError}
          </ThemedText>
          <Pressable onPress={loadStorageStats} style={{ marginTop: 4 }}>
            <ThemedText
              style={{
                color: AppColors.primary,
                fontFamily: "Cairo_600SemiBold",
              }}
            >
              إعادة المحاولة
            </ThemedText>
          </Pressable>
        </View>
      ) : storageStats ? (
        <View style={{ gap: Spacing.md }}>
          {/* Summary grid */}
          <ThemedText
            style={{
              fontFamily: "Cairo_700Bold",
              fontSize: 14,
              color: theme.textSecondary,
              textAlign: "right",
            }}
          >
            ملخص
          </ThemedText>
          <View
            style={{ flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm }}
          >
            {(
              [
                {
                  label: "المنتجات النشطة",
                  value: storageStats.totalProducts,
                  icon: "package" as const,
                  color: AppColors.primary,
                },
                {
                  label: "إجمالي الصور",
                  value: storageStats.totalImages,
                  icon: "image" as const,
                  color: AppColors.info,
                },
                {
                  label: "الصور المصغرة",
                  value: storageStats.totalThumbs,
                  icon: "grid" as const,
                  color: AppColors.success,
                },
                {
                  label: "الصور الكاملة",
                  value: Math.max(
                    0,
                    storageStats.totalImages - storageStats.totalThumbs,
                  ),
                  icon: "maximize" as const,
                  color: AppColors.statusPurple,
                },
              ] as const
            ).map((card, i) => (
              <View
                key={i}
                style={{
                  width: "47%",
                  backgroundColor: theme.backgroundDefault,
                  borderRadius: 20,
                  padding: Spacing.md + 2,
                  gap: 6,
                  borderWidth: 1,
                  borderColor: theme.border,
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
                  <ThemedText
                    style={{
                      fontFamily: "Cairo_700Bold",
                      fontSize: 26,
                      lineHeight: 36,
                      includeFontPadding: true,
                      color: AppColors.gray800,
                    }}
                  >
                    {card.value}
                  </ThemedText>
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

          {/* Top stores */}
          {storageStats.topStores?.length > 0 && (
            <View style={{ gap: Spacing.sm }}>
              <ThemedText
                style={{
                  fontFamily: "Cairo_700Bold",
                  fontSize: 14,
                  color: theme.textSecondary,
                  textAlign: "right",
                }}
              >
                أكبر المتاجر استخداماً للصور
              </ThemedText>
              <View
                style={{
                  backgroundColor: theme.backgroundDefault,
                  borderRadius: BorderRadius.lg,
                  overflow: "hidden",
                }}
              >
                {storageStats.topStores.map((store: any, i: number) => (
                  <View
                    key={store.vendorId}
                    style={{
                      flexDirection: "row-reverse",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: Spacing.md,
                      borderBottomWidth:
                        i < storageStats.topStores.length - 1 ? 1 : 0,
                      borderBottomColor: theme.border,
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
                          width: 30,
                          height: 30,
                          borderRadius: 8,
                          backgroundColor: AppColors.primary + "15",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <ThemedText
                          style={{
                            fontFamily: "Cairo_700Bold",
                            fontSize: 13,
                            color: AppColors.primary,
                          }}
                        >
                          {i + 1}
                        </ThemedText>
                      </View>
                      <ThemedText
                        style={{
                          fontFamily: "Cairo_600SemiBold",
                          fontSize: 14,
                          color: theme.text,
                        }}
                      >
                        {store.storeName}
                      </ThemedText>
                    </View>
                    <View
                      style={{
                        flexDirection: "row-reverse",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Feather
                        name="image"
                        size={13}
                        color={theme.textSecondary}
                      />
                      <ThemedText
                        style={{
                          fontFamily: "Cairo_400Regular",
                          fontSize: 13,
                          color: theme.textSecondary,
                        }}
                      >
                        {store.imageCount}
                      </ThemedText>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          <ThemedText
            style={{
              fontFamily: "Cairo_400Regular",
              fontSize: 11,
              color: theme.textSecondary,
              textAlign: "center",
            }}
          >
            آخر تحديث:{" "}
            {new Date(storageStats.computedAt).toLocaleString("ar-IQ")}
          </ThemedText>
          <Pressable
            onPress={loadStorageStats}
            style={{
              backgroundColor: theme.backgroundSecondary,
              borderRadius: BorderRadius.lg,
              padding: Spacing.md,
              alignItems: "center",
            }}
          >
            <ThemedText
              style={{
                fontFamily: "Cairo_600SemiBold",
                fontSize: 14,
                color: AppColors.primary,
              }}
            >
              تحديث الإحصائيات
            </ThemedText>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

export const StorageTab = React.memo(StorageTabInner);
