---
name: Driver Financial System
description: New financial model replacing legacy wallet system — amountOwed tracks cumulative Onway commission, blocking driver at 50,000 IQD threshold.
---

## The Model

| Field | Meaning |
|---|---|
| `totalEarnings` | Cumulative driver take-home (750 restaurant / 2000 market per order) |
| `totalOnwayCommission` | Cumulative Onway commission (250 restaurant / 1000 market per order) |
| `totalPaid` | Cumulative payments driver made to Onway (via recordDriverPayment) |
| `amountOwed` | = totalOnwayCommission − totalPaid; grows until driver pays Onway |

## Blocking Threshold
`OWED_THRESHOLD = 50,000 IQD`
- toggle-online rejects if `amountOwed >= 50000`
- After each complete-order, re-checks and removes driver from queue if threshold exceeded

**Why:** Old wallet system required Onway to pre-load balance per driver (prepaid). New system is postpaid — Onway tracks what's owed and collects periodically. Eliminates upfront cash from admin.

## Firestore Collections
- `driverFinancialAccounts/{phoneNumber}` — the account document
- `driverTransactions/{autoId}` — each earning/commission/payment event

## API Endpoints
- `GET /api/driver/wallet?phoneNumber=` → `{account, transactions[]}`
- `POST /api/admin/driver-wallet/payment` → `{phoneNumber, amount, notes}`
- `GET /api/admin/driver-financial` → `{accounts: [{driver, account}]}`
- Legacy: `POST /api/admin/driver-wallet/recharge` → now calls recordDriverPayment (backward compat)

## How to Apply
Any new driver-earning logic must call `updateDriverEarningsOnOrder()` not the old wallet functions. The old functions (`getDriverWalletBalance`, `updateDriverWalletBalance`, `addWalletTransaction`, `getWalletHistory`) are removed from routes.ts imports.
