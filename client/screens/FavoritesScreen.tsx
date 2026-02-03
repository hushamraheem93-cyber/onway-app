import React from "react";
import { StyleSheet, View, FlatList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, DesignSystem } from "@/constants/theme";
import { EmptyState } from "@/components/EmptyState";

export default function FavoritesScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: tabBarHeight + Spacing.xl,
        paddingHorizontal: DesignSystem.screenPadding,
        flexGrow: 1,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
      data={[]}
      renderItem={() => null}
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={
        <EmptyState
          title="لا توجد منتجات مفضلة"
          subtitle="أضف منتجاتك المفضلة للوصول إليها بسهولة"
        />
      }
    />
  );
}

const styles = StyleSheet.create({});
