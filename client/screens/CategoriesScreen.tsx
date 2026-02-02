import React from "react";
import { StyleSheet, FlatList, View, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { useTheme } from "@/hooks/useTheme";
import { Spacing } from "@/constants/theme";
import { CATEGORIES, Category } from "@/constants/categories";
import { CategoryCard } from "@/components/CategoryCard";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const NUM_COLUMNS = 3;
const HORIZONTAL_PADDING = Spacing.lg;
const CARD_WIDTH = (SCREEN_WIDTH - HORIZONTAL_PADDING * 2) / NUM_COLUMNS;

export default function CategoriesScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();

  const handleCategoryPress = (category: Category) => {
    navigation.navigate("Products", { categoryId: category.id, categoryName: category.name });
  };

  const renderCategory = ({ item }: { item: Category }) => (
    <View style={[styles.categoryItem, { width: CARD_WIDTH }]}>
      <CategoryCard category={item} onPress={() => handleCategoryPress(item)} />
    </View>
  );

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: tabBarHeight + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
      data={CATEGORIES}
      renderItem={renderCategory}
      keyExtractor={(item) => item.id}
      numColumns={NUM_COLUMNS}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  categoryItem: {
    marginBottom: Spacing.sm,
  },
});
