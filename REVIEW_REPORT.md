# OnWay — Code Review Report

**Quality Gate**: ⚠️ **FAIL** (1 high-impact issue)
**Issues**: 0 critical · 1 high · 2 medium
**Min Impact Filter**: medium (score ≥ 41)
**Mode**: READ-ONLY — no code modified, no commits created
**Date**: 2026-07-25

---

## Scope & Method

Reviewed the full repository (working tree clean, so this is a whole-codebase
review, not a diff): **15,103** lines of server TypeScript, **44,076** lines of
client code, **11,522** lines of admin dashboard, plus Firebase rules/indexes,
PM2 config and deployment scripts.

Applied the `review-local-changes` methodology: findings are scored on
**impact (0-100)** × **confidence (0-100)** and filtered by a progressive
threshold (higher impact needs less confidence). Issues below the thresholds
were dropped rather than padded into the report.

**Important framing:** this codebase has already been through several audit and
fix rounds in this project (see `AUDIT_REPORT.md`,
`PRODUCTION_READY_REPORT.md`, `FINAL_PRODUCTION_VALIDATION.md`). The previously
identified Critical/High issues were fixed and re-verified. This review
therefore concentrated on areas **not** covered before — the settlement engine
internals, memory lifetime, and API contract consistency — and reports **3 new
findings**.

### False positives investigated and deliberately excluded

| Candidate | Why excluded |
|-----------|--------------|
| `VendorNotificationsContext` interval leak | Heuristic count misfired — line 56 is a `useRef` type annotation; the real interval (:116) is cleared in cleanup (:118) |
| `OrderTrackingScreen` listener leak | The `addEventListener` calls are inside a WebView HTML string; they die with the WebView |
| `AdminScreen` / `MapPickerScreen` listeners | Same WebView-injected-JS pattern |
| `locationFirestoreThrottle` never evicted | One small entry per driver phone — bounded by driver count, impact ~20, below filter |
| `/api/stores` returning 500 | Intentional "database unavailable" guard, only fires without Firebase credentials |

---

## Issues

### 🟠 HIGH — Settlement can be silently and permanently lost on a transient failure

**File**: `server/routes.ts:3706-3766` · `server/settlement.ts:82-135`
**Impact**: 75 · **Confidence**: 90

The order-completion path commits the idempotency flag **before** recording the
money, and then ignores whether the money was actually recorded.

Sequence as written:

```
routes.ts:3706   if (snap.data()?.earningsCredited === true) return false;
routes.ts:3707   tx.update(orderRef, { earningsCredited: true });   // ← committed first
   ...
routes.ts:3736   await recordOrderSettlement({ accountType: "driver",  ... });  // return ignored
routes.ts:3756   await recordOrderSettlement({ accountType: "vendor",  ... });  // return ignored
```

And `recordOrderSettlement` swallows its own failures:

```ts
// settlement.ts:132-135
} catch (error) {
  console.error("recordOrderSettlement tx error:", error);
  return false;        // ← identical to the "already recorded" no-op at line 87
}
```

**Evidence / failure scenario.** A driver completes an order. `earningsCredited`
is set to `true` and commits. The settlement transaction then fails for any
transient reason — Firestore contention on the ledger doc, a network blip, a
quota spike. The error is caught, logged, and `false` is returned. **The caller
never checks it.** The driver's debt and the vendor's payable are never created.

The loss is **permanent**, because a retry of the completion hits line 3706,
sees `earningsCredited === true`, and returns early — skipping settlement
entirely. There is no reconciliation job and no alert; the only trace is one
`console.error` line.

`false` is also indistinguishable from the legitimate idempotent no-op
(`settlement.ts:87`), so even a caller that *did* check the value could not tell
"already recorded" from "failed to record".

**Suggestion** (not applied — read-only mode):

```ts
// 1. Make failure distinguishable from the idempotent no-op.
//    Either rethrow, or return a discriminated result:
type SettlementResult = "recorded" | "duplicate" | "failed";

// 2. Record the settlement inside the SAME transaction that sets
//    earningsCredited, so the flag and the money commit atomically.
//    If that is impractical, invert the order: record settlement first,
//    set earningsCredited only after both settlements succeed.

// 3. At minimum, surface the failure so it is recoverable:
const ok = await recordOrderSettlement({ ... });
if (ok === "failed") {
  await orderRef.update({ earningsCredited: false, settlementError: true });
  console.error(`[SETTLEMENT] order ${orderId} completed but NOT settled`);
}
```

A reconciliation query — orders with `status: "delivered"` and no matching
`settlements/{orderId}__driver` document — would also detect any already-lost
records.

---

### 🟡 MEDIUM — `imageHashMap` grows without bound and can hold multi-MB Base64 strings

**File**: `server/routes.ts:94, 928, 955`
**Impact**: 60 · **Confidence**: 90

```ts
// routes.ts:94
const imageHashMap = new Map<string, string>();   // sha256 → URL
...
// routes.ts:951-955
} catch (storageErr: any) {
  console.warn("[Storage] admin upload fell back to Base64:", storageErr?.message);
  url = `data:image/webp;base64,${webpBuffer.toString("base64")}`;  // ← whole image
}
imageHashMap.set(contentHash, url);   // never deleted, no TTL, no size cap
```

**Evidence.** The map is written on every admin image upload and **nothing ever
removes an entry** — no eviction, no TTL, no maximum size. Values are normally
short Storage URLs, which is fine. But when the Storage upload fails, the
fallback stores the **entire image as a Base64 data URI**, and *that* is what
gets cached. Uploads are capped at 15 MB pre-compression, so entries can be
hundreds of KB to several MB each.

This matters more than raw RAM: `ecosystem.config.js` sets
`max_memory_restart: "512M"`, and a PM2 restart **wipes the in-memory
operational state** — the driver queue, admin session revocation list and
rate-limit counters are all per-process (documented in `ecosystem.config.js`).
So unbounded growth here eventually causes a restart that drops live driver
queue state.

Note the two failure modes compound: the Storage bucket misconfiguration fixed
earlier (`server/firebase.ts:23`) was exactly what forced the Base64 branch.

**Suggestion**: cap the map (simple LRU or a periodic sweep), and/or skip
caching entirely when the value is a `data:` URI:

```ts
if (!url.startsWith("data:")) imageHashMap.set(contentHash, url);
```

---

### 🟡 MEDIUM — Error response shape is inconsistent: `{error}` vs `{message}`

**File**: `server/index.ts:784` vs 453 handlers in `server/routes.ts` / `server/vendor.ts`
**Impact**: 50 · **Confidence**: 90

| Source | Shape |
|--------|-------|
| 453 route handlers | `res.status(4xx/5xx).json({ error: "..." })` |
| Global error handler (`index.ts:784`) | `res.status(status).json({ message })` |

**Evidence.** Any unhandled exception bubbles to the global handler and returns
`{ message }`. On the client, **25 files read `body.error`** but only **2**
handle both shapes (`OrderContext.tsx` is one of the two — it correctly falls
back to `.message`).

So in exactly the situation where a real, unexpected server error occurred, 23
of 25 client call sites read `undefined` and show a generic fallback instead of
the actual reason. This makes production incidents harder to diagnose from user
reports, and it silently contradicts the documented API contract.

**Suggestion**: emit both keys from the global handler — a one-line,
backward-compatible change:

```ts
// index.ts:784
return res.status(status).json({ error: message, message });
```

---

## Areas Reviewed — No New Issues Above Threshold

| Area | Status | Note |
|------|--------|------|
| Authentication / authorization | ✅ Solid | 20/20 live probes passed previously; guards re-verified present |
| XSS (admin dashboard) | ✅ Fixed | `escapeHtml`/`escapeAttr` applied to all 9 sinks; verified in Chromium |
| WebSocket auth | ✅ Fixed | Handshake identity enforced; spoofing rejected in live test |
| Settlement idempotency | ✅ Correct | Reads-first transaction, keyed `orderId__accountType` — *the flaw is the caller, above* |
| Firestore rules | ✅ Default-deny | Financial collections unreadable from clients |
| Rate limiting | ✅ Working | Verified firing at configured limits |
| PM2 config | ✅ Fixed | `.env` loading repaired and re-tested; `instances: 1` correct for in-memory state |
| Customer / Vendor / Driver apps | ✅ Render clean | No runtime crashes in real-browser render pass |
| Website / SEO | ✅ Complete | 9/9 meta tags present |
| Client interval & listener cleanup | ✅ Clean | All flagged candidates proved false positives |

---

## Improvements (non-blocking)

1. **Distinguish "duplicate" from "failed" in the settlement API** —
   `server/settlement.ts:71` — returning `boolean` for three distinct outcomes
   (recorded / already-recorded / failed) is the root enabler of the HIGH issue
   above. A discriminated return type makes the failure impossible to ignore
   silently. *Effort: low.*

2. **Add a settlement reconciliation check** — a query for delivered orders
   lacking a `settlements/{orderId}__driver` doc turns a silent, permanent money
   loss into a detectable one. Fits naturally into
   `scripts/production-validate.mjs`. *Effort: low.*

3. **Normalise the client error-reading helper** — 25 call sites each hand-roll
   `res.json()` error extraction. A single `extractApiError(res)` helper would
   fix the `{error}`/`{message}` split once instead of 25 times. *Effort: medium.*

4. **Cap or skip caching of Base64 fallbacks** — see the MEDIUM issue above;
   one conditional prevents unbounded growth. *Effort: low.*

---

## Verdict

**Quality Gate: FAIL** — solely because of the HIGH settlement issue.

The codebase is in good shape overall: the security posture is strong and
verified by live testing, and the two most dangerous classes of bug in a
delivery platform (double-crediting money, and identity spoofing) are correctly
defended. The finding above is the mirror image of the double-credit protection
— that work correctly guaranteed *at most once*, but the ordering means the
system does not guarantee *at least once*.

Given that this is real money in a live delivery platform, I would fix the HIGH
issue before public launch. The two MEDIUM issues are safe to schedule.

**No code was modified and no commits were created, per read-only instruction.**
