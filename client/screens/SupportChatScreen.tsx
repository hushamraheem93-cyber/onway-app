import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  FlatList,
  Pressable,
  ActivityIndicator,
  Platform,
  Modal,
  ScrollView,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";

import { ThemedText } from "@/components/ThemedText";
import { GradientBackground } from "@/components/GradientBackground";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { AppColors, Spacing, BorderRadius } from "@/constants/theme";
import { resolveImageUrl } from "@/utils/imageUtils";
import { getApiUrl } from "@/lib/query-client";

interface ProductData {
  id: string;
  name: string;
  price: number;
  image: string;
  categoryId?: string;
}

interface SupportMessage {
  id: string;
  text: string;
  sender: "user" | "admin";
  timestamp: number;
  type?: "text" | "image" | "product";
  imageUrl?: string;
  productData?: ProductData;
}

const POLL_INTERVAL = 5000;

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" });
}

function formatPrice(p: number) {
  return p.toLocaleString("ar-IQ") + " د.ع";
}

function MessageBubble({ msg }: { msg: SupportMessage }) {
  const { theme } = useTheme();
  const isUser = msg.sender === "user";
  const isImage = msg.type === "image";
  const isProduct = msg.type === "product";

  return (
    <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAdmin]}>
      {!isUser ? (
        <View style={styles.adminAvatar}>
          <Feather name="headphones" size={14} color={AppColors.white} />
        </View>
      ) : null}

      <View style={[
        isImage || isProduct ? styles.bubbleMedia : styles.bubble,
        isUser
          ? { backgroundColor: isImage || isProduct ? "transparent" : AppColors.primary }
          : { backgroundColor: theme.backgroundDefault, borderWidth: isImage || isProduct ? 0 : 1, borderColor: theme.border },
      ]}>
        {isImage && msg.imageUrl ? (
          <View>
            <Image
              source={{ uri: resolveImageUrl(msg.imageUrl) }}
              style={styles.messageImage}
              contentFit="cover"
            />
            <ThemedText type="small" style={[styles.bubbleTime, { color: isUser ? AppColors.primary : theme.textSecondary, marginTop: 4 }]}>
              {formatTime(msg.timestamp)}
            </ThemedText>
          </View>
        ) : isProduct && msg.productData ? (
          <View style={[styles.productCard, { backgroundColor: isUser ? AppColors.primary + "15" : theme.backgroundDefault, borderColor: isUser ? AppColors.primary + "40" : theme.border }]}>
            <Image
              source={{ uri: resolveImageUrl(msg.productData.image) }}
              style={styles.productImage}
              contentFit="cover"
            />
            <View style={styles.productInfo}>
              <ThemedText type="body" style={{ fontWeight: "700", color: theme.text, fontSize: 13 }}>
                {msg.productData.name}
              </ThemedText>
              <ThemedText type="small" style={{ color: AppColors.primary, fontWeight: "700" }}>
                {formatPrice(msg.productData.price)}
              </ThemedText>
              <ThemedText type="small" style={[styles.bubbleTime, { color: theme.textSecondary, marginTop: 2 }]}>
                {formatTime(msg.timestamp)}
              </ThemedText>
            </View>
          </View>
        ) : (
          <>
            <ThemedText type="body" style={[styles.bubbleText, isUser ? { color: AppColors.white } : { color: theme.text }]}>
              {msg.text}
            </ThemedText>
            <ThemedText type="small" style={[styles.bubbleTime, { color: isUser ? AppColors.textOnBrandSubtle : theme.textSecondary }]}>
              {formatTime(msg.timestamp)}
            </ThemedText>
          </>
        )}
      </View>
    </View>
  );
}

function EmptyState() {
  const { theme } = useTheme();
  return (
    <View style={styles.emptyContainer}>
      <View style={[styles.emptyIcon, { backgroundColor: AppColors.primary + "15" }]}>
        <Feather name="message-circle" size={40} color={AppColors.primary} />
      </View>
      <ThemedText type="h3" style={[styles.emptyTitle, { color: theme.text }]}>مرحباً بك في الدعم</ThemedText>
      <ThemedText type="body" style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
        فريق الدعم متواجد لمساعدتك. اكتب رسالتك أو أرسل صورة أو شارك منتجاً
      </ThemedText>
    </View>
  );
}

function ProductPickerModal({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (product: ProductData) => void;
}) {
  const { theme } = useTheme();
  const [products, setProducts] = useState<ProductData[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    const url = new URL("/api/products", getApiUrl());
    fetch(url.toString())
      .then(r => r.json())
      .then(data => setProducts(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [visible]);

  const filtered = products.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 30);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.backgroundRoot }}>
        <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
          <ThemedText type="h3">اختر منتجاً</ThemedText>
          <Pressable onPress={onClose}><Feather name="x" size={24} color={theme.text} /></Pressable>
        </View>
        <View style={{ paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm }}>
          <TextInput
            style={[styles.searchInput, { backgroundColor: theme.backgroundDefault, color: theme.text, borderColor: theme.border }]}
            placeholder="ابحث عن منتج..."
            placeholderTextColor={theme.textSecondary}
            value={search}
            onChangeText={setSearch}
            textAlign="right"
          />
        </View>
        {loading ? (
          <ActivityIndicator size="large" color={AppColors.primary} style={{ marginTop: 40 }} />
        ) : (
          <ScrollView contentContainerStyle={{ padding: Spacing.md, gap: 10 }}>
            {filtered.map(p => (
              <Pressable
                key={p.id}
                style={[styles.productRow, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}
                onPress={() => { onSelect(p); onClose(); }}
              >
                <Image source={{ uri: resolveImageUrl(p.image) }} style={styles.productRowImage} contentFit="cover" />
                <View style={{ flex: 1 }}>
                  <ThemedText type="body" style={{ fontWeight: "700" }}>{p.name}</ThemedText>
                  <ThemedText type="small" style={{ color: AppColors.primary }}>{formatPrice(p.price)}</ThemedText>
                </View>
                <Feather name="send" size={18} color={AppColors.primary} />
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

export default function SupportChatScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { phoneNumber, userProfile } = useAuth();

  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMessages = useCallback(async () => {
    if (!phoneNumber) return;
    try {
      const url = new URL("/api/support/messages", getApiUrl());
      url.searchParams.set("phoneNumber", phoneNumber);
      const res = await fetch(url.toString());
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch {}
    finally { setLoading(false); }
  }, [phoneNumber]);

  useEffect(() => {
    fetchMessages();
    pollRef.current = setInterval(fetchMessages, POLL_INTERVAL);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchMessages]);

  const sendMessage = async (opts: {
    text?: string;
    type?: "text" | "image" | "product";
    imageUrl?: string;
    productData?: ProductData;
  }) => {
    if (!phoneNumber || sending) return;
    setSending(true);

    const optimisticMsg: SupportMessage = {
      id: `opt_${Date.now()}`,
      text: opts.text || (opts.type === "image" ? "صورة" : opts.productData?.name || ""),
      sender: "user",
      timestamp: Date.now(),
      type: opts.type || "text",
      imageUrl: opts.imageUrl,
      productData: opts.productData,
    };
    setMessages(prev => [...prev, optimisticMsg]);

    try {
      const url = new URL("/api/support/messages", getApiUrl());
      const body: Record<string, any> = {
        phoneNumber,
        userName: userProfile?.fullName || "",
        userRegion: userProfile?.region || "",
        userGender: userProfile?.gender || "",
        type: opts.type || "text",
      };
      if (opts.text) body.text = opts.text;
      if (opts.imageUrl) body.imageUrl = opts.imageUrl;
      if (opts.productData) body.productData = opts.productData;

      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch {}
    finally { setSending(false); }
  };

  const handleSendText = () => {
    const text = inputText.trim();
    if (!text) return;
    setInputText("");
    sendMessage({ text, type: "text" });
  };

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setUploadingImage(true);
    try {
      const uploadUrl = new URL("/api/support/upload-image", getApiUrl());
      const formData = new FormData();
      const { File } = await import("expo-file-system");
      formData.append("image", new File(asset.uri) as any);
      const res = await fetch(uploadUrl.toString(), { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        await sendMessage({ type: "image", imageUrl: data.imageUrl });
      }
    } catch (e) {
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSelectProduct = (product: ProductData) => {
    sendMessage({ type: "product", productData: product, text: product.name });
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <GradientBackground />
        <ActivityIndicator size="large" color={AppColors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
      <GradientBackground />

      <FlatList
        data={messages.length > 0 ? messages.toReversed() : []}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <MessageBubble msg={item} />}
        inverted={messages.length > 0}
        contentContainerStyle={[styles.listContent, { paddingTop: headerHeight + Spacing.md, paddingBottom: Spacing.md }]}
        ListEmptyComponent={<EmptyState />}
        showsVerticalScrollIndicator={false}
      />

      <View style={[styles.inputBar, { backgroundColor: theme.backgroundDefault, borderTopColor: theme.border, paddingBottom: insets.bottom + Spacing.sm }]}>
        <View style={styles.attachRow}>
          <Pressable
            style={[styles.attachBtn, { backgroundColor: theme.backgroundRoot, borderColor: theme.border }]}
            onPress={handlePickImage}
            disabled={uploadingImage || sending}
            testID="button-attach-image"
          >
            {uploadingImage ? (
              <ActivityIndicator size="small" color={AppColors.primary} />
            ) : (
              <Feather name="image" size={20} color={AppColors.primary} />
            )}
          </Pressable>
          <Pressable
            style={[styles.attachBtn, { backgroundColor: theme.backgroundRoot, borderColor: theme.border }]}
            onPress={() => setShowProductPicker(true)}
            disabled={sending}
            testID="button-attach-product"
          >
            <Feather name="tag" size={20} color={AppColors.primary} />
          </Pressable>
          <TextInput
            style={[styles.input, { backgroundColor: theme.backgroundRoot, color: theme.text, borderColor: theme.border }]}
            placeholder="اكتب رسالتك..."
            placeholderTextColor={theme.textSecondary}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={500}
            textAlign="right"
            testID="input-support-message"
          />
          <Pressable
            style={[styles.sendButton, { backgroundColor: inputText.trim() ? AppColors.primary : theme.border, opacity: sending ? 0.7 : 1 }]}
            onPress={handleSendText}
            disabled={!inputText.trim() || sending}
            testID="button-send-support"
          >
            {sending ? (
              <ActivityIndicator size="small" color={AppColors.white} />
            ) : (
              <Feather name="send" size={18} color={AppColors.white} />
            )}
          </Pressable>
        </View>
      </View>

      <ProductPickerModal
        visible={showProductPicker}
        onClose={() => setShowProductPicker(false)}
        onSelect={handleSelectProduct}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  listContent: { paddingHorizontal: Spacing.md },
  bubbleRow: { flexDirection: "row", marginVertical: 4, alignItems: "flex-end", gap: 8 },
  bubbleRowUser: { justifyContent: "flex-start" },
  bubbleRowAdmin: { justifyContent: "flex-end" },
  adminAvatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: AppColors.primary,
    justifyContent: "center", alignItems: "center", marginBottom: 2,
  },
  bubble: {
    maxWidth: "75%", borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
  },
  bubbleMedia: { maxWidth: "75%" },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  bubbleTime: { fontSize: 10, marginTop: 2, textAlign: "left" },
  messageImage: { width: 220, height: 160, borderRadius: BorderRadius.md },
  productCard: {
    flexDirection: "row", borderRadius: BorderRadius.md,
    borderWidth: 1, overflow: "hidden", width: 240,
  },
  productImage: { width: 70, height: 70 },
  productInfo: { flex: 1, padding: 8, justifyContent: "space-between" },
  emptyContainer: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingHorizontal: Spacing.xl, paddingTop: 60,
  },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 40,
    justifyContent: "center", alignItems: "center", marginBottom: Spacing.lg,
  },
  emptyTitle: { textAlign: "center", marginBottom: Spacing.sm },
  emptySubtitle: { textAlign: "center", lineHeight: 22 },
  inputBar: {
    paddingHorizontal: Spacing.md, paddingTop: Spacing.sm,
    borderTopWidth: 1,
  },
  attachRow: {
    flexDirection: "row", alignItems: "flex-end", gap: 8,
  },
  attachBtn: {
    width: 40, height: 40, borderRadius: BorderRadius.md,
    borderWidth: 1, justifyContent: "center", alignItems: "center",
    flexShrink: 0,
  },
  input: {
    flex: 1, borderRadius: BorderRadius.lg, borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    fontSize: 15, maxHeight: 100, minHeight: 40,
  },
  sendButton: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: "center", alignItems: "center", flexShrink: 0,
  },
  modalHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    padding: Spacing.lg, borderBottomWidth: 1,
  },
  searchInput: {
    borderRadius: BorderRadius.md, borderWidth: 1,
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    fontSize: 14,
  },
  productRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: BorderRadius.md, borderWidth: 1, padding: 10,
  },
  productRowImage: { width: 50, height: 50, borderRadius: 8 },
});
