import React from "react";
import { View, StyleSheet, Image, Pressable, Dimensions } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { Spacing, AppColors, BorderRadius } from "@/constants/theme";
import { useCart } from "@/context/CartContext";
import { useNotifications } from "@/context/NotificationContext";

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
          <Feather name="bell" size={22} color={AppColors.textPrimary} />
          {unreadCount > 0 ? (
            <View style={styles.badge}>
              <ThemedText type="small" style={styles.badgeText}>
                {unreadCount > 9 ? "9+" : unreadCount}
              </ThemedText>
            </View>
          ) : null}
        </Pressable>
        <Pressable style={styles.iconButton} onPress={handleCartPress}>
          <Feather name="shopping-cart" size={22} color={AppColors.textPrimary} />
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
        <ThemedText style={styles.title}>{title}</ThemedText>
        <Image
          source={require("../../assets/images/icon.png")}
          style={styles.icon}
          resizeMode="cover"
        />
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
    borderRadius: BorderRadius.full,
    backgroundColor: AppColors.secondary,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    overflow: "hidden",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: AppColors.primary,
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: AppColors.primary,
    borderRadius: BorderRadius.full,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
});
