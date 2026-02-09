import React from "react";
import { StyleSheet, View, TextInput, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";

import { useTheme } from "@/hooks/useTheme";
import { AppColors } from "@/constants/theme";

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onSubmitEditing?: () => void;
}

export function SearchBar({
  value,
  onChangeText,
  placeholder = "ابحث عن منتجاتك...",
  onSubmitEditing,
}: SearchBarProps) {
  const { theme, isDark } = useTheme();

  return (
    <View
      style={[
        styles.container,
        { 
          backgroundColor: isDark ? theme.backgroundDefault : "#F5F5F5",
          borderColor: isDark ? theme.border : "#EEE",
        },
      ]}
    >
      <Feather name="mic" size={20} color="#999" style={styles.micIcon} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#999"
        style={[styles.input, { color: theme.text }]}
        textAlign="right"
        returnKeyType="search"
        onSubmitEditing={onSubmitEditing}
      />
      {value.length > 0 ? (
        <Pressable onPress={() => onChangeText("")} style={styles.clearButton}>
          <Feather name="x" size={18} color="#999" />
        </Pressable>
      ) : (
        <Feather name="search" size={20} color={AppColors.onGrey} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 15,
    marginHorizontal: 15,
    marginVertical: 15,
    height: 50,
    borderWidth: 1,
  },
  micIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    marginHorizontal: 10,
    fontSize: 16,
    paddingVertical: 0,
  },
  clearButton: {
    padding: 4,
  },
});
