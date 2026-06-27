import React, { useState } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useTheme } from "@/hooks/useTheme";
import { ThemedText } from "@/components/ThemedText";
import { GradientBackground } from "@/components/GradientBackground";
import { AppColors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/context/AuthContext";

const PURPLE = "#673AB7";

type FilterType = "all" | "unanswered" | "high" | "low";

interface RatingItem {
  id: string;
  stars: number;
  comment?: string;
  image?: string;
  customerPhone?: string;
  createdAt: string;
  vendorReply?: string;
  vendorRepliedAt?: string;
  hidden?: boolean;
}

interface RatingsSummary {
  average: number;
  total: number;
  breakdown: { stars: number; count: number }[];
  items: RatingItem[];
  hasMore: boolean;
}

function StarRow({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <MaterialCommunityIcons
          key={i}
          name={i <= Math.round(value) ? "star" : "star-outline"}
          size={size}
          color="#F59E0B"
        />
      ))}
    </View>
  );
}

const FILTER_TABS: { key: FilterType; label: string }[] = [
  { key: "all",         label: "الكل"      },
  { key: "unanswered",  label: "بدون رد"   },
  { key: "high",        label: "الأعلى"    },
  { key: "low",         label: "الأقل"     },
];

function ReplyModal({
  visible,
  existingReply,
  onClose,
  onSave,
}: {
  visible: boolean;
  existingReply: string;
  onClose: () => void;
  onSave: (text: string) => Promise<void>;
}) {
  const { theme } = useTheme();
  const [text, setText] = useState(existingReply);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await onSave(text.trim());
      onClose();
    } catch {
      Alert.alert("خطأ", "تعذّر حفظ الرد");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView
        style={mStyles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[mStyles.sheet, { backgroundColor: theme.backgroundDefault }]}>
          <View style={mStyles.header}>
            <ThemedText style={mStyles.title}>الرد على التقييم</ThemedText>
            <Pressable onPress={onClose}>
              <Feather name="x" size={20} color={theme.textSecondary} />
            </Pressable>
          </View>
          <TextInput
            style={[mStyles.input, { backgroundColor: theme.backgroundRoot, color: theme.text, borderColor: theme.border ?? "#E5E7EB" }]}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            placeholder="اكتب ردك هنا..."
            placeholderTextColor={theme.textSecondary}
            value={text}
            onChangeText={setText}
            textAlign="right"
          />
          <View style={mStyles.actions}>
            <Pressable
              onPress={onClose}
              style={[mStyles.btn, { backgroundColor: theme.backgroundRoot }]}
            >
              <ThemedText style={{ color: theme.textSecondary, fontFamily: "Cairo_700Bold" }}>إلغاء</ThemedText>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={saving || !text.trim()}
              style={[mStyles.btn, { backgroundColor: PURPLE, opacity: saving || !text.trim() ? 0.6 : 1 }]}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <ThemedText style={{ color: "#fff", fontFamily: "Cairo_700Bold" }}>
                  {existingReply ? "تعديل الرد" : "إرسال الرد"}
                </ThemedText>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const mStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 16 },
  header: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  title: { fontFamily: "Cairo_700Bold", fontSize: 16 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 100, fontFamily: "Cairo_400Regular", fontSize: 14 },
  actions: { flexDirection: "row-reverse", gap: 10 },
  btn: { flex: 1, padding: 12, borderRadius: 12, alignItems: "center" },
});

export default function VendorRatingsScreen() {
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const { vendorToken, vendorProfile } = useAuth();
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<FilterType>("all");
  const [replyModal, setReplyModal] = useState<{ visible: boolean; ratingId: string; existing: string }>({
    visible: false,
    ratingId: "",
    existing: "",
  });

  const vendorId = vendorProfile?.id ?? null;

  const queryKey = ["vendor-ratings", vendorId, filter];
  const { data, isLoading, isRefetching, refetch } = useQuery<RatingsSummary>({
    queryKey,
    enabled: !!vendorId,
    queryFn: async () => {
      const url = new URL(`/api/stores/${vendorId}/ratings`, getApiUrl());
      url.searchParams.set("filter", filter);
      url.searchParams.set("page", "1");
      url.searchParams.set("limit", "50");
      const res = await fetch(url.toString(), {
        headers: vendorToken ? { Authorization: `Bearer ${vendorToken}` } : {},
      });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });

  const summary = data ?? { average: 0, total: 0, breakdown: [], items: [], hasMore: false };

  const handleReply = async (ratingId: string, text: string) => {
    const res = await fetch(new URL(`/api/ratings/${ratingId}/vendor-reply`, getApiUrl()).toString(), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(vendorToken ? { Authorization: `Bearer ${vendorToken}` } : {}),
      },
      body: JSON.stringify({ reply: text }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "فشل");
    }
    queryClient.invalidateQueries({ queryKey });
  };

  const openReplyModal = (ratingId: string, existing: string) => {
    setReplyModal({ visible: true, ratingId, existing });
  };

  const renderItem = ({ item }: { item: RatingItem }) => {
    const dateStr = new Date(item.createdAt).toLocaleDateString("ar-IQ", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    return (
      <View style={[itemStyles.card, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
        <View style={itemStyles.header}>
          <View style={[itemStyles.avatar, { backgroundColor: PURPLE + "20" }]}>
            <Feather name="user" size={15} color={PURPLE} />
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText style={itemStyles.phone}>
              {item.customerPhone ? `*****${item.customerPhone.slice(-4)}` : "زبون"}
            </ThemedText>
            <ThemedText style={[itemStyles.date, { color: theme.textSecondary }]}>{dateStr}</ThemedText>
          </View>
          <StarRow value={item.stars} size={13} />
        </View>

        {item.comment ? (
          <ThemedText style={[itemStyles.comment, { color: theme.text }]}>{item.comment}</ThemedText>
        ) : (
          <ThemedText style={[itemStyles.comment, { color: theme.textSecondary, fontStyle: "italic" }]}>
            بدون تعليق
          </ThemedText>
        )}

        {item.image ? (
          <Image source={{ uri: item.image }} style={itemStyles.img} contentFit="cover" />
        ) : null}

        {item.vendorReply ? (
          <View style={[itemStyles.replyBox, { backgroundColor: PURPLE + "10", borderColor: PURPLE + "30" }]}>
            <View style={itemStyles.replyHeader}>
              <Feather name="message-circle" size={13} color={PURPLE} />
              <ThemedText style={[itemStyles.replyLabel, { color: PURPLE }]}>ردك</ThemedText>
            </View>
            <ThemedText style={[itemStyles.replyText, { color: theme.text }]}>{item.vendorReply}</ThemedText>
          </View>
        ) : null}

        <Pressable
          onPress={() => openReplyModal(item.id, item.vendorReply ?? "")}
          style={[
            itemStyles.replyBtn,
            { borderColor: PURPLE, backgroundColor: item.vendorReply ? PURPLE + "10" : PURPLE },
          ]}
        >
          <Feather name="message-circle" size={13} color={item.vendorReply ? PURPLE : "#fff"} />
          <ThemedText style={[itemStyles.replyBtnText, { color: item.vendorReply ? PURPLE : "#fff" }]}>
            {item.vendorReply ? "تعديل الرد" : "الرد على التقييم"}
          </ThemedText>
        </Pressable>
      </View>
    );
  };

  const ListHeader = () => (
    <View>
      {/* Stats */}
      <View style={[statsStyles.card, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
        <View style={statsStyles.row}>
          <View style={statsStyles.stat}>
            <ThemedText style={[statsStyles.num, { color: "#F59E0B" }]}>
              {summary.average > 0 ? summary.average.toFixed(1) : "—"}
            </ThemedText>
            <StarRow value={summary.average} size={16} />
            <ThemedText style={[statsStyles.label, { color: theme.textSecondary }]}>متوسط التقييم</ThemedText>
          </View>
          <View style={[statsStyles.divider, { backgroundColor: theme.border ?? "#E5E7EB" }]} />
          <View style={statsStyles.stat}>
            <ThemedText style={[statsStyles.num, { color: PURPLE }]}>{summary.total}</ThemedText>
            <ThemedText style={[statsStyles.label, { color: theme.textSecondary }]}>إجمالي التقييمات</ThemedText>
          </View>
          <View style={[statsStyles.divider, { backgroundColor: theme.border ?? "#E5E7EB" }]} />
          <View style={statsStyles.stat}>
            <ThemedText style={[statsStyles.num, { color: "#10B981" }]}>
              {summary.items.filter((i) => i.vendorReply).length}
            </ThemedText>
            <ThemedText style={[statsStyles.label, { color: theme.textSecondary }]}>تم الرد</ThemedText>
          </View>
        </View>
      </View>

      {/* Filter tabs */}
      <View style={fStyles.row}>
        {FILTER_TABS.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => setFilter(tab.key)}
            style={[
              fStyles.tab,
              filter === tab.key
                ? { backgroundColor: PURPLE }
                : { backgroundColor: theme.backgroundDefault, borderColor: theme.border ?? "#E5E7EB", borderWidth: 1 },
            ]}
          >
            <ThemedText style={[fStyles.label, { color: filter === tab.key ? "#fff" : theme.textSecondary }]}>
              {tab.label}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      {summary.items.length > 0 ? (
        <ThemedText style={[fStyles.sectionTitle, { color: theme.textSecondary }]}>التقييمات</ThemedText>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <GradientBackground />
      <FlatList
        data={summary.items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.md,
          paddingBottom: tabBarHeight + Spacing.xl,
          paddingHorizontal: Spacing.lg,
        }}
        scrollIndicatorInsets={{ bottom: tabBarHeight }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={PURPLE} />
        }
        ListHeaderComponent={<ListHeader />}
        ListEmptyComponent={
          isLoading ? (
            <View style={{ alignItems: "center", paddingVertical: 40 }}>
              <ActivityIndicator color={PURPLE} />
            </View>
          ) : (
            <View style={{ alignItems: "center", paddingVertical: 40, gap: 8 }}>
              <Feather name="star" size={48} color={theme.textSecondary} style={{ opacity: 0.3 }} />
              <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center" }}>
                لا توجد تقييمات بعد
              </ThemedText>
            </View>
          )
        }
        renderItem={renderItem}
      />

      <ReplyModal
        visible={replyModal.visible}
        existingReply={replyModal.existing}
        onClose={() => setReplyModal((s) => ({ ...s, visible: false }))}
        onSave={(text) => handleReply(replyModal.ratingId, text)}
      />
    </View>
  );
}

const itemStyles = StyleSheet.create({
  card: { borderRadius: BorderRadius.lg, padding: 14, marginBottom: 10 },
  header: { flexDirection: "row-reverse", alignItems: "center", gap: 10, marginBottom: 8 },
  avatar: { width: 34, height: 34, borderRadius: 17, justifyContent: "center", alignItems: "center" },
  phone: { fontFamily: "Cairo_700Bold", fontSize: 13 },
  date: { fontFamily: "Cairo_400Regular", fontSize: 11 },
  comment: { fontFamily: "Cairo_400Regular", fontSize: 14, lineHeight: 22, marginBottom: 8, textAlign: "right" },
  img: { width: "100%", height: 140, borderRadius: 10, marginBottom: 8 },
  replyBox: { borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 8 },
  replyHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 6, marginBottom: 4 },
  replyLabel: { fontFamily: "Cairo_700Bold", fontSize: 12 },
  replyText: { fontFamily: "Cairo_400Regular", fontSize: 13, textAlign: "right" },
  replyBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderRadius: 10, padding: 8 },
  replyBtnText: { fontFamily: "Cairo_700Bold", fontSize: 12 },
});

const statsStyles = StyleSheet.create({
  card: { borderRadius: BorderRadius.lg, padding: 16, marginBottom: 12 },
  row: { flexDirection: "row-reverse", alignItems: "center" },
  stat: { flex: 1, alignItems: "center", gap: 4 },
  num: { fontFamily: "Cairo_700Bold", fontSize: 26 },
  label: { fontFamily: "Cairo_400Regular", fontSize: 11, textAlign: "center" },
  divider: { width: 1, height: 50, marginHorizontal: 8 },
});

const fStyles = StyleSheet.create({
  row: { flexDirection: "row-reverse", gap: 8, marginBottom: 14, flexWrap: "wrap" },
  tab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  label: { fontFamily: "Cairo_700Bold", fontSize: 12 },
  sectionTitle: { fontFamily: "Cairo_700Bold", fontSize: 13, marginBottom: 8, textAlign: "right" },
});
