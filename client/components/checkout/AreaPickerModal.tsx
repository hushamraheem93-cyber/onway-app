import React from "react";
import { View, Modal, Pressable, FlatList, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { AppColors, BorderRadius, FontWeight, Spacing } from "@/constants/theme";

interface DeliveryArea {
  id: string;
  name: string;
  fee: number;
  isActive: boolean;
}

interface Props {
  visible: boolean;
  areas: DeliveryArea[];
  selectedAreaId: string;
  onSelect: (areaId: string) => void;
  onClose: () => void;
}

export function AreaPickerModal({ visible, areas, selectedAreaId, onSelect, onClose }: Props) {
  const { theme } = useTheme();

  const handleSelect = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelect(id);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={[styles.content, { backgroundColor: theme.backgroundDefault }]}>
          <ThemedText type="h4" style={styles.title}>اختر منطقة التوصيل</ThemedText>
          <FlatList
            data={areas}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => handleSelect(item.id)}
                accessibilityRole="button"
                accessibilityLabel={item.name}
                accessibilityState={{ selected: selectedAreaId === item.id }}
                style={[styles.item, selectedAreaId === item.id && { backgroundColor: AppColors.secondary }]}
              >
                <View style={styles.itemContent}>
                  <ThemedText
                    type="body"
                    style={[
                      styles.itemName,
                      selectedAreaId === item.id && { color: AppColors.primary, fontWeight: FontWeight.bold },
                    ]}
                  >
                    {item.name}
                  </ThemedText>
                </View>
                {selectedAreaId === item.id ? (
                  <Feather name="check-circle" size={22} color={AppColors.primary} />
                ) : null}
              </Pressable>
            )}
          />
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: AppColors.overlay,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  content: {
    width: "100%",
    maxHeight: "60%",
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
  },
  title: {
    textAlign: "center",
    marginBottom: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  itemContent: {
    flex: 1,
    alignItems: "flex-end",
  },
  itemName: {
    textAlign: "right",
  },
});
