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
import { AppColors, FontFamily, Shadows } from "@/constants/theme";

const ORANGE = AppColors.primary;
const DAY_LABELS = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];

// ─── Section row component ─────────────────────────────────────────────────────

const SettingsRow = React.memo(({
  icon, iconBg, iconColor, title, subtitle, onPress, danger, rightNode, testID,
}: {
  icon: string; iconBg: string; iconColor: string;
  title: string; subtitle?: string;
  onPress?: () => void; danger?: boolean;
  rightNode?: React.ReactNode; testID?: string;
}) => {
  const { theme } = useTheme();
  return (
    <Pressable
      style={[sr.row, { backgroundColor: danger ? AppColors.errorLight : theme.backgroundDefault }, Shadows.xs]}
      onPress={onPress}
      testID={testID}
    >
      <View style={[sr.iconBox, { backgroundColor: iconBg }]}>
        <MaterialCommunityIcons name={icon as any} size={20} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <ThemedText style={[sr.title, danger && { color: AppColors.error }]}>{title}</ThemedText>
        {subtitle ? <ThemedText style={[sr.sub, { color: theme.textSecondary }]}>{subtitle}</ThemedText> : null}
      </View>
      {rightNode ?? (onPress ? <MaterialCommunityIcons name="chevron-left" size={20} color={AppColors.gray300} /> : null)}
    </Pressable>
  );
});

const sr = StyleSheet.create({
  row:    { flexDirection: "row-reverse", alignItems: "center", gap: 14, padding: 14, borderRadius: 18 },
  iconBox:{ width: 42, height: 42, borderRadius: 12, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  title:  { fontFamily: FontFamily.cairoBold, fontSize: 14, color: AppColors.gray800, textAlign: "right" },
  sub:    { fontFamily: FontFamily.tajawal, fontSize: 12, textAlign: "right", marginTop: 2 },
});

// ─── Section header ───────────────────────────────────────────────────────────

function SectionLabel({ title }: { title: string }) {
  return (
    <View style={sl.wrap}>
      <ThemedText style={sl.text}>{title}</ThemedText>
    </View>
  );
}
const sl = StyleSheet.create({
  wrap: { paddingHorizontal: 4, paddingTop: 8, paddingBottom: 4 },
  text: { fontFamily: FontFamily.cairoBold, fontSize: 12, color: AppColors.gray400, textAlign: "right", letterSpacing: 0.5 },
});

// ─── Bottom sheet modal ───────────────────────────────────────────────────────

function SheetModal({ visible, title, onClose, children }: {
  visible: boolean; title: string; onClose: () => void; children: React.ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={sm.overlay}>
        <View style={[sm.sheet, { backgroundColor: theme.backgroundDefault }]}>
          <View style={sm.handle} />
          <View style={sm.header}>
            <ThemedText style={sm.title}>{title}</ThemedText>
            <Pressable onPress={onClose} hitSlop={10}>
              <Feather name="x" size={20} color={AppColors.gray400} />
            </Pressable>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

const sm = StyleSheet.create({
  overlay:{ flex: 1, backgroundColor: AppColors.overlay, justifyContent: "flex-end" },
  sheet:  { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingTop: 12, gap: 14 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: AppColors.gray200, alignSelf: "center", marginBottom: 8 },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  title:  { fontFamily: FontFamily.cairoBold, fontSize: 17, color: AppColors.gray800 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function VendorProfileScreen() {
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme }    = useTheme();
  const { vendorProfile, vendorToken, logout, refreshVendorProfile } = useAuth();

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover,  setUploadingCover]  = useState(false);
  const [bioModal,        setBioModal]        = useState(false);
  const [bioText,         setBioText]         = useState(vendorProfile?.bio || "");
  const [savingBio,       setSavingBio]       = useState(false);
  const [storeNameModal,  setStoreNameModal]  = useState(false);
  const [storeNameText,   setStoreNameText]   = useState(vendorProfile?.storeName || "");
  const [savingStoreName, setSavingStoreName] = useState(false);
  const [settingsModal,   setSettingsModal]   = useState(false);
  const [settDeliveryTime,  setDeliveryTime]  = useState(vendorProfile?.deliveryTime || "30-45");
  const [settDeliveryPrice, setDeliveryPrice] = useState(String(vendorProfile?.deliveryPrice ?? 0));
  const defaultWh = vendorProfile?.workingHours ?? { openTime: "09:00", closeTime: "22:00", openDays: [0,1,2,3,4,5,6] };
  const [settOpenTime,  setOpenTime]    = useState(defaultWh.openTime);
  const [settCloseTime, setCloseTime]   = useState(defaultWh.closeTime);
  const [settOpenDays,  setOpenDays]    = useState<number[]>(defaultWh.openDays);
  const [useHours,      setUseHours]    = useState(!!vendorProfile?.workingHours);
  const [savingSettings, setSavingSettings] = useState(false);

  useFocusEffect(useCallback(() => {
    setStoreNameText(vendorProfile?.storeName || "");
    setBioText(vendorProfile?.bio || "");
    setDeliveryTime(vendorProfile?.deliveryTime || "30-45");
    setDeliveryPrice(String(vendorProfile?.deliveryPrice ?? 0));
    const wh = vendorProfile?.workingHours;
    setUseHours(!!wh);
    setOpenTime(wh?.openTime  || "09:00");
    setCloseTime(wh?.closeTime || "22:00");
    setOpenDays(wh?.openDays  ?? [0,1,2,3,4,5,6]);
  }, [vendorProfile]));

  // ── API helpers (logic unchanged) ─────────────────────────────────────────────

  const uploadImage = async (type: "profileImage" | "coverImage") => {
    if (!vendorToken) return;
    const setter = type === "profileImage" ? setUploadingAvatar : setUploadingCover;
    setter(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", allowsEditing: true, aspect: type === "profileImage" ? [1, 1] : [3, 1], quality: 0.85 });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const formData = new FormData();
      formData.append(type, { uri: asset.uri, type: "image/jpeg", name: `${type}.jpg` } as any);
      const res = await fetch(new URL("/api/vendor/profile/images", getApiUrl()).toString(), { method: "POST", headers: { Authorization: `Bearer ${vendorToken}` }, body: formData });
      if (res.ok) { await refreshVendorProfile(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }
    } catch {} finally { setter(false); }
  };

  const saveStoreName = async () => {
    if (!vendorToken || !storeNameText.trim()) return;
    setSavingStoreName(true);
    try {
      await fetch(new URL("/api/vendor/profile", getApiUrl()).toString(), { method: "PATCH", headers: { Authorization: `Bearer ${vendorToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ storeName: storeNameText.trim() }) });
      await refreshVendorProfile(); setStoreNameModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {} finally { setSavingStoreName(false); }
  };

  const saveBio = async () => {
    if (!vendorToken) return;
    setSavingBio(true);
    try {
      await fetch(new URL("/api/vendor/profile", getApiUrl()).toString(), { method: "PATCH", headers: { Authorization: `Bearer ${vendorToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ bio: bioText }) });
      await refreshVendorProfile(); setBioModal(false);
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
          workingHours: useHours ? { openTime: settOpenTime, closeTime: settCloseTime, openDays: settOpenDays } : null,
        }),
      });
      await refreshVendorProfile(); setSettingsModal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {} finally { setSavingSettings(false); }
  };

  // ── Derived values ─────────────────────────────────────────────────────────────

  const coverUrl  = vendorProfile?.coverImageUrl  ? new URL(vendorProfile.coverImageUrl, getApiUrl()).toString()  : null;
  const avatarUrl = vendorProfile?.profileImageUrl ? new URL(vendorProfile.profileImageUrl, getApiUrl()).toString() : null;

  const statusCfg = vendorProfile?.status === "active"
    ? { label: "نشط",          color: AppColors.success, bg: AppColors.successLight, icon: "check-circle" }
    : vendorProfile?.status === "pending"
    ? { label: "قيد المراجعة", color: AppColors.warning, bg: AppColors.warningLight, icon: "clock-outline" }
    : { label: "موقوف",        color: AppColors.error,   bg: AppColors.errorLight,   icon: "close-circle"  };

  // ── Render ─────────────────────────────────────────────────────────────────────

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: AppColors.background }}
      contentContainerStyle={{ paddingTop: headerHeight + 16, paddingBottom: tabBarHeight + 24, paddingHorizontal: 16, gap: 10 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Profile card ── */}
      <View style={[p.profileCard, { backgroundColor: theme.backgroundDefault }, Shadows.sm]}>
        {/* Cover */}
        <Pressable style={p.coverWrap} onPress={() => uploadImage("coverImage")}>
          {coverUrl
            ? <Image source={{ uri: coverUrl }} style={p.cover} resizeMode="cover" />
            : <View style={[p.cover, { backgroundColor: AppColors.secondary, alignItems: "center", justifyContent: "center" }]}>
                <MaterialCommunityIcons name="image-filter-hdr" size={32} color={ORANGE + "50"} />
              </View>}
          <View style={p.editCoverBtn}>
            {uploadingCover ? <ActivityIndicator size="small" color={AppColors.white} /> : <Feather name="camera" size={13} color={AppColors.white} />}
          </View>
        </Pressable>

        {/* Avatar + info */}
        <View style={p.avatarRow}>
          <Pressable style={p.avatarWrap} onPress={() => uploadImage("profileImage")}>
            {avatarUrl
              ? <Image source={{ uri: avatarUrl }} style={p.avatar} />
              : <View style={[p.avatar, { backgroundColor: ORANGE, alignItems: "center", justifyContent: "center" }]}>
                  <ThemedText style={{ fontSize: 26, color: AppColors.white, fontFamily: FontFamily.cairoBold }}>
                    {vendorProfile?.storeName?.[0] || "م"}
                  </ThemedText>
                </View>}
            <View style={p.editAvatarBtn}>
              {uploadingAvatar ? <ActivityIndicator size="small" color={AppColors.white} /> : <Feather name="camera" size={11} color={AppColors.white} />}
            </View>
          </Pressable>

          <View style={{ flex: 1, gap: 4 }}>
            <Pressable style={p.storeNameRow} onPress={() => setStoreNameModal(true)}>
              <ThemedText style={p.storeName} numberOfLines={2}>{vendorProfile?.storeName || "متجري"}</ThemedText>
              <View style={[p.editIconBox, { backgroundColor: ORANGE + "15" }]}>
                <Feather name="edit-2" size={12} color={ORANGE} />
              </View>
            </Pressable>
            <ThemedText style={[p.bizType, { color: theme.textSecondary }]}>
              {BUSINESS_LABELS[(vendorProfile as any)?.businessType || ""] || "متجر"}
            </ThemedText>
            <View style={[p.statusBadge, { backgroundColor: statusCfg.bg }]}>
              <MaterialCommunityIcons name={statusCfg.icon as any} size={12} color={statusCfg.color} />
              <ThemedText style={[p.statusText, { color: statusCfg.color }]}>{statusCfg.label}</ThemedText>
            </View>
          </View>
        </View>

        {/* Bio */}
        <Pressable style={p.bioRow} onPress={() => setBioModal(true)}>
          <ThemedText style={[p.bioText, !vendorProfile?.bio && { color: theme.textSecondary, fontStyle: "italic" }]} numberOfLines={2}>
            {vendorProfile?.bio || "أضف وصفاً لمتجرك..."}
          </ThemedText>
          <View style={[p.editIconBox, { backgroundColor: ORANGE + "15" }]}>
            <Feather name="edit-2" size={12} color={ORANGE} />
          </View>
        </Pressable>

        {vendorProfile?.address && (
          <View style={p.addrRow}>
            <Feather name="map-pin" size={12} color={AppColors.gray400} />
            <ThemedText style={[p.addrText, { color: theme.textSecondary }]}>{vendorProfile.address}</ThemedText>
          </View>
        )}
      </View>

      {/* ── Store settings section ── */}
      <SectionLabel title="إعدادات المتجر" />

      <SettingsRow
        icon="store-cog-outline"
        iconBg={AppColors.secondary} iconColor={ORANGE}
        title="وقت التوصيل والعمل"
        subtitle={[
          vendorProfile?.deliveryTime ? `${vendorProfile.deliveryTime} دقيقة` : null,
          vendorProfile?.deliveryPrice != null ? `أجرة التوصيل: ${vendorProfile.deliveryPrice} د.ع` : null,
        ].filter(Boolean).join(" · ") || "غير محدد"}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSettingsModal(true); }}
      />

      {vendorProfile?.rating != null && (
        <SettingsRow
          icon="star-outline"
          iconBg={AppColors.warningLight} iconColor={AppColors.warning}
          title="تقييم المتجر"
          subtitle={`${(vendorProfile.rating as number).toFixed(1)} / 5 · ${(vendorProfile as any).ratingCount ?? 0} تقييم`}
          rightNode={<ThemedText style={{ fontFamily: FontFamily.cairoBold, fontSize: 22, color: AppColors.warning }}>{(vendorProfile.rating as number).toFixed(1)}</ThemedText>}
        />
      )}

      {/* ── Account section ── */}
      <SectionLabel title="الحساب" />

      <SettingsRow
        icon="help-circle-outline"
        iconBg={AppColors.infoLight} iconColor={AppColors.info}
        title="الدعم والمساعدة"
        subtitle="support@onway.app"
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); if (Platform.OS !== "web") Linking.openURL("mailto:support@onway.app").catch(() => {}); }}
      />

      <SettingsRow
        icon="information-outline"
        iconBg={AppColors.gray100} iconColor={AppColors.gray500}
        title="حول التطبيق"
        subtitle="OnWay Vendor v1.0"
      />

      <SettingsRow
        icon="logout"
        iconBg={AppColors.errorLight} iconColor={AppColors.error}
        title="تسجيل الخروج"
        danger
        onPress={async () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); await logout(); }}
        testID="button-vendor-logout"
      />

      {/* ── Store Name Modal ── */}
      <SheetModal visible={storeNameModal} title="اسم المتجر" onClose={() => setStoreNameModal(false)}>
        <TextInput
          style={[md.input, { color: theme.text, borderColor: theme.border ?? AppColors.divider }]}
          value={storeNameText} onChangeText={setStoreNameText}
          placeholder="اسم المتجر" placeholderTextColor={AppColors.gray400} textAlign="right" autoFocus
        />
        <View style={md.btns}>
          <Pressable style={[md.btn, { backgroundColor: !storeNameText.trim() ? AppColors.gray200 : ORANGE }]} onPress={saveStoreName} disabled={savingStoreName || !storeNameText.trim()}>
            {savingStoreName ? <ActivityIndicator color={AppColors.white} size="small" /> : <ThemedText style={md.btnText}>حفظ</ThemedText>}
          </Pressable>
          <Pressable style={[md.btn, { backgroundColor: AppColors.gray100 }]} onPress={() => setStoreNameModal(false)}>
            <ThemedText style={[md.btnText, { color: AppColors.gray700 }]}>إلغاء</ThemedText>
          </Pressable>
        </View>
      </SheetModal>

      {/* ── Bio Modal ── */}
      <SheetModal visible={bioModal} title="وصف المتجر" onClose={() => setBioModal(false)}>
        <TextInput
          style={[md.input, md.textArea, { color: theme.text, borderColor: theme.border ?? AppColors.divider }]}
          value={bioText} onChangeText={setBioText}
          placeholder="أضف وصفاً لمتجرك..." placeholderTextColor={AppColors.gray400}
          multiline numberOfLines={4} textAlign="right"
        />
        <View style={md.btns}>
          <Pressable style={[md.btn, { backgroundColor: ORANGE }]} onPress={saveBio} disabled={savingBio}>
            {savingBio ? <ActivityIndicator color={AppColors.white} size="small" /> : <ThemedText style={md.btnText}>حفظ</ThemedText>}
          </Pressable>
          <Pressable style={[md.btn, { backgroundColor: AppColors.gray100 }]} onPress={() => setBioModal(false)}>
            <ThemedText style={[md.btnText, { color: AppColors.gray700 }]}>إلغاء</ThemedText>
          </Pressable>
        </View>
      </SheetModal>

      {/* ── Settings Modal ── */}
      <SheetModal visible={settingsModal} title="إعدادات المتجر" onClose={() => setSettingsModal(false)}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <ThemedText style={md.fieldLabel}>وقت التوصيل (دقائق)</ThemedText>
          <TextInput style={[md.input, { color: theme.text, borderColor: theme.border ?? AppColors.divider }]} value={settDeliveryTime} onChangeText={setDeliveryTime} placeholder="مثال: 30-45" placeholderTextColor={AppColors.gray400} textAlign="right" />

          <ThemedText style={md.fieldLabel}>أجرة التوصيل (د.ع)</ThemedText>
          <TextInput style={[md.input, { color: theme.text, borderColor: theme.border ?? AppColors.divider }]} value={settDeliveryPrice} onChangeText={setDeliveryPrice} keyboardType="numeric" placeholder="0" placeholderTextColor={AppColors.gray400} textAlign="right" />

          <Pressable style={md.toggleRow} onPress={() => setUseHours(!useHours)}>
            <View style={[md.toggle, { backgroundColor: useHours ? ORANGE : AppColors.divider }]}>
              <View style={[md.toggleThumb, { left: useHours ? 18 : 2 }]} />
            </View>
            <ThemedText style={md.toggleLabel}>تحديد ساعات العمل</ThemedText>
          </Pressable>

          {useHours && (
            <View style={{ flexDirection: "row-reverse", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <ThemedText style={md.fieldLabel}>فتح</ThemedText>
                <TextInput style={[md.input, { color: theme.text, borderColor: theme.border ?? AppColors.divider }]} value={settOpenTime} onChangeText={setOpenTime} placeholder="09:00" placeholderTextColor={AppColors.gray400} textAlign="right" />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={md.fieldLabel}>إغلاق</ThemedText>
                <TextInput style={[md.input, { color: theme.text, borderColor: theme.border ?? AppColors.divider }]} value={settCloseTime} onChangeText={setCloseTime} placeholder="22:00" placeholderTextColor={AppColors.gray400} textAlign="right" />
              </View>
            </View>
          )}

          {useHours && (
            <View style={md.daysRow}>
              {DAY_LABELS.map((d, i) => {
                const on = settOpenDays.includes(i);
                return (
                  <Pressable
                    key={i}
                    style={[md.dayBtn, on && { backgroundColor: ORANGE, borderColor: ORANGE }]}
                    onPress={() => setOpenDays((p) => on ? p.filter((x) => x !== i) : [...p, i])}
                  >
                    <ThemedText style={[md.dayText, on && { color: AppColors.white }]}>{d}</ThemedText>
                  </Pressable>
                );
              })}
            </View>
          )}

          <View style={[md.btns, { marginTop: 8 }]}>
            <Pressable style={[md.btn, { backgroundColor: ORANGE }]} onPress={saveSettings} disabled={savingSettings}>
              {savingSettings ? <ActivityIndicator color={AppColors.white} size="small" /> : <ThemedText style={md.btnText}>حفظ</ThemedText>}
            </Pressable>
            <Pressable style={[md.btn, { backgroundColor: AppColors.gray100 }]} onPress={() => setSettingsModal(false)}>
              <ThemedText style={[md.btnText, { color: AppColors.gray700 }]}>إلغاء</ThemedText>
            </Pressable>
          </View>
        </ScrollView>
      </SheetModal>
    </ScrollView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────────

const p = StyleSheet.create({
  profileCard:   { borderRadius: 24, overflow: "hidden" },
  coverWrap:     { width: "100%", height: 120, position: "relative" },
  cover:         { width: "100%", height: 120 },
  editCoverBtn:  { position: "absolute", bottom: 10, left: 10, backgroundColor: AppColors.overlay, borderRadius: 14, padding: 7 },
  avatarRow:     { flexDirection: "row-reverse", alignItems: "flex-start", gap: 14, padding: 16 },
  avatarWrap:    { position: "relative" },
  avatar:        { width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: AppColors.white },
  editAvatarBtn: { position: "absolute", bottom: 0, left: 0, backgroundColor: ORANGE, borderRadius: 10, padding: 5, borderWidth: 2, borderColor: AppColors.white },
  storeNameRow:  { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  storeName:     { fontFamily: FontFamily.cairoBold, fontSize: 20, color: AppColors.gray800, flex: 1, textAlign: "right" },
  editIconBox:   { width: 26, height: 26, borderRadius: 8, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  bizType:       { fontFamily: FontFamily.tajawal, fontSize: 13, textAlign: "right" },
  statusBadge:   { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, alignSelf: "flex-end" },
  statusText:    { fontFamily: FontFamily.cairoBold, fontSize: 11 },
  bioRow:        { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingBottom: 14 },
  bioText:       { flex: 1, fontFamily: FontFamily.tajawal, fontSize: 13, textAlign: "right", lineHeight: 20 },
  addrRow:       { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingBottom: 14 },
  addrText:      { fontFamily: FontFamily.tajawal, fontSize: 12, textAlign: "right" },
});

const md = StyleSheet.create({
  input:       { borderWidth: 1.5, borderRadius: 14, padding: 13, fontFamily: FontFamily.tajawal, fontSize: 16, textAlign: "right" },
  textArea:    { minHeight: 100, textAlignVertical: "top" },
  fieldLabel:  { fontFamily: FontFamily.cairoBold, fontSize: 12, color: AppColors.gray500, textAlign: "right", marginBottom: 6 },
  btns:        { flexDirection: "row-reverse", gap: 10 },
  btn:         { flex: 1, borderRadius: 14, paddingVertical: 13, alignItems: "center" },
  btnText:     { fontFamily: FontFamily.cairoBold, fontSize: 14, color: AppColors.white },
  toggleRow:   { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingVertical: 6 },
  toggle:      { width: 44, height: 26, borderRadius: 13, position: "relative" },
  toggleThumb: { position: "absolute", top: 3, width: 20, height: 20, borderRadius: 10, backgroundColor: AppColors.white, shadowColor: AppColors.black, shadowOpacity: 0.2, shadowRadius: 2, elevation: 2 },
  toggleLabel: { fontFamily: FontFamily.cairoBold, fontSize: 13, color: AppColors.gray700 },
  daysRow:     { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  dayBtn:      { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1.5, borderColor: AppColors.divider },
  dayText:     { fontFamily: FontFamily.cairoBold, fontSize: 11, color: AppColors.gray500 },
});
