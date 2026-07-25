# OnWay — Technology Stack Audit

**Mode**: READ-ONLY — no code, no configuration, no commits
**Date**: 2026-07-25
**Findings**: 1 critical · 2 high · 4 medium · 3 low

> **Note on the requested skill**: `tech-stack` does not exist in
> `NeoLabHQ/context-engineering-kit` (that repo has 68 skills; none is a tech-stack
> skill), so nothing was installed for it and none was used. This audit was
> performed directly.

---

## 1. Version Matrix — Compatibility Verdict

| Layer | Declared | Installed | Verdict |
|---|---|---|---|
| Expo SDK | `~54.0.35` | 54.0.35 | ✅ |
| React | `19.1.0` | 19.1.0 | ✅ matches SDK 54 |
| React Native | `0.81.5` | 0.81.5 | ✅ matches SDK 54 |
| React Navigation | `^7.1.8` | 7.x | ✅ |
| Express | `^5.0.1` | **5.2.1** | ✅ verified running |
| firebase (client) | `^12.8.0` | 12.16.0 | ✅ |
| firebase-admin | `^13.6.1` | 13.10.0 | ✅ independent of client SDK |
| socket.io / client | `^4.8.3` | 4.8.3 / 4.8.3 | ✅ **exact match** |
| TypeScript | `~5.9.2` | 5.9.3 | ✅ compiles clean |

**React 19 + RN 0.81 + Expo 54** is the correct matched set for SDK 54 — no
version conflict. **socket.io server and client are byte-identical (4.8.3)**,
which is the pairing that matters most for the real-time layer.

**Express 5** is a major upgrade with known breaking changes. Scanned for all of
them — removed optional-param syntax (`:x?`), changed `*` wildcards, frozen
`req.query`: **zero occurrences**. Confirmed empirically: the server boots and
serves correctly under Express 5.2.1.

---

## 2. 🔴 CRITICAL — Every driver's and vendor's financial balance is publicly readable

**File**: `firestore.rules:199-202`

```
match /settlementLedger/{docId} {
  allow read: if true;   // client onSnapshot (VendorWalletScreen / DriverEarningsScreen)
  allow write: if false;
}
```

**Why this is exploitable.** The app **does not use Firebase Auth anywhere** —
identity is a custom JWT. So `request.auth` is always `null`, and `allow read: if
true` is the only thing gating this collection: it is open to the entire internet.

The Firebase web config is, by design, embedded in the shipped client bundle, so
anyone can initialise the SDK against this project. And the document ids are
**deterministic and enumerable**:

```
settlementLedger/driver:07701234567     ← ledgerId("driver", phoneNumber)
settlementLedger/vendor:<vendorId>      ← ledgerId("vendor", vendorId)
```

Iraqi mobile numbers follow a fixed `07XXXXXXXXX` pattern, so the driver keyspace
is trivially enumerable. Each document exposes `outstandingTotal`, `totalGross`,
`totalCommission`, `totalOrders`, `totalSettled` — i.e. **every driver's debt and
every vendor's revenue**, for the whole platform, without authentication.

**How it got here.** Introduced in commit `f69edfc` to make the client-side
`onSnapshot` listeners in `VendorWalletScreen` / `DriverEarningsScreen` work.
Those listeners were previously failing silently against default-deny (which is
what my earlier audits observed and reported as safe) — this rule "fixed" them by
removing the protection.

**This supersedes the statement in `REVIEW_REPORT.md` that financial collections
are unreadable from clients.** That was accurate when checked; this rule landed
afterwards.

**Recommended fix** (not applied — read-only): the REST endpoints already serve
this data with proper JWT authorisation and the screens already fall back to them.
Reverting to `allow read: if false` restores the protection and costs only the
live-update behaviour. Keeping realtime would require Firebase Auth with custom
tokens so the rule can be scoped to the owning account.

---

## 3. 🟠 HIGH — `app.json` is dead configuration that silently overrides nothing

**Files**: `app.json` · `app.config.js`

`app.config.js` exports a **static object**, not a function. When both files
exist, Expo uses `app.config.js` and **ignores `app.json` entirely** — it never
receives or merges those values. `expo-doctor` flags this:

> *"You have an app.json file in your project, but your app.config.js is not
> using the values from it."*

**Concrete evidence this trap is live**: earlier in this project the brand colour
and package identifiers were edited **in `app.json`** to fix a splash-screen
mismatch. That edit had **no effect on any build**. The outcome only looks correct
because `app.config.js` independently already contained the right values
(`#E86520`, `com.husham.onway`).

The two files currently agree, so there is no active defect — but any future edit
to `app.json` will silently do nothing, which is exactly how the original splash
mismatch happened.

**Recommended fix**: delete `app.json`, or convert `app.config.js` to the
function form `({ config }) => ({ ...config, ... })` so it genuinely extends it.

---

## 4. 🟠 HIGH — Client Firebase config is never validated at build time

**Files**: `client/lib/firebase.ts:13-21` · `scripts/build.js` · `.replit`

```ts
apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '',
projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '',
```

`EXPO_PUBLIC_*` variables are **baked into the bundle at build time**, not read at
runtime. If `npm run expo:static:build` runs without them exported, every value
silently becomes `''` and the client SDK initialises against a non-existent
project. **Nothing in the build pipeline checks for this** — verified: no
reference to `EXPO_PUBLIC_FIREBASE` in `scripts/build.js`, `.replit`, or any
deployment script.

The failure is invisible: the three screens using the client SDK
(`DriverEarningsScreen`, `VendorWalletScreen`, `VendorAnalyticsScreen`) all
degrade silently to REST, so a mis-built bundle looks fine while its realtime
layer is permanently dead.

**Recommended fix**: fail the build when any `EXPO_PUBLIC_FIREBASE_*` value is
empty.

---

## 5. 🟡 MEDIUM — Node runtime differs between CI and production

| Environment | Node | Source |
|---|---|---|
| CI | **20** | `.github/workflows/ci.yml:22` |
| VPS (production) | **22** | `deployment/server-setup.sh:31` |
| `package.json` `engines` | **absent** | — |

CI validates on a runtime production never uses. Both are LTS and broadly
compatible, so this is unlikely to bite — but it weakens CI as a gate, and with no
`engines` field nothing stops a deploy on Node 18, which Expo 54 does not support.

**Recommended fix**: add `"engines": { "node": ">=20" }` and align CI to 22.

---

## 6. 🟡 MEDIUM — Storage bucket configured twice, with nothing keeping them in sync

| Side | Variable | Default if unset |
|---|---|---|
| Server | `FIREBASE_STORAGE_BUCKET` | `<project-id>.firebasestorage.app` |
| Client | `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` | `''` |

Two independent variables must name the same bucket, and no check enforces it. If
they diverge, the server writes to one bucket and the client resolves URLs against
another — images upload "successfully" but render broken.

Related: the server-side hardcoded-bucket defect was fixed earlier this session
(`server/firebase.ts`), which is what surfaced this pairing.

---

## 7. 🟡 MEDIUM — `nginx.conf` is not self-contained

**File**: `deployment/nginx.conf:84, 91, 117`

The `/api/` and `/` locations delegate header handling to
`include /etc/nginx/proxy_params;` — **a file that is not in this repository**.
The `/socket.io/` block sets its headers explicitly instead, so the config is
internally inconsistent.

This matters because the application's rate limiter derives the client IP from the
**last** `X-Forwarded-For` entry (`server/index.ts`, `trustedClientIp`). That is
correct **only if** `proxy_params` sets `X-Forwarded-For $proxy_add_x_forwarded_for`.
On Ubuntu 24.04 — the documented target — that file exists and does the right
thing, so this works today. On any other distribution nginx will fail to start
outright.

---

## 8. 🟡 MEDIUM — `eas-cli` is a project dependency

Flagged by `expo-doctor`. It belongs installed globally or invoked via `npx`;
as a project dependency it inflates every `npm ci` (including CI) for no benefit.

---

## 9. 🟢 LOW

| # | Finding |
|---|---|
| L1 | **Two rate limiters stacked** — nginx (`30r/s` API, `5r/m` admin login) plus the in-app limiter (600/min default, 10/min admin login). Layered defence is fine, but nginx keys on `$binary_remote_addr`, so putting the VPS behind Cloudflare would collapse all users into one bucket. |
| L2 | **PM2 pinned to `instances: 1`** — correct and deliberately documented (driver queue, sessions and rate-limit counters are per-process), but it caps the platform at one core with no horizontal scaling path short of Redis. |
| L3 | **`expo-doctor` 2 checks inconclusive** — the config-schema and React Native Directory checks failed on network access from this sandbox, not on project content. Re-run on a networked machine for full coverage. |

---

## 10. Integration Verdicts

| Integration | Verdict | Basis |
|---|---|---|
| React Native ↔ Expo ↔ React | ✅ Compatible | SDK 54 matched set; app renders in a real browser |
| Express 5 ↔ existing routes | ✅ Compatible | Zero breaking-change patterns; server verified serving |
| socket.io server ↔ client | ✅ Compatible | Identical 4.8.3; live connection + auth verified |
| socket.io ↔ nginx | ✅ Correct | `/socket.io/` has `proxy_http_version 1.1` + Upgrade/Connection headers + 86400s timeouts; client uses the default path |
| firebase-admin ↔ Firestore | ✅ Working | Verified against a live server |
| Firebase Storage ↔ server | ⚠️ Fixed but unverified | Bucket-name defect repaired this session; needs `scripts/production-validate.mjs` against real credentials |
| Firebase client SDK ↔ rules | 🔴 **Insecure** | Works only because the ledger is world-readable — see §2 |
| Authentication (custom JWT) | ✅ Sound | 20/20 authz probes passed previously; **note: Firebase Auth is not used at all**, which is why rules cannot be scoped |
| PM2 ↔ `.env` | ✅ Fixed | `env_file` defect repaired and re-tested this session |
| Hostinger VPS ↔ nginx ↔ Node | ⚠️ Mostly ready | Correct for Ubuntu 24.04; depends on the external `proxy_params` — see §7 |
| Build config (esbuild + Metro) | ✅ Working | Server bundle 515 KB; web bundle 5.02 MB, both build clean |

---

## 11. Priority

1. 🔴 **`settlementLedger` public read** — financial PII for every driver and vendor is exposed to the internet. Fix before public launch.
2. 🟠 `app.json` dead config — delete it before it silently swallows another edit.
3. 🟠 Validate `EXPO_PUBLIC_FIREBASE_*` at build time.
4. 🟡 Align Node versions, add `engines`; unify the storage-bucket variables.
5. 🟢 Low items as convenient.

---

## Summary

The stack itself is **coherent and correctly assembled** — the version matrix has
no conflicts, Express 5 is genuinely compatible with the existing routes,
socket.io is exactly matched end to end, and the nginx WebSocket path is set up
properly. The problems found are **not incompatibilities between technologies**;
they are configuration defects at the seams: a security rule opened to make a
client feature work, a config file that silently does nothing, unvalidated
build-time secrets, and environment drift.

The `settlementLedger` rule is the one that should block launch.

*No code or configuration was modified and no commits were created.*
