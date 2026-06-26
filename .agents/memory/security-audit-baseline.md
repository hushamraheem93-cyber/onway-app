---
name: Security Audit Baseline
description: Summary of security fixes applied before production launch (Jun 2026).
---

# Security Audit Baseline — Jun 2026

## Completed fixes
- **JWT fail-fast:** server refuses to start in production if `JWT_SECRET` is unset (`process.exit(1)`).
- **OTP log removed:** `console.log([OTP] Sent code ${code} to ${phoneNumber})` was removed from routes.ts.
- **Console.log cleanup:** removed all logs containing phone numbers, push tokens, lat/lng, driver names in batch-reject/assign flows.
- **Demo data deleted:** 3 demo vendors + 45 products (48 docs total) deleted from Firestore via `scripts/cleanup-demo-data.mjs`.
- **Firestore rules:** `firestore.rules` covers 25+ collections with default-deny + explicit public/private classification.
- **firebase.json + .firebaserc:** created to enable `firebase deploy --only firestore:rules`.

## Remaining pre-launch actions (user must do)
1. Add `JWT_SECRET` to Replit Secrets (see `docs/JWT_SECRET.md`).
2. Run `firebase deploy --only firestore:rules` to publish rules to Firebase Console.
3. Enable Scheduled Backups in Firebase Console (Blaze plan required).
4. Add `ALLOWED_ORIGINS` secret with production domain for CORS restriction.
