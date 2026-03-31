import React from "react";
import { StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

export function GradientBackground() {
  return (
    <LinearGradient
      colors={["#FFE5D9", "#FFF0E6", "#FFF8F3", "#FFFFFF"]}
      locations={[0, 0.2, 0.5, 1]}
      style={StyleSheet.absoluteFillObject}
    />
  );
}
