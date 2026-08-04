# OnWay — تطبيق التوصيل | Iraqi Delivery Platform

OnWay is a cash-on-delivery marketplace for a small Iraqi district (qadaa): customers
order from local stores and restaurants, drivers are dispatched automatically, and the
whole operation is run from a web admin panel. Arabic-first, RTL, mobile-first.

> **هذا هو مستودع التطبيق الكامل** (تطبيقات الجوال + الخادم + لوحة التحكم + النظام المالي).
> الموقع التسويقي (Next.js) موجود على فرع منفصل ويُنشر على Vercel — انظر أسفل الصفحة.

---

## What's in this repo

A single monorepo containing every part of the platform:

| Part | Path | Stack |
|------|------|-------|
| **Customer app** | `client/` | React Native (Expo SDK 54) |
| **Driver app** | `client/` (driver screens) | React Native / Expo |
| **Vendor (merchant) app** | `client/` (vendor screens) | React Native / Expo |
| **Backend API** | `server/` | Node.js + Express + TypeScript |
| **Admin dashboard** | `server/templates/admin.html` | Server-rendered web panel + Leaflet |
| **Financial system** | `server/settlement.ts`, `server/financialLedger.ts` | Firestore ledgers |
| **Dispatch engine** | `server/routes.ts` | In-memory queue + Firestore |
| **Data** | Cloud Firestore | `firestore.rules`, `firestore.indexes.json` |
| **Deployment** | `deployment/`, `eas.json`, `ecosystem.config.js` | VPS (PM2) + EAS |
| **Tests** | `tests/` | Node test runner (unit + regression guards) |

Payments are **cash-on-delivery only** (no online payment). The three apps share one
Expo codebase and switch UI by role (customer / driver / vendor).

## Tech stack

- **Mobile:** React Native + Expo (SDK 54), TypeScript, React Navigation
- **Backend:** Node.js, Express, Socket.IO (live driver tracking), TypeScript
- **Database:** Google Cloud Firestore
- **Auth:** OTP + signed JWTs (separate customer / driver / vendor / admin scopes)
- **Maps:** Leaflet (admin) + WebView Leaflet / react-native-maps (apps)
- **CI:** GitHub Actions (`.github/workflows/ci.yml`)

## Getting started

```bash
npm install

# Backend (Express API) — dev
npm run server:dev

# Mobile apps (Expo) — dev
npm run expo:dev
```

Configuration lives in environment variables (see `.env.example`) — Firebase service
account, JWT secret, etc.

## Verify (what CI checks)

```bash
npm run check:types     # TypeScript, 0 errors
npm run test:unit       # unit + settlement-consistency guards
npm run server:build    # esbuild the server bundle
```

## Deployment

- **Backend (VPS):** `bash deployment/update.sh` — pulls `main`, installs, builds, restarts via PM2.
- **Mobile apps:** EAS build (`eas.json`) → App Store / Google Play.
- **Marketing website:** a separate Next.js site (branch `test-root`), deployed to Vercel
  (`onway-app.vercel.app`). It is **not** part of this application code.

## Repository layout notes

- The **default branch is `main`** — the production application.
- The **marketing website** lives on its own branch (`test-root`) and deploys independently to Vercel.
- Historical per-feature development branches have been cleaned up; their history is
  preserved in `main`.

---

<sub>OnWay · منصة توصيل عراقية · React Native + Node/Express + Firestore</sub>
