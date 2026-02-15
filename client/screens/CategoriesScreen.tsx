import React from "react";
import { StyleSheet, FlatList, View, Dimensions, ActivityIndicator, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, AppColors } from "@/constants/theme";
import { Category } from "@/constants/categories";
import { ThemedText } from "@/components/ThemedText";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { getApiUrl } from "@/lib/query-client";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = (SCREEN_WIDTH - 50) / 2;

export default function CategoriesScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();

  const { data: categories = [], isLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const handleCategoryPress = (category: Category) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (category.id === "delivery") {
      navigation.navigate("CourierPickup");
    } else if (category.id === "international-shopping") {
      navigation.navigate("InternationalShopping");
    } else {
      navigation.navigate("Products", { categoryId: category.id, categoryName: category.name });
    }
  };

  const getImageUrl = (image: string) => {
    if (!image) return "";
    if (image.startsWith("data:")) return image;
    if (image.startsWith("http")) return image;
    return `${getApiUrl()}${image}`;
  };

  const renderCategory = ({ item }: { item: Category }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: item.color || "#F5F5F5" }]}
      onPress={() => handleCategoryPress(item)}
      activeOpacity={0.8}
    >
      <View style={styles.iconContainer}>
        <Image
          source={{ uri: getImageUrl(item.image) }}
          style={styles.image}
          contentFit="contain"
          transition={200}
        />
      </View>
      <ThemedText type="body" style={styles.name} numberOfLines={2}>
        {item.name}
      </ThemedText>
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.backgroundRoot }]}>
        <ActivityIndicator size="large" color={AppColors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundDefault }]}>
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.lg,
          paddingBottom: insets.bottom + 100,
          paddingHorizontal: 15,
        }}
        columnWrapperStyle={styles.row}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        data={categories}
        renderItem={renderCategory}
        keyExtractor={(item) => item.id}
        numColumns={2}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  row: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
  },
  card: {
    width: CARD_WIDTH,
    height: 160,
    borderRadius: 35,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 1,
  },
  iconContainer: {
    width: 85,
    height: 85,
    backgroundColor: "#FFF",
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  image: {
    width: 50,
    height: 50,
  },
  name: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#444",
    textAlign: "center",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
