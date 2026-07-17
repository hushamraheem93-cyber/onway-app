import React, { useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
  ActivityIndicator,
  Image,
  Linking,
  Platform,
} from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useFocusEffect } from "@react-navigation/native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";

import { ThemedText } from "@/components/ThemedText";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { getApiUrl } from "@/lib/query-client";
import { BUSINESS_LABELS } from "@/constants/businessCategories";
import { AppColors } from "@/constants/theme";

const ORANGE = AppColors.primary;
const ORANGE_LIGHT = AppColors.secondary;

const DAY_LABELS = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];

export default function VendorProfileScreen() {
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const { vendorProfile, vendorToken, logout, refreshVendorProfile } = useAuth();

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [bioModal, setBioModal] = useState(false);
  const [bioText, setBioText] = useState(vendorProfile?.bio || "");
  const [savingBio, setSavingBio] = useState(false);

  const [settingsModal, setSettingsModal] = useState(false);
  const [settDeliveryTime, setSettDeliveryTime] = useState(vendorProfile?.deliveryTime || "30-45");
  const [settDeliveryPrice, setSettDeliveryPrice] = useState(String(vendorProfile?.deliveryPrice ?? 0));
  const defaultWh = vendorProfile?.workingHours ?? { openTime: "09:00", closeTime: "22:00", openDays: [0,1,2,3,4,5,6] };
  const [settOpenTime, setSettOpenTime] = useState(defaultWh.openTime);
  const [settCloseTime, setSettCloseTime] = useState(defaultWh.closeTime);
  const [settOpenDays, setSettOpenDays] = useState<number[]>(defaultWh.openDays);
  const [settingsUseHours, setSettingsUseHours] = useState(!!vendorProfile?.workingHours);
  const [savingSettings, setSavingSettings] = useState(false);

  useFocusEffect(useCallback(() => {
    setBioText(vendorProfile?.bio || "");
    setSettDeliveryTime(vendorProfile?.deliveryTime || "30-45");
    setSettDeliveryPrice(String(vendorProfile?.deliveryPrice ?? 0));
    const wh = vendorProfile?.workingHours;
    setSettingsUseHours(!!wh);
    setSettOpenTime(wh?.openTime || "09:00");
    setSettCloseTime(wh?.closeTime || "22:00");
    setSettOpenDays(wh?.openDays ?? [0,1,2,3,4,5,6]);
  }, [vendorProfile]));

  const uploadImage = async (type: "profileImage" | "coverImage") => {
    if (!vendorToken) return;
    const setter = type === "profileImage" ? setUploadingAvatar : setUploadingCover;
    setter(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images",
        allowsEditing: true,
        aspect: type === "profileImage" ? [1, 1] : [3, 1],
        quality: 0.85,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const formData = new FormData();
      formData.append(type, { uri: asset.uri, type: "image/jpeg", name: `${type}.jpg` } as any);
      const res = await fetch(new URL("/api/vendor/profile/images", getApiUrl()).toString(), {
        method: "POST",
        headers: { Authorization: `Bearer ${vendorToken}` },
        body: formData,
      });
      if (res.ok) {
        await refreshVendorProfile();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {} finally { setter(false); }
  };

  const saveBio = async () => {
    if (!vendorToken) return;
    setSavingBio(true);
    try {
      await fetch(new URL("/api/vendor/profile", getApiUrl()).toString(), {
        method: "PATCH",
        headers: { Authorization: `Bearer ${vendorToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ bio: bioText }),
      });
      await refreshVendorProfile();
      setBioModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {} finally { setSavingBio(false); }
  };

  const saveSettings = async () => {
    if (!vendorToken) return;
    setSavingSettings(true);
    try {
      await fetch(new URL("/api/vendor/profile", getApiUrl()).toString(), {
        method: "PATCH",
        headers: { Authorization: `Bearer ${vendorToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          deliveryTime: settDeliveryTime.trim(),
          deliveryPrice: Number(settDeliveryPrice) || 0,
          workingHours: settingsUseHours
            ? { openTime: settOpenTime, closeTime: settCloseTime, openDays: settOpenDays }
            : null,
        }),
      });
      await refreshVendorProfile();
      setSettingsModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {} finally { setSavingSettings(false); }
  };

  const coverUrl = vendorProfile?.coverImageUrl
    ? new URL(vendorProfile.coverImageUrl, getApiUrl()).toString() : null;
  const avatarUrl = vendorProfile?.profileImageUrl
    ? new URL(vendorProfile.profileImageUrl, getApiUrl()).toString() : null;

  const statusColor = vendorProfile?.status === "active" ? AppColors.success
    : vendorProfile?.status === "pending" ? AppColors.warning : AppColors.error;
  const statusBg = vendorProfile?.status === "active" ? AppColors.successLight
    : vendorProfile?.status === "pending" ? AppColors.warningLight : AppColors.errorLight;
  const statusLabel = vendorProfile?.status === "active" ? "نشط"
    : vendorProfile?.status === "pending" ? "قيد المراجعة" : "موقوف";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{ paddingTop: headerHeight + 16, paddingBottom: tabBarHeight + 24, paddingHorizontal: 16, gap: 12 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Profile card */}
      <View style={[styles.card, { backgroundColor: theme.backgroundDefault }]}>
        {/* Cover */}
        <Pressable style={styles.coverWrap} onPress={() => uploadImage("coverImage")}>
          {coverUrl ? (
            <Image source={{ uri: coverUrl }} style={styles.cover} resizeMode="cover" />
          ) : (
            <View style={[styles.cover, { backgroundColor: AppColors.gray50, alignItems: "center", justifyContent: "center" }]}>
              <MaterialCommunityIcons name="image-filter-hdr" size={32} color={AppColors.vendorPurpleLight} />
            </View>
          )}
          <View style={styles.editCoverBtn}>
            {uploadingCover ? <ActivityIndicator size="small" color={AppColors.white} /> : <Feather name="camera" size={13} color={AppColors.white} />}
          </View>
        </Pressable>

        {/* Avatar + info */}
        <View style={styles.avatarRow}>
          <Pressable style={styles.avatarWrap} onPress={() => uploadImage("profileImage")}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: ORANGE, alignItems: "center", justifyContent: "center" }]}>
                <ThemedText style={{ fontSize: 26, color: AppColors.white, fontFamily: "Cairo_700Bold" }}>
                  {vendorProfile?.storeName?.[0] || "م"}
                </ThemedText>
              </View>
            )}
            <View style={styles.editAvatarBtn}>
              {uploadingAvatar ? <ActivityIndicator size="small" color={AppColors.white} /> : <Feather name="camera" size={11} color={AppColors.white} />}
            </View>
          </Pressable>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.storeName} numberOfLines={1}>{vendorProfile?.storeName || "متجري"}</ThemedText>
            <ThemedText style={[styles.bizType, { color: theme.textSecondary }]}>
              {BUSINESS_LABELS[vendorProfile?.businessType || ""] || "متجر"}
            </ThemedText>
            <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <ThemedText style={[styles.statusText, { color: statusColor }]}>{statusLabel}</ThemedText>
            </View>
          </View>
        </View>

        {/* Bio */}
        <Pressable style={styles.bioRow} onPress={() => setBioModal(true)}>
          <ThemedText style={[styles.bioText, !vendorProfile?.bio && { color: theme.textSecondary }]} numberOfLines={2}>
            {vendorProfile?.bio || "أضف وصفاً لمتجرك..."}
          </ThemedText>
          <Feather name="edit-2" size={14} color={ORANGE} />
        </Pressable>

        {vendorProfile?.address ? (
          <View style={styles.addrRow}>
            <Feather name="map-pin" size={13} color={AppColors.gray400} />
            <ThemedText style={[styles.addrText, { color: theme.textSecondary }]}>{vendorProfile.address}</ThemedText>
          </View>
        ) : null}
      </View>

      {/* Store settings card */}
      <ThemedText style={styles.sectionLabel}>إعدادات المتجر</ThemedText>
      <Pressable
        style={[styles.card, styles.settingsRow, { backgroundColor: theme.backgroundDefault }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setSettingsModal(true);
        }}
      >
        <View style={[styles.settingsIcon, { backgroundColor: ORANGE_LIGHT }]}>
          <Feather name="settings" size={18} color={ORANGE} />
        </View>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.settingsTitle}>وقت التوصيل والعمل</ThemedText>
          <ThemedText style={[styles.settingsSub, { color: theme.textSecondary }]}>
            {vendorProfile?.deliveryTime ? `${vendorProfile.deliveryTime} دقيقة` : "غير محدد"}
            {vendorProfile?.deliveryPrice != null ? ` · أجرة التوصيل: ${vendorProfile.deliveryPrice} د.ع` : ""}
          </ThemedText>
        </View>
        <Feather name="chevron-left" size={18} color={theme.textSecondary} />
      </Pressable>

      {/* Rating */}
      {vendorProfile?.rating != null ? (
        <View style={[styles.card, styles.ratingRow, { backgroundColor: theme.backgroundDefault }]}>
          <View style={[styles.settingsIcon, { backgroundColor: AppColors.warningLight }]}>
            <MaterialCommunityIcons name="star" size={18} color={AppColors.warning} />
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.settingsTitle}>تقييم المتجر</ThemedText>
            <ThemedText style={[styles.settingsSub, { color: theme.textSecondary }]}>
              {(vendorProfile.rating as number).toFixed(1)} / 5 · {(vendorProfile as any).ratingCount ?? 0} تقييم
            </ThemedText>
          </View>
          <ThemedText style={styles.ratingBig}>{(vendorProfile.rating as number).toFixed(1)}</ThemedText>
        </View>
      ) : null}

      <ThemedText style={styles.sectionLabel}>الحساب</ThemedText>

      <Pressable
        style={[styles.card, styles.settingsRow, { backgroundColor: theme.backgroundDefault }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          if (Platform.OS !== "web") {
            Linking.openURL("mailto:support@onway.app").catch(() => {});
          }
        }}
      >
        <View style={[styles.settingsIcon, { backgroundColor: AppColors.infoLight }]}>
          <Feather name="help-circle" size={18} color={AppColors.info} />
        </View>
        <ThemedText style={[styles.settingsTitle, { flex: 1 }]}>الدعم والمساعدة</ThemedText>
        <Feather name="chevron-left" size={18} color={theme.textSecondary} />
      </Pressable>

      <Pressable
        style={[styles.card, styles.settingsRow, styles.logoutRow]}
        onPress={async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          await logout();
        }}
        testID="button-vendor-logout"
      >
        <View style={[styles.settingsIcon, { backgroundColor: AppColors.errorLight }]}>
          <Feather name="log-out" size={18} color={AppColors.error} />
        </View>
        <ThemedText style={[styles.settingsTitle, { flex: 1, color: AppColors.error }]}>تسجيل الخروج</ThemedText>
      </Pressable>

      {/* Bio modal */}
      <Modal visible={bioModal} transparent animationType="fade" onRequestClose={() => setBioModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: theme.backgroundDefault }]}>
            <ThemedText style={styles.modalTitle}>وصف المتجر</ThemedText>
            <TextInput
              style={[styles.bioInput, { color: theme.text, borderColor: theme.border ?? AppColors.divider }]}
              value={bioText}
              onChangeText={setBioText}
              placeholder="أضف وصفاً لمتجرك..."
              placeholderTextColor={AppColors.gray400}
              multiline
              numberOfLines={4}
              textAlign="right"
            />
            <View style={styles.modalBtns}>
              <Pressable style={[styles.modalBtn, { backgroundColor: ORANGE }]} onPress={saveBio} disabled={savingBio}>
                {savingBio ? <ActivityIndicator color={AppColors.white} size="small" /> : <ThemedText style={styles.modalBtnText}>حفظ</ThemedText>}
              </Pressable>
              <Pressable style={[styles.modalBtn, { backgroundColor: AppColors.gray100 }]} onPress={() => setBioModal(false)}>
                <ThemedText style={[styles.modalBtnText, { color: AppColors.gray700 }]}>إلغاء</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Settings modal */}
      <Modal visible={settingsModal} transparent animationType="slide" onRequestClose={() => setSettingsModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: theme.backgroundDefault }]}>
            <ThemedText style={styles.modalTitle}>إعدادات المتجر</ThemedText>

            <ThemedText style={styles.fieldLabel}>وقت التوصيل (دقائق)</ThemedText>
            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.border ?? AppColors.divider }]}
              value={settDeliveryTime}
              onChangeText={setSettDeliveryTime}
              placeholder="مثال: 30-45"
              placeholderTextColor={AppColors.gray400}
              textAlign="right"
            />
            <ThemedText style={styles.fieldLabel}>أجرة التوصيل (د.ع)</ThemedText>
            <TextInput
              style={[styles.input, { color: theme.text, borderColor: theme.border ?? AppColors.divider }]}
              value={settDeliveryPrice}
              onChangeText={setSettDeliveryPrice}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={AppColors.gray400}
              textAlign="right"
            />

            <Pressable style={styles.toggleRow} onPress={() => setSettingsUseHours(!settingsUseHours)}>
              <View style={[styles.toggle, { backgroundColor: settingsUseHours ? ORANGE : AppColors.divider }]}>
                <View style={[styles.toggleThumb, { left: settingsUseHours ? 18 : 2 }]} />
              </View>
              <ThemedText style={styles.toggleLabel}>تحديد ساعات العمل</ThemedText>
            </Pressable>

            {settingsUseHours ? (
              <View style={styles.timeRow}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.fieldLabel}>فتح</ThemedText>
                  <TextInput
                    style={[styles.input, { color: theme.text, borderColor: theme.border ?? AppColors.divider }]}
                    value={settOpenTime}
                    onChangeText={setSettOpenTime}
                    placeholder="09:00"
                    placeholderTextColor={AppColors.gray400}
                    textAlign="right"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.fieldLabel}>إغلاق</ThemedText>
                  <TextInput
                    style={[styles.input, { color: theme.text, borderColor: theme.border ?? AppColors.divider }]}
                    value={settCloseTime}
                    onChangeText={setSettCloseTime}
                    placeholder="22:00"
                    placeholderTextColor={AppColors.gray400}
                    textAlign="right"
                  />
                </View>
              </View>
            ) : null}

            {settingsUseHours ? (
              <View style={styles.daysRow}>
                {DAY_LABELS.map((d, i) => {
                  const on = settOpenDays.includes(i);
                  return (
                    <Pressable
                      key={i}
                      style={[styles.dayBtn, on && { backgroundColor: ORANGE, borderColor: ORANGE }]}
                      onPress={() => setSettOpenDays(prev => on ? prev.filter(x => x !== i) : [...prev, i])}
                    >
                      <ThemedText style={[styles.dayText, on && { color: AppColors.white }]}>{d}</ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            <View style={styles.modalBtns}>
              <Pressable style={[styles.modalBtn, { backgroundColor: ORANGE }]} onPress={saveSettings} disabled={savingSettings}>
                {savingSettings ? <ActivityIndicator color={AppColors.white} size="small" /> : <ThemedText style={styles.modalBtnText}>حفظ</ThemedText>}
              </Pressable>
              <Pressable style={[styles.modalBtn, { backgroundColor: AppColors.gray100 }]} onPress={() => setSettingsModal(false)}>
                <ThemedText style={[styles.modalBtnText, { color: AppColors.gray700 }]}>إلغاء</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { fontFamily: "Cairo_700Bold", fontSize: 14, color: AppColors.gray400, textAlign: "right", marginTop: 4 },
  card: { borderRadius: 20, overflow: "hidden", shadowColor: AppColors.black, shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  coverWrap: { width: "100%", height: 120, position: "relative" },
  cover: { width: "100%", height: 120 },
  editCoverBtn: { position: "absolute", bottom: 8, left: 8, backgroundColor: AppColors.overlay, borderRadius: 14, padding: 6 },
  avatarRow: { flexDirection: "row-reverse", alignItems: "center", gap: 14, padding: 16 },
  avatarWrap: { position: "relative" },
  avatar: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: AppColors.white },
  editAvatarBtn: { position: "absolute", bottom: 0, left: 0, backgroundColor: ORANGE, borderRadius: 10, padding: 5, borderWidth: 2, borderColor: AppColors.white },
  storeName: { fontFamily: "Cairo_700Bold", fontSize: 21, textAlign: "right" },
  bizType: { fontFamily: "Cairo_400Regular", fontSize: 13, textAlign: "right" },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, alignSelf: "flex-end", marginTop: 4 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontFamily: "Cairo_700Bold", fontSize: 11 },
  bioRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  bioText: { flex: 1, fontFamily: "Cairo_400Regular", fontSize: 13, textAlign: "right" },
  addrRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingBottom: 12 },
  addrText: { fontFamily: "Cairo_400Regular", fontSize: 12, textAlign: "right" },
  settingsRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12, padding: 16 },
  ratingRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12, padding: 16 },
  settingsIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  settingsTitle: { fontFamily: "Cairo_700Bold", fontSize: 14, textAlign: "right" },
  settingsSub: { fontFamily: "Cairo_400Regular", fontSize: 12, textAlign: "right", marginTop: 2 },
  ratingBig: { fontFamily: "Cairo_700Bold", fontSize: 22, color: AppColors.warning },
  logoutRow: { borderWidth: 1, borderColor: AppColors.errorLight, backgroundColor: AppColors.errorLight },
  modalOverlay: { flex: 1, backgroundColor: AppColors.overlay, justifyContent: "center", alignItems: "center", padding: 20 },
  modalBox: { width: "100%", borderRadius: 20, padding: 20, gap: 12 },
  modalTitle: { fontFamily: "Cairo_700Bold", fontSize: 17, textAlign: "center", marginBottom: 4 },
  fieldLabel: { fontFamily: "Cairo_700Bold", fontSize: 12, color: AppColors.gray500, textAlign: "right", marginBottom: 4 },
  input: { borderWidth: 1.5, borderRadius: 12, padding: 12, fontFamily: "Cairo_400Regular", fontSize: 16, textAlign: "right" },
  bioInput: { borderWidth: 1.5, borderRadius: 10, padding: 10, fontFamily: "Cairo_400Regular", fontSize: 14, textAlign: "right", minHeight: 100, textAlignVertical: "top" },
  toggleRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingVertical: 4 },
  toggle: { width: 44, height: 26, borderRadius: 13, position: "relative" },
  toggleThumb: { position: "absolute", top: 3, width: 20, height: 20, borderRadius: 10, backgroundColor: AppColors.white, shadowColor: AppColors.black, shadowOpacity: 0.2, shadowRadius: 2, elevation: 2 },
  toggleLabel: { fontFamily: "Cairo_700Bold", fontSize: 13 },
  timeRow: { flexDirection: "row-reverse", gap: 10 },
  daysRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 },
  dayBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1.5, borderColor: AppColors.divider },
  dayText: { fontFamily: "Cairo_700Bold", fontSize: 11, color: AppColors.gray500 },
  modalBtns: { flexDirection: "row-reverse", gap: 10, marginTop: 4 },
  modalBtn: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  modalBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: AppColors.white },
});
