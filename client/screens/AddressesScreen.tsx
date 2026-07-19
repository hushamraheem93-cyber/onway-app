import React, { useState, useEffect } from "react";
import { StyleSheet, ScrollView, View, Pressable, TextInput, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import { GradientBackground } from "@/components/GradientBackground";
import { Spacing, BorderRadius, Shadows, AppColors, FontWeight} from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";

interface Address {
  id: string;
  title: string;
  region: string;
  address: string;
  isDefault: boolean;
}

export default function AddressesScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const { userProfile, phoneNumber, customerToken } = useAuth();

  const savedAddress: Address | null = userProfile ? {
    id: "profile-address",
    title: "عنوان التسجيل",
    region: userProfile.region,
    address: userProfile.address,
    isDefault: true,
  } : null;

  const [additionalAddresses, setAdditionalAddresses] = useState<Address[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAddresses();
  }, []);

  const loadAddresses = async () => {
    if (!phoneNumber) { setIsLoading(false); return; }
    try {
      const res = await fetch(
        new URL(`/api/users/${encodeURIComponent(phoneNumber)}/addresses`, getApiUrl()).toString(),
        { headers: customerToken ? { Authorization: `Bearer ${customerToken}` } : {} },
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.addresses)) setAdditionalAddresses(data.addresses);
      }
    } catch (error) {
    } finally {
      setIsLoading(false);
    }
  };

  // Whole-list replace (server keeps the `addresses` array on the user doc).
  // Optimistically update the UI, then persist; revert on failure.
  const saveAddresses = async (addresses: Address[]) => {
    const prev = additionalAddresses;
    setAdditionalAddresses(addresses);
    if (!phoneNumber) return;
    try {
      const res = await fetch(
        new URL(`/api/users/${encodeURIComponent(phoneNumber)}/addresses`, getApiUrl()).toString(),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(customerToken ? { Authorization: `Bearer ${customerToken}` } : {}),
          },
          body: JSON.stringify({ addresses }),
        },
      );
      if (!res.ok) throw new Error("save failed");
      const data = await res.json();
      if (Array.isArray(data.addresses)) setAdditionalAddresses(data.addresses);
    } catch (error) {
      setAdditionalAddresses(prev);
      Alert.alert("خطأ", "حدث خطأ أثناء حفظ العنوان");
    }
  };

  const allAddresses = savedAddress 
    ? [savedAddress, ...additionalAddresses]
    : additionalAddresses;

  const handleAddAddress = () => {
    if (!newTitle.trim() || !newAddress.trim()) {
      Alert.alert("تنبيه", "يرجى إدخال اسم العنوان والعنوان التفصيلي");
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const newAddr: Address = {
      id: Date.now().toString(),
      title: newTitle.trim(),
      region: "",
      address: newAddress.trim(),
      isDefault: additionalAddresses.length === 0 && !savedAddress,
    };
    
    const updatedAddresses = [...additionalAddresses, newAddr];
    saveAddresses(updatedAddresses);
    setNewTitle("");
    setNewAddress("");
    setShowAddForm(false);
  };

  const handleSetDefault = (id: string) => {
    if (id === "profile-address") return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const updatedAddresses = additionalAddresses.map(addr => ({
      ...addr,
      isDefault: addr.id === id,
    }));
    saveAddresses(updatedAddresses);
  };

  const handleDelete = (id: string) => {
    if (id === "profile-address") return;
    
    Alert.alert(
      "حذف العنوان",
      "هل أنت متأكد من حذف هذا العنوان؟",
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "حذف",
          style: "destructive",
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            const updatedAddresses = additionalAddresses.filter(addr => addr.id !== id);
            saveAddresses(updatedAddresses);
          },
        },
      ]
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <GradientBackground />
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
      showsVerticalScrollIndicator={false}
    >
      {allAddresses.length === 0 && !isLoading ? (
        <View style={[styles.emptyState, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
          <Feather name="map-pin" size={48} color={theme.textSecondary} />
          <ThemedText type="body" style={[styles.emptyText, { color: theme.textSecondary }]}>
            لا توجد عناوين محفوظة
          </ThemedText>
        </View>
      ) : null}

      {allAddresses.map((addr) => (
        <View key={addr.id} style={[styles.addressCard, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
          <View style={styles.addressHeader}>
            {addr.id !== "profile-address" ? (
              <Pressable
                onPress={() => handleDelete(addr.id)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`حذف العنوان: ${addr.title}`}
              >
                <Feather name="trash-2" size={18} color={AppColors.error} />
              </Pressable>
            ) : (
              <View style={styles.profileBadge}>
                <ThemedText type="small" style={styles.profileBadgeText}>الأساسي</ThemedText>
              </View>
            )}
            <View style={styles.addressTitleContainer}>
              {addr.isDefault && addr.id !== "profile-address" ? (
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
          
          {addr.region ? (
            <View style={styles.regionRow}>
              <ThemedText type="body" style={[styles.regionText, { color: AppColors.primary }]}>
                {addr.region}
              </ThemedText>
              <Feather name="navigation" size={14} color={AppColors.primary} />
            </View>
          ) : null}
          
          <ThemedText type="body" style={[styles.addressText, { color: theme.textSecondary }]}>
            {addr.address}
          </ThemedText>
          
          {!addr.isDefault && addr.id !== "profile-address" ? (
            <Pressable
              onPress={() => handleSetDefault(addr.id)}
              style={[styles.setDefaultBtn, { borderColor: AppColors.primary }]}
              accessibilityRole="button"
              accessibilityLabel="تعيين كعنوان افتراضي"
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
              onPress={() => {
                setShowAddForm(false);
                setNewTitle("");
                setNewAddress("");
              }}
              style={[styles.formBtn, { backgroundColor: AppColors.gray300 }]}
              accessibilityRole="button"
              accessibilityLabel="إلغاء"
            >
              <ThemedText type="body" style={{ color: AppColors.gray700 }}>إلغاء</ThemedText>
            </Pressable>
            <Pressable
              onPress={handleAddAddress}
              style={[styles.formBtn, { backgroundColor: AppColors.primary }]}
              accessibilityRole="button"
              accessibilityLabel="حفظ العنوان"
            >
              <ThemedText type="body" style={{ color: AppColors.white }}>حفظ</ThemedText>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          onPress={() => setShowAddForm(true)}
          style={[styles.addBtn, { borderColor: AppColors.primary }]}
          accessibilityRole="button"
          accessibilityLabel="إضافة عنوان جديد"
        >
          <ThemedText type="body" style={{ color: AppColors.primary }}>إضافة عنوان جديد</ThemedText>
          <Feather name="plus" size={20} color={AppColors.primary} />
        </Pressable>
      )}
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyState: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl * 2,
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  emptyText: {
    marginTop: Spacing.md,
    textAlign: "center",
  },
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
    fontWeight: FontWeight.semiBold,
  },
  defaultBadge: {
    backgroundColor: AppColors.primary + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  defaultText: {
    color: AppColors.primary,
    fontWeight: FontWeight.semiBold,
  },
  profileBadge: {
    backgroundColor: AppColors.success + "20",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  profileBadgeText: {
    color: AppColors.success,
    fontWeight: FontWeight.semiBold,
  },
  regionRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  regionText: {
    fontWeight: FontWeight.semiBold,
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
    fontSize: 16, // ≥16 for readability + prevents iOS auto-zoom on focus
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
