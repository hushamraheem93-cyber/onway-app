import React from "react";
import { StyleSheet, FlatList, View, Dimensions, ActivityIndicator, Pressable, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, AppColors } from "@/constants/theme";
import { Category } from "@/constants/categories";
import { ThemedText } from "@/components/ThemedText";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { GradientBackground } from "@/components/GradientBackground";
import { resolveImageUrl } from "@/utils/imageUtils";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_GAP = 12;
const CARD_WIDTH = (SCREEN_WIDTH - 16 * 2 - CARD_GAP) / 2;

const CATEGORY_3D_IMAGES: Record<string, string> = {
  "restaurants": "/uploads/category-3d-restaurants.png",
  "fruits-vegetables": "/uploads/category-3d-vegetables.png",
  "meat-poultry": "/uploads/category-3d-meat.png",
  "dairy-eggs": "/uploads/category-3d-dairy.png",
  "cleaning-care": "/uploads/category-3d-cleaning.png",
  "beverages": "/uploads/category-3d-beverages.png",
  "snacks-sweets": "/uploads/category-3d-snacks.png",
  "tea-coffee": "/uploads/category-3d-coffee.png",
  "baby": "/uploads/category-3d-baby.png",
  "flowers": "/uploads/category-3d-flowers.png",
  "delivery": "/uploads/category-3d-delivery.png",
  "pharmacy": "/uploads/category-3d-pharmacy.png",
  "women-bags": "/uploads/category-3d-bags.png",
  "international-shopping": "/uploads/category-3d-international.png",
};

const CATEGORY_COLORS: Record<string, string> = {
  "restaurants": "#FFF4E0",
  "fruits-vegetables": "#E8F5E9",
  "meat-poultry": "#FFEBEE",
  "dairy-eggs": "#F3E5F5",
  "cleaning-care": "#E3F2FD",
  "beverages": "#E0F7FA",
  "snacks-sweets": "#FFF9C4",
  "tea-coffee": "#EFEBE9",
  "baby": "#FCE4EC",
  "flowers": "#FDF2F2",
  "delivery": "#FFFDE7",
  "pharmacy": "#E1F5FE",
  "women-bags": "#FCE4EC",
  "international-shopping": "#E8EAF6",
};

export default function CategoriesScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();

  const { data: categories = [], isLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const CATEGORY_TO_BUSINESS_TYPE: Record<string, string> = {
    restaurants: "restaurant",
    pharmacy: "pharmacy",
  };

  const handleCategoryPress = (category: Category) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (category.id === "delivery") {
      navigation.navigate("CourierPickup");
    } else if (category.id === "international-shopping") {
      navigation.navigate("InternationalShopping");
    } else {
      const businessType = CATEGORY_TO_BUSINESS_TYPE[category.id];
      navigation.navigate("StoresList", {
        categoryId: category.id,
        categoryName: category.name,
        businessType,
      });
    }
  };

  const get3DImage = (categoryId: string) => {
    const path = CATEGORY_3D_IMAGES[categoryId];
    if (path) return resolveImageUrl(path);
    return "";
  };

  const getGradientColor = (categoryId: string, fallback?: string) => {
    return CATEGORY_COLORS[categoryId] || fallback || "#FFF3E0";
  };

  const renderCategory = ({ item }: { item: Category }) => {
    const gradientColor = getGradientColor(item.id, item.color);
    const image3D = get3DImage(item.id);
    const imageSource = image3D || resolveImageUrl(item.image);

    return (
      <Pressable
        style={styles.cardWrapper}
        onPress={() => handleCategoryPress(item)}
        testID={`card-category-${item.id}`}
      >
        <LinearGradient
          colors={[gradientColor, "#FFFFFF"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.card}
        >
          <View style={styles.imageContainer}>
            <Image
              source={{ uri: imageSource }}
              style={styles.image}
              contentFit="contain"
              cachePolicy="disk"
              transition={200}
            />
          </View>
          <ThemedText type="body" style={styles.name} numberOfLines={2}>
            {item.name}
          </ThemedText>
        </LinearGradient>
      </Pressable>
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.backgroundRoot }]}>
        <ActivityIndicator size="large" color={AppColors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container]}>
      <GradientBackground />
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.lg,
          paddingBottom: insets.bottom + 100,
          paddingHorizontal: 16,
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
    marginBottom: CARD_GAP,
  },
  cardWrapper: {
    width: CARD_WIDTH,
    borderRadius: 25,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: {
        elevation: 4,
      },
      default: {
        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
      },
    }),
  },
  card: {
    width: "100%",
    height: 180,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  imageContainer: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  image: {
    width: 100,
    height: 100,
    backgroundColor: "transparent",
  },
  name: {
    fontSize: 14,
    fontWeight: "700",
    color: "#333333",
    textAlign: "center",
    marginTop: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
