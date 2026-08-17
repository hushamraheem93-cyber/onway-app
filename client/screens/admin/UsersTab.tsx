/**
 * The admin "المستخدمون" (users) tab (H-65).
 *
 * `renderUsersTab` moved verbatim out of AdminScreen. This is the only tab that
 * loads the full user list, and its query stays gated to this tab in AdminScreen
 * (H-43): the dashboard's user count comes from the server-side aggregate, not
 * from downloading every user document. Nothing here widened that.
 *
 * The list renders the same fields it always did, and this component adds no
 * logging of any kind.
 */
import React from "react";
import { View, Pressable, TextInput, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { Spacing, AppColors } from "@/constants/theme";
import { formatDateOnly } from "@/lib/dateUtils";
import { styles } from "@/screens/admin/adminStyles";

interface Props {
  adminUsers: any[];
  usersLoading: boolean;
  refetchUsers: () => void;
  usersSearch: string;
  setUsersSearch: (v: string) => void;
  theme: any;
}

function UsersTabInner({
  adminUsers,
  usersLoading,
  refetchUsers,
  usersSearch,
  setUsersSearch,
  theme,
}: Props) {
  const renderUsersTab = () => {
    const filtered = adminUsers.filter(
      (u) =>
        u.phoneNumber?.includes(usersSearch) ||
        u.fullName?.toLowerCase().includes(usersSearch.toLowerCase()),
    );

    const formatDate = formatDateOnly;

    return (
      <View style={styles.usersContainer}>
        {/* Stats card */}
        <View
          style={[
            styles.usersStatsCard,
            { backgroundColor: theme.backgroundSecondary },
          ]}
        >
          <View style={styles.usersStatBox}>
            <Feather name="users" size={26} color={AppColors.primary} />
            <ThemedText style={styles.usersStatNum}>
              {usersLoading ? "..." : adminUsers.length}
            </ThemedText>
            <ThemedText style={styles.usersStatLabel}>
              إجمالي المستخدمين
            </ThemedText>
          </View>
          <View style={styles.usersStatDivider} />
          <View style={styles.usersStatBox}>
            <Feather name="bell" size={26} color={AppColors.success} />
            <ThemedText
              style={[styles.usersStatNum, { color: AppColors.success }]}
            >
              {usersLoading
                ? "..."
                : adminUsers.filter((u) => !!u.pushToken).length}
            </ThemedText>
            <ThemedText style={styles.usersStatLabel}>
              مفعّل الإشعارات
            </ThemedText>
          </View>
        </View>

        {/* Search */}
        <View
          style={[
            styles.usersSearchBox,
            { backgroundColor: theme.backgroundSecondary },
          ]}
        >
          <Feather name="search" size={16} color={AppColors.gray400} />
          <TextInput
            style={[styles.usersSearchInput, { color: theme.text }]}
            placeholder="ابحث بالاسم أو رقم الهاتف..."
            placeholderTextColor={AppColors.gray400}
            value={usersSearch}
            onChangeText={setUsersSearch}
            textAlign="right"
          />
          {usersSearch.length > 0 ? (
            <Pressable onPress={() => setUsersSearch("")}>
              <Feather name="x" size={15} color={AppColors.gray400} />
            </Pressable>
          ) : null}
        </View>

        {/* Refresh */}
        <Pressable
          style={styles.usersRefreshBtn}
          onPress={() => refetchUsers()}
        >
          <Feather name="refresh-cw" size={14} color={AppColors.primary} />
          <ThemedText style={styles.usersRefreshText}>تحديث القائمة</ThemedText>
        </Pressable>

        {/* List */}
        {usersLoading ? (
          <ActivityIndicator
            color={AppColors.primary}
            style={{ marginTop: Spacing.xl }}
          />
        ) : filtered.length === 0 ? (
          <View style={styles.usersEmpty}>
            <Feather name="user-x" size={40} color={AppColors.gray300} />
            <ThemedText style={styles.usersEmptyText}>
              {usersSearch ? "لا نتائج مطابقة" : "لا يوجد مستخدمون بعد"}
            </ThemedText>
          </View>
        ) : (
          <View style={styles.usersList}>
            {filtered.map((user, idx) => (
              <View
                key={user.id}
                style={[
                  styles.userRow,
                  { backgroundColor: theme.backgroundSecondary },
                ]}
              >
                <View style={styles.userRowLeft}>
                  <View
                    style={[
                      styles.userAvatar,
                      {
                        backgroundColor: `rgba(251,91,33,${0.1 + (idx % 4) * 0.05})`,
                      },
                    ]}
                  >
                    <ThemedText style={styles.userAvatarText}>
                      {user.fullName?.charAt(0) || "؟"}
                    </ThemedText>
                  </View>
                </View>
                <View style={styles.userRowInfo}>
                  <ThemedText style={styles.userRowName} numberOfLines={1}>
                    {user.fullName || "بدون اسم"}
                  </ThemedText>
                  <View style={styles.userRowMeta}>
                    <Feather name="phone" size={11} color={AppColors.gray400} />
                    <ThemedText style={styles.userRowPhone}>
                      {user.phoneNumber}
                    </ThemedText>
                  </View>
                  {user.region ? (
                    <View style={styles.userRowMeta}>
                      <Feather
                        name="map-pin"
                        size={11}
                        color={AppColors.gray400}
                      />
                      <ThemedText style={styles.userRowPhone}>
                        {user.region}
                      </ThemedText>
                    </View>
                  ) : null}
                  {formatDate(user.createdAt) ? (
                    <ThemedText style={styles.userRowDate}>
                      {formatDate(user.createdAt)}
                    </ThemedText>
                  ) : null}
                </View>
                <View style={styles.userRowRight}>
                  {user.pushToken ? (
                    <View style={styles.userNotifBadge}>
                      <Feather
                        name="bell"
                        size={10}
                        color={AppColors.success}
                      />
                    </View>
                  ) : null}
                  <ThemedText style={styles.userRowIndex}>
                    #{idx + 1}
                  </ThemedText>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  return renderUsersTab();
}

export const UsersTab = React.memo(UsersTabInner);
