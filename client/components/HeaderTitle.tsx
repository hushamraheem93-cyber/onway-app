import React from "react";
import { View, StyleSheet, Pressable, Dimensions, Text } from "react-native";
import { Image } from "expo-image";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";

import { useCart } from "@/context/CartContext";
import { useNotifications } from "@/context/NotificationContext";
import { AppColors } from "@/constants/theme";

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

  const handleSearchPress = () => {
    navigation.navigate("Main", { screen: "SearchTab" });
  };

  const handleNotificationsPress = () => {
    navigation.navigate("Main", { screen: "ProfileTab", params: { screen: "NotificationsList" } });
  };

  return (
    <View style={styles.wrapper}>
      {/* Logo is an absolutely-centered, NON-interactive overlay. It is 130px wide
          and previously lived in a flex:1 third that it overflowed, painting on top
          of the adjacent action icon and swallowing its taps — which is why tapping
          the search icon "did nothing" while the cart icon (further from centre)
          still worked. pointerEvents="none" guarantees the logo can never intercept
          a tap on any icon, and absolute centring keeps it screen-centred. */}
      <View style={styles.logoOverlay} pointerEvents="none">
        <Image
          source={require("../assets/images/onway-header-logo-transparent.png")}
          style={styles.logo}
          contentFit="contain"
        />
      </View>

      {/* row-reverse so the action icons sit on the LEFT and the menu on the RIGHT
          under the app's forced-RTL layout (plain "row" put the icons on the right). */}
      <View style={styles.container}>
        <View style={styles.iconGroup}>
          <Pressable style={styles.iconButton} onPress={handleSearchPress} testID="button-search" accessibilityRole="button" accessibilityLabel="بحث عن منتج">
            <Feather name="search" size={22} color={AppColors.primary} />
          </Pressable>
          <Pressable style={styles.iconButton} onPress={handleNotificationsPress} testID="button-notifications">
            <Feather name="bell" size={22} color={AppColors.primary} />
            {unreadCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {unreadCount > 9 ? "9+" : unreadCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable style={styles.iconButton} onPress={handleCartPress} testID="button-cart">
            <Feather name="shopping-cart" size={22} color={AppColors.primary} />
            {cartCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {cartCount > 9 ? "9+" : cartCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        <Pressable
          style={styles.menuButton}
          onPress={() =>
            navigation.navigate("Main", {
              screen: "ProfileTab",
              params: { screen: "Profile" },
            })
          }
          testID="button-menu"
        >
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
  wrapper: {
    width: SCREEN_WIDTH - 32,
    borderBottomWidth: 0,
    justifyContent: "center",
  },
  container: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingBottom: 6,
  },
  iconGroup: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  logoOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 6,
  },
  logo: {
    width: 130,
    height: 50,
  },
  menuButton: {
    width: 36,
    height: 36,
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
    backgroundColor: AppColors.primary,
    borderRadius: 2,
  },
  menuLineShort: {
    width: 16,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(232, 101, 32, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(232, 101, 32, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: 0,
    left: 0,
    backgroundColor: AppColors.primary,
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
    color: AppColors.white,
  },
});
