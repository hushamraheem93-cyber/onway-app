import React from "react";
import {
  StyleSheet,
  FlatList,
  View,
  useWindowDimensions,
  ActivityIndicator,
  Pressable,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, AppColors, FontWeight } from "@/constants/theme";
import { Category } from "@/constants/categories";
import { ThemedText } from "@/components/ThemedText";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { GradientBackground } from "@/components/GradientBackground";
import {
  categoryImageFallbackSource,
  categoryImageSource,
} from "@/constants/categoryImages";
import { CategoryIcon } from "@/components/CategoryIcon";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const CARD_GAP = 12;


export default function CategoriesScreen() {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const cardWidth = Math.max(0, (screenWidth - 32 - CARD_GAP) / 2);

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



  const renderCategory = ({ item }: { item: Category }) => {
    const imageSource = categoryImageSource(item.id, item.image);
    const fallbackImageSource = categoryImageFallbackSource(item.id);

    return (
      <Pressable
        style={[styles.cardWrapper, { width: cardWidth }]}
        onPress={() => handleCategoryPress(item)}
        testID={`card-category-${item.id}`}
        accessibilityRole="button"
        accessibilityLabel={`قسم ${item.name}`}
      >
        {/* Plain #FFFFFF, matching HomeScreen. The per-category tints are gone;
            the LinearGradient element stays with two identical white stops so the
            card's size, radius, padding and the wrapper's shadow are unchanged. */}
        <LinearGradient
          colors={[AppColors.white, AppColors.white]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.card}
        >
          <View style={styles.imageContainer}>
            <CategoryIcon
              uri={imageSource}
              fallbackUri={fallbackImageSource}
              size={110}
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
    height: 190,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    paddingVertical: 12,
    paddingHorizontal: 6,
  },
  imageContainer: {
    height: 116,
    width: "100%",
    flexGrow: 0,
    flexShrink: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  name: {
    fontSize: 14,
    fontWeight: FontWeight.bold,
    color: AppColors.gray700,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 22,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
