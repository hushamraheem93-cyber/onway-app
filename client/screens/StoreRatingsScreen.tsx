import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from "react-native";
import { useRoute, RouteProp } from "@react-navigation/native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useQuery } from "@tanstack/react-query";

import { useTheme } from "@/hooks/useTheme";
import { ThemedText } from "@/components/ThemedText";
import { GradientBackground } from "@/components/GradientBackground";
import { AppColors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

type StoreRatingsRouteProp = RouteProp<RootStackParamList, "StoreRatings">;

type FilterType = "newest" | "highest" | "lowest" | "with_images";

interface RatingItem {
  id: string;
  stars: number;
  comment?: string;
  image?: string;
  customerPhone?: string;
  createdAt: string;
  vendorReply?: string;
  vendorRepliedAt?: string;
}

interface RatingSummary {
  average: number;
  total: number;
  breakdown: { stars: number; count: number }[];
  items: RatingItem[];
  hasMore: boolean;
  nextCursor?: string;
}

function StarRow({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <MaterialCommunityIcons
          key={i}
          name={i <= Math.round(value) ? "star" : "star-outline"}
          size={size}
          color={AppColors.warning}
        />
      ))}
    </View>
  );
}

function BreakdownBar({
  stars,
  count,
  total,
  theme,
}: {
  stars: number;
  count: number;
  total: number;
  theme: any;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <View style={bStyles.barRow}>
      <ThemedText style={bStyles.barLabel}>{stars}</ThemedText>
      <MaterialCommunityIcons name="star" size={13} color={AppColors.warning} />
      <View
        style={[
          bStyles.barBg,
          { backgroundColor: theme.border ?? AppColors.divider },
        ]}
      >
        <View
          style={[
            bStyles.barFill,
            { width: `${pct}%` as any, backgroundColor: AppColors.warning },
          ]}
        />
      </View>
      <ThemedText style={[bStyles.barPct, { color: theme.textSecondary }]}>
        {pct}%
      </ThemedText>
      <ThemedText style={[bStyles.barCount, { color: theme.textSecondary }]}>
        ({count})
      </ThemedText>
    </View>
  );
}

const bStyles = StyleSheet.create({
  barRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  barLabel: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    width: 14,
    textAlign: "center",
  },
  barBg: { flex: 1, height: 8, borderRadius: 4, overflow: "hidden" },
  barFill: { height: 8, borderRadius: 4 },
  barPct: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    width: 32,
    textAlign: "left",
  },
  barCount: {
    fontFamily: "Cairo_400Regular",
    fontSize: 11,
    width: 36,
    textAlign: "left",
  },
});

function RatingCard({ item, theme }: { item: RatingItem; theme: any }) {
  const [imageModal, setImageModal] = useState(false);
  const dateStr = new Date(item.createdAt).toLocaleDateString("ar-IQ", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <View
      style={[
        rStyles.card,
        { backgroundColor: theme.backgroundDefault },
        Shadows.sm,
      ]}
    >
      <View style={rStyles.header}>
        <View
          style={[
            rStyles.avatar,
            { backgroundColor: AppColors.primary + "20" },
          ]}
        >
          <Feather name="user" size={16} color={AppColors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <ThemedText style={rStyles.phone}>
            {item.customerPhone
              ? `*****${item.customerPhone.slice(-4)}`
              : "زبون"}
          </ThemedText>
          <ThemedText style={[rStyles.date, { color: theme.textSecondary }]}>
            {dateStr}
          </ThemedText>
        </View>
        <StarRow value={item.stars} size={14} />
      </View>

      {item.comment ? (
        <ThemedText style={[rStyles.comment, { color: theme.text }]}>
          {item.comment}
        </ThemedText>
      ) : null}

      {item.image ? (
        <Pressable onPress={() => setImageModal(true)}>
          <Image
            source={{ uri: item.image }}
            style={rStyles.ratingImage}
            contentFit="cover"
          />
        </Pressable>
      ) : null}

      {item.vendorReply ? (
        <View
          style={[
            rStyles.replyBox,
            {
              backgroundColor: AppColors.primary + "10",
              borderColor: AppColors.primary + "30",
            },
          ]}
        >
          <View style={rStyles.replyHeader}>
            <Feather
              name="message-circle"
              size={13}
              color={AppColors.primary}
            />
            <ThemedText
              style={[rStyles.replyLabel, { color: AppColors.primary }]}
            >
              رد المتجر
            </ThemedText>
          </View>
          <ThemedText style={[rStyles.replyText, { color: theme.text }]}>
            {item.vendorReply}
          </ThemedText>
        </View>
      ) : null}

      <Modal visible={imageModal} transparent animationType="fade">
        <Pressable
          style={rStyles.modalOverlay}
          onPress={() => setImageModal(false)}
        >
          <Image
            source={{ uri: item.image! }}
            style={rStyles.modalImage}
            contentFit="contain"
          />
        </Pressable>
      </Modal>
    </View>
  );
}

const rStyles = StyleSheet.create({
  card: { borderRadius: BorderRadius.lg, padding: 14, marginBottom: 10 },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: "center",
    alignItems: "center",
  },
  phone: { fontFamily: "Cairo_700Bold", fontSize: 13 },
  date: { fontFamily: "Cairo_400Regular", fontSize: 11 },
  comment: {
    fontFamily: "Cairo_400Regular",
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 8,
    textAlign: "right",
  },
  ratingImage: {
    width: "100%",
    height: 160,
    borderRadius: 10,
    marginBottom: 8,
  },
  replyBox: { borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 4 },
  replyHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  replyLabel: { fontFamily: "Cairo_700Bold", fontSize: 12 },
  replyText: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    textAlign: "right",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalImage: { width: "90%", height: "70%" },
});

/**
 * How long the user must stop typing before the search reaches the server (H-62).
 *
 * Long enough that a normal word is one request rather than one per letter, short
 * enough that the wait is not noticeable after the last keystroke.
 */
const SEARCH_DEBOUNCE_MS = 350;

const FILTER_TABS: { key: FilterType; label: string }[] = [
  { key: "newest", label: "الأحدث" },
  { key: "highest", label: "الأعلى" },
  { key: "lowest", label: "الأقل" },
  { key: "with_images", label: "مع صور" },
];

export default function StoreRatingsScreen() {
  const route = useRoute<StoreRatingsRouteProp>();
  const { storeId } = route.params;
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const [filter, setFilter] = useState<FilterType>("newest");
  // `search` is what the box shows; `committedSearch` is what the query uses. They
  // are separate so typing stays instant while the network does not.
  const [search, setSearch] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");
  const [page, setPage] = useState(1);

  // H-62: the query key held `search` directly, so every keystroke was a new key
  // and therefore a new request — typing "مطعم" hit the endpoint four times.
  //
  // The commit deliberately moves `committedSearch` and `page` together in one
  // update. Debouncing only the value while leaving the page reset on the
  // keystroke would step through (previous search, page 1) for the whole debounce
  // window, showing page 1 of the OLD search while the user is still typing.
  //
  // No cancellation logic is needed for out-of-order replies: react-query stores
  // each result under its own serialized key, so a late response for an earlier
  // search updates that key's cache entry and never the one being rendered.
  useEffect(() => {
    if (search === committedSearch) return;
    const timer = setTimeout(() => {
      setCommittedSearch(search);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search, committedSearch]);

  const queryKey = [
    `/api/stores/${storeId}/ratings`,
    filter,
    committedSearch,
    page,
  ];
  const { data, isLoading, isRefetching, refetch } = useQuery<RatingSummary>({
    queryKey,
    queryFn: async () => {
      const url = new URL(`/api/stores/${storeId}/ratings`, getApiUrl());
      url.searchParams.set("filter", filter);
      url.searchParams.set("page", String(page));
      if (committedSearch.trim())
        url.searchParams.set("q", committedSearch.trim());
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });

  const summary = data ?? {
    average: 0,
    total: 0,
    breakdown: [],
    items: [],
    hasMore: false,
  };

  const ListHeader = useCallback(
    () => (
      <View>
        {/* Overall rating */}
        <View
          style={[
            styles.summaryCard,
            { backgroundColor: theme.backgroundDefault },
            Shadows.sm,
          ]}
        >
          <View style={styles.summaryTop}>
            <View style={styles.avgBox}>
              <ThemedText style={styles.avgNum}>
                {summary.average > 0 ? summary.average.toFixed(1) : "—"}
              </ThemedText>
              <StarRow value={summary.average} size={20} />
              <ThemedText
                style={[styles.totalCount, { color: theme.textSecondary }]}
              >
                ({summary.total} تقييم)
              </ThemedText>
            </View>
            <View style={styles.breakdownBox}>
              {[5, 4, 3, 2, 1].map((s) => {
                const entry = summary.breakdown.find((b) => b.stars === s);
                return (
                  <BreakdownBar
                    key={s}
                    stars={s}
                    count={entry?.count ?? 0}
                    total={summary.total}
                    theme={theme}
                  />
                );
              })}
            </View>
          </View>
        </View>

        {/* Search */}
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: theme.backgroundDefault,
              borderColor: theme.border ?? AppColors.divider,
            },
          ]}
        >
          <Feather name="search" size={16} color={theme.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="ابحث في التعليقات..."
            placeholderTextColor={theme.textSecondary}
            value={search}
            // The page reset rides with the debounced commit above, so that the
            // list never shows page 1 of the previous search mid-typing.
            onChangeText={setSearch}
            textAlign="right"
          />
          {search.length > 0 ? (
            <Pressable
              // Clearing is a deliberate, discrete action — commit it immediately
              // rather than making the user wait out the debounce. Setting all
              // three together keeps it to a single re-render and a single request,
              // and leaves search === committedSearch so no timer is armed.
              onPress={() => {
                setSearch("");
                setCommittedSearch("");
                setPage(1);
              }}
              accessibilityRole="button"
              accessibilityLabel="مسح البحث"
              hitSlop={8}
            >
              <Feather name="x" size={16} color={theme.textSecondary} />
            </Pressable>
          ) : null}
        </View>

        {/* Filter tabs */}
        <View style={styles.filterRow}>
          {FILTER_TABS.map((tab) => (
            <Pressable
              key={tab.key}
              onPress={() => {
                setFilter(tab.key);
                setPage(1);
              }}
              accessibilityRole="button"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: filter === tab.key }}
              style={[
                styles.filterTab,
                filter === tab.key
                  ? { backgroundColor: AppColors.primary }
                  : {
                      backgroundColor: theme.backgroundDefault,
                      borderColor: theme.border ?? AppColors.divider,
                      borderWidth: 1,
                    },
              ]}
            >
              <ThemedText
                style={[
                  styles.filterLabel,
                  {
                    color:
                      filter === tab.key
                        ? AppColors.white
                        : theme.textSecondary,
                  },
                ]}
              >
                {tab.label}
              </ThemedText>
            </Pressable>
          ))}
        </View>

        {summary.items.length > 0 ? (
          <ThemedText
            style={[styles.sectionTitle, { color: theme.textSecondary }]}
          >
            آراء الزبائن
          </ThemedText>
        ) : null}
      </View>
    ),
    [summary, filter, search, theme],
  );

  return (
    <View style={{ flex: 1 }}>
      <GradientBackground />
      <FlatList
        data={summary.items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.md,
          paddingBottom: insets.bottom + Spacing.xl,
          paddingHorizontal: Spacing.lg,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={AppColors.primary}
          />
        }
        ListHeaderComponent={<ListHeader />}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={AppColors.primary} />
            </View>
          ) : (
            <View style={styles.center}>
              <Feather
                name="star"
                size={48}
                color={theme.textSecondary}
                style={{ opacity: 0.3 }}
              />
              <ThemedText
                type="body"
                style={{
                  color: theme.textSecondary,
                  marginTop: 12,
                  textAlign: "center",
                }}
              >
                لا توجد تقييمات بعد
              </ThemedText>
            </View>
          )
        }
        renderItem={({ item }) => <RatingCard item={item} theme={theme} />}
        ListFooterComponent={
          summary.hasMore ? (
            <Pressable
              onPress={() => setPage((p) => p + 1)}
              style={[styles.loadMoreBtn, { borderColor: AppColors.primary }]}
              accessibilityRole="button"
              accessibilityLabel="عرض المزيد من التقييمات"
            >
              <ThemedText
                style={{
                  color: AppColors.primary,
                  fontFamily: "Cairo_700Bold",
                }}
              >
                عرض المزيد
              </ThemedText>
            </Pressable>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  summaryCard: {
    borderRadius: BorderRadius.lg,
    padding: 16,
    marginBottom: 12,
  },
  summaryTop: {
    flexDirection: "row-reverse",
    gap: 16,
    alignItems: "flex-start",
  },
  avgBox: {
    alignItems: "center",
    gap: 4,
    minWidth: 80,
  },
  avgNum: {
    fontFamily: "Cairo_700Bold",
    fontSize: 36,
    color: AppColors.warning,
  },
  totalCount: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
  },
  breakdownBox: {
    flex: 1,
  },
  searchBar: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Cairo_400Regular",
    fontSize: 16,
  },
  filterRow: {
    flexDirection: "row-reverse",
    gap: 8,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  filterTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  filterLabel: {
    fontFamily: "Cairo_700Bold",
    fontSize: 12,
  },
  sectionTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    marginBottom: 8,
    textAlign: "right",
  },
  center: {
    alignItems: "center",
    paddingVertical: 40,
  },
  loadMoreBtn: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    marginTop: 8,
  },
});
