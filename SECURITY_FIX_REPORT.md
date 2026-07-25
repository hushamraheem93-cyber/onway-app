# Security Fix — `settlementLedger` Public Read

**Severity**: CRITICAL
**Source**: `TECH_STACK_REPORT.md` §2
**Status**: ✅ Fixed · 32/32 tests pass · verified by mutation testing
**Date**: 2026-07-25
**Scope**: this CRITICAL issue plus one collection found to share the same
pattern and expose credentials. No application code, business logic or
architecture was changed.

---

## 1. Root Cause

`firestore.rules` granted unauthenticated read access to the financial ledger:

```
match /settlementLedger/{docId} {
  allow read: if true;   // client onSnapshot (VendorWalletScreen / DriverEarningsScreen)
  allow write: if false;
}
```

Three factors combined to make this fully exploitable:

1. **No Firebase Auth anywhere.** Identity is a custom JWT, so `request.auth` is
   permanently `null`. `allow read: if true` was therefore the *only* gate — and
   it gated nothing.
2. **The Firebase web config ships inside the client bundle** by design, so anyone
   can point the SDK at the project.
3. **Document ids are deterministic and enumerable** — `ledgerId()` produces
   `driver:<phoneNumber>` and `vendor:<vendorId>`. Iraqi mobile numbers follow a
   fixed `07XXXXXXXXX` pattern, making the driver keyspace trivially walkable.

Each document exposes `outstandingTotal`, `totalGross`, `totalCommission`,
`totalOrders` and `totalSettled` — **every driver's debt and every vendor's
revenue, platform-wide, to anyone on the internet.**

**How it was introduced.** Commit `f69edfc` added the rule to make the client-side
`onSnapshot` listeners in the wallet screens work. Those listeners had been
failing silently against default-deny. The rule "fixed" the symptom by removing
the protection.

### Second instance of the same pattern

The mandate included searching for other rules with this pattern that expose
sensitive production data. Auditing all 10 publicly-readable collections found one:

```
match /vendors/{docId} { allow read: if true; }
```

Vendor documents store **`passwordHash`** (bcrypt, written in `server/vendor.ts`
when a store registers). The REST layer strips that field in **five separate
places** before responding — proof the team treats it as secret — but the rule
bypassed the REST layer entirely and served the raw document. Firestore rules
cannot filter fields, so the collection had to be closed.

The remaining eight public collections (`categories`, `banners`, `deliveryAreas`,
`products`, `vendorProducts`, `promotionalSections`, `appSettings`,
`app_settings`) are catalog/config data browsed before login and were **left
untouched**, as instructed.

---

## 2. Files Changed

| File | Change |
|---|---|
| `firestore.rules` | `settlementLedger` → `allow read, write: if false` |
| `firestore.rules` | `vendors` → `allow read, write: if false` (contains `passwordHash`) |
| `tests/unit/firestore-rules.test.mjs` | **New** — 23 assertions locking the rules down |

**No application code was modified.** No screen, endpoint, business rule or
architectural decision changed. The JWT authentication model is untouched and
Firebase Authentication was **not** introduced.

---

## 3. Exact Security Improvement

| | Before | After |
|---|---|---|
| `settlementLedger` read | 🔴 Anyone on the internet | ✅ Backend only (Admin SDK) |
| `vendors` read (incl. `passwordHash`) | 🔴 Anyone on the internet | ✅ Backend only (Admin SDK) |
| Driver debt / vendor revenue | 🔴 Enumerable by phone number | ✅ Requires a valid JWT via REST |
| Vendor bcrypt hashes | 🔴 Harvestable for offline cracking | ✅ Never leaves the server |
| Client writes | ✅ Already denied | ✅ Unchanged |

Financial data is now reachable **only** through the JWT-authorised REST
endpoints, each already guarded:

| Endpoint | Guard |
|---|---|
| `/api/driver/status` | `requireDriverAuth` (mounted on `/api/driver`) |
| `/api/vendor/settlement` | `requireVendor` |
| `/api/vendor/wallet` | `requireVendor` |

Public store browsing is unaffected — it goes through `/api/stores` and
`/api/vendors`, which use the Admin SDK (rules do not apply) and return the
password-stripped shape.

---

## 4. Verification Performed

### Screens still work

All three affected screens read the live value with a fallback and register a
silent `onSnapshot` error handler, so a denied listener degrades to REST:

| Screen | Fallback expression | Source |
|---|---|---|
| `DriverEarningsScreen:768` | `liveSettlement?.outstandingTotal ?? account?.amountOwed ?? 0` | `/api/driver/status` |
| `VendorWalletScreen:191` | `liveBalance ?? settlement.view.outstanding` | `/api/vendor/settlement` |
| `VendorAnalyticsScreen:249` | `liveBalance ?? settlement.view.outstanding` | `/api/vendor/wallet` |

**Strongest evidence:** this sandbox has never had `EXPO_PUBLIC_FIREBASE_*` set,
so the client Firebase SDK has been non-functional in *every* render pass
performed across this project — the wallet and earnings screens have been running
on the REST fallback the entire time, and rendered correctly each time. The fix
makes production match what has already been exercised repeatedly.

Additionally re-rendered the driver and vendor apps in Chromium with all Firestore
client traffic force-denied (403): **no crashes, no blank screens** — driver shows
its status screen, vendor shows the dashboard with store name and status.

### No client SDK reads anything else

Exhaustive grep across the client tree for `collection(db`, `doc(db`,
`onSnapshot`, `getDocs`, `getDoc(` — **only `settlementLedger` is read via the
client SDK**, from exactly three screens. Closing `vendors` therefore breaks
nothing.

### Automated tests

`tests/unit/firestore-rules.test.mjs` parses `firestore.rules` directly — no
credentials, no emulator, so it gates CI:

- `settlementLedger` is not publicly readable (the regression under repair)
- `vendors` is not publicly readable (password hashes)
- 13 sensitive collections each deny unauthenticated reads
- no collection anywhere grants client writes
- the recursive default-deny catch-all is present
- the 6 public catalog collections **remain readable** (guards against
  over-correcting and breaking pre-login browsing)

Comments are stripped before matching, so prose describing the old rule cannot
produce a false pass.

### Mutation testing

```
vulnerability reintroduced (allow read: if true) :  32 tests, 30 pass, 2 FAIL
fix restored                                      :  32 tests, 32 pass, 0 fail
```

The suite genuinely detects this exact regression.

### Build & gates

| Gate | Result |
|---|---|
| `tsc --noEmit` | ✅ clean |
| `npm run test:unit` | ✅ 32 passed, 0 failed |
| `npm run server:build` | ✅ 515.3 KB |
| `firestore.rules` syntax | ✅ balanced braces, `rules_version` present |

---

## 5. Deployment — Required

**The fix is inert until the rules are published.** Editing the file changes
nothing in production by itself:

```bash
firebase deploy --only firestore:rules
```

Verify afterwards, from any signed-out context:

```js
// must now fail with PERMISSION_DENIED
getDoc(doc(db, "settlementLedger", "driver:07XXXXXXXXX"))
```

Expected app-side effect: wallet balances stop updating live and refresh on
screen focus / pull-to-refresh instead. No values disappear.

---

## 6. Remaining Recommendations

1. **`app_settings/admin_push` is still publicly readable.** It stores the admin
   Expo push token. Not a credential, but it lets an attacker send notifications
   to the admin device. **Deliberately left unchanged** — it falls outside "fix
   only sensitive production data" and the instruction not to touch unrelated
   rules. Worth a follow-up decision.

2. **Restore realtime properly, if it is wanted.** Live balance updates were the
   original motivation. Doing it securely without weakening rules means either
   Firebase Auth with custom tokens (so rules can be scoped to the owning
   account), or pushing balance changes over the existing authenticated
   socket.io channel — the latter fits the current architecture and needs no new
   auth system.

3. **Treat rule loosening as a security change.** This regression entered while
   fixing a UI feature. The new test file now fails CI if any sensitive
   collection is reopened.

4. Unchanged, as instructed: the two MEDIUM findings in `REVIEW_REPORT.md` and
   the HIGH/MEDIUM items in `TECH_STACK_REPORT.md` (dead `app.json`, unvalidated
   `EXPO_PUBLIC_FIREBASE_*`, Node version drift).

---

*One commit created, after all tests passed.*
