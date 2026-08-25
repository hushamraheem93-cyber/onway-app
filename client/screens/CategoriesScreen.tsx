import React, { useState } from "react";
import {
  StyleSheet,
  FlatList,
  View,
  Dimensions,
  ActivityIndicator,
  Pressable,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, AppColors, FontWeight } from "@/constants/theme";
import { Category } from "@/constants/categories";
import { ThemedText } from "@/components/ThemedText";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { GradientBackground } from "@/components/GradientBackground";
import { categoryImageSource } from "@/constants/categoryImages";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

/**
 * The category picture, with something to show when there is none.
 *
 * Neither screen had an onError or a placeholder, so a category whose image was
 * missing — or whose legacy /uploads URL 404'd — rendered an empty hole with no
 * hint that anything was wrong. This keeps the same 100x100 box and the same
 * contentFit; it only fills it when the image cannot be shown.
 */
function CategoryIcon({ uri }: { uri: string }) {
  const [failed, setFailed] = useState(false);

  if (!uri || failed) {
    return (
      <View style={[styles.image, styles.imageFallback]}>
        <Feather name="image" size={32} color={AppColors.gray400} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={styles.image}
      contentFit="contain"
      cachePolicy="disk"
      transition={200}
      onError={() => setFailed(true)}
    />
  );
}


const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_GAP = 12;
const CARD_WIDTH = (SCREEN_WIDTH - 16 * 2 - CARD_GAP) / 2;


const CATEGORY_COLORS: Record<string, string> = {
  restaurants: AppColors.warningLight,
  "fruits-vegetables": AppColors.successLight,
  "meat-poultry": AppColors.errorLight,
  "dairy-eggs": AppColors.vendorPurpleLight,
  "cleaning-care": AppColors.driverBlueLight,
  beverages: AppColors.infoLight,
  "snacks-sweets": AppColors.warningLight,
  "tea-coffee": AppColors.gray100,
  baby: AppColors.errorLight,
  flowers: AppColors.errorLight,
  delivery: AppColors.warningLight,
  pharmacy: AppColors.infoLight,
  "women-bags": AppColors.errorLight,
  "international-shopping": AppColors.infoLight,
};

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
      navigation.navigate("StoresList", {
        categoryId: category.id,
        categoryName: category.name,
      });
    }
  };



  const getGradientColor = (categoryId: string, fallback?: string) => {
    return CATEGORY_COLORS[categoryId] || fallback || AppColors.secondary;
  };

  const renderCategory = ({ item }: { item: Category }) => {
    const gradientColor = getGradientColor(item.id, item.color);
    // The uploaded picture first; the legacy /uploads asset only if there is none.
    const imageSource = categoryImageSource(item.id, item.image);

    return (
      <Pressable
        style={styles.cardWrapper}
        onPress={() => handleCategoryPress(item)}
        testID={`card-category-${item.id}`}
        accessibilityRole="button"
        accessibilityLabel={`قسم ${item.name}`}
      >
        <LinearGradient
          colors={[gradientColor, AppColors.white]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.card}
        >
          <View style={styles.imageContainer}>
            <CategoryIcon uri={imageSource} />
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
      <View
        style={[
          styles.loadingContainer,
          { backgroundColor: theme.backgroundRoot },
        ]}
      >
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
          paddingTop: Math.max(headerHeight, insets.top + 44) + Spacing.lg,
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
        shadowColor: AppColors.black,
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
  // Centres the placeholder glyph inside the box above. The box keeps its size.
  imageFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    fontSize: 14,
    fontWeight: FontWeight.bold,
    color: AppColors.gray700,
    textAlign: "center",
    marginTop: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
