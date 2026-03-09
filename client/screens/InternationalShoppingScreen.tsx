import React, { useState } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { AppColors, Spacing } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

const BRAND_ORANGE = "#D94523";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface ShoppingSite {
  id: string;
  name: string;
  nameAr: string;
  icon: string;
  color: string;
  bgColor: string;
}

const SHOPPING_SITES: ShoppingSite[] = [
  { id: "shein", name: "SHEIN", nameAr: "شي إن", icon: "shopping-bag", color: "#000000", bgColor: "#F5F5F5" },
  { id: "aliexpress", name: "AliExpress", nameAr: "علي إكسبرس", icon: "package", color: "#E53935", bgColor: "#FFEBEE" },
  { id: "alibaba", name: "Alibaba", nameAr: "علي بابا", icon: "globe", color: "#FF6F00", bgColor: "#FFF3E0" },
];

export default function InternationalShoppingScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { theme } = useTheme();
  const navigation = useNavigation<NavigationProp>();
  const { phoneNumber, userProfile } = useAuth();

  const [selectedSite, setSelectedSite] = useState<string | null>(null);
  const [productLink, setProductLink] = useState("");
  const [productDetails, setProductDetails] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [customerNotes, setCustomerNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const isFormValid =
    selectedSite !== null &&
    productLink.trim().length > 0 &&
    productDetails.trim().length > 0;

  const handleSubmit = async () => {
    if (!isFormValid) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsSubmitting(true);

    try {
      const siteName = SHOPPING_SITES.find((s) => s.id === selectedSite)?.name || selectedSite;

      const orderData = {
        phoneNumber: phoneNumber || "",
        customerName: userProfile?.fullName || "",
        items: [
          {
            productId: `international-${selectedSite}`,
            name: `طلب من ${siteName} - ${productDetails.substring(0, 50)}`,
            price: 0,
            quantity: Number(quantity) || 1,
            image: "",
          },
        ],
        total: 0,
        deliveryFee: 0,
        address: userProfile?.address || "",
        region: "التسوق الدولي",
        orderType: "international-shopping",
        internationalDetails: {
          site: selectedSite,
          productLink,
          productDetails,
          quantity: Number(quantity) || 1,
          notes: customerNotes || undefined,
        },
      };

      const response = await fetch(
        new URL("/api/orders", getApiUrl()).toString(),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(orderData),
        }
      );

      if (response.ok) {
        setIsSubmitted(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert("خطأ", "حدث خطأ أثناء تقديم الطلب. حاول مرة أخرى.");
      }
    } catch (error) {
      Alert.alert("خطأ", "حدث خطأ في الاتصال. تأكد من اتصالك بالإنترنت.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedSite(null);
    setProductLink("");
    setProductDetails("");
    setQuantity("1");
    setCustomerNotes("");
    setIsSubmitted(false);
  };

  if (isSubmitted) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundDefault }]}>
        <View style={[styles.successContainer, { paddingTop: headerHeight + 40 }]}>
          <View style={styles.successIcon}>
            <Feather name="check-circle" size={64} color={BRAND_ORANGE} />
          </View>
          <ThemedText style={styles.successTitle}>تم تقديم طلبك بنجاح</ThemedText>
          <ThemedText style={styles.successSubtitle}>
            سيتم مراجعة طلبك وتحديد السعر والتواصل معك قريباً
          </ThemedText>
          <Pressable
            style={styles.submitButton}
            onPress={resetForm}
            testID="button-new-order"
          >
            <Feather name="plus" size={18} color="#FFF" style={{ marginLeft: 8 }} />
            <ThemedText style={styles.submitButtonText}>طلب جديد</ThemedText>
          </Pressable>
          <Pressable
            style={[styles.submitButton, { backgroundColor: "#F0F0F0", marginTop: 12 }]}
            onPress={() => navigation.goBack()}
            testID="button-back-home"
          >
            <ThemedText style={[styles.submitButtonText, { color: "#666" }]}>
              العودة للرئيسية
            </ThemedText>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={headerHeight}
    >
      <ScrollView
        style={[styles.container, { backgroundColor: theme.backgroundDefault }]}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.lg,
          paddingBottom: insets.bottom + 40,
          paddingHorizontal: 20,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerSection}>
          <View style={styles.headerIconWrap}>
            <Feather name="globe" size={32} color={BRAND_ORANGE} />
          </View>
          <ThemedText style={styles.headerTitle}>التسوق من المواقع العالمية</ThemedText>
          <ThemedText style={[styles.headerSubtitle, { color: theme.textSecondary }]}>
            اختر الموقع وأرسل رابط المنتج وسنتكفل بالباقي
          </ThemedText>
        </View>

        <ThemedText style={styles.sectionTitle}>اختر الموقع</ThemedText>
        <View style={styles.sitesGrid}>
          {SHOPPING_SITES.map((site) => (
            <Pressable
              key={site.id}
              style={[
                styles.siteCard,
                { backgroundColor: site.bgColor },
                selectedSite === site.id ? styles.siteCardSelected : undefined,
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedSite(site.id);
              }}
              testID={`button-site-${site.id}`}
            >
              <View style={[styles.siteIconWrap, { backgroundColor: "#FFF" }]}>
                <Feather name={site.icon as any} size={26} color={site.color} />
              </View>
              <ThemedText style={[styles.siteName, { color: site.color }]}>
                {site.name}
              </ThemedText>
              <ThemedText style={styles.siteNameAr}>{site.nameAr}</ThemedText>
              {selectedSite === site.id ? (
                <View style={styles.checkMark}>
                  <Feather name="check" size={14} color="#FFF" />
                </View>
              ) : null}
            </Pressable>
          ))}
        </View>

        <View style={styles.divider} />

        <ThemedText style={styles.sectionTitle}>تفاصيل المنتج</ThemedText>

        <View style={styles.formSection}>
          <View style={styles.inputGroup}>
            <ThemedText style={styles.label}>رابط المنتج</ThemedText>
            <View style={[styles.inputContainer, { backgroundColor: theme.backgroundSecondary }]}>
              <Feather name="link" size={18} color="#999" style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="الصق رابط المنتج هنا"
                placeholderTextColor="#BBB"
                value={productLink}
                onChangeText={setProductLink}
                textAlign="right"
                autoCapitalize="none"
                autoCorrect={false}
                testID="input-product-link"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={styles.label}>وصف المنتج</ThemedText>
            <View
              style={[
                styles.inputContainer,
                styles.textArea,
                { backgroundColor: theme.backgroundSecondary },
              ]}
            >
              <TextInput
                style={[styles.input, styles.textAreaInput, { color: theme.text }]}
                placeholder="اكتب تفاصيل المنتج المطلوب (الاسم، النوع، اللون المفضل...)"
                placeholderTextColor="#BBB"
                value={productDetails}
                onChangeText={setProductDetails}
                multiline
                numberOfLines={3}
                textAlign="right"
                textAlignVertical="top"
                testID="input-product-details"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={styles.label}>الكمية</ThemedText>
            <View style={[styles.inputContainer, { backgroundColor: theme.backgroundSecondary }]}>
              <TextInput
                style={[styles.input, { color: theme.text, textAlign: "center" }]}
                placeholder="1"
                placeholderTextColor="#BBB"
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="numeric"
                testID="input-quantity"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={styles.label}>ملاحظات إضافية (اختياري)</ThemedText>
            <View
              style={[
                styles.inputContainer,
                styles.textArea,
                { backgroundColor: theme.backgroundSecondary },
              ]}
            >
              <TextInput
                style={[styles.input, styles.textAreaInput, { color: theme.text }]}
                placeholder="أي ملاحظات أخرى..."
                placeholderTextColor="#BBB"
                value={customerNotes}
                onChangeText={setCustomerNotes}
                multiline
                numberOfLines={2}
                textAlign="right"
                textAlignVertical="top"
                testID="input-customer-notes"
              />
            </View>
          </View>
        </View>

        <Pressable
          style={[
            styles.submitButton,
            !isFormValid ? styles.submitButtonDisabled : undefined,
          ]}
          onPress={handleSubmit}
          disabled={!isFormValid || isSubmitting}
          testID="button-submit-international"
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              <Feather name="send" size={18} color="#FFF" style={{ marginLeft: 8 }} />
              <ThemedText style={styles.submitButtonText}>تقديم الطلب</ThemedText>
            </>
          )}
        </Pressable>

        <ThemedText style={[styles.disclaimerText, { color: theme.textSecondary }]}>
          سيتم مراجعة طلبك وتحديد التكلفة النهائية شاملة الشحن والتوصيل، وسيتم التواصل معك لتأكيد الطلب
        </ThemedText>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerSection: {
    alignItems: "center",
    marginBottom: 28,
  },
  headerIconWrap: {
    width: 70,
    height: 70,
    borderRadius: 20,
    backgroundColor: "#EDE7F6",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  headerTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 22,
    color: "#2D2D2D",
    textAlign: "center",
    lineHeight: 38,
    includeFontPadding: true,
  },
  headerSubtitle: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 24,
    includeFontPadding: true,
    marginTop: 4,
  },
  sectionTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    color: BRAND_ORANGE,
    textAlign: "right",
    marginBottom: 14,
    lineHeight: 28,
    includeFontPadding: true,
  },
  sitesGrid: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    gap: 10,
  },
  siteCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 18,
    paddingHorizontal: 8,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "transparent",
    position: "relative",
  },
  siteCardSelected: {
    borderColor: BRAND_ORANGE,
  },
  siteIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  siteName: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 22,
    includeFontPadding: true,
  },
  siteNameAr: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    color: "#999",
    textAlign: "center",
    lineHeight: 18,
    includeFontPadding: true,
  },
  checkMark: {
    position: "absolute",
    top: 8,
    left: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: BRAND_ORANGE,
    justifyContent: "center",
    alignItems: "center",
  },
  divider: {
    height: 1,
    backgroundColor: "#F0F0F0",
    marginVertical: 24,
  },
  formSection: {
    gap: 4,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontFamily: "Cairo_600SemiBold",
    fontSize: 14,
    color: "#444",
    textAlign: "right",
    marginBottom: 8,
    lineHeight: 24,
    includeFontPadding: true,
  },
  inputContainer: {
    flexDirection: "row-reverse",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#F0F0F0",
    paddingHorizontal: 14,
    height: 52,
  },
  inputIcon: {
    marginLeft: 10,
  },
  input: {
    flex: 1,
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    lineHeight: 24,
    includeFontPadding: true,
  },
  textArea: {
    height: 90,
    alignItems: "flex-start",
    paddingTop: 12,
  },
  textAreaInput: {
    height: 66,
  },
  row: {
    flexDirection: "row-reverse",
  },
  submitButton: {
    backgroundColor: BRAND_ORANGE,
    borderRadius: 16,
    height: 56,
    flexDirection: "row-reverse",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 24,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontFamily: "Cairo_700Bold",
    fontSize: 16,
    color: "#FFFFFF",
    lineHeight: 28,
    includeFontPadding: true,
  },
  disclaimerText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 20,
    includeFontPadding: true,
    marginTop: 16,
    paddingHorizontal: 10,
  },
  successContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  successIcon: {
    marginBottom: 24,
  },
  successTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 22,
    color: "#2D2D2D",
    textAlign: "center",
    lineHeight: 38,
    includeFontPadding: true,
    marginBottom: 8,
  },
  successSubtitle: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    color: "#888",
    textAlign: "center",
    lineHeight: 24,
    includeFontPadding: true,
    marginBottom: 32,
  },
});
