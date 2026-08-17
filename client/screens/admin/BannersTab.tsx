/**
 * The admin "البانرات" (banners) tab (H-65).
 *
 * `renderBannersTab` moved verbatim out of AdminScreen. Both banner kinds — the
 * slider and the offer card — keep the same form, the same image upload path and
 * the same delete confirmation. The upload and the save stay in AdminScreen.
 */
import React from "react";
import { View, Pressable, TextInput, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { AppColors } from "@/constants/theme";
import { resolveImageUrl } from "@/utils/imageUtils";
import { styles } from "@/screens/admin/adminStyles";

interface BannerForm {
  title: string;
  type: "offer" | "slider";
  imageUri: string;
  imageUrl: string;
}

interface Props {
  banners: any[];
  bannersLoading: boolean;
  bannerForm: BannerForm;
  setBannerForm: React.Dispatch<React.SetStateAction<BannerForm>>;
  saveBanner: () => void;
  handleEditBanner: (banner: any) => void;
  confirmDelete: (id: string, type: "banner") => void;
  pickImage: (setter: (uri: string) => void) => void;
  isEditing: boolean;
  editItem: any;
  resetForm: () => void;
  theme: any;
}

function BannersTabInner({
  banners,
  bannersLoading,
  bannerForm,
  setBannerForm,
  saveBanner,
  handleEditBanner,
  confirmDelete,
  pickImage,
  isEditing,
  editItem,
  resetForm,
  theme,
}: Props) {
  const renderBannersTab = () => (
    <View>
      <View style={styles.formCard}>
        <ThemedText type="h4" style={styles.formTitle}>
          {editItem ? "تعديل البانر" : "إضافة بانر جديد"}
        </ThemedText>

        <TextInput
          style={[
            styles.input,
            { backgroundColor: theme.backgroundSecondary, color: theme.text },
          ]}
          placeholder="عنوان البانر (اختياري)"
          placeholderTextColor={theme.textSecondary}
          value={bannerForm.title}
          onChangeText={(text) => setBannerForm({ ...bannerForm, title: text })}
        />

        <View style={styles.typeSelector}>
          <Pressable
            style={[
              styles.typeButton,
              bannerForm.type === "slider" && styles.typeButtonActive,
            ]}
            onPress={() => setBannerForm({ ...bannerForm, type: "slider" })}
          >
            <ThemedText
              type="body"
              style={[
                styles.typeButtonText,
                bannerForm.type === "slider" && styles.typeButtonTextActive,
              ]}
            >
              سلايدر
            </ThemedText>
          </Pressable>
          <Pressable
            style={[
              styles.typeButton,
              bannerForm.type === "offer" && styles.typeButtonActive,
            ]}
            onPress={() => setBannerForm({ ...bannerForm, type: "offer" })}
          >
            <ThemedText
              type="body"
              style={[
                styles.typeButtonText,
                bannerForm.type === "offer" && styles.typeButtonTextActive,
              ]}
            >
              عرض رئيسي
            </ThemedText>
          </Pressable>
        </View>

        <Pressable
          style={[styles.imagePicker, { borderColor: theme.border }]}
          onPress={() =>
            pickImage((uri) =>
              setBannerForm({ ...bannerForm, imageUri: uri, imageUrl: "" }),
            )
          }
        >
          {bannerForm.imageUri || bannerForm.imageUrl ? (
            <Image
              source={{
                uri:
                  bannerForm.imageUri || resolveImageUrl(bannerForm.imageUrl),
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
            <Pressable style={styles.cancelButton} onPress={resetForm}>
              <ThemedText type="body" style={styles.cancelButtonText}>
                إلغاء
              </ThemedText>
            </Pressable>
          ) : null}
          <Pressable style={styles.saveButton} onPress={saveBanner}>
            <ThemedText type="body" style={styles.saveButtonText}>
              {editItem ? "حفظ التعديلات" : "إضافة"}
            </ThemedText>
          </Pressable>
        </View>
      </View>

      <ThemedText type="h4" style={styles.listTitle}>
        البانرات الحالية
      </ThemedText>

      {bannersLoading ? (
        <ActivityIndicator color={AppColors.primary} />
      ) : (
        banners.map((banner) => (
          <View
            key={banner.id}
            style={[
              styles.listItem,
              { backgroundColor: theme.backgroundSecondary },
            ]}
          >
            {resolveImageUrl(banner.image) ? (
              <Image
                source={{ uri: resolveImageUrl(banner.image) }}
                style={styles.listItemImage}
                contentFit="cover"
              />
            ) : (
              <View
                style={[
                  styles.listItemImage,
                  {
                    backgroundColor: AppColors.gray100,
                    alignItems: "center",
                    justifyContent: "center",
                  },
                ]}
              >
                <Feather name="image" size={18} color={AppColors.gray400} />
              </View>
            )}
            <View style={styles.listItemContent}>
              <ThemedText type="body" numberOfLines={1}>
                {banner.title || "بدون عنوان"}
              </ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {banner.type === "offer" ? "عرض رئيسي" : "سلايدر"}
              </ThemedText>
            </View>
            <View style={styles.listItemActions}>
              <Pressable
                onPress={() => handleEditBanner(banner)}
                style={styles.actionButton}
              >
                <Feather name="edit-2" size={18} color={AppColors.primary} />
              </Pressable>
              <Pressable
                onPress={() => confirmDelete(banner.id, "banner")}
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

  return renderBannersTab();
}

export const BannersTab = React.memo(BannersTabInner);
