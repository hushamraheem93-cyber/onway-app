import React from "react";
import { View, TextInput, StyleSheet, Switch, Platform } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { ThemedText } from "@/components/ThemedText";
import { DYNAMIC_FIELDS, DynamicFieldConfig } from "@/constants/businessCategories";

const ORANGE = "#E86520";
const PURPLE = "#673AB7";

interface Props {
  businessType: string;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

export default function DynamicProductFields({ businessType, values, onChange }: Props) {
  const fields: DynamicFieldConfig[] = DYNAMIC_FIELDS[businessType] || [];
  if (fields.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <ThemedText style={styles.sectionTitle}>تفاصيل إضافية حسب نوع النشاط</ThemedText>
      </View>

      {fields.map((field) => {
        const value = values[field.key] || "";

        if (field.type === "toggle") {
          const isOn = value === "true";
          return (
            <View key={field.key} style={styles.toggleRow}>
              <Switch
                value={isOn}
                onValueChange={(v) => onChange(field.key, v ? "true" : "false")}
                trackColor={{ false: "#E5E7EB", true: ORANGE }}
                thumbColor="#fff"
              />
              <ThemedText style={styles.toggleLabel}>{field.label}</ThemedText>
            </View>
          );
        }

        if (field.type === "select" && field.options) {
          return (
            <View key={field.key}>
              <ThemedText style={styles.label}>{field.label}</ThemedText>
              <View style={styles.pickerWrap}>
                <Picker
                  selectedValue={value || field.options[0]}
                  onValueChange={(v) => onChange(field.key, v)}
                  style={styles.picker}
                >
                  {field.options.map((opt) => (
                    <Picker.Item key={opt} label={opt} value={opt} />
                  ))}
                </Picker>
              </View>
            </View>
          );
        }

        return (
          <View key={field.key}>
            <ThemedText style={styles.label}>
              {field.label}
              {field.unit ? (
                <ThemedText style={styles.unit}> ({field.unit})</ThemedText>
              ) : null}
            </ThemedText>
            <TextInput
              style={styles.input}
              value={value}
              onChangeText={(v) => onChange(field.key, v)}
              placeholder={field.placeholder || ""}
              placeholderTextColor="#bbb"
              keyboardType={field.type === "number" ? "numeric" : "default"}
              textAlign="right"
              testID={`input-extra-${field.key}`}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1.5,
    borderColor: "#EDE9FE",
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    backgroundColor: "#FAFAFF",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#EDE9FE",
  },
  sectionTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    color: PURPLE,
    textAlign: "right",
    flex: 1,
  },
  label: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    color: "#444",
    textAlign: "right",
    marginBottom: 6,
    marginTop: 4,
  },
  unit: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    color: "#888",
  },
  input: {
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: "#111",
    textAlign: "right",
    marginBottom: 12,
    backgroundColor: "#fff",
  },
  pickerWrap: {
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  picker: {
    height: Platform.OS === "ios" ? 140 : 50,
    color: "#111",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
    justifyContent: "flex-end",
  },
  toggleLabel: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    color: "#444",
    textAlign: "right",
  },
});
