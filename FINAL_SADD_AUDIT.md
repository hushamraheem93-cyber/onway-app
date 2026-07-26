# OnWay — Final Pre-Release Audit

**Date**: 2026-07-25 · **Mode**: READ-ONLY (no code, config or commits changed)
**Method**: 6 independent subagents across 18 domains, then cross-checked and
personally re-verified against the source before inclusion.

> **Note on the requested skill**: no `sadd` skill exists — not in the enabled
> skills, not in the marketplace, nothing similar. None was installed or
> substituted. The audit was performed with subagents, which you explicitly
> requested and which the task genuinely needs.
>
> The 18 domains were assigned to 6 specialized agents rather than 18. Eighteen
> cold-start agents would have re-read the same large files (`routes.ts` alone is
> 6,940 lines) many times over for no additional accuracy.

---

## 1. Executive Summary

**Verdict: ⛔ NOT READY FOR PRODUCTION.**

Six independent agents surfaced findings across every domain. I re-verified every
Critical and the most severe High findings myself by reading the exact lines —
several agent claims were dropped as false positives, and the ones below survived.

**6 Critical and 26 High issues remain confirmed.**

Three themes dominate, and all three are uncomfortable:

**a) Previously-fixed vulnerabilities came back.** The driver auth bypass (C1) is a
*regression*: a well-intentioned "fallback" was added after my earlier audit that
re-opens the exact takeover class that had been closed. Security fixes in this
repository are not currently protected by anything that would notice them being
undone.

**b) My own earlier fixes were incomplete or actively harmful.** This audit found
that:
- my XSS escaping pass **missed the entire support-chat module** (C4) — the most
  weaponizable sink in the dashboard;
- my settlement-loss fix **left a larger hole open** (C3) — I handled the write
  failing, not the case where the code never reaches the write;
- I gated `/api/reverse-geocode` and **never updated the caller** (H1), silently
  breaking address resolution for every customer and driver;
- the composite index I added for promo dedup **names a collection the code does
  not use** (`promoUsage` vs `promoUsageHistory`), so it protects nothing;
- I scored the website "SEO 9/9 PASS" having checked only the meta tags — **the
  page itself is the Expo Go developer preview** (H15).

**c) Money is provably wrong in more than one place.** Not "might be" — the
marketplace payout base (C2) demonstrably includes delivery and service fees.

**Nothing here should be read as "close to launch".** The order lifecycle still
has never been exercised end to end against real Firebase, which is how several of
these survived this long.

| Severity | Count |
|---|---|
| 🔴 Critical | **6** |
| 🟠 High | **26** |
| 🟡 Medium | **19** |
| 🟢 Low | **6** |
| ❌ False positives eliminated | **9** |

---

## 2. Remaining Critical Issues

### C1 — Driver account takeover (REGRESSION of a previously-fixed issue)
**File**: `server/routes.ts` — `POST /api/driver/mobile-auth`
**Confidence: High** (verified by reading the handler)

A fallback path was added after the original fix: when the customer JWT is
missing, expired, or belongs to a different phone, the handler looks up
`getDriverByPhone(phoneNumber)` and — if a driver record merely *exists* — mints a
30-day driver token anyway.

The in-code comment explains the intent (avoid locking drivers out when their
30-day customer JWT expires). The effect is that **proof of phone ownership is
optional**. Driver phone numbers are visible to customers in-app and appear in
order documents.

**Impact**: anyone who knows a driver's phone number gets full `/api/driver/*`
access — read that driver's wallet and settlement history, go online, accept
batches, read customer names, phones, addresses and live GPS, mark orders
delivered (writing debt onto the real driver's ledger), and spoof location. The
endpoint is not in the per-endpoint rate-limit table. Note `vendor.ts` has no such
fallback and its comment calls this pattern "account takeover".

### C2 — Vendor over-payout on every marketplace order (MONEY)
**File**: `server/routes.ts:3756`
**Confidence: High** (verified both order-creation paths)

```ts
const orderValue = (order as any).restaurantSubtotal ?? order.total ?? 0;
```

I confirmed that only the **legacy restaurant path** sets `restaurantSubtotal`
(and `vendorCommissionAmount`). The marketplace/`vendorProducts` fallback sets
`vendorId` and `vendorName` **only**. So for every marketplace order the payout
base silently becomes `order.total` — which includes `deliveryFee` and
`serviceFee`, and is net of `promoDiscount`.

**Impact**: OnWay credits the vendor ~90% of the delivery fee and service fee it
should have retained, and absorbs ~90% of every promo discount. The admin
statement endpoint computes the correct base separately, so the books and the
ledger disagree and reconciliation will not surface it.

### C3 — Settlement silently skipped, with no recovery (MONEY)
**File**: `server/routes.ts:3704-3722` · `server/firebase.ts:553`
**Confidence: High** (verified both code paths)

`earningsCredited: true` is committed in its own transaction **first**. The entire
money block then sits behind `if (order)`, where `order = await
getOrderById(orderId)` — and `getOrderById` catches every error and returns
`null`.

A transient Firestore read failure therefore skips settlement entirely. The
`settlementPending` marker I added lives *inside* that block, so **the recovery
sweep never sees the order**. The endpoint returns `{success:true}` and any retry
short-circuits to `alreadyCompleted:true`.

**This is a gap in my own earlier fix.** That fix handled `recordOrderSettlement`
failing; it did not handle never reaching it.

### C4 — Stored XSS in the admin support chat (MISSED by the earlier fix)
**File**: `server/templates/admin.html:9997-10170` (sinks at 10157, 10021, 10018, 10009, 10146, 10144)
**Confidence: High** (verified — zero escaping calls in the whole module)

`renderSupportMessages()` interpolates `${m.text || ''}` directly into
`innerHTML`; the chat list does the same with `lastMessage`, `userName` and
product `name`/`image`. **The module contains no `escapeHtml`/`escapeAttr` call at
all.** The data is written by any OTP-verified customer via `POST
/api/support/messages`.

**Impact**: a customer sends `<img src=x onerror="fetch('/api/admin/...',{method:'DELETE'})">`.
The moment an admin opens the Support tab it executes in the authenticated admin
session. The `/admin` CSP does not stop it — it includes `'unsafe-inline'` for
scripts and `connect-src 'self'` permits every admin endpoint.

**The earlier XSS pass fixed 9 sinks and missed this entire module.**

### C5 — Google admin sign-in accepts a token from *any* OAuth client
**File**: `server/index.ts:569-571`
**Confidence: High** (verified)

```ts
const expectedClientId = process.env.GOOGLE_CLIENT_ID;
if (expectedClientId && payload.aud !== expectedClientId) {   // ← gated on the var existing
  return res.status(401).json({ error: "توكن غير صالح" });
}
```

The audience check is **skipped entirely when `GOOGLE_CLIENT_ID` is unset**.
`ADMIN_GOOGLE_EMAIL` and `GOOGLE_CLIENT_ID` are independently optional in both
`.env.example` and `deployment/env-setup.sh`, so setting the allowed admin email
without the client id is a realistic misconfiguration.

**Impact**: with that combination, an ID token minted by **any** Google OAuth
client for the allowed email grants a full admin session. An attacker registers
their own OAuth app, signs in the target email (or uses any app that email has
authorised), and presents the token. Verifying `email` + `email_verified` without
verifying `aud` is the classic Google-token-confusion flaw.

### C6 — Order completion strands the order if anything throws after the flag
**File**: `server/routes.ts:3704-3718`
**Confidence: High**

Same root shape as C3 but a different consequence: the idempotency flag commits
before the status write, payout computation and bookkeeping. If anything after it
throws, the request 500s with the flag already set; the retry returns
`alreadyCompleted:true`.

**Impact**: the order is permanently stuck in `preparing` — never delivered, driver
never credited, and the batch never closes, so **the driver is blocked from
receiving any new batch**.

---

## 3. Remaining High Issues

| # | Issue | File | Impact | Conf. |
|---|---|---|---|---|
| H1 | **Three client calls omit the required JWT** — support chat (GET+POST), order cancel, reverse-geocode | `SupportChatScreen.tsx:226,274` · `OrderConfirmationScreen.tsx:80` · `lib/geocoding.ts:17` | Support chat, the 3-minute cancel window, and address resolution are **100% dead**. Customers and drivers see raw GPS coordinates instead of addresses. **The reverse-geocode break was introduced by my own hardening.** | High |
| H2 | Driver approval status never enforced | `routes.ts` `requireDriverAuth`, `toggle-online` | A `pending` or admin-**rejected** driver can go online and receive real batches with customer PII and cash. Rejecting a driver does not lock them out. | High |
| H3 | `ORDER_TRANSITIONS` has no `ready` key (**cross-confirmed by 2 agents**) | `firebase.ts:663-671` · `routes.ts:3675` | Vendor marks ready → driver taps "picked up" → transition silently blocked, but `pickedUpAt` is written, "on the way" is pushed to the customer, and success is returned. Order stuck at `ready`; tracking contradicts reality. | High |
| H4 | `serviceFee` trusted from the request body; no floor on total | `routes.ts:2110-2111` | `{serviceFee: -50000}` yields a near-zero/negative cash order. Free food, unbounded, inside the block whose own comment says never trust client prices. | High |
| H5 | Order `quantity` completely unvalidated | `routes.ts:2057` | Negative quantity = second free-order vector. `"1e999"` → `Infinity` propagates into the ledger and permanently poisons that account. | High |
| H6 | Driver endpoints don't verify the order belongs to the caller | `routes.ts:3462,3443,3627,3665` | Any authenticated driver can flip **any** order to `in_delivery` or `issue`. `batchId` is optional on two of them, so the guard is skippable. | High |
| H7 | Vendor status never re-checked after token issue | `vendor.ts:66-93,152-186` | Suspending a vendor for fraud does not cut them off — the 7-day token keeps working and `mobile-auth` mints fresh ones. Registration is unauthenticated. | High |
| H8 | Settlement events broadcast to **all** sockets | `routes.ts:6462-6468` | Anonymous sockets are permitted by design, so any client receives every driver's phone, name and outstanding balance in real time. | High |
| H9 | Customer phone numbers in public ratings endpoint | `routes.ts:5912,5966` | Unauthenticated bulk harvest of reviewer phone numbers correlated to stores. | High |
| H10 | `app_settings/admin_push` world-readable | `firestore.rules:92-95` | Admin push token is public; Expo's send API is unauthenticated → spoofed admin notifications. *(I flagged this previously as a recommendation and left it; an agent independently confirmed it is exploitable.)* | High |
| H11 | `vendorProducts` public and stores `vendorPhone` | `firestore.rules:74-77` | Bulk harvest of every store owner's personal number. No client SDK reads it, so it can be closed with zero feature loss. | High |
| H12 | Base64 images inside order documents; `limitImageSize` is a **no-op** | `routes.ts:2121-2129, 862-869` | Verified: every branch returns `img` unchanged. A cart of ~8-15 marketplace items pushes the order past Firestore's 1MB limit → checkout permanently fails for that cart. | High |
| H13 | Vendor product images still Base64, not Storage | `vendor.ts:99-111,459-481,622-644` | 5 images/product exceeds 1MB → vendor cannot save. Bloats every public catalog response. Stale "Storage not provisioned" comments — the bucket defect is now fixed. | High |
| H14 | Non-transactional money writes | `firebase.ts:2289-2360, 2363-2397` | `recordDriverPayment`/`recordDriverAdjustment` use read-modify-write while the sibling function correctly uses a transaction. Concurrent payment + settlement = lost update; the audit row still writes, so ledger and audit disagree. | High |
| H15 | `completeSettlement` has no idempotency key | `settlement.ts:427,477-484` | Admin double-tap or retry pays a settlement twice — a driver handing over 50,000 IQD gets 100,000 cleared. The settlement mirror of the already-fixed order double-credit. | High |
| H16 | `escapeHtml` used in a JS-string-in-attribute context | `admin.html:4632,4636,4640,4930,8445,8448` | `escapeHtml` does not escape quotes (the file's own comment says use `escapeAttr`). A driver named `x',alert(1),'` injects JS into `onclick`. | High |
| H17 | Merchant card escapes only single quotes | `admin.html:6790` | `.replace(/'/g,"\\'")` leaves `<`, `>`, `"` — full attribute break-out via store name. | High |
| H18 | **The public website is the Expo Go developer preview** | `landing-page.html:359-412` | Verified: headings are "Download Expo Go" / "Scan QR Code"; store links point to Expo Go, not OnWay. Yet it is `robots: index,follow` with Arabic consumer OG copy. Every visitor is told to install the wrong app. | High |
| H20 | **`pm2 reload` never re-reads `.env`** — a trap created by my own ecosystem fix | `ssl-setup.sh:43-52` · `update.sh:39` | Values are captured at `pm2 start`. `ssl-setup.sh` rewrites `ALLOWED_ORIGINS`, prints "Reloading PM2 to pick up new .env", and the process keeps the old value **forever**. The documented order starts PM2 *before* SSL, so `ALLOWED_ORIGINS` can be empty at start — and with fail-closed CORS every browser request 403s. Re-running the scripts does not fix it. | High |
| H21 | `update.sh` calls an undefined `warn` under `set -euo pipefail` | `deployment/update.sh:42` | Verified: `warn` is never defined. Whenever PM2 has no `onway` process, deploy pulls, builds, then exits 127 **before `pm2 start`** — the site stays down while the operator sees "Build complete". | High |
| H22 | Admin session revocation is process-local | `adminAuth.ts:30-31,61-64` | `invalidateAllSessions()` exists specifically so a leaked cookie dies on password reset. `JWT_SECRET` is unchanged, so after any restart — and `max_memory_restart` guarantees restarts — a stolen 7-day admin JWT verifies again. | High |
| H23 | **51 route-local `error.message` responses bypass the sanitizer** | `routes.ts` (51 sites) · `vendor.ts` (2) | Verified count. The hardened global handler never runs for these. Firestore internals leak to unauthenticated clients — project ids, collection names, index-creation URLs. H16's index error is the live example. | High |
| H24 | `driverRejectionCooldowns` never evicted | `routes.ts:719,3545,4705` | Nested Map grows with every rejection; the 3-minute cooldown is only read, never used to prune. Crosses `max_memory_restart: 512M` → PM2 restart wipes the driver queue mid-shift *and* resurrects revoked admin tokens (H22). | High |
| H25 | `driverCompletedOrders` in-memory cache grows forever and is pure redundancy | `routes.ts:714,3835` | The same record is already persisted and `getCompletedOrders()` dedupes against Firestore. ~180k retained objects/year at 500 deliveries/day. | High |
| H26 | 60-second cron scans all active orders with no `limit()` and no re-entrancy guard | `index.ts:853-855,919` | Sequential per-order vendor read + push + update. Once a run exceeds 60s, runs stack and re-read the same orders before the notified-marker is written → duplicate vendor pushes and multiplying Firestore load. | High |
| H19 | Upload endpoints accept non-image content | `routes.ts:76-79, 2566, 5458` | The disk `upload` has no `fileFilter`; client `Content-Type` is propagated. On the Storage-fallback path the file lands on the app's own origin under `Access-Control-Allow-Origin: *` → stored XSS on the app origin, outside the `/admin`-only CSP. | Med-High |

---

## 4. Remaining Medium Issues

| # | Issue | File |
|---|---|---|
| M1 | `assignWaitingBatchToDriver` has no lock — concurrent invocations create duplicate batches for the same orders; orphaned batches are invisible to the timeout sweep | `routes.ts:4472-4541` |
| M2 | `report-issue` bypasses the state machine → `delivered → issue → cancelled` on already-settled orders, with no ledger reversal | `routes.ts:3472, 5053` |
| M3 | `adminAdjustLedger` accepts `NaN` (`Math.abs(Math.round(NaN))`, and `NaN <= 0` is false) and writes it to the ledger permanently | `settlement.ts:718` |
| M4 | Order attribution spoofable — `POST /api/orders` never compares body `phoneNumber`/`userId` to the authenticated phone (every other customer route does) | `routes.ts:1950,2123` |
| M5 | Promo redemption is check-then-act across ~280 lines, with `.add()` and no deterministic id → single-use coupons redeemable twice | `routes.ts:1955,2234` |
| M6 | **The `promoUsage` composite index names a collection the code never uses** (`promoUsageHistory`). *My own index fix is inert.* | `firestore.indexes.json:62-69` |
| M7 | Missing composite index — vendor analytics (`vendorId ==`, `status ==`, `orderBy createdAt`) → `FAILED_PRECONDITION` on first production use | `vendor.ts:2097` |
| M8 | Missing index — `settlementPayments`; the FIFO repair pass is `try/catch`-swallowed so it **never runs** and interrupted payments stay unapplied forever | `settlement.ts:533` |
| M9 | Missing index — ratings "with photos" filter (inequality on a 4th field) → 500 on every store page | `routes.ts:5923` |
| M10 | `supportChats` messages array: non-atomic read-modify-write, no cap, unvalidated `imageUrl` → lost messages, and the thread bricks permanently past 1MB | `firebase.ts:1881-1941` |
| M11 | Vendor can write their **own** store rating (`updates.rating = Number(rating)`, unbounded) | `vendor.ts:415` |
| M12 | Website CMS tab is a complete no-op that reports success — nothing consumes `websiteContent` | `admin.html:11493` |
| M13 | Admin `confirmDelete` has no `else` on `response.ok`; product delete throws `ReferenceError` on three undefined identifiers | `admin.html:5450-5471, 5459-5464` |
| M15 | `uncaughtException` logged and swallowed — defeats PM2 crash recovery entirely | `index.ts:946` |
| M16 | N+1 on order creation: the same `vendorProducts` docs fetched twice, sequentially | `routes.ts:2013,2214` |
| M17 | `/api/admin/dashboard-stats` loads 5 entire collections into heap | `routes.ts:5661` |
| M18 | `nginx.conf` cannot load as documented — `listen 443 ssl` with every `ssl_certificate` commented out; contradicts `server-setup.sh` | `deployment/nginx.conf:36-44` |
| M19 | `esbuild`/`compression`/`jsonwebtoken` used in production but declared in neither dependency block; currently resolve only transitively via packages `npm ls` calls extraneous | `package.json` |
| M14 | Vendor notification poll resets `isFirstLoad` on every AppState change, absorbing pending orders **without** popup or alarm | `VendorNotificationsContext.tsx:111-121` |

---

## 5. Remaining Low Issues

| # | Issue | File |
|---|---|---|
| L1 | Driver GPS interval/socket can outlive "go offline" (async permission dialog races the effect cleanup) | `DriverHomeScreen.tsx:423-445, 457-488` |
| L2 | `OrderTrackingScreen` shows an indefinite loading state with no retry when the order isn't found | `OrderTrackingScreen.tsx:371` |
| L3 | `OrderConfirmationScreen` loading state has no back/retry and `headerBackVisible:false` | `OrderConfirmationScreen.tsx:57` |
| L4 | Vendor/admin save handlers show success on failure (orders list, product delete, zone toggle, banner/category/area) | `VendorOrdersScreen.tsx:908` · `admin.html:10798` · `AdminScreen.tsx:877,907,982` |
| L5 | `uncaughtException` is logged and swallowed, leaving the process running in unknown state instead of letting PM2 restart | `index.ts:946` |
| L6 | `res.status(500).json({error: error.message})` in ~20 handlers defeats the central sanitizer | `routes.ts` (various) |

---

## 6. False Positives Eliminated

Cross-checking and my own re-verification dropped these agent claims:

| Claim | Why rejected |
|---|---|
| `settlementLedger` still publicly readable | Already closed this session; verified `allow read, write: if false` |
| Client `onSnapshot` listeners leak | All three supply `unsub()` cleanups — verified |
| `VendorNotificationsContext` interval leak | Heuristic misfire — the match was a `useRef` type annotation; the real interval is cleared |
| `OrderTrackingScreen`/`AdminScreen` listener leaks | `addEventListener` calls are inside WebView HTML strings; they die with the WebView |
| Path traversal via `path.extname(originalname)` | Node's `extname` cannot return a path separator — checked and cleared |
| Notification failures abort order flows | Every push function try/catches and returns `false`; Express 5 forwards rejections. Verified no flow aborts |
| `/api/admin/*` authorization gaps | `app.use("/api/admin", requireAdminAuth)` covers `routes.ts`; `vendor.ts` guards per-route; login correctly registered earlier |
| Rate limiter `X-Forwarded-For` handling wrong | Last-entry choice is correct for the nginx config in use |
| `/api/stores` 500 responses | Intentional DB-unavailable guard; only fires without credentials |

---

## 7. Production Readiness Score

| Dimension | Score | Basis |
|---|---|---|
| Authentication & Authorization | **25** | C1 takeover regression; H2/H7 status never enforced |
| Money correctness | **20** | C2 over-payout, C3 lost settlement, H14/H15 non-atomic + double-payable |
| Data exposure | **40** | H8/H9/H10/H11 open PII channels |
| Admin dashboard security | **30** | C4 stored XSS; H16/H17 attribute-context injection |
| Order lifecycle correctness | **35** | H3 pickup blocked, C5 stranding, M1 duplicate batches |
| Input validation | **30** | H4/H5 free-order vectors |
| Client app reliability | **50** | H1 three dead features |
| Website | **20** | H18 is the wrong page entirely |
| Infrastructure & deployment | **35** | H20-H26: deploy script aborts, `pm2 reload` never re-reads `.env`, nginx unloadable as documented, three unbounded memory growers |
| Test coverage | **35** | 49 unit tests, but the order/money path is still untested |
| **Overall** | **28 / 100** | |

---

## 8. Launch Recommendation

# ⛔ NOT READY FOR PRODUCTION

Your own criterion — "only recommend READY if no confirmed Critical or High
issues remain" — is not close to met: **6 Critical and 26 High** remain confirmed
after false-positive elimination.

**Minimum before reconsidering:**
1. **C1** — remove the `mobile-auth` fallback. It is a straight regression of a
   previously-closed vulnerability.
2. **C2** — fix the marketplace payout base. Every marketplace order overpays today.
3. **C3 / C5** — move settlement inside the transaction that sets
   `earningsCredited`, or set the flag only after settlement lands.
4. **C4** — escape the support-chat module.
5. **H1** — attach the JWT at the three broken call sites (one line each).
6. **H2 / H7** — enforce approval status on drivers and vendors at request time.

**Two process problems matter as much as the bugs:**

- **Security fixes regress silently.** C1 and C4 both re-opened ground that had
  been covered. The Firestore-rules test added earlier is the only guard of its
  kind in the repository; the same protection does not exist for route auth or
  output escaping.
- **This audit found five defects in my own prior work** (C3, C4, H1, M6, and the
  website score). Fixes here have been verified by typecheck, build and targeted
  probes — not by exercising the real flow. That is precisely the gap
  `FINAL_PRODUCTION_VALIDATION.md` flagged and it has not closed.

Until an order can be created, priced, assigned, delivered and settled against
real Firebase with the numbers checked by hand, findings of this severity should
be assumed to still be present in areas no agent happened to look.

---

*No code, configuration or commits were changed. Domains 15-18 (security,
performance, deployment, production configuration) were additionally covered by
direct hands-on verification earlier in this project — PM2 run under the real
ecosystem config, nginx inspection, env-var audit and CI gating.*
