import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

function assertHas(source, pattern, message) {
  assert.match(source, pattern, message);
}

test("shared screen states expose loading and retryable error contracts", async () => {
  const state = await read("client/components/ScreenState.tsx");
  const empty = await read("client/components/EmptyState.tsx");

  assertHas(state, /export function LoadingState/);
  assertHas(state, /accessibilityRole=\"progressbar\"/);
  assertHas(state, /export function ErrorState/);
  assertHas(state, /accessibilityRole=\"alert\"/);
  assertHas(state, /onRetry\?: \(\) => void/);
  assertHas(state, /إعادة المحاولة/);
  assertHas(empty, /export const EmptyState/);
});

test("customer orders never renders empty before the initial load completes", async () => {
  const source = await read("client/screens/OrdersScreen.tsx");
  assertHas(source, /import \{ LoadingState \} from \"@\/components\/ScreenState\"/);
  assertHas(source, /if \(isLoading \|\| !hasLoadedOrders\) \{[\s\S]*?جاري تحميل الطلبات/);
  assertHas(source, /<EmptyState/);
});

test("vendor analytics distinguishes loading, failed fetch and stale data", async () => {
  const source = await read("client/screens/VendorAnalyticsScreen.tsx");
  assertHas(source, /ErrorState, LoadingState/);
  assertHas(source, /isError && !data/);
  assertHas(source, /onRetry=\{\(\) => void refetch\(\)\}/);
});

test("driver orders uses shared loading, empty and retryable error states", async () => {
  const source = await read("client/screens/DriverOrdersScreen.tsx");
  assertHas(source, /import \{ EmptyState \} from \"@\/components\/EmptyState\"/);
  assertHas(source, /import \{ ErrorState, LoadingState \} from \"@\/components\/ScreenState\"/);
  assertHas(source, /<LoadingState[\s\S]*?جاري تحميل طلباتك/);
  assertHas(source, /<ErrorState[\s\S]*?onRetry/);
});

test("admin session gate has an explicit loading state", async () => {
  const source = await read("client/screens/AdminScreen.tsx");
  assertHas(source, /import \{ LoadingState \} from \"@\/components\/ScreenState\"/);
  assertHas(source, /adminAuthState === \"checking\"/);
  assertHas(source, /<LoadingState[\s\S]*?جاري التحقق من جلسة الإدارة/);
});

test("notifications separates loading, storage error and genuine empty", async () => {
  const context = await read("client/context/NotificationContext.tsx");
  const screen = await read("client/screens/NotificationsListScreen.tsx");
  assertHas(context, /loading: boolean/);
  assertHas(context, /error: boolean/);
  assertHas(context, /reloadNotifications/);
  assertHas(context, /setError\(true\)/);
  assertHas(screen, /ErrorState, LoadingState/);
  assertHas(screen, /if \(loading\)/);
  assertHas(screen, /if \(error\)/);
  assertHas(screen, /reloadNotifications/);
});

test("support chat exposes fetch failure and retry without changing send flow", async () => {
  const source = await read("client/screens/SupportChatScreen.tsx");
  assertHas(source, /ErrorState, LoadingState/);
  assertHas(source, /loadError/);
  assertHas(source, /failed to load support messages/);
  assertHas(source, /onRetry=\{\(\) => void fetchMessages\(\)\}/);
});

test("Sprint 5 state components do not add API endpoints or financial calculations", async () => {
  const state = await read("client/components/ScreenState.tsx");
  assert.doesNotMatch(state, /fetch\(|\/api\//);
  assert.doesNotMatch(state, /calculateCommission|settlementLedger|walletId\s*=|ledgerId\s*=/);
});
