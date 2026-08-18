/**
 * The admin "الأقسام" (categories) tab (H-65).
 *
 * `renderCategoriesTab` moved verbatim out of AdminScreen. Image picking and
 * upload (`pickImage`, `saveCategory`) stay in AdminScreen — they touch the
 * upload pipeline and the query cache, so they remain single-writer there and
 * arrive here as props.
 */
import React from "react";
import { View, Pressable, TextInput, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { AppColors } from "@/constants/theme";
import { resolveImageUrl } from "@/utils/imageUtils";
import { styles } from "@/screens/admin/adminStyles";

interface CategoryForm {
  name: string;
  imageUri: string;
  imageUrl: string;
}

interface Props {
  categories: any[];
  categoriesLoading: boolean;
  categoryForm: CategoryForm;
  setCategoryForm: React.Dispatch<React.SetStateAction<CategoryForm>>;
  saveCategory: () => void;
  handleEditCategory: (category: any) => void;
  confirmDelete: (id: string, type: "category") => void;
  saveCategoryChanges: () => void;
  hasCategoryChanges: boolean;
  isSavingCategories: boolean;
  pickImage: (setter: (uri: string) => void) => void;
  isEditing: boolean;
  editItem: any;
  resetForm: () => void;
  theme: any;
}

function CategoriesTabInner({
  categories,
  categoriesLoading,
  categoryForm,
  setCategoryForm,
  saveCategory,
  handleEditCategory,
  confirmDelete,
  saveCategoryChanges,
  hasCategoryChanges,
  isSavingCategories,
  pickImage,
  isEditing,
  editItem,
  resetForm,
  theme,
}: Props) {
  const renderCategoriesTab = () => (
    <View>
      <View style={styles.formCard}>
        <ThemedText type="h4" style={styles.formTitle}>
          {editItem ? "تعديل القسم" : "إضافة قسم جديد"}
        </ThemedText>

        <TextInput
          style={[
            styles.input,
            { backgroundColor: theme.backgroundSecondary, color: theme.text },
          ]}
          placeholder="اسم القسم"
          placeholderTextColor={theme.textSecondary}
          value={categoryForm.name}
          onChangeText={(text) =>
            setCategoryForm({ ...categoryForm, name: text })
          }
        />

        <Pressable
          accessibilityRole="button"
          style={[styles.imagePicker, { borderColor: theme.border }]}
          onPress={() =>
            pickImage((uri) =>
              setCategoryForm({ ...categoryForm, imageUri: uri, imageUrl: "" }),
            )
          }
        >
          {categoryForm.imageUri || categoryForm.imageUrl ? (
            <Image
              source={{
                uri:
                  categoryForm.imageUri ||
                  resolveImageUrl(categoryForm.imageUrl),
              }}
              style={styles.previewImage}
              contentFit="cover"
            />
          ) : (
            <View style={styles.imagePickerPlaceholder}>
              <Feather name="image" size={32} color={theme.textSecondary} />
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                اختر صورة
              </ThemedText>
            </View>
          )}
        </Pressable>

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
            onPress={saveCategory}
          >
            <ThemedText type="body" style={styles.saveButtonText}>
              {editItem ? "حفظ التعديلات" : "إضافة"}
            </ThemedText>
          </Pressable>
        </View>
      </View>

      <ThemedText type="h4" style={styles.listTitle}>
        الأقسام الحالية
      </ThemedText>

      {categoriesLoading ? (
        <ActivityIndicator color={AppColors.primary} />
      ) : (
        categories.map((category) => (
          <View
            key={category.id}
            style={[
              styles.listItem,
              { backgroundColor: theme.backgroundSecondary },
            ]}
          >
            <Image
              source={{ uri: resolveImageUrl(category.image) }}
              style={styles.listItemImage}
              contentFit="cover"
            />
            <View style={styles.listItemContent}>
              <ThemedText type="body" numberOfLines={1}>
                {category.name}
              </ThemedText>
            </View>
            <View style={styles.listItemActions}>
              <Pressable
                onPress={() => handleEditCategory(category)}
                style={styles.actionButton}
                accessibilityRole="button"
                accessibilityLabel={`تعديل قسم ${category.name}`}
              >
                <Feather name="edit-2" size={18} color={AppColors.primary} />
              </Pressable>
              <Pressable
                onPress={() => confirmDelete(category.id, "category")}
                style={styles.actionButton}
                accessibilityRole="button"
                accessibilityLabel={`حذف قسم ${category.name}`}
                accessibilityHint="يفتح تأكيداً قبل الحذف"
              >
                <Feather name="trash-2" size={18} color={AppColors.error} />
              </Pressable>
            </View>
          </View>
        ))
      )}

      {hasCategoryChanges ? (
        <Pressable
          accessibilityRole="button"
          testID="button-save-category-changes"
          onPress={saveCategoryChanges}
          style={[
            styles.saveCategoryChangesBtn,
            isSavingCategories && { opacity: 0.7 },
          ]}
        >
          {isSavingCategories ? (
            <ActivityIndicator size="small" color={AppColors.white} />
          ) : (
            <Feather name="check-circle" size={20} color={AppColors.white} />
          )}
          <ThemedText type="body" style={styles.saveCategoryChangesBtnText}>
            {isSavingCategories ? "جارٍ الحفظ..." : "حفظ التغيير"}
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );

  return renderCategoriesTab();
}

export const CategoriesTab = React.memo(CategoriesTabInner);
