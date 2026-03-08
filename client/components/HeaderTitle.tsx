import React from "react";
import { View, StyleSheet, Pressable, Dimensions, Text } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";

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
          <Feather name="bell" size={22} color="#2C3E50" />
          {unreadCount > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {unreadCount > 9 ? "9+" : unreadCount}
              </Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable style={styles.iconButton} onPress={handleCartPress}>
          <Feather name="shopping-cart" size={22} color="#2C3E50" />
          {cartCount > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {cartCount > 9 ? "9+" : cartCount}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <View style={styles.centerSection}>
        <View style={styles.logoBlock}>
          <Text style={styles.logoText}>
            <Text style={styles.logoName}>OnWay</Text>
          </Text>
          <MaterialCommunityIcons name="motorbike" size={26} color="#F37335" style={styles.motorbike} />
        </View>
      </View>

      <View style={styles.rightSection}>
        <Pressable style={styles.menuButton} onPress={() => navigation.navigate("Main", { screen: "ProfileTab" })}>
          <View style={styles.menuLines}>
            <View style={styles.menuLine} />
            <View style={[styles.menuLine, styles.menuLineShort]} />
            <View style={styles.menuLine} />
          </View>
        </Pressable>
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
    gap: 12,
    flex: 1,
  },
  centerSection: {
    flex: 1,
    alignItems: "center",
  },
  rightSection: {
    flex: 1,
    alignItems: "flex-end",
  },
  menuButton: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  menuLines: {
    width: 22,
    height: 16,
    justifyContent: "space-between",
  },
  menuLine: {
    width: 22,
    height: 2.5,
    backgroundColor: "#2C3E50",
    borderRadius: 2,
  },
  menuLineShort: {
    width: 16,
  },
  logoBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  motorbike: {
    transform: [{ scaleX: -1 }],
  },
  logoText: {
    flexDirection: "row",
  },
  logoName: {
    fontFamily: "Cairo_700Bold",
    fontSize: 24,
    fontStyle: "italic",
    fontWeight: "800",
    color: "#F37335",
    letterSpacing: -1,
  },
  iconButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: 0,
    left: 0,
    backgroundColor: "#FF6B35",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 10,
    color: "#FFFFFF",
  },
});
