---
name: Vendor Availability Modes
description: isVacation and isBusy flags on vendor profiles — how they're toggled and enforced.
---

## Fields

`isVacation` and `isBusy` are optional booleans on:
- Firestore `vendors` document
- `VendorProfile` interface (`client/context/AuthContext.tsx`)
- `Vendor` type (`client/types/index.ts`)

## Toggle API

`PATCH /api/vendor/availability` (in `server/vendor.ts`), requires vendor JWT. Accepts `{ isVacation?: boolean, isBusy?: boolean }`.

## Enforcement

`POST /api/orders` checks the vendor document BEFORE price verification. If `isVacation` or `isBusy` is true, returns HTTP 400 with Arabic error message. No order is created.

## UI

`VendorHomeScreen` has two `AvailabilityToggle` components below the quick-actions row, calling `PATCH /api/vendor/availability` on press.

**Why:** Single-district app needs simple on/off control. Not complex scheduling — just a toggle.
