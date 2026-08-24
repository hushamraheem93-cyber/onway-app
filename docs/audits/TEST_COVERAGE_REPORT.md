# OnWay — Test Coverage Report

**Mode**: READ-ONLY for production code — tests only, no application logic touched
**Date**: 2026-07-25
**Result**: 49 unit tests passing (17 added this session), 0 failing
**Method**: TDD skill discipline — real code not mocks, and every suite
mutation-tested to prove it fails when the behaviour breaks

---

## 1. Coverage Before and After

| | Before this session | After |
|---|---|---|
| Unit tests running in CI | 0 | **49** |
| Test files | 0 unit / 7 API | 3 unit / 7 API |
| Authentication (OTP) coverage | **none** | **17 tests** |
| Money/settlement coverage | 9 tests | 9 tests |
| Firestore rules coverage | 23 tests | 23 tests |

The 7 suites in `tests/api/` (`01-public` … `07-security`) require a **live
server plus real Firebase credentials**. They have never run in CI and cannot,
which is why measured coverage was effectively zero despite the files existing.

---

## 2. What Was Added — OTP Authentication (17 tests)

**`tests/unit/otp-auth.test.mjs`**

OTP is the single gate to every account on the platform: customers verify with
it, and drivers and vendors both exchange the OTP-issued customer JWT for their
own tokens. It had **zero tests**. It is also fully in-memory (`otpStore` needs
no Firestore), so it is completely testable without credentials — the highest
value-per-effort gap in the repository.

| Group | Tests | Behaviour locked down |
|---|---|---|
| Generation | 4 | 4-digit format, 1000-9999 range, RNG produces varied codes, re-issue supersedes the old code |
| Verification | 5 | correct code accepted, wrong rejected, **single-use (no replay)**, unknown phone rejected, **codes scoped per phone** |
| Brute-force | 3 | **invalidated after 5 wrong attempts**, 4 wrong attempts do not lock out a legitimate user, a fresh code resets the counter |
| Dev bypass | 5 | `0000` works with `DEV_MODE=true`, **rejected under `NODE_ENV=production`**, **rejected when `REPLIT_DEPLOYMENT=1`**, rejected when `DEV_MODE` is merely unset, and does not weaken real verification |

The brute-force group matters disproportionately: the code is 4 digits by
deliberate product decision (9,000 possibilities), so **the attempt cap is the
only thing making that length safe**. It is now regression-locked.

The dev-bypass group guards the worst-case failure on this platform — if
`DEV_MODE` ever leaked into production, a fixed code `0000` would log anyone in
as anyone.

### Mutation testing — proof the tests bite

| Mutation applied to production code | Result |
|---|---|
| Removed the 5-attempt brute-force cap | **1 test fails** ✅ |
| Made the dev bypass ignore `NODE_ENV=production` and `REPLIT_DEPLOYMENT` | **2 tests fail** ✅ |
| Restored | 49/49 pass ✅ |

Production code was reverted after each mutation and verified clean.

---

## 3. Coverage by Priority Area

| # | Area | Status | Detail |
|---|---|---|---|
| 1 | **Authentication** | 🟡 Partial | OTP fully covered (17). JWT middleware **not unit-tested** — see §4. Verified live earlier: 20/20 authz probes. |
| 2 | **OTP** | ✅ Covered | 17 tests incl. brute-force and production bypass rejection |
| 3 | **Product upload** | 🔴 None | Needs multer + Firestore; logic sits inside the route closure |
| 4 | **Image upload** | 🔴 None | Needs Firebase Storage. `scripts/production-validate.mjs` covers this against real credentials instead |
| 5 | **Orders** | 🔴 None | Order creation, pricing and the status machine all live inside the closure and need Firestore |
| 6 | **Wallet / settlement** | ✅ Covered | 9 tests: success, transient failure, retry, duplicate completion, sweep re-entrancy, partial failure |
| 7 | **Driver assignment** | 🔴 None | `assignWaitingBatchToDriver` is closure-scoped; also depends on in-memory queue state |
| 8 | **WebSocket** | 🟡 Manual only | Verified live this session (spoofing rejected, authenticated driver accepted) but **not automated** |
| 9 | **Notifications** | 🔴 None | `sendPushNotification` requires a real `ExponentPushToken` and network |
| 10 | **Admin Dashboard** | 🟡 Partial | Firestore rules covered (23 tests). Login/session verified live; dashboard JS has no tests |
| — | **Firestore rules** | ✅ Covered | 23 tests: sensitive collections denied, no client writes, catalog stays public |

---

## 4. Root Cause of the Coverage Gap — Not Laziness, Architecture

`server/routes.ts` is 6,940 lines and exports **exactly one symbol**:

```
$ grep -E "^export " server/routes.ts
378:export async function registerRoutes(app: Express): Promise<Server> {
```

Everything else is defined **inside that closure** and is therefore unreachable
from any test file:

| Function | Line | Reachable? |
|---|---|---|
| `computeDriverPayout` | 1613 | ❌ inside closure |
| `getSystemSettings` | 1573 | ❌ inside closure |
| `assignWaitingBatchToDriver` | 4472 | ❌ inside closure |
| `checkIsRestaurantOrder` | 743 | ❌ inside closure |
| `toLocalPhone` | 2838 | ❌ inside closure |
| `requireCustomerAuth` / `requireDriverAuth` | 304 / 321 | module level, but **not exported** |

This is why the three areas that *did* get tested — OTP, settlement, rules — are
exactly the three that live in **separate, exported modules**
(`server/firebase.ts`, `server/settlement.ts`, `firestore.rules`).

**Testing the rest requires either** exporting/extracting those functions (a
refactor, explicitly out of scope here) **or** running against a live server with
real Firebase credentials (what `tests/api/*` already attempts).

---

## 5. Recommended Tests, in Priority Order

Each entry states the blocker honestly, since none can be written under the
current constraints.

### Priority 1 — Order pricing integrity *(money, currently untested)*
Server-authoritative pricing is described in `AUDIT_REPORT.md` as the strongest
part of the codebase, yet nothing regression-tests it.
**Tests to write**: client-sent total that disagrees with the recomputed total is
rejected; delivery fee recomputed from the zone, not trusted from the client;
promo discount cannot exceed the subtotal; a promo cannot make the total negative.
**Blocker**: pricing logic is inside the `POST /api/orders` closure. Needs
extraction into a pure `calculateOrderTotal(items, area, promo)` module — which
would then be trivially testable.

### Priority 2 — JWT middleware *(the entire authorisation boundary)*
**Tests to write**: missing header → 401; token signed with the wrong secret →
401; expired token → 401; wrong `role` claim → 401/403; valid token populates
`req.customerPhone`; **driver identity always comes from the token and never from
`req.body.phoneNumber`** (the C2 IDOR fix — currently only verified manually).
**Blocker**: `requireCustomerAuth` / `requireDriverAuth` are not exported. One
`export` keyword each would make them unit-testable with a fake `req`/`res`.

### Priority 3 — Driver payout rules *(money)*
**Tests to write**: flat restaurant vs flat default; percent mode; percent clamped
to 0-100; `deductionAmount` never negative when the delivery fee is below the
driver's earning.
**Blocker**: `computeDriverPayout` is closure-scoped.

### Priority 4 — WebSocket authorisation *(verified manually, not automated)*
**Tests to write**: anonymous socket cannot publish `driver:location`; a driver
token can; `order:watch` rejects a non-owner. This session proved all three by
hand against a live server — automating it needs a test server harness plus
Firestore for the ownership lookup.

### Priority 5 — Order status machine
**Tests to write**: legal transitions allowed, illegal ones rejected, terminal
states immutable.
**Blocker**: needs Firestore; a Firestore emulator would unlock this and much of
Priority 1.

### Priority 6 — Notifications
**Tests to write**: a malformed push token is rejected before any network call
(the `ExponentPushToken` guard); a send failure never breaks order completion.
The guard itself is testable if extracted.

---

## 6. The Single Highest-Leverage Improvement

**Add the Firestore emulator** (`firebase emulators:start --only firestore`).

It would unlock Priorities 1, 3 and 5, plus let the seven existing
`tests/api/*.test.mjs` suites finally run in CI — turning ~50 already-written but
permanently-skipped tests into real coverage. That is a larger return than any
number of new unit tests, because the test bodies already exist.

Second-highest: **export the middleware and pricing helpers**. Roughly a dozen
`export` keywords would move Priorities 1-3 from "impossible" to "straightforward",
with no behavioural change.

---

## 7. Honest Assessment

Coverage went from **0 → 49 CI-gating tests**, and the three areas now covered are
well chosen: they are the platform's authentication gate, its money path, and its
data-exposure boundary — the three places where a silent regression costs the most.

But **the core business flow remains untested**: creating an order, pricing it,
assigning a driver, and completing it. That is unchanged from
`FINAL_PRODUCTION_VALIDATION.md`, and it is a structural consequence of a
6,940-line single-export module, not something more test-writing alone can fix.

Nothing here should be read as "the order flow works". It means the order flow is
**still verified only by hand**.

*No production code was modified. Test files and this report are the only additions.*
