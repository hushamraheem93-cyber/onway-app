import React, { useEffect } from "react";
import { StyleSheet, FlatList, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { useTheme } from "@/hooks/useTheme";
import { Spacing, AppColors } from "@/constants/theme";
import { useOrders, Order } from "@/context/OrderContext";
import { OrderCard } from "@/components/OrderCard";
import { EmptyState } from "@/components/EmptyState";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const { orders, isLoading, refreshOrders } = useOrders();

  useEffect(() => {
    refreshOrders();
  }, []);

  const handleStartShopping = () => {
    navigation.navigate("Main", { screen: "HomeTab" } as any);
  };

  const renderItem = ({ item }: { item: Order }) => (
    <OrderCard order={item} />
  );

  const renderEmpty = () => (
    <EmptyState
      title="لا توجد طلبات"
      subtitle="لم تقم بأي طلبات بعد"
      buttonText="ابدأ التسوق"
      onButtonPress={handleStartShopping}
    />
  );

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
        flexGrow: 1,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
      data={orders}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={renderEmpty}
      refreshControl={
        <RefreshControl
          refreshing={isLoading}
          onRefresh={refreshOrders}
          tintColor={AppColors.primary}
          colors={[AppColors.primary]}
        />
      }
    />
  );
}

const styles = StyleSheet.create({});
