import React from "react";
import { View, StyleSheet, Pressable, Dimensions, Text } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";

import { ThemedText } from "@/components/ThemedText";
import { Spacing, AppColors, BorderRadius } from "@/constants/theme";
import { useCart } from "@/context/CartContext";
import { useNotifications } from "@/context/NotificationContext";

import headerLogo from "../assets/images/onway-header-logo.png";

const SCREEN_WIDTH = Dimensions.get("window").width;

interface HeaderTitleProps {
  title: string;
}

export function HeaderTitle({ title }: HeaderTitleProps) {
  const navigation = useNavigation<any>();
  const { getItemCount } = useCart();
  const { unreadCount } = useNotifications();
  const cartCount = getItemCount();

  const handleCartPress = () => {
    navigation.navigate("Main", { screen: "CartTab" });
  };

  const handleNotificationsPress = () => {
    navigation.navigate("Main", { screen: "ProfileTab", params: { screen: "NotificationsList" } });
  };

  return (
    <View style={styles.container}>
      <View style={styles.leftSection}>
        <Pressable style={styles.iconButton} onPress={handleNotificationsPress}>
          <Feather name="bell" size={22} color={AppColors.onGrey} />
          {unreadCount > 0 ? (
            <View style={styles.badge}>
              <ThemedText type="small" style={styles.badgeText}>
                {unreadCount > 9 ? "9+" : unreadCount}
              </ThemedText>
            </View>
          ) : null}
        </Pressable>
        <Pressable style={styles.iconButton} onPress={handleCartPress}>
          <Feather name="shopping-cart" size={22} color={AppColors.onGrey} />
          {cartCount > 0 ? (
            <View style={styles.badge}>
              <ThemedText type="small" style={styles.badgeText}>
                {cartCount > 9 ? "9+" : cartCount}
              </ThemedText>
            </View>
          ) : null}
        </Pressable>
      </View>

      <View style={styles.rightSection}>
        <Image
          source={headerLogo}
          style={styles.logoImage}
          contentFit="contain"
        />
        <View style={styles.logoContainer}>
          <Text style={styles.logoOn}>ON</Text>
          <Text style={styles.logoWay}>WAY</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: SCREEN_WIDTH - 32,
  },
  leftSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  rightSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  logoImage: {
    width: 40,
    height: 40,
  },
  logoContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  logoOn: {
    fontFamily: "System",
    fontSize: 22,
    fontWeight: "800",
    fontStyle: "italic",
    color: AppColors.onGrey,
  },
  logoWay: {
    fontFamily: "System",
    fontSize: 22,
    fontWeight: "800",
    fontStyle: "italic",
    color: AppColors.wayYellow,
  },
  badge: {
    position: "absolute",
    top: -5,
    right: -5,
    backgroundColor: "#f37021",
    borderRadius: BorderRadius.full,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
});
