import React from "react";
import { View, StyleSheet, Pressable, Text } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { useCart } from "@/context/CartContext";
import { useNotifications } from "@/context/NotificationContext";
import { AppColors } from "@/constants/theme";

// Visual height of the bar content (below the status bar). The home screen pads
// its scroll content by insets.top + HEADER_BAR_HEIGHT so nothing hides behind it.
export const HEADER_BAR_HEIGHT = 52;

interface HeaderTitleProps {
  title?: string;
}

// In-screen top bar for the Home tab. It is rendered INSIDE the screen (not as a
// React Navigation native-stack title) and owns its own safe-area top padding.
// The old approach — a full-width custom component used as a *centered* native-stack
// title — was clipped by Android's native Toolbar, pushing the notification/cart
// icons off-screen and inflating the header height. Rendering it as a normal View
// makes the layout identical and correct on iOS and every Android size.
export function HeaderTitle({ title }: HeaderTitleProps) {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
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
    <View style={[styles.bar, { paddingTop: insets.top }]}>
      {/* row-reverse so the action icons sit on the LEFT and the menu on the RIGHT
          under the app's forced-RTL layout (plain "row" put the icons on the right). */}
      <View style={styles.container}>
        <View style={styles.iconGroup}>
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
  bar: {
    width: "100%",
    backgroundColor: "transparent",
  },
  container: {
    height: HEADER_BAR_HEIGHT,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  iconGroup: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
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
