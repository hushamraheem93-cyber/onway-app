/**
 * AdminFinanceTab — surfaces the financial & analytics endpoints that the
 * in-app admin panel never rendered before (they existed only on the server,
 * and partly in the standalone web panel). Self-contained: one screen with
 * internal sub-tabs, so it plugs into AdminScreen via a single <AdminFinanceTab/>.
 *
 * All calls hit /api/admin/* with credentials:"include" (session cookie), the
 * same auth every other admin call in AdminScreen uses. Read-only except the
 * driver recharge/adjustment actions, which reuse the existing endpoints.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, ScrollView, Pressable, ActivityIndicator, TextInput, Alert,
  StyleSheet,
} from "react-native";
import { getApiUrl } from "@/lib/query-client";

const C = {
  bg: "#0f1115",
  card: "#171a21",
  card2: "#1e222b",
  border: "#2a2f3a",
  text: "#e8eaed",
  sub: "#9aa0aa",
  brand: "#FB5B21",
  green: "#22c55e",
  red: "#ef4444",
  amber: "#f59e0b",
  blue: "#3b82f6",
};

const money = (n: any) => `${Math.round(Number(n) || 0).toLocaleString("en-US")} د.ع`;
const num = (n: any) => `${Math.round(Number(n) || 0).toLocaleString("en-US")}`;

async function adminGet(path: string): Promise<any> {
  const res = await fetch(`${getApiUrl()}${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}
async function adminPost(path: string, body: any): Promise<any> {
  const res = await fetch(`${getApiUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `${res.status}`);
  return data;
}

type Sub =
  | "revenue" | "dashboard" | "ops" | "drivers"
  | "movements" | "analytics" | "ranking";

const SUBS: { key: Sub; label: string }[] = [
  { key: "revenue", label: "الإيرادات" },
  { key: "dashboard", label: "لوحة موسّعة" },
  { key: "ops", label: "التشغيل" },
  { key: "drivers", label: "كشوف السائقين" },
  { key: "movements", label: "سجلّ الحركات" },
  { key: "analytics", label: "التحليلات" },
  { key: "ranking", label: "الترتيب والتقييم" },
];

// ── small building blocks ─────────────────────────────────────────────────
function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}
function Loading() {
  return <ActivityIndicator color={C.brand} style={{ marginVertical: 24 }} />;
}
function ErrorLine({ msg }: { msg: string }) {
  return <Text style={styles.error}>تعذّر التحميل: {msg}</Text>;
}

// Generic lazy loader hook for a GET endpoint.
function useLazy<T = any>(path: string | null, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const reload = useCallback(() => {
    if (!path) return;
    setLoading(true); setErr(null);
    adminGet(path).then(setData).catch((e) => setErr(e.message)).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, deps);
  return { data, loading, err, reload };
}

// ── Revenue (financial-reports) ───────────────────────────────────────────
function RevenuePanel() {
  const [period, setPeriod] = useState<"today" | "week" | "month">("month");
  const { data, loading, err } = useLazy(`/api/admin/financial-reports?period=${period}`, [period]);
  return (
    <View>
      <View style={styles.pills}>
        {(["today", "week", "month"] as const).map((p) => (
          <Pressable key={p} onPress={() => setPeriod(p)}
            style={[styles.pill, period === p && styles.pillActive]}>
            <Text style={[styles.pillText, period === p && styles.pillTextActive]}>
              {p === "today" ? "اليوم" : p === "week" ? "الأسبوع" : "الشهر"}
            </Text>
          </Pressable>
        ))}
      </View>
      {loading ? <Loading /> : err ? <ErrorLine msg={err} /> : data ? (
        <>
          <View style={styles.statRow}>
            <Stat label="إجمالي الإيراد" value={money(data.totalRevenue)} />
            <Stat label="ربح المنصّة" value={money(data.onwayProfit)} color={C.green} />
            <Stat label="أرباح السائقين" value={money(data.totalDriverEarnings)} color={C.blue} />
            <Stat label="عدد الطلبات" value={num(data.totalOrders)} />
          </View>
          <Section title="أعلى المتاجر إيراداً">
            {(data.vendorBreakdown || []).slice(0, 15).map((v: any) => (
              <View key={v.vendorId} style={styles.row}>
                <Text style={styles.rowName} numberOfLines={1}>{v.vendorName}</Text>
                <Text style={styles.rowVal}>{money(v.revenue)}</Text>
                <Text style={[styles.rowSub, { color: C.green }]}>عمولة {money(v.commission)}</Text>
              </View>
            ))}
            {(!data.vendorBreakdown || data.vendorBreakdown.length === 0) && <Text style={styles.empty}>لا بيانات</Text>}
          </Section>
          <Section title="المبيعات اليومية (آخر 30 يوماً)">
            {(data.dailySales || []).slice().reverse().map((d: any) => (
              <View key={d.date} style={styles.row}>
                <Text style={styles.rowName}>{d.date}</Text>
                <Text style={styles.rowVal}>{money(d.revenue)}</Text>
                <Text style={styles.rowSub}>{num(d.orders)} طلب</Text>
              </View>
            ))}
          </Section>
        </>
      ) : null}
    </View>
  );
}

// ── Expanded dashboard (dashboard-stats) ──────────────────────────────────
function DashboardPanel() {
  const { data, loading, err } = useLazy(`/api/admin/dashboard-stats`);
  if (loading) return <Loading />;
  if (err) return <ErrorLine msg={err} />;
  if (!data) return null;
  const o = data.orders || {}; const r = data.revenue || {}; const dr = data.drivers || {}; const ve = data.vendors || {};
  return (
    <View>
      <Section title="الطلبات">
        <View style={styles.statRow}>
          <Stat label="اليوم" value={num(o.today)} />
          <Stat label="الأسبوع" value={num(o.week)} />
          <Stat label="الشهر" value={num(o.month)} />
          <Stat label="نشطة" value={num(o.active)} color={C.amber} />
        </View>
      </Section>
      <Section title="الإيراد">
        <View style={styles.statRow}>
          <Stat label="اليوم" value={money(r.today)} />
          <Stat label="الأسبوع" value={money(r.week)} />
          <Stat label="الشهر" value={money(r.month)} color={C.green} />
        </View>
      </Section>
      <Section title="المنظومة">
        <View style={styles.statRow}>
          <Stat label="المستخدمون" value={num(data.users)} />
          <Stat label="السائقون" value={num(dr.total ?? dr)} />
          <Stat label="المتاجر" value={num(ve.total ?? ve)} />
          <Stat label="المنتجات" value={num(data.products)} />
        </View>
      </Section>
      {Array.isArray(data.topVendors) && data.topVendors.length > 0 && (
        <Section title="أفضل المتاجر">
          {data.topVendors.map((v: any, i: number) => (
            <View key={i} style={styles.row}>
              <Text style={styles.rowName} numberOfLines={1}>{v.name || v.storeName || v.vendorName || "—"}</Text>
              <Text style={styles.rowVal}>{v.orders != null ? `${num(v.orders)} طلب` : money(v.revenue)}</Text>
            </View>
          ))}
        </Section>
      )}
    </View>
  );
}

// ── Operations (operations) ───────────────────────────────────────────────
function OpsPanel() {
  const { data, loading, err, reload } = useLazy(`/api/admin/operations`);
  if (loading) return <Loading />;
  if (err) return <ErrorLine msg={err} />;
  if (!data) return null;
  return (
    <View>
      <Pressable onPress={reload} style={styles.refresh}><Text style={styles.refreshText}>↻ تحديث</Text></Pressable>
      <View style={styles.statRow}>
        <Stat label="طلبات جديدة" value={num(data.newOrders)} color={C.brand} />
        <Stat label="قيد التحضير" value={num(data.preparingOrders)} color={C.amber} />
        <Stat label="قيد التوصيل" value={num(data.inDelivery)} color={C.blue} />
        <Stat label="سائقون متصلون" value={num(data.onlineDrivers)} color={C.green} />
      </View>
      <View style={styles.statRow}>
        <Stat label="دفعات نشطة" value={num(data.activeBatches)} />
        <Stat label="طلبات متأخرة" value={num(data.lateOrders)} color={C.red} />
        <Stat label="مشاكل" value={num(data.issues)} color={C.red} />
      </View>
      {Array.isArray(data.lateOrdersList) && data.lateOrdersList.length > 0 && (
        <Section title="طلبات متأخرة">
          {data.lateOrdersList.map((o: any, i: number) => (
            <View key={i} style={styles.row}>
              <Text style={styles.rowName}>#{String(o.id || o.orderId || "").slice(-6).toUpperCase()}</Text>
              <Text style={styles.rowSub}>{o.status}</Text>
            </View>
          ))}
        </Section>
      )}
    </View>
  );
}

// ── Driver statements (driver-financial + statement + yearly + actions) ────
function DriversPanel() {
  const { data, loading, err, reload } = useLazy(`/api/admin/driver-financial`);
  const [sel, setSel] = useState<{ phone: string; name: string } | null>(null);
  if (sel) return <DriverDetail phone={sel.phone} name={sel.name} onBack={() => { setSel(null); reload(); }} />;
  if (loading) return <Loading />;
  if (err) return <ErrorLine msg={err} />;
  const accounts = data?.accounts || [];
  return (
    <View>
      {accounts.length === 0 && <Text style={styles.empty}>لا سائقين</Text>}
      {accounts.map((a: any) => {
        const acc = a.account || {}; const st = a.stats || {}; const d = a.driver || {};
        return (
          <Pressable key={d.phoneNumber} onPress={() => setSel({ phone: d.phoneNumber, name: d.fullName || d.phoneNumber })}
            style={styles.driverCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowName}>{d.fullName || d.phoneNumber}</Text>
              <Text style={styles.rowSub}>{d.phoneNumber} · {num(st.totalOrders)} طلب</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={[styles.rowVal, { color: acc.amountOwed > 0 ? C.red : C.green }]}>مستحق: {money(acc.amountOwed)}</Text>
              <Text style={styles.rowSub}>أرباحه {money(acc.totalEarnings)}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function DriverDetail({ phone, name, onBack }: { phone: string; name: string; onBack: () => void }) {
  const stmt = useLazy(`/api/admin/driver-financial/${encodeURIComponent(phone)}/statement`, [phone]);
  const chart = useLazy(`/api/admin/driver-financial/${encodeURIComponent(phone)}/yearly-chart`, [phone]);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const doAction = async (kind: "recharge" | "add" | "deduct") => {
    const amt = Number(amount);
    if (!amt || amt <= 0) { Alert.alert("خطأ", "أدخل مبلغاً صحيحاً"); return; }
    setBusy(true);
    try {
      if (kind === "recharge") {
        await adminPost(`/api/admin/driver-wallet/recharge`, { phoneNumber: phone, amount: amt, notes: "دفعة من الإدارة", adminName: "admin" });
      } else {
        await adminPost(`/api/admin/driver-wallet/adjustment`, { phoneNumber: phone, amount: amt, type: kind, notes: "تعديل يدوي", adminName: "admin" });
      }
      setAmount("");
      Alert.alert("تم", "تمّت العملية بنجاح");
      stmt.reload();
    } catch (e: any) {
      Alert.alert("فشل", e.message);
    } finally { setBusy(false); }
  };

  const acc = stmt.data?.account || {};
  const maxMonth = Math.max(1, ...(chart.data?.months || []).map((m: any) => m.earnings || 0));
  return (
    <View>
      <Pressable onPress={onBack} style={styles.back}><Text style={styles.backText}>‹ رجوع</Text></Pressable>
      <Text style={styles.detailTitle}>{name}</Text>

      {stmt.loading ? <Loading /> : stmt.err ? <ErrorLine msg={stmt.err} /> : (
        <View style={styles.statRow}>
          <Stat label="مستحق للمنصّة" value={money(acc.amountOwed)} color={acc.amountOwed > 0 ? C.red : C.green} />
          <Stat label="أرباحه" value={money(acc.totalEarnings)} />
          <Stat label="عمولة المنصّة" value={money(acc.totalOnwayCommission)} />
          <Stat label="المدفوع" value={money(acc.totalPaid)} color={C.green} />
        </View>
      )}

      <Section title="تسجيل دفعة / تعديل الرصيد">
        <TextInput value={amount} onChangeText={setAmount} keyboardType="numeric"
          placeholder="المبلغ (د.ع)" placeholderTextColor={C.sub} style={styles.input} />
        <View style={styles.actionRow}>
          <Pressable disabled={busy} onPress={() => doAction("recharge")} style={[styles.actionBtn, { backgroundColor: C.green }]}>
            <Text style={styles.actionText}>تسجيل دفعة</Text></Pressable>
          <Pressable disabled={busy} onPress={() => doAction("add")} style={[styles.actionBtn, { backgroundColor: C.amber }]}>
            <Text style={styles.actionText}>إضافة للمستحق</Text></Pressable>
          <Pressable disabled={busy} onPress={() => doAction("deduct")} style={[styles.actionBtn, { backgroundColor: C.red }]}>
            <Text style={styles.actionText}>خصم</Text></Pressable>
        </View>
      </Section>

      <Section title="الرسم السنوي (آخر 12 شهراً)">
        {chart.loading ? <Loading /> : (chart.data?.months || []).map((m: any, i: number) => (
          <View key={i} style={styles.barRow}>
            <Text style={styles.barLabel}>{m.label}</Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${Math.round((m.earnings / maxMonth) * 100)}%` }]} />
            </View>
            <Text style={styles.barVal}>{money(m.earnings)}</Text>
          </View>
        ))}
      </Section>

      <Section title="كشف الحركات">
        {(stmt.data?.transactions || []).slice(0, 40).map((t: any, i: number) => (
          <View key={i} style={styles.row}>
            <Text style={styles.rowName}>{t.type === "payment" ? "دفعة" : `طلب #${String(t.orderId || "").slice(-6).toUpperCase()}`}</Text>
            <Text style={[styles.rowVal, { color: t.type === "payment" ? C.green : C.text }]}>
              {t.type === "payment" ? money(t.amount) : money(t.driverEarning)}
            </Text>
            <Text style={styles.rowSub}>{(t.timestamp || "").toString().slice(0, 10)}</Text>
          </View>
        ))}
        {(!stmt.data?.transactions || stmt.data.transactions.length === 0) && <Text style={styles.empty}>لا حركات</Text>}
      </Section>
    </View>
  );
}

// ── Movements (wallet-transactions) ───────────────────────────────────────
function MovementsPanel() {
  const [type, setType] = useState<"driver" | "vendor">("driver");
  const { data, loading, err } = useLazy(`/api/admin/wallet-transactions?accountType=${type}&limit=200`, [type]);
  return (
    <View>
      <View style={styles.pills}>
        {(["driver", "vendor"] as const).map((t) => (
          <Pressable key={t} onPress={() => setType(t)} style={[styles.pill, type === t && styles.pillActive]}>
            <Text style={[styles.pillText, type === t && styles.pillTextActive]}>{t === "driver" ? "السائقون" : "المتاجر"}</Text>
          </Pressable>
        ))}
      </View>
      {loading ? <Loading /> : err ? <ErrorLine msg={err} /> : (
        <>
          {(data?.transactions || []).map((t: any) => (
            <View key={t.id} style={styles.row}>
              <Text style={styles.rowName} numberOfLines={1}>{t.accountName || t.accountId} · #{String(t.orderId || "").slice(-6).toUpperCase()}</Text>
              <Text style={styles.rowVal}>{money(t.grossAmount ?? t.commission)}</Text>
              <Text style={[styles.rowSub, { color: t.status === "settled" ? C.green : C.amber }]}>
                {t.status === "settled" ? "مسوّى" : "مستحق"}
              </Text>
            </View>
          ))}
          {(!data?.transactions || data.transactions.length === 0) && <Text style={styles.empty}>لا حركات</Text>}
        </>
      )}
    </View>
  );
}

// ── Analytics (analytics) ─────────────────────────────────────────────────
function AnalyticsPanel() {
  const [days, setDays] = useState(30);
  const { data, loading, err } = useLazy(`/api/admin/analytics?days=${days}`, [days]);
  return (
    <View>
      <View style={styles.pills}>
        {[7, 30, 90].map((d) => (
          <Pressable key={d} onPress={() => setDays(d)} style={[styles.pill, days === d && styles.pillActive]}>
            <Text style={[styles.pillText, days === d && styles.pillTextActive]}>{d} يوم</Text>
          </Pressable>
        ))}
      </View>
      {loading ? <Loading /> : err ? <ErrorLine msg={err} /> : data ? (
        <>
          <View style={styles.statRow}>
            <Stat label="الطلبات" value={num(data.totalOrders)} />
            <Stat label="الإيراد" value={money(data.totalRevenue)} color={C.green} />
            <Stat label="متوسط الطلب" value={money(data.avgOrderValue)} />
            <Stat label="مستخدمون جدد" value={num(data.newUsers)} color={C.blue} />
          </View>
          <Stat label="نسبة التسليم" value={`${Math.round((data.deliveredRate || 0))}%`} />
          {Array.isArray(data.topCategories) && data.topCategories.length > 0 && (
            <Section title="أعلى الأقسام">
              {data.topCategories.map((c: any, i: number) => (
                <View key={i} style={styles.row}>
                  <Text style={styles.rowName}>{c.category || c.name}</Text>
                  <Text style={styles.rowVal}>{num(c.count ?? c.orders)}</Text>
                </View>
              ))}
            </Section>
          )}
        </>
      ) : null}
    </View>
  );
}

// ── Ranking & ratings (store-ranking + ratings-dashboard + notification-stats) ──
function RankingPanel() {
  const ratings = useLazy(`/api/admin/ratings-dashboard`);
  const notif = useLazy(`/api/admin/notification-stats`);
  return (
    <View>
      {notif.data && (
        <View style={styles.statRow}>
          <Stat label="إجمالي المستخدمين" value={num(notif.data.totalUsers)} />
          <Stat label="أجهزة الإشعارات" value={num(notif.data.tokensCount)} color={C.blue} />
        </View>
      )}
      {ratings.loading ? <Loading /> : ratings.err ? <ErrorLine msg={ratings.err} /> : ratings.data ? (
        <>
          <Section title="أفضل المتاجر تقييماً">
            {(ratings.data.topStores || []).map((s: any) => (
              <View key={s.id} style={styles.row}>
                <Text style={styles.rowName} numberOfLines={1}>{s.storeName}</Text>
                <Text style={[styles.rowVal, { color: C.green }]}>★ {(s.rating ?? 0).toFixed(1)}</Text>
                <Text style={styles.rowSub}>{num(s.ratingCount)} تقييم</Text>
              </View>
            ))}
          </Section>
          <Section title="أقل المتاجر تقييماً">
            {(ratings.data.worstStores || []).map((s: any) => (
              <View key={s.id} style={styles.row}>
                <Text style={styles.rowName} numberOfLines={1}>{s.storeName}</Text>
                <Text style={[styles.rowVal, { color: C.red }]}>★ {(s.rating ?? 0).toFixed(1)}</Text>
                <Text style={styles.rowSub}>{num(s.ratingCount)} تقييم</Text>
              </View>
            ))}
          </Section>
        </>
      ) : null}
    </View>
  );
}

export function AdminFinanceTab() {
  const [sub, setSub] = useState<Sub>("revenue");
  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.subBar} contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}>
        {SUBS.map((s) => (
          <Pressable key={s.key} onPress={() => setSub(s.key)} style={[styles.subTab, sub === s.key && styles.subTabActive]}>
            <Text style={[styles.subTabText, sub === s.key && styles.subTabTextActive]}>{s.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, paddingBottom: 60 }}>
        {sub === "revenue" && <RevenuePanel />}
        {sub === "dashboard" && <DashboardPanel />}
        {sub === "ops" && <OpsPanel />}
        {sub === "drivers" && <DriversPanel />}
        {sub === "movements" && <MovementsPanel />}
        {sub === "analytics" && <AnalyticsPanel />}
        {sub === "ranking" && <RankingPanel />}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  subBar: { flexGrow: 0, paddingVertical: 10 },
  subTab: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  subTabActive: { backgroundColor: C.brand, borderColor: C.brand },
  subTabText: { color: C.sub, fontFamily: "Cairo_600SemiBold", fontSize: 13 },
  subTabTextActive: { color: "#fff" },
  statRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  stat: { flexGrow: 1, minWidth: 90, backgroundColor: C.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.border },
  statValue: { color: C.text, fontFamily: "Cairo_700Bold", fontSize: 16 },
  statLabel: { color: C.sub, fontFamily: "Cairo_400Regular", fontSize: 11, marginTop: 2 },
  section: { marginTop: 14 },
  sectionTitle: { color: C.text, fontFamily: "Cairo_700Bold", fontSize: 14, marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  rowName: { color: C.text, fontFamily: "Cairo_600SemiBold", fontSize: 13, flex: 1 },
  rowVal: { color: C.text, fontFamily: "Cairo_700Bold", fontSize: 13 },
  rowSub: { color: C.sub, fontFamily: "Cairo_400Regular", fontSize: 11 },
  empty: { color: C.sub, fontFamily: "Cairo_400Regular", fontSize: 13, textAlign: "center", paddingVertical: 16 },
  error: { color: C.red, fontFamily: "Cairo_400Regular", fontSize: 13, textAlign: "center", paddingVertical: 16 },
  pills: { flexDirection: "row", gap: 8, marginBottom: 12 },
  pill: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  pillActive: { backgroundColor: C.brand, borderColor: C.brand },
  pillText: { color: C.sub, fontFamily: "Cairo_600SemiBold", fontSize: 12 },
  pillTextActive: { color: "#fff" },
  driverCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.card, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.border },
  refresh: { alignSelf: "flex-end", paddingVertical: 4, paddingHorizontal: 10, marginBottom: 8 },
  refreshText: { color: C.brand, fontFamily: "Cairo_600SemiBold", fontSize: 12 },
  back: { alignSelf: "flex-start", paddingVertical: 6, paddingHorizontal: 4, marginBottom: 4 },
  backText: { color: C.brand, fontFamily: "Cairo_700Bold", fontSize: 14 },
  detailTitle: { color: C.text, fontFamily: "Cairo_700Bold", fontSize: 18, marginBottom: 12 },
  input: { backgroundColor: C.card2, borderRadius: 10, borderWidth: 1, borderColor: C.border, color: C.text, paddingHorizontal: 12, paddingVertical: 10, fontFamily: "Cairo_400Regular", marginBottom: 8, textAlign: "right" },
  actionRow: { flexDirection: "row", gap: 8 },
  actionBtn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  actionText: { color: "#fff", fontFamily: "Cairo_700Bold", fontSize: 12 },
  barRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  barLabel: { color: C.sub, fontFamily: "Cairo_400Regular", fontSize: 10, width: 64 },
  barTrack: { flex: 1, height: 10, backgroundColor: C.card2, borderRadius: 6, overflow: "hidden" },
  barFill: { height: 10, backgroundColor: C.brand, borderRadius: 6 },
  barVal: { color: C.text, fontFamily: "Cairo_400Regular", fontSize: 10, width: 80, textAlign: "left" },
});
