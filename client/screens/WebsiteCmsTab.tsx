/**
 * WebsiteCmsTab — قسم إدارة محتوى الموقع التعريفي
 * يُستخدم داخل لوحة إدارة OnWay كتبويب مستقل.
 * يخزّن الصور في Firebase Storage والنصوص في Firestore
 * عبر /api/admin/website-cms/* endpoints.
 */
import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  Switch,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { AppColors, Spacing, BorderRadius } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";

// ── Color token ──────────────────────────────────────────────────────────────
const RED = AppColors.error;
const GRAY = AppColors.gray100;
const GRAY500 = AppColors.gray500;
const WHITE = AppColors.white;

// ── Section definitions ───────────────────────────────────────────────────────
type SectionKey =
  | "hero"
  | "features"
  | "stats"
  | "faq"
  | "downloadLinks"
  | "screenshots"
  | "contact"
  | "seo";

const SECTIONS: {
  key: SectionKey;
  label: string;
  icon: keyof typeof Feather.glyphMap;
}[] = [
  { key: "hero", label: "الرئيسية", icon: "home" },
  { key: "features", label: "المميزات", icon: "star" },
  { key: "stats", label: "الإحصائيات", icon: "bar-chart-2" },
  { key: "faq", label: "الأسئلة", icon: "help-circle" },
  { key: "downloadLinks", label: "روابط التحميل", icon: "download" },
  { key: "screenshots", label: "لقطات الشاشة", icon: "camera" },
  { key: "contact", label: "التواصل", icon: "phone" },
  { key: "seo", label: "SEO", icon: "search" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function adminFetch(path: string, opts: RequestInit = {}) {
  return fetch(`${getApiUrl()}${path}`, { credentials: "include", ...opts });
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

/**
 * The reason the server gave for a failed response (H-31).
 *
 * Every handler here used to show one generic "فشل في الحفظ", throwing away
 * messages the admin needs: "غير مصرح" (the session expired), "طلب غير موثوق
 * المصدر" (CSRF), and — the one that actually blocks progress — the `fields`
 * list that PUT returns with 400, which names the field the schema rejected.
 * The body is read defensively: an error page from the reverse proxy is not JSON.
 */
async function serverError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => null)) as
    | { error?: unknown; fields?: unknown }
    | null;
  const reason =
    typeof data?.error === "string" && data.error.trim()
      ? data.error
      : "حاول مرة أخرى";
  const fields = Array.isArray(data?.fields)
    ? data.fields.filter((f) => typeof f === "string")
    : [];
  return fields.length ? `${reason}: ${fields.join("، ")}` : reason;
}

const CONNECTION_ERROR =
  "تعذّر الاتصال بالخادم، تحقّق من الإنترنت وحاول مجدداً";

// ── Sub-components ────────────────────────────────────────────────────────────

/** Labelled text input */
function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  keyboardType = "default",
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: "default" | "url" | "email-address" | "phone-pad";
}) {
  return (
    <View style={s.fieldWrap}>
      <ThemedText style={s.fieldLabel}>{label}</ThemedText>
      <TextInput
        style={[s.input, multiline && s.inputMulti]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? ""}
        placeholderTextColor={GRAY500}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        keyboardType={keyboardType}
        textAlign="right"
      />
    </View>
  );
}

/** Image upload row */
function ImageField({
  label,
  imageUrl,
  onUpload,
  onRemove,
  uploading,
}: {
  label: string;
  imageUrl: string;
  onUpload: () => void;
  onRemove: () => void;
  uploading: boolean;
}) {
  return (
    <View style={s.fieldWrap}>
      <ThemedText style={s.fieldLabel}>{label}</ThemedText>
      {imageUrl ? (
        <View style={s.imgPreviewWrap}>
          <Image
            source={{ uri: imageUrl }}
            style={s.imgPreview}
            contentFit="cover"
          />
          <Pressable style={s.imgRemoveBtn} onPress={onRemove}>
            <Feather name="trash-2" size={14} color={WHITE} />
          </Pressable>
        </View>
      ) : (
        <Pressable
          style={s.imgUploadBtn}
          onPress={onUpload}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator size="small" color={RED} />
          ) : (
            <>
              <Feather name="upload" size={16} color={RED} />
              <ThemedText style={s.imgUploadText}>رفع صورة</ThemedText>
            </>
          )}
        </Pressable>
      )}
    </View>
  );
}

/** Save button */
function SaveBtn({
  onPress,
  loading,
}: {
  onPress: () => void;
  loading: boolean;
}) {
  return (
    <Pressable
      style={[s.saveBtn, loading && { opacity: 0.6 }]}
      onPress={onPress}
      disabled={loading}
    >
      {loading ? (
        <ActivityIndicator size="small" color={WHITE} />
      ) : (
        <>
          <Feather name="save" size={16} color={WHITE} />
          <ThemedText style={s.saveBtnText}>حفظ التغييرات</ThemedText>
        </>
      )}
    </Pressable>
  );
}

/** Section card wrapper */
function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={s.card}>
      <ThemedText style={s.cardTitle}>{title}</ThemedText>
      {children}
    </View>
  );
}

// ── Section forms ─────────────────────────────────────────────────────────────

function HeroForm({ initial, onSaved }: { initial: any; onSaved: () => void }) {
  const [data, setData] = useState({
    title_ar: initial?.title_ar ?? "",
    subtitle_ar: initial?.subtitle_ar ?? "",
    ctaPrimary_ar: initial?.ctaPrimary_ar ?? "",
    ctaSecondary_ar: initial?.ctaSecondary_ar ?? "",
    heroImageUrl: initial?.heroImageUrl ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const set = (k: keyof typeof data) => (v: string) =>
    setData((d) => ({ ...d, [k]: v }));

  const pickAndUpload = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      quality: 0.9,
    });
    if (r.canceled || !r.assets?.[0]) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("image", {
        uri: r.assets[0].uri,
        type: "image/jpeg",
        name: "hero.jpg",
      } as any);
      form.append("field", "heroImageUrl");
      const res = await adminFetch("/api/admin/website-cms/hero/image", {
        method: "POST",
        body: form,
      });
      // H-31: res.json() ran BEFORE res.ok was checked, so an error page that is
      // not JSON (a 502 from the reverse proxy) threw before any message existed.
      if (!res.ok) {
        Alert.alert("خطأ", await serverError(res));
        return;
      }
      const json = await res.json();
      setData((d) => ({ ...d, heroImageUrl: json.url }));
    } catch {
      Alert.alert("خطأ", CONNECTION_ERROR);
    } finally {
      setUploading(false);
    }
  };

  const removeImage = async () => {
    // H-31: no try, no res.ok check — the image was cleared from the screen
    // whatever the server answered, so a refused delete looked like a success
    // and the picture stayed live on the public site.
    try {
      const res = await adminFetch("/api/admin/website-cms/image", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: data.heroImageUrl,
          section: "hero",
          field: "heroImageUrl",
        }),
      });
      if (!res.ok) {
        Alert.alert("خطأ", await serverError(res));
        return;
      }
      setData((d) => ({ ...d, heroImageUrl: "" }));
    } catch {
      Alert.alert("خطأ", CONNECTION_ERROR);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await adminFetch("/api/admin/website-cms/hero", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        Alert.alert("✓ تم الحفظ");
        onSaved();
      } else Alert.alert("خطأ", await serverError(res));
    } catch {
      // H-31: there was no catch at all, so a dropped connection rejected a
      // promise nothing awaits — the spinner stopped and the admin was told
      // nothing whatsoever.
      Alert.alert("خطأ", CONNECTION_ERROR);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="القسم الرئيسي (Hero)">
      <Field
        label="العنوان الرئيسي (عربي)"
        value={data.title_ar}
        onChangeText={set("title_ar")}
      />
      <Field
        label="الوصف"
        value={data.subtitle_ar}
        onChangeText={set("subtitle_ar")}
        multiline
      />
      <Field
        label="نص زر التحميل"
        value={data.ctaPrimary_ar}
        onChangeText={set("ctaPrimary_ar")}
      />
      <Field
        label="نص الزر الثانوي"
        value={data.ctaSecondary_ar}
        onChangeText={set("ctaSecondary_ar")}
      />
      <ImageField
        label="صورة Hero"
        imageUrl={data.heroImageUrl}
        onUpload={pickAndUpload}
        onRemove={removeImage}
        uploading={uploading}
      />
      <SaveBtn onPress={save} loading={saving} />
    </SectionCard>
  );
}

function FeaturesForm({
  initial,
  onSaved,
}: {
  initial: any;
  onSaved: () => void;
}) {
  type Item = {
    id: string;
    icon: string;
    title_ar: string;
    desc_ar: string;
    order: number;
  };
  const [items, setItems] = useState<Item[]>(
    Array.isArray(initial?.items)
      ? initial.items
      : [{ id: uid(), icon: "zap", title_ar: "", desc_ar: "", order: 1 }],
  );
  const [saving, setSaving] = useState(false);

  const addItem = () =>
    setItems((prev) => [
      ...prev,
      {
        id: uid(),
        icon: "star",
        title_ar: "",
        desc_ar: "",
        order: prev.length + 1,
      },
    ]);
  const removeItem = (id: string) =>
    setItems((prev) => prev.filter((i) => i.id !== id));
  const updateItem = (id: string, field: keyof Item, value: string) =>
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, [field]: value } : i)),
    );

  const save = async () => {
    setSaving(true);
    try {
      const res = await adminFetch("/api/admin/website-cms/features", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (res.ok) {
        Alert.alert("✓ تم الحفظ");
        onSaved();
      } else Alert.alert("خطأ", await serverError(res));
    } catch {
      // H-31: there was no catch at all, so a dropped connection rejected a
      // promise nothing awaits — the spinner stopped and the admin was told
      // nothing whatsoever.
      Alert.alert("خطأ", CONNECTION_ERROR);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="مميزات التطبيق">
      {items.map((item, i) => (
        <View key={item.id} style={s.listItem}>
          <View style={s.listItemHeader}>
            <ThemedText style={s.listItemNum}>ميزة {i + 1}</ThemedText>
            <Pressable onPress={() => removeItem(item.id)} style={s.removeBtn}>
              <Feather name="trash-2" size={14} color={AppColors.error} />
            </Pressable>
          </View>
          <Field
            label="الأيقونة (Feather icon name)"
            value={item.icon}
            onChangeText={(v) => updateItem(item.id, "icon", v)}
            placeholder="zap"
          />
          <Field
            label="العنوان (عربي)"
            value={item.title_ar}
            onChangeText={(v) => updateItem(item.id, "title_ar", v)}
          />
          <Field
            label="الوصف (عربي)"
            value={item.desc_ar}
            onChangeText={(v) => updateItem(item.id, "desc_ar", v)}
            multiline
          />
        </View>
      ))}
      <Pressable style={s.addBtn} onPress={addItem}>
        <Feather name="plus" size={15} color={RED} />
        <ThemedText style={s.addBtnText}>إضافة ميزة</ThemedText>
      </Pressable>
      <SaveBtn onPress={save} loading={saving} />
    </SectionCard>
  );
}

function StatsForm({
  initial,
  onSaved,
}: {
  initial: any;
  onSaved: () => void;
}) {
  const [data, setData] = useState({
    downloads: initial?.downloads ?? "",
    vendors: initial?.vendors ?? "",
    cities: initial?.cities ?? "",
    rating: initial?.rating ?? "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof data) => (v: string) =>
    setData((d) => ({ ...d, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await adminFetch("/api/admin/website-cms/stats", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        Alert.alert("✓ تم الحفظ");
        onSaved();
      } else Alert.alert("خطأ", await serverError(res));
    } catch {
      // H-31: there was no catch at all, so a dropped connection rejected a
      // promise nothing awaits — the spinner stopped and the admin was told
      // nothing whatsoever.
      Alert.alert("خطأ", CONNECTION_ERROR);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="الإحصائيات">
      <Field
        label="عدد التحميلات"
        value={data.downloads}
        onChangeText={set("downloads")}
        placeholder="50,000+"
      />
      <Field
        label="عدد المتاجر"
        value={data.vendors}
        onChangeText={set("vendors")}
        placeholder="200+"
      />
      <Field
        label="عدد المدن"
        value={data.cities}
        onChangeText={set("cities")}
        placeholder="5"
      />
      <Field
        label="التقييم"
        value={data.rating}
        onChangeText={set("rating")}
        placeholder="4.8"
      />
      <SaveBtn onPress={save} loading={saving} />
    </SectionCard>
  );
}

function FaqForm({ initial, onSaved }: { initial: any; onSaved: () => void }) {
  type Item = {
    id: string;
    question_ar: string;
    answer_ar: string;
    order: number;
  };
  const [items, setItems] = useState<Item[]>(
    Array.isArray(initial?.items)
      ? initial.items
      : [{ id: uid(), question_ar: "", answer_ar: "", order: 1 }],
  );
  const [saving, setSaving] = useState(false);

  const addItem = () =>
    setItems((prev) => [
      ...prev,
      { id: uid(), question_ar: "", answer_ar: "", order: prev.length + 1 },
    ]);
  const removeItem = (id: string) =>
    setItems((prev) => prev.filter((i) => i.id !== id));
  const update = (id: string, field: keyof Item, value: string) =>
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, [field]: value } : i)),
    );

  const save = async () => {
    setSaving(true);
    try {
      const res = await adminFetch("/api/admin/website-cms/faq", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (res.ok) {
        Alert.alert("✓ تم الحفظ");
        onSaved();
      } else Alert.alert("خطأ", await serverError(res));
    } catch {
      // H-31: there was no catch at all, so a dropped connection rejected a
      // promise nothing awaits — the spinner stopped and the admin was told
      // nothing whatsoever.
      Alert.alert("خطأ", CONNECTION_ERROR);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="الأسئلة الشائعة">
      {items.map((item, i) => (
        <View key={item.id} style={s.listItem}>
          <View style={s.listItemHeader}>
            <ThemedText style={s.listItemNum}>سؤال {i + 1}</ThemedText>
            <Pressable onPress={() => removeItem(item.id)} style={s.removeBtn}>
              <Feather name="trash-2" size={14} color={AppColors.error} />
            </Pressable>
          </View>
          <Field
            label="السؤال"
            value={item.question_ar}
            onChangeText={(v) => update(item.id, "question_ar", v)}
          />
          <Field
            label="الجواب"
            value={item.answer_ar}
            onChangeText={(v) => update(item.id, "answer_ar", v)}
            multiline
          />
        </View>
      ))}
      <Pressable style={s.addBtn} onPress={addItem}>
        <Feather name="plus" size={15} color={RED} />
        <ThemedText style={s.addBtnText}>إضافة سؤال</ThemedText>
      </Pressable>
      <SaveBtn onPress={save} loading={saving} />
    </SectionCard>
  );
}

function DownloadLinksForm({
  initial,
  onSaved,
}: {
  initial: any;
  onSaved: () => void;
}) {
  const [data, setData] = useState({
    appStoreUrl: initial?.appStoreUrl ?? "",
    playStoreUrl: initial?.playStoreUrl ?? "",
    appStoreEnabled: initial?.appStoreEnabled !== false,
    playStoreEnabled: initial?.playStoreEnabled !== false,
  });
  const [saving, setSaving] = useState(false);
  const setStr = (k: "appStoreUrl" | "playStoreUrl") => (v: string) =>
    setData((d) => ({ ...d, [k]: v }));
  const setBool = (k: "appStoreEnabled" | "playStoreEnabled") => (v: boolean) =>
    setData((d) => ({ ...d, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await adminFetch("/api/admin/website-cms/downloadLinks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        Alert.alert("✓ تم الحفظ");
        onSaved();
      } else Alert.alert("خطأ", await serverError(res));
    } catch {
      // H-31: there was no catch at all, so a dropped connection rejected a
      // promise nothing awaits — the spinner stopped and the admin was told
      // nothing whatsoever.
      Alert.alert("خطأ", CONNECTION_ERROR);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="روابط التحميل">
      <View style={s.switchRow}>
        <Switch
          value={data.appStoreEnabled}
          onValueChange={setBool("appStoreEnabled")}
          trackColor={{ true: RED }}
        />
        <ThemedText style={s.switchLabel}>App Store مفعّل</ThemedText>
      </View>
      <Field
        label="رابط App Store"
        value={data.appStoreUrl}
        onChangeText={setStr("appStoreUrl")}
        keyboardType="url"
        placeholder="https://apps.apple.com/..."
      />
      <View style={[s.switchRow, { marginTop: Spacing.md }]}>
        <Switch
          value={data.playStoreEnabled}
          onValueChange={setBool("playStoreEnabled")}
          trackColor={{ true: RED }}
        />
        <ThemedText style={s.switchLabel}>Google Play مفعّل</ThemedText>
      </View>
      <Field
        label="رابط Google Play"
        value={data.playStoreUrl}
        onChangeText={setStr("playStoreUrl")}
        keyboardType="url"
        placeholder="https://play.google.com/..."
      />
      <SaveBtn onPress={save} loading={saving} />
    </SectionCard>
  );
}

function ScreenshotsForm({
  initial,
  onSaved,
}: {
  initial: any;
  onSaved: () => void;
}) {
  const [images, setImages] = useState<string[]>(
    Array.isArray(initial?.images) ? initial.images : [],
  );
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const pickAndUpload = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      quality: 0.9,
      allowsMultipleSelection: true,
    });
    if (r.canceled || !r.assets?.length) return;
    setUploading(true);
    try {
      for (const asset of r.assets) {
        const form = new FormData();
        form.append("image", {
          uri: asset.uri,
          type: "image/jpeg",
          name: "screenshot.jpg",
        } as any);
        form.append("field", "temp");
        const res = await adminFetch(
          "/api/admin/website-cms/screenshots/image",
          { method: "POST", body: form },
        );
        // H-31: this had no `else` at all, so every rejected screenshot upload
        // was completely silent — the picker closed and nothing appeared.
        if (!res.ok) {
          Alert.alert("خطأ", await serverError(res));
          return;
        }
        const json = await res.json();
        setImages((prev) => [...prev, json.url]);
      }
    } catch {
      Alert.alert("خطأ", CONNECTION_ERROR);
    } finally {
      setUploading(false);
    }
  };

  const removeImage = async (url: string) => {
    // The optimistic removal stays — the grid should react instantly — but H-31
    // never rolled it back, so a refused delete removed the screenshot from the
    // admin's view while it kept serving on the public site.
    const previous = images;
    setImages((prev) => prev.filter((u) => u !== url));
    try {
      const res = await adminFetch("/api/admin/website-cms/image", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        setImages(previous);
        Alert.alert("خطأ", await serverError(res));
      }
    } catch {
      setImages(previous);
      Alert.alert("خطأ", CONNECTION_ERROR);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await adminFetch("/api/admin/website-cms/screenshots", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images }),
      });
      if (res.ok) {
        Alert.alert("✓ تم الحفظ");
        onSaved();
      } else Alert.alert("خطأ", await serverError(res));
    } catch {
      // H-31: there was no catch at all, so a dropped connection rejected a
      // promise nothing awaits — the spinner stopped and the admin was told
      // nothing whatsoever.
      Alert.alert("خطأ", CONNECTION_ERROR);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="لقطات الشاشة">
      <View style={s.screenshotGrid}>
        {images.map((url) => (
          <View key={url} style={s.screenshotItem}>
            <Image
              source={{ uri: url }}
              style={s.screenshotImg}
              contentFit="cover"
            />
            <Pressable style={s.imgRemoveBtn} onPress={() => removeImage(url)}>
              <Feather name="x" size={12} color={WHITE} />
            </Pressable>
          </View>
        ))}
        <Pressable
          style={s.screenshotAdd}
          onPress={pickAndUpload}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator size="small" color={RED} />
          ) : (
            <>
              <Feather name="plus" size={20} color={RED} />
              <ThemedText style={[s.addBtnText, { marginTop: 4 }]}>
                إضافة
              </ThemedText>
            </>
          )}
        </Pressable>
      </View>
      <SaveBtn onPress={save} loading={saving} />
    </SectionCard>
  );
}

function ContactForm({
  initial,
  onSaved,
}: {
  initial: any;
  onSaved: () => void;
}) {
  const [data, setData] = useState({
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    whatsapp: initial?.whatsapp ?? "",
    instagram: initial?.instagram ?? "",
    twitter: initial?.twitter ?? "",
    facebook: initial?.facebook ?? "",
    address_ar: initial?.address_ar ?? "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof data) => (v: string) =>
    setData((d) => ({ ...d, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await adminFetch("/api/admin/website-cms/contact", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        Alert.alert("✓ تم الحفظ");
        onSaved();
      } else Alert.alert("خطأ", await serverError(res));
    } catch {
      // H-31: there was no catch at all, so a dropped connection rejected a
      // promise nothing awaits — the spinner stopped and the admin was told
      // nothing whatsoever.
      Alert.alert("خطأ", CONNECTION_ERROR);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="معلومات التواصل">
      <Field
        label="البريد الإلكتروني"
        value={data.email}
        onChangeText={set("email")}
        keyboardType="email-address"
      />
      <Field
        label="رقم الهاتف"
        value={data.phone}
        onChangeText={set("phone")}
        keyboardType="phone-pad"
      />
      <Field
        label="واتساب"
        value={data.whatsapp}
        onChangeText={set("whatsapp")}
        keyboardType="phone-pad"
      />
      <Field
        label="إنستغرام (@username)"
        value={data.instagram}
        onChangeText={set("instagram")}
      />
      <Field
        label="تويتر/X (@username)"
        value={data.twitter}
        onChangeText={set("twitter")}
      />
      <Field
        label="فيسبوك (رابط الصفحة)"
        value={data.facebook}
        onChangeText={set("facebook")}
        keyboardType="url"
      />
      <Field
        label="العنوان"
        value={data.address_ar}
        onChangeText={set("address_ar")}
        multiline
      />
      <SaveBtn onPress={save} loading={saving} />
    </SectionCard>
  );
}

function SeoForm({ initial, onSaved }: { initial: any; onSaved: () => void }) {
  const [data, setData] = useState({
    title_ar: initial?.title_ar ?? "",
    description_ar: initial?.description_ar ?? "",
    keywords: initial?.keywords ?? "",
    ogImageUrl: initial?.ogImageUrl ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const set = (k: keyof typeof data) => (v: string) =>
    setData((d) => ({ ...d, [k]: v }));

  const pickAndUpload = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      quality: 0.9,
    });
    if (r.canceled || !r.assets?.[0]) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("image", {
        uri: r.assets[0].uri,
        type: "image/jpeg",
        name: "og.jpg",
      } as any);
      form.append("field", "ogImageUrl");
      const res = await adminFetch("/api/admin/website-cms/seo/image", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        Alert.alert("خطأ", await serverError(res));
        return;
      }
      const json = await res.json();
      setData((d) => ({ ...d, ogImageUrl: json.url }));
    } catch {
      Alert.alert("خطأ", CONNECTION_ERROR);
    } finally {
      setUploading(false);
    }
  };

  const removeOg = async () => {
    try {
      const res = await adminFetch("/api/admin/website-cms/image", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: data.ogImageUrl,
          section: "seo",
          field: "ogImageUrl",
        }),
      });
      if (!res.ok) {
        Alert.alert("خطأ", await serverError(res));
        return;
      }
      setData((d) => ({ ...d, ogImageUrl: "" }));
    } catch {
      Alert.alert("خطأ", CONNECTION_ERROR);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await adminFetch("/api/admin/website-cms/seo", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        Alert.alert("✓ تم الحفظ");
        onSaved();
      } else Alert.alert("خطأ", await serverError(res));
    } catch {
      // H-31: there was no catch at all, so a dropped connection rejected a
      // promise nothing awaits — the spinner stopped and the admin was told
      // nothing whatsoever.
      Alert.alert("خطأ", CONNECTION_ERROR);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="إعدادات SEO">
      <Field
        label="عنوان الصفحة (Title)"
        value={data.title_ar}
        onChangeText={set("title_ar")}
        placeholder="OnWay - أسرع خدمة توصيل في العراق"
      />
      <Field
        label="الوصف (Meta Description)"
        value={data.description_ar}
        onChangeText={set("description_ar")}
        multiline
        placeholder="وصف قصير يظهر في نتائج البحث..."
      />
      <Field
        label="الكلمات المفتاحية (Keywords)"
        value={data.keywords}
        onChangeText={set("keywords")}
        multiline
        placeholder="توصيل, طلبات, مطاعم, العراق"
      />
      <ImageField
        label="صورة المشاركة (OG Image — 1200×630)"
        imageUrl={data.ogImageUrl}
        onUpload={pickAndUpload}
        onRemove={removeOg}
        uploading={uploading}
      />
      <SaveBtn onPress={save} loading={saving} />
    </SectionCard>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function WebsiteCmsTab() {
  const [activeSection, setActiveSection] = useState<SectionKey>("hero");
  const [cmsData, setCmsData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // H-31: a failed load was silent and left cmsData empty, so every form
  // rendered blank — every field is `initial?.x ?? ""`. The admin read that as
  // "nothing is configured yet", pressed Save, and the all-empty payload was
  // accepted (the schema is .partial() and the write is { merge: true }),
  // wiping the live site's content. Loading now fails visibly instead, and the
  // forms are not rendered at all until real content is in hand.
  const fetchAll = useCallback(async () => {
    try {
      const res = await adminFetch("/api/admin/website-cms");
      if (!res.ok) {
        setLoadError(await serverError(res));
        return;
      }
      setCmsData(await res.json());
      setLoadError(null);
    } catch {
      setLoadError(CONNECTION_ERROR);
    } finally {
      setLoading(false);
    }
  }, []);

  // Manual retry only — no automatic retry anywhere in this screen.
  const retryLoad = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const onSaved = useCallback(() => {
    fetchAll();
  }, [fetchAll]);

  const renderLoadError = () => (
    <View style={s.card}>
      <View style={s.loadErrorTop}>
        <Feather name="wifi-off" size={20} color={RED} />
        <ThemedText style={s.cardTitle}>تعذّر تحميل محتوى الموقع</ThemedText>
      </View>
      <ThemedText style={s.fieldLabel}>{loadError}</ThemedText>
      <ThemedText style={s.loadErrorHint}>
        لم تُعرَض النماذج حتى لا يُحفَظ محتوى فارغ فوق المحتوى الحالي.
      </ThemedText>
      <Pressable style={s.saveBtn} onPress={retryLoad}>
        <Feather name="refresh-cw" size={16} color={WHITE} />
        <ThemedText style={s.saveBtnText}>إعادة المحاولة</ThemedText>
      </Pressable>
    </View>
  );

  const renderSection = () => {
    const d = cmsData[activeSection];
    switch (activeSection) {
      case "hero":
        return <HeroForm initial={d} onSaved={onSaved} />;
      case "features":
        return <FeaturesForm initial={d} onSaved={onSaved} />;
      case "stats":
        return <StatsForm initial={d} onSaved={onSaved} />;
      case "faq":
        return <FaqForm initial={d} onSaved={onSaved} />;
      case "downloadLinks":
        return <DownloadLinksForm initial={d} onSaved={onSaved} />;
      case "screenshots":
        return <ScreenshotsForm initial={d} onSaved={onSaved} />;
      case "contact":
        return <ContactForm initial={d} onSaved={onSaved} />;
      case "seo":
        return <SeoForm initial={d} onSaved={onSaved} />;
    }
  };

  return (
    <View style={s.root}>
      {/* Sub-navigation */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.subNav}
        contentContainerStyle={s.subNavContent}
      >
        {SECTIONS.map((sec) => {
          const active = sec.key === activeSection;
          return (
            <Pressable
              key={sec.key}
              style={[
                s.subNavItem,
                active && { borderBottomColor: RED, borderBottomWidth: 2 },
              ]}
              onPress={() => setActiveSection(sec.key)}
            >
              <Feather
                name={sec.icon}
                size={16}
                color={active ? RED : GRAY500}
              />
              <ThemedText
                style={[s.subNavLabel, { color: active ? RED : GRAY500 }]}
              >
                {sec.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Content */}
      <ScrollView
        style={s.content}
        contentContainerStyle={s.contentInner}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator
            size="large"
            color={RED}
            style={{ marginTop: 60 }}
          />
        ) : loadError ? (
          renderLoadError()
        ) : (
          renderSection()
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1 },
  subNav: { borderBottomWidth: 1, borderBottomColor: GRAY },
  subNavContent: {
    flexDirection: "row",
    paddingHorizontal: Spacing.sm,
    gap: 2,
  },
  subNavItem: {
    flexDirection: "column",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 3,
  },
  subNavLabel: { fontFamily: "Cairo_400Regular", fontSize: 11 },
  content: { flex: 1 },
  contentInner: { padding: Spacing.md, gap: Spacing.md },

  card: {
    backgroundColor: WHITE,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: 15,
    color: AppColors.gray800,
    textAlign: "right",
    marginBottom: 4,
  },

  // H-31 load-error state. Reuses the existing card, title and button styles;
  // only the icon row and the hint line are new.
  loadErrorTop: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
  },
  loadErrorHint: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    color: GRAY500,
    textAlign: "right",
    marginBottom: 4,
  },

  fieldWrap: { gap: 4 },
  fieldLabel: {
    fontFamily: "Cairo_400Regular",
    fontSize: 12,
    color: GRAY500,
    textAlign: "right",
  },
  input: {
    borderWidth: 1,
    borderColor: GRAY,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: "Tajawal_400Regular",
    fontSize: 14,
    color: AppColors.gray800,
    textAlignVertical: "top",
    backgroundColor: "#FAFAFA",
  },
  inputMulti: { minHeight: 80, paddingTop: 10 },

  imgPreviewWrap: {
    position: "relative",
    width: "100%",
    height: 160,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  imgPreview: { width: "100%", height: "100%" },
  imgRemoveBtn: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: AppColors.error,
    borderRadius: 20,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  imgUploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: RED,
    borderStyle: "dashed",
    borderRadius: BorderRadius.md,
    paddingVertical: 20,
    backgroundColor: RED + "08",
  },
  imgUploadText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: RED },

  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: RED,
    borderRadius: BorderRadius.md,
    paddingVertical: 13,
    marginTop: Spacing.sm,
  },
  saveBtnText: { fontFamily: "Cairo_700Bold", fontSize: 14, color: WHITE },

  listItem: {
    backgroundColor: GRAY + "80",
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  listItemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  listItemNum: {
    fontFamily: "Cairo_700Bold",
    fontSize: 13,
    color: AppColors.gray700,
  },
  removeBtn: { padding: 4 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: RED + "40",
    borderStyle: "dashed",
  },
  addBtnText: { fontFamily: "Cairo_400Regular", fontSize: 13, color: RED },

  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    justifyContent: "flex-end",
  },
  switchLabel: {
    fontFamily: "Cairo_400Regular",
    fontSize: 13,
    color: AppColors.gray700,
  },

  screenshotGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  screenshotItem: {
    width: 90,
    height: 160,
    borderRadius: 10,
    overflow: "hidden",
    position: "relative",
  },
  screenshotImg: { width: "100%", height: "100%" },
  screenshotAdd: {
    width: 90,
    height: 160,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: RED + "60",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: RED + "06",
  },
});
