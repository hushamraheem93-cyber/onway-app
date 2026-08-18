/**
 * The admin panel's tab bar (H-65).
 *
 * Extracted from AdminScreen for one measurable reason: it is the only piece of
 * chrome rendered on EVERY tab, and AdminScreen holds 60 pieces of state. Every
 * keystroke in any of its ~40 text inputs re-ran the whole component body, which
 * rebuilt this bar and — before H-65 — recomputed four full array scans to derive
 * the badge counts (pending orders, pending drivers, pending stores, settlement
 * requests) each time.
 *
 * `React.memo` here is not decoration: the parent now passes a `useMemo`-stabilised
 * `tabs` array and a `useCallback`-stabilised `onSelect`, so the bar re-renders only
 * when a badge count, the active tab, or the theme actually changes. Typing in a
 * form no longer touches it at all.
 *
 * It owns no state and fetches nothing — everything arrives as props, which is also
 * what makes it testable on its own.
 */
import React from "react";
import { View, Pressable, ScrollView, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { AppColors, Spacing } from "@/constants/theme";

export interface AdminTab<K extends string = string> {
  key: K;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  /** Undefined or 0 renders no badge — same rule the inline version used. */
  badge?: number;
}

interface Props<K extends string> {
  tabs: AdminTab<K>[];
  activeTab: K;
  onSelect: (key: K) => void;
  /** The active-tab accent. Passed in so the bar carries no palette decision. */
  accent: string;
  theme: { backgroundDefault: string; textSecondary: string; border: string };
  paddingTop: number;
}

function AdminTabBarInner<K extends string>({
  tabs,
  activeTab,
  onSelect,
  accent,
  theme,
  paddingTop,
}: Props<K>) {
  return (
    <View
      style={[
        styles.adminTabBar,
        { paddingTop, backgroundColor: theme.backgroundDefault },
      ]}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.adminTabsRow}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            // H-63: the visible label already names the tab; only the badge case
            // needs an explicit one, so the count is not read as a bare number.
            // The active tab was marked by an underline colour alone.
            <Pressable
              key={tab.key}
              style={[
                styles.adminTab,
                isActive && { borderBottomColor: accent, borderBottomWidth: 2 },
              ]}
              onPress={() => onSelect(tab.key)}
              testID={`tab-${tab.key}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={
                tab.badge && tab.badge > 0
                  ? `${tab.label}، ${tab.badge} جديد`
                  : undefined
              }
            >
              <View style={{ position: "relative" }}>
                <Feather
                  name={tab.icon}
                  size={20}
                  color={isActive ? accent : theme.textSecondary}
                />
                {tab.badge && tab.badge > 0 ? (
                  <View style={styles.adminTabBadge}>
                    <ThemedText
                      style={{
                        fontSize: 9,
                        color: AppColors.white,
                        fontFamily: "Cairo_700Bold",
                        lineHeight: 14,
                      }}
                    >
                      {tab.badge > 9 ? "9+" : tab.badge}
                    </ThemedText>
                  </View>
                ) : null}
              </View>
              <ThemedText
                style={[
                  styles.adminTabLabel,
                  { color: isActive ? accent : theme.textSecondary },
                ]}
              >
                {tab.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={{ height: 1, backgroundColor: theme.border }} />
    </View>
  );
}

/**
 * Copied verbatim from AdminScreen's StyleSheet. H-65 is a decomposition, not a
 * restyle: every value below must stay identical to what the inline bar rendered.
 */
const styles = StyleSheet.create({
  adminTabBar: {
    shadowColor: AppColors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 10,
  },
  adminTabsRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.sm,
  },
  adminTab: {
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    minWidth: 64,
    borderBottomColor: "transparent",
    borderBottomWidth: 2,
  },
  adminTabLabel: {
    fontFamily: "Cairo_400Regular",
    fontSize: 10,
  },
  adminTabBadge: {
    position: "absolute",
    top: -5,
    right: -8,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: AppColors.error,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
});

/**
 * Memoised. The generic signature is preserved through the cast — `React.memo`
 * erases type parameters, and the tab key union is what keeps `onSelect` honest at
 * the call site.
 */
export const AdminTabBar = React.memo(
  AdminTabBarInner,
) as typeof AdminTabBarInner;
