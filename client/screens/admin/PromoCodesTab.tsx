/**
 * The admin "الخصومات" (promo codes) tab (H-65).
 *
 * `renderPromoCodesTab` moved verbatim out of AdminScreen. Discount maths is not
 * done here and never was — the tab edits the code, its kind, its value and its
 * expiry, and `savePromoCode` in AdminScreen performs the write and surfaces a
 * rejected one rather than swallowing it.
 */
import React from "react";
import { View, Pressable, TextInput, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { Spacing, AppColors } from "@/constants/theme";
import { formatPrice } from "@/constants/currency";
import { styles } from "@/screens/admin/adminStyles";

interface PromoForm {
  code: string;
  type: "fixed" | "percentage";
  value: string;
  expiryDate: string;
}

interface Props {
  promoCodes: any[];
  promoCodesLoading: boolean;
  promoForm: PromoForm;
  setPromoForm: React.Dispatch<React.SetStateAction<PromoForm>>;
  savePromoCode: () => void;
  handleEditPromo: (promo: any) => void;
  confirmDelete: (id: string, type: "promoCode") => void;
  isEditing: boolean;
  editItem: any;
  resetForm: () => void;
  theme: any;
}

function PromoCodesTabInner({
  promoCodes,
  promoCodesLoading,
  promoForm,
  setPromoForm,
  savePromoCode,
  handleEditPromo,
  confirmDelete,
  isEditing,
  editItem,
  resetForm,
  theme,
}: Props) {
  const renderPromoCodesTab = () => (
    <View>
      <View style={styles.formCard}>
        <ThemedText type="h4" style={styles.formTitle}>
          {editItem ? "تعديل كود الخصم" : "إضافة كود خصم جديد"}
        </ThemedText>

        <TextInput
          style={[
            styles.input,
            { backgroundColor: theme.backgroundSecondary, color: theme.text },
          ]}
          placeholder="كود الخصم"
          placeholderTextColor={theme.textSecondary}
          value={promoForm.code}
          onChangeText={(text) => setPromoForm({ ...promoForm, code: text })}
        />

        <View style={styles.typeSelector}>
          <Pressable
            style={[
              styles.typeButton,
              promoForm.type === "fixed" && styles.typeButtonActive,
            ]}
            onPress={() => setPromoForm({ ...promoForm, type: "fixed" })}
          >
            <ThemedText
              type="body"
              style={[
                styles.typeButtonText,
                promoForm.type === "fixed" && styles.typeButtonTextActive,
              ]}
            >
              مبلغ ثابت
            </ThemedText>
          </Pressable>
          <Pressable
            style={[
              styles.typeButton,
              promoForm.type === "percentage" && styles.typeButtonActive,
            ]}
            onPress={() => setPromoForm({ ...promoForm, type: "percentage" })}
          >
            <ThemedText
              type="body"
              style={[
                styles.typeButtonText,
                promoForm.type === "percentage" && styles.typeButtonTextActive,
              ]}
            >
              نسبة مئوية
            </ThemedText>
          </Pressable>
        </View>

        <TextInput
          style={[
            styles.input,
            { backgroundColor: theme.backgroundSecondary, color: theme.text },
          ]}
          placeholder={
            promoForm.type === "percentage" ? "القيمة (%)" : "القيمة (د.ع)"
          }
          placeholderTextColor={theme.textSecondary}
          value={promoForm.value}
          onChangeText={(text) => setPromoForm({ ...promoForm, value: text })}
          keyboardType="numeric"
        />

        <TextInput
          style={[
            styles.input,
            { backgroundColor: theme.backgroundSecondary, color: theme.text },
          ]}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={theme.textSecondary}
          value={promoForm.expiryDate}
          onChangeText={(text) =>
            setPromoForm({ ...promoForm, expiryDate: text })
          }
        />

        <View style={styles.formButtons}>
          {isEditing ? (
            <Pressable style={styles.cancelButton} onPress={resetForm}>
              <ThemedText type="body" style={styles.cancelButtonText}>
                إلغاء
              </ThemedText>
            </Pressable>
          ) : null}
          <Pressable style={styles.saveButton} onPress={savePromoCode}>
            <ThemedText type="body" style={styles.saveButtonText}>
              {editItem ? "حفظ التعديلات" : "إضافة"}
            </ThemedText>
          </Pressable>
        </View>
      </View>

      <ThemedText type="h4" style={styles.listTitle}>
        أكواد الخصم الحالية
      </ThemedText>

      {promoCodesLoading ? (
        <ActivityIndicator color={AppColors.primary} />
      ) : (
        promoCodes.map((promo) => (
          <View
            key={promo.id}
            style={[
              styles.listItem,
              { backgroundColor: theme.backgroundSecondary },
            ]}
          >
            <View style={styles.areaIcon}>
              <Feather name="tag" size={22} color={AppColors.primary} />
            </View>
            <View style={styles.listItemContent}>
              <ThemedText type="body" numberOfLines={1}>
                {promo.code}
              </ThemedText>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: Spacing.xs,
                }}
              >
                <View
                  style={[
                    styles.discountBadge,
                    {
                      backgroundColor:
                        promo.type === "percentage"
                          ? AppColors.success
                          : AppColors.warning,
                    },
                  ]}
                >
                  <ThemedText type="small" style={styles.discountText}>
                    {promo.type === "percentage" ? "نسبة" : "ثابت"}
                  </ThemedText>
                </View>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  {promo.type === "percentage"
                    ? `${promo.value}%`
                    : formatPrice(promo.value)}
                </ThemedText>
                <ThemedText
                  type="small"
                  style={{
                    color: promo.isActive ? AppColors.success : AppColors.error,
                  }}
                >
                  {promo.isActive ? "فعال" : "غير فعال"}
                </ThemedText>
              </View>
            </View>
            <View style={styles.listItemActions}>
              <Pressable
                onPress={() => handleEditPromo(promo)}
                style={styles.actionButton}
              >
                <Feather name="edit-2" size={18} color={AppColors.primary} />
              </Pressable>
              <Pressable
                onPress={() => confirmDelete(promo.id, "promoCode")}
                style={styles.actionButton}
              >
                <Feather name="trash-2" size={18} color={AppColors.error} />
              </Pressable>
            </View>
          </View>
        ))
      )}
    </View>
  );

  return renderPromoCodesTab();
}

export const PromoCodesTab = React.memo(PromoCodesTabInner);
