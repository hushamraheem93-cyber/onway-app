import React, { useState } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";

import { useTheme } from "@/hooks/useTheme";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Spacing, BorderRadius, AppColors } from "@/constants/theme";
import { Banner, Category } from "@/constants/categories";
import { getApiUrl, apiRequest } from "@/lib/query-client";

type TabType = "banners" | "categories";
type BannerType = "offer" | "slider";

export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabType>("banners");
  const [isEditing, setIsEditing] = useState(false);
  const [editItem, setEditItem] = useState<Banner | Category | null>(null);
  
  const [bannerForm, setBannerForm] = useState({
    title: "",
    type: "slider" as BannerType,
    imageUri: "",
    imageUrl: "",
  });

  const [categoryForm, setCategoryForm] = useState({
    name: "",
    imageUri: "",
    imageUrl: "",
  });

  const { data: banners = [], isLoading: bannersLoading } = useQuery<Banner[]>({
    queryKey: ["/api/admin/banners"],
  });

  const { data: categories = [], isLoading: categoriesLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const deleteBanner = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/banners/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/banners"] });
      queryClient.invalidateQueries({ queryKey: ["/api/banners"] });
    },
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/categories/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
    },
  });

  const pickImage = async (setter: (uri: string) => void) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setter(result.assets[0].uri);
    }
  };

  const saveBanner = async () => {
    try {
      const formData = new FormData();
      formData.append("title", bannerForm.title);
      formData.append("type", bannerForm.type);
      formData.append("isActive", "true");

      if (bannerForm.imageUri) {
        if (Platform.OS === "web") {
          const response = await fetch(bannerForm.imageUri);
          const blob = await response.blob();
          formData.append("image", blob, "image.jpg");
        } else {
          const file = new File(bannerForm.imageUri);
          formData.append("image", file as any);
        }
      } else if (bannerForm.imageUrl) {
        formData.append("imageUrl", bannerForm.imageUrl);
      }

      const url = editItem ? `/api/admin/banners/${editItem.id}` : "/api/admin/banners";
      const method = editItem ? "PUT" : "POST";

      await fetch(`${getApiUrl()}${url}`, {
        method,
        body: formData,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/admin/banners"] });
      queryClient.invalidateQueries({ queryKey: ["/api/banners"] });
      resetForm();
    } catch (error) {
      console.error("Error saving banner:", error);
    }
  };

  const saveCategory = async () => {
    try {
      const formData = new FormData();
      formData.append("name", categoryForm.name);

      if (categoryForm.imageUri) {
        if (Platform.OS === "web") {
          const response = await fetch(categoryForm.imageUri);
          const blob = await response.blob();
          formData.append("image", blob, "image.jpg");
        } else {
          const file = new File(categoryForm.imageUri);
          formData.append("image", file as any);
        }
      } else if (categoryForm.imageUrl) {
        formData.append("imageUrl", categoryForm.imageUrl);
      }

      const url = editItem ? `/api/admin/categories/${editItem.id}` : "/api/admin/categories";
      const method = editItem ? "PUT" : "POST";

      await fetch(`${getApiUrl()}${url}`, {
        method,
        body: formData,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      resetForm();
    } catch (error) {
      console.error("Error saving category:", error);
    }
  };

  const resetForm = () => {
    setIsEditing(false);
    setEditItem(null);
    setBannerForm({ title: "", type: "slider", imageUri: "", imageUrl: "" });
    setCategoryForm({ name: "", imageUri: "", imageUrl: "" });
  };

  const handleEditBanner = (banner: Banner) => {
    setEditItem(banner);
    setBannerForm({
      title: banner.title || "",
      type: banner.type,
      imageUri: "",
      imageUrl: banner.image,
    });
    setIsEditing(true);
  };

  const handleEditCategory = (category: Category) => {
    setEditItem(category);
    setCategoryForm({
      name: category.name,
      imageUri: "",
      imageUrl: category.image,
    });
    setIsEditing(true);
  };

  const confirmDelete = (id: string, type: "banner" | "category") => {
    if (Platform.OS === "web") {
      if (window.confirm("هل أنت متأكد من الحذف؟")) {
        if (type === "banner") {
          deleteBanner.mutate(id);
        } else {
          deleteCategory.mutate(id);
        }
      }
    } else {
      Alert.alert("تأكيد الحذف", "هل أنت متأكد من الحذف؟", [
        { text: "إلغاء", style: "cancel" },
        {
          text: "حذف",
          style: "destructive",
          onPress: () => {
            if (type === "banner") {
              deleteBanner.mutate(id);
            } else {
              deleteCategory.mutate(id);
            }
          },
        },
      ]);
    }
  };

  const getImageUrl = (image: string) => {
    if (image.startsWith("http")) return image;
    return `${getApiUrl()}${image}`;
  };

  const renderBannersTab = () => (
    <View>
      <View style={styles.formCard}>
        <ThemedText type="h4" style={styles.formTitle}>
          {editItem ? "تعديل البانر" : "إضافة بانر جديد"}
        </ThemedText>

        <TextInput
          style={[styles.input, { backgroundColor: theme.backgroundSecondary, color: theme.text }]}
          placeholder="عنوان البانر (اختياري)"
          placeholderTextColor={theme.textSecondary}
          value={bannerForm.title}
          onChangeText={(text) => setBannerForm({ ...bannerForm, title: text })}
        />

        <View style={styles.typeSelector}>
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
        </View>

        <Pressable
          style={[styles.imagePicker, { borderColor: theme.border }]}
          onPress={() => pickImage((uri) => setBannerForm({ ...bannerForm, imageUri: uri, imageUrl: "" }))}
        >
          {bannerForm.imageUri || bannerForm.imageUrl ? (
            <Image
              source={{ uri: bannerForm.imageUri || getImageUrl(bannerForm.imageUrl) }}
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
          <View key={banner.id} style={[styles.listItem, { backgroundColor: theme.backgroundSecondary }]}>
            <Image
              source={{ uri: getImageUrl(banner.image) }}
              style={styles.listItemImage}
              contentFit="cover"
            />
            <View style={styles.listItemContent}>
              <ThemedText type="body" numberOfLines={1}>
                {banner.title || "بدون عنوان"}
              </ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {banner.type === "offer" ? "عرض رئيسي" : "سلايدر"}
              </ThemedText>
            </View>
            <View style={styles.listItemActions}>
              <Pressable onPress={() => handleEditBanner(banner)} style={styles.actionButton}>
                <Feather name="edit-2" size={18} color={AppColors.primary} />
              </Pressable>
              <Pressable onPress={() => confirmDelete(banner.id, "banner")} style={styles.actionButton}>
                <Feather name="trash-2" size={18} color="#EF4444" />
              </Pressable>
            </View>
          </View>
        ))
      )}
    </View>
  );

  const renderCategoriesTab = () => (
    <View>
      <View style={styles.formCard}>
        <ThemedText type="h4" style={styles.formTitle}>
          {editItem ? "تعديل القسم" : "إضافة قسم جديد"}
        </ThemedText>

        <TextInput
          style={[styles.input, { backgroundColor: theme.backgroundSecondary, color: theme.text }]}
          placeholder="اسم القسم"
          placeholderTextColor={theme.textSecondary}
          value={categoryForm.name}
          onChangeText={(text) => setCategoryForm({ ...categoryForm, name: text })}
        />

        <Pressable
          style={[styles.imagePicker, { borderColor: theme.border }]}
          onPress={() => pickImage((uri) => setCategoryForm({ ...categoryForm, imageUri: uri, imageUrl: "" }))}
        >
          {categoryForm.imageUri || categoryForm.imageUrl ? (
            <Image
              source={{ uri: categoryForm.imageUri || getImageUrl(categoryForm.imageUrl) }}
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
          <Pressable style={styles.saveButton} onPress={saveCategory}>
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
          <View key={category.id} style={[styles.listItem, { backgroundColor: theme.backgroundSecondary }]}>
            <Image
              source={{ uri: getImageUrl(category.image) }}
              style={styles.listItemImage}
              contentFit="cover"
            />
            <View style={styles.listItemContent}>
              <ThemedText type="body" numberOfLines={1}>
                {category.name}
              </ThemedText>
            </View>
            <View style={styles.listItemActions}>
              <Pressable onPress={() => handleEditCategory(category)} style={styles.actionButton}>
                <Feather name="edit-2" size={18} color={AppColors.primary} />
              </Pressable>
              <Pressable onPress={() => confirmDelete(category.id, "category")} style={styles.actionButton}>
                <Feather name="trash-2" size={18} color="#EF4444" />
              </Pressable>
            </View>
          </View>
        ))
      )}
    </View>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
    >
      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, activeTab === "banners" && styles.tabActive]}
          onPress={() => { setActiveTab("banners"); resetForm(); }}
        >
          <ThemedText
            type="body"
            style={[styles.tabText, activeTab === "banners" && styles.tabTextActive]}
          >
            البانرات
          </ThemedText>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "categories" && styles.tabActive]}
          onPress={() => { setActiveTab("categories"); resetForm(); }}
        >
          <ThemedText
            type="body"
            style={[styles.tabText, activeTab === "categories" && styles.tabTextActive]}
          >
            الأقسام
          </ThemedText>
        </Pressable>
      </View>

      {activeTab === "banners" ? renderBannersTab() : renderCategoriesTab()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: "row",
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: AppColors.primary,
  },
  tabText: {
    color: "#6B7280",
  },
  tabTextActive: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  formCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  formTitle: {
    marginBottom: Spacing.md,
  },
  input: {
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    fontSize: 16,
    fontFamily: "Tajawal_400Regular",
    marginBottom: Spacing.md,
    textAlign: "right",
  },
  typeSelector: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  typeButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
  },
  typeButtonActive: {
    backgroundColor: AppColors.primary,
  },
  typeButtonText: {
    color: "#6B7280",
  },
  typeButtonTextActive: {
    color: "#FFFFFF",
  },
  imagePicker: {
    height: 120,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderStyle: "dashed",
    overflow: "hidden",
    marginBottom: Spacing.md,
  },
  imagePickerPlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.xs,
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  formButtons: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  saveButton: {
    flex: 1,
    backgroundColor: AppColors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  cancelButtonText: {
    color: "#6B7280",
  },
  listTitle: {
    marginBottom: Spacing.md,
  },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  listItemImage: {
    width: 60,
    height: 40,
    borderRadius: BorderRadius.sm,
  },
  listItemContent: {
    flex: 1,
    marginHorizontal: Spacing.md,
  },
  listItemActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  actionButton: {
    padding: Spacing.sm,
  },
});
