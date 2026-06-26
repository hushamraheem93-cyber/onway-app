---
name: Firestore Architecture
description: How the OnWay app uses Firebase — client vs server SDK, and what the rules protect.
---

# Firestore Architecture

## Rule
All Firestore reads/writes go through the Express backend (Firebase Admin SDK). The client SDK (`client/lib/firebase.ts`) initializes `db` but no client file imports it for direct queries.

**Why:** The app uses custom phone-based auth (OTP), not Firebase Auth UIDs. So Firestore rules cannot use `request.auth` to verify users — authenticated operations must go through the backend.

**How to apply:**
- When adding a new feature that needs Firestore data: always route through an Express API endpoint, not a direct client SDK call.
- If a new Firestore collection is added, update `firestore.rules` and run `firebase deploy --only firestore:rules`. The default-deny rule covers it until then.
- The public `apiKey` in `client/lib/firebase.ts` is intentional and safe — Firebase designed it to be public.

## Collections access model
- **Public read (client):** categories, banners, deliveryAreas, vendors, vendorProducts, products, appSettings, app_settings, promotionalSections
- **Backend-only:** everything else (users, orders, drivers, wallets, promoCodes, pushTokens, etc.)
