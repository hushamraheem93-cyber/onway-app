import React from "react";
import { StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Gradients } from "@/constants/theme";

export function GradientBackground() {
  return (
    <LinearGradient
      colors={Gradients.background}
      locations={[0, 0.15, 0.4, 1]}
      style={StyleSheet.absoluteFillObject}
    />
  );
}
