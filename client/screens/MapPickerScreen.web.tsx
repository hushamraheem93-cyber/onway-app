import React from "react";
import { StyleSheet, View, Pressable } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { AppColors } from "@/constants/theme";

export default function MapPickerScreen() {
  const navigation = useNavigation();
  const { theme } = useTheme();

  return (
    <View style={[styles.webFallback, { backgroundColor: theme.backgroundRoot }]}>
      <Feather name="map" size={64} color="#CCC" />
      <ThemedText type="h3" style={styles.webText}>
        افتح التطبيق عبر Expo Go لاستخدام الخريطة
      </ThemedText>
      <Pressable
        style={styles.confirmButton}
        onPress={() => navigation.goBack()}
      >
        <ThemedText type="body" style={styles.confirmText}>رجوع</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  webFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 20,
  },
  webText: {
    textAlign: "center",
    marginTop: 8,
  },
  confirmButton: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: AppColors.wayYellow,
    borderRadius: 14,
    height: 52,
    paddingHorizontal: 30,
    marginTop: 20,
    gap: 8,
  },
  confirmText: {
    fontWeight: "700",
    color: "#000",
    fontSize: 16,
  },
});
