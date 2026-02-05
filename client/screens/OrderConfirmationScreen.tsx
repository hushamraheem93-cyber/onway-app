import React from "react";
import { StyleSheet, View, Linking, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { ThemedText } from "@/components/ThemedText";
import { Spacing, BorderRadius, AppColors, Shadows } from "@/constants/theme";
import { formatPrice } from "@/constants/currency";
import { Button } from "@/components/Button";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { Order } from "@/context/OrderContext";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteProps = RouteProp<RootStackParamList, "OrderConfirmation">;

const ADMIN_WHATSAPP = "9647702891104";

export default function OrderConfirmationScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const order = route.params?.order;

  if (!order || !order.items) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.backgroundRoot, justifyContent: "center", alignItems: "center" }}>
        <ThemedText type="body">جاري التحميل...</ThemedText>
      </View>
    );
  }

  const formatOrderTime = (date: Date) => {
    const d = new Date(date);
    const hours = d.getHours().toString().padStart(2, "0");
    const minutes = d.getMinutes().toString().padStart(2, "0");
    const day = d.getDate().toString().padStart(2, "0");
    const month = (d.getMonth() + 1).toString().padStart(2, "0");
    const year = d.getFullYear();
    return `${hours}:${minutes} - ${day}/${month}/${year}`;
  };

  const generateWhatsAppMessage = () => {
    const itemsList = order.items
      .map((item, index) => `${index + 1}. ${item.name} × ${item.quantity} = ${formatPrice(item.price * item.quantity)}`)
      .join("\n");

    const message = `🛒 *طلب جديد*

📋 *رقم الطلب:* ${order.id}
⏰ *وقت الطلب:* ${formatOrderTime(new Date(order.createdAt))}

📱 *رقم الهاتف:* ${order.phoneNumber}
📍 *عنوان التوصيل:* ${order.address}
🗺️ *المنطقة:* ${order.region}

📦 *المنتجات المطلوبة:*
${itemsList}

🚚 *أجور التوصيل:* ${formatPrice(order.deliveryFee)}
💰 *المجموع الكلي:* ${formatPrice(order.total + order.deliveryFee)}`;

    return message;
  };

  const sendToWhatsApp = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    
    const message = generateWhatsAppMessage();
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${ADMIN_WHATSAPP}?text=${encodedMessage}`;
    
    const canOpen = await Linking.canOpenURL(whatsappUrl);
    if (canOpen) {
      await Linking.openURL(whatsappUrl);
    } else {
      await Linking.openURL(`https://web.whatsapp.com/send?phone=${ADMIN_WHATSAPP}&text=${encodedMessage}`);
    }
  };

  const goHome = () => {
    navigation.navigate("Main");
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
    >
      <View style={styles.successIcon}>
        <View style={[styles.iconCircle, { backgroundColor: AppColors.success }]}>
          <Feather name="check" size={48} color="#FFFFFF" />
        </View>
      </View>

      <ThemedText type="h2" style={styles.title}>
        تم تأكيد طلبك بنجاح!
      </ThemedText>

      <ThemedText type="body" style={[styles.subtitle, { color: theme.textSecondary }]}>
        رقم الطلب: {order.id}
      </ThemedText>

      <View style={[styles.card, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
        <ThemedText type="h4" style={styles.cardTitle}>
          تفاصيل الطلب
        </ThemedText>

        <View style={styles.detailRow}>
          <ThemedText type="body">{order.phoneNumber}</ThemedText>
          <ThemedText type="body" style={{ color: theme.textSecondary }}>الهاتف</ThemedText>
        </View>

        <View style={styles.detailRow}>
          <ThemedText type="body">{order.region}</ThemedText>
          <ThemedText type="body" style={{ color: theme.textSecondary }}>المنطقة</ThemedText>
        </View>

        <View style={styles.detailRow}>
          <ThemedText type="body" style={{ flex: 1, textAlign: "left" }}>{order.address}</ThemedText>
          <ThemedText type="body" style={{ color: theme.textSecondary }}>العنوان</ThemedText>
        </View>

        <View style={[styles.detailRow, styles.divider]}>
          <ThemedText type="body">{order.items.length} منتج</ThemedText>
          <ThemedText type="body" style={{ color: theme.textSecondary }}>المنتجات</ThemedText>
        </View>

        {order.items.map((item, index) => (
          <View key={index} style={styles.itemRow}>
            <ThemedText type="small" style={{ color: AppColors.primary }}>
              {formatPrice(item.price * item.quantity)}
            </ThemedText>
            <ThemedText type="small" style={{ flex: 1, textAlign: "right" }}>
              {item.name} × {item.quantity}
            </ThemedText>
          </View>
        ))}

        <View style={styles.detailRow}>
          <ThemedText type="body" style={{ color: theme.textSecondary }}>
            {formatPrice(order.deliveryFee)}
          </ThemedText>
          <ThemedText type="body" style={{ color: theme.textSecondary }}>أجور التوصيل</ThemedText>
        </View>

        <View style={[styles.detailRow, styles.totalRow]}>
          <ThemedText type="h3" style={{ color: AppColors.primary }}>
            {formatPrice(order.total + order.deliveryFee)}
          </ThemedText>
          <ThemedText type="h4">المجموع الكلي</ThemedText>
        </View>

        <ThemedText type="small" style={[styles.timeText, { color: theme.textSecondary }]}>
          وقت الطلب: {formatOrderTime(new Date(order.createdAt))}
        </ThemedText>
      </View>

      <View style={[styles.whatsappCard, { backgroundColor: "#25D366" }]}>
        <Feather name="message-circle" size={28} color="#FFFFFF" style={styles.whatsappIcon} />
        <ThemedText type="body" style={styles.whatsappText}>
          لإتمام الطلب، يرجى إرسال تفاصيل الطلب إلى الإدارة عبر واتساب
        </ThemedText>
      </View>

      <Button onPress={sendToWhatsApp} style={styles.whatsappButton}>
        <View style={styles.buttonContent}>
          <Feather name="send" size={20} color="#FFFFFF" />
          <ThemedText type="body" style={styles.buttonText}>
            إرسال الطلب إلى الإدارة عبر واتساب
          </ThemedText>
        </View>
      </Button>

      <Button onPress={goHome} variant="outline" style={styles.homeButton}>
        العودة للرئيسية
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  successIcon: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  subtitle: {
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  card: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  cardTitle: {
    textAlign: "right",
    marginBottom: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
    marginTop: Spacing.sm,
    paddingTop: Spacing.md,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
    marginTop: Spacing.md,
    paddingTop: Spacing.lg,
  },
  timeText: {
    textAlign: "center",
    marginTop: Spacing.md,
  },
  whatsappCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    flexDirection: "row-reverse",
    alignItems: "center",
  },
  whatsappIcon: {
    marginLeft: Spacing.md,
  },
  whatsappText: {
    flex: 1,
    color: "#FFFFFF",
    textAlign: "right",
  },
  whatsappButton: {
    backgroundColor: "#25D366",
    marginBottom: Spacing.md,
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  buttonText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  homeButton: {
    marginBottom: Spacing.xl,
  },
});
