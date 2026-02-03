import React, { useState } from "react";
import { StyleSheet, ScrollView, View, Pressable, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Shadows, AppColors } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";

interface Address {
  id: string;
  title: string;
  address: string;
  isDefault: boolean;
}

export default function AddressesScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();

  const [addresses, setAddresses] = useState<Address[]>([
    { id: "1", title: "المنزل", address: "بغداد - المنصور - شارع الأميرات", isDefault: true },
  ]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newAddress, setNewAddress] = useState("");

  const handleAddAddress = () => {
    if (newTitle.trim() && newAddress.trim()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const newAddr: Address = {
        id: Date.now().toString(),
        title: newTitle.trim(),
        address: newAddress.trim(),
        isDefault: addresses.length === 0,
      };
      setAddresses([...addresses, newAddr]);
      setNewTitle("");
      setNewAddress("");
      setShowAddForm(false);
    }
  };

  const handleSetDefault = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAddresses(addresses.map(addr => ({
      ...addr,
      isDefault: addr.id === id,
    })));
  };

  const handleDelete = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setAddresses(addresses.filter(addr => addr.id !== id));
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
      showsVerticalScrollIndicator={false}
    >
      {addresses.map((addr) => (
        <View key={addr.id} style={[styles.addressCard, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
          <View style={styles.addressHeader}>
            <Pressable onPress={() => handleDelete(addr.id)} hitSlop={8}>
              <Feather name="trash-2" size={18} color="#E53935" />
            </Pressable>
            <View style={styles.addressTitleContainer}>
              {addr.isDefault ? (
                <View style={styles.defaultBadge}>
                  <ThemedText type="small" style={styles.defaultText}>الافتراضي</ThemedText>
                </View>
              ) : null}
              <ThemedText type="body" style={styles.addressTitle}>{addr.title}</ThemedText>
            </View>
            <View style={[styles.iconContainer, { backgroundColor: AppColors.primary + "15" }]}>
              <Feather name="map-pin" size={20} color={AppColors.primary} />
            </View>
          </View>
          <ThemedText type="body" style={[styles.addressText, { color: theme.textSecondary }]}>
            {addr.address}
          </ThemedText>
          {!addr.isDefault ? (
            <Pressable
              onPress={() => handleSetDefault(addr.id)}
              style={[styles.setDefaultBtn, { borderColor: AppColors.primary }]}
            >
              <ThemedText type="small" style={{ color: AppColors.primary }}>
                تعيين كافتراضي
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      ))}

      {showAddForm ? (
        <View style={[styles.addForm, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
          <ThemedText type="h4" style={styles.formTitle}>إضافة عنوان جديد</ThemedText>
          <TextInput
            style={[styles.input, { backgroundColor: theme.backgroundRoot, color: theme.text }]}
            placeholder="اسم العنوان (مثل: المنزل، العمل)"
            placeholderTextColor={theme.textSecondary}
            value={newTitle}
            onChangeText={setNewTitle}
            textAlign="right"
          />
          <TextInput
            style={[styles.input, styles.textArea, { backgroundColor: theme.backgroundRoot, color: theme.text }]}
            placeholder="العنوان التفصيلي"
            placeholderTextColor={theme.textSecondary}
            value={newAddress}
            onChangeText={setNewAddress}
            textAlign="right"
            multiline
          />
          <View style={styles.formButtons}>
            <Pressable
              onPress={() => setShowAddForm(false)}
              style={[styles.formBtn, { backgroundColor: "#ccc" }]}
            >
              <ThemedText type="body" style={{ color: "#333" }}>إلغاء</ThemedText>
            </Pressable>
            <Pressable
              onPress={handleAddAddress}
              style={[styles.formBtn, { backgroundColor: AppColors.primary }]}
            >
              <ThemedText type="body" style={{ color: "#fff" }}>حفظ</ThemedText>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          onPress={() => setShowAddForm(true)}
          style={[styles.addBtn, { borderColor: AppColors.primary }]}
        >
          <ThemedText type="body" style={{ color: AppColors.primary }}>إضافة عنوان جديد</ThemedText>
          <Feather name="plus" size={20} color={AppColors.primary} />
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  addressCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  addressHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: Spacing.md,
  },
  addressTitleContainer: {
    flex: 1,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.sm,
  },
  addressTitle: {
    fontWeight: "600",
  },
  defaultBadge: {
    backgroundColor: AppColors.primary + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  defaultText: {
    color: AppColors.primary,
    fontWeight: "600",
  },
  addressText: {
    textAlign: "right",
    lineHeight: 22,
  },
  setDefaultBtn: {
    alignSelf: "flex-end",
    marginTop: Spacing.sm,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
  },
  addBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderStyle: "dashed",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  addForm: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginTop: Spacing.sm,
  },
  formTitle: {
    textAlign: "right",
    marginBottom: Spacing.md,
  },
  input: {
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    fontSize: 16,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  formButtons: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  formBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
});
