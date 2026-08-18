/**
 * The admin "المناطق" (delivery areas) tab (H-65).
 *
 * `renderAreasTab` moved verbatim out of AdminScreen. This is the tab that edits
 * `deliveryAreas.fee` — the single source of the delivery fee for both order kinds
 * since D-3 — so nothing about its inputs, validation or save path was touched.
 * `saveArea` still lives in AdminScreen and still reports a rejected write instead
 * of swallowing it.
 */
import React from "react";
import { View, Pressable, TextInput, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { AppColors, FontWeight } from "@/constants/theme";
import { formatPrice } from "@/constants/currency";
import { styles } from "@/screens/admin/adminStyles";

interface AreaForm {
  name: string;
  fee: string;
}

interface Props {
  deliveryAreas: any[];
  areasLoading: boolean;
  areaForm: AreaForm;
  setAreaForm: React.Dispatch<React.SetStateAction<AreaForm>>;
  saveArea: () => void;
  handleEditArea: (area: any) => void;
  confirmDelete: (id: string, type: "area") => void;
  isEditing: boolean;
  editItem: any;
  resetForm: () => void;
  theme: any;
}

function AreasTabInner({
  deliveryAreas,
  areasLoading,
  areaForm,
  setAreaForm,
  saveArea,
  handleEditArea,
  confirmDelete,
  isEditing,
  editItem,
  resetForm,
  theme,
}: Props) {
  const renderAreasTab = () => (
    <View>
      <View style={styles.formCard}>
        <ThemedText type="h4" style={styles.formTitle}>
          {editItem ? "تعديل المنطقة" : "إضافة منطقة جديدة"}
        </ThemedText>

        <TextInput
          style={[
            styles.input,
            { backgroundColor: theme.backgroundSecondary, color: theme.text },
          ]}
          placeholder="اسم المنطقة"
          placeholderTextColor={theme.textSecondary}
          value={areaForm.name}
          onChangeText={(text) => setAreaForm({ ...areaForm, name: text })}
        />

        <TextInput
          style={[
            styles.input,
            { backgroundColor: theme.backgroundSecondary, color: theme.text },
          ]}
          placeholder="أجور التوصيل (د.ع)"
          placeholderTextColor={theme.textSecondary}
          value={areaForm.fee}
          onChangeText={(text) => setAreaForm({ ...areaForm, fee: text })}
          keyboardType="numeric"
        />

        <View style={styles.formButtons}>
          {isEditing ? (
            <Pressable
              accessibilityRole="button"
              style={styles.cancelButton}
              onPress={resetForm}
            >
              <ThemedText type="body" style={styles.cancelButtonText}>
                إلغاء
              </ThemedText>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            style={styles.saveButton}
            onPress={saveArea}
          >
            <ThemedText type="body" style={styles.saveButtonText}>
              {editItem ? "حفظ التعديلات" : "إضافة"}
            </ThemedText>
          </Pressable>
        </View>
      </View>

      <ThemedText type="h4" style={styles.listTitle}>
        مناطق التوصيل الحالية
      </ThemedText>

      {areasLoading ? (
        <ActivityIndicator color={AppColors.primary} />
      ) : (
        deliveryAreas.map((area) => (
          <View
            key={area.id}
            style={[
              styles.listItem,
              { backgroundColor: theme.backgroundSecondary },
            ]}
          >
            <View style={styles.areaIcon}>
              <Feather name="map-pin" size={24} color={AppColors.primary} />
            </View>
            <View style={styles.listItemContent}>
              <ThemedText type="body" numberOfLines={1}>
                {area.name}
              </ThemedText>
              <ThemedText
                type="small"
                style={{
                  color: AppColors.primary,
                  fontWeight: FontWeight.semiBold,
                }}
              >
                {formatPrice(area.fee)}
              </ThemedText>
            </View>
            <View style={styles.listItemActions}>
              <Pressable
                onPress={() => handleEditArea(area)}
                style={styles.actionButton}
                accessibilityRole="button"
                accessibilityLabel={`تعديل منطقة ${area.name}`}
              >
                <Feather name="edit-2" size={18} color={AppColors.primary} />
              </Pressable>
              <Pressable
                onPress={() => confirmDelete(area.id, "area")}
                style={styles.actionButton}
                accessibilityRole="button"
                accessibilityLabel={`حذف منطقة ${area.name}`}
                accessibilityHint="يفتح تأكيداً قبل الحذف"
              >
                <Feather name="trash-2" size={18} color={AppColors.error} />
              </Pressable>
            </View>
          </View>
        ))
      )}
    </View>
  );

  return renderAreasTab();
}

export const AreasTab = React.memo(AreasTabInner);
