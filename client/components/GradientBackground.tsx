import React from "react";
import { StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

export function GradientBackground() {
  return (
    <LinearGradient
      colors={["#FFF3EE", "#FFF9F6", "#FFFCFA", "#FFFFFF"]}
      locations={[0, 0.15, 0.4, 1]}
      style={StyleSheet.absoluteFillObject}
    />
  );
}
