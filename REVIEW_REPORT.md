# OnWay — Final Review Report

**Status**: Read-only review completed
**Date**: 2026-08-05
**Scope**: Review of the current source code for authentication, vendor access control, settlement handling, image caching, and API error handling.

---

## 1. Confirmed Critical Issues

### 1) Vendor access control can be weakened when Firestore is unavailable
- **Description**: The vendor middleware accepts the JWT and role, but the blocked-status check is only applied when a Firestore instance is available. When Firestore is unavailable, the request continues without enforcing the vendor account status check.
- **File**: [server/vendor.ts](server/vendor.ts), [server/firebase.ts](server/firebase.ts)
- **Function**: requireVendor, getFirestore
- **Evidence**: In [server/vendor.ts](server/vendor.ts), the middleware validates the JWT and role, then performs the vendor document lookup and status enforcement only if a Firestore instance exists. In [server/firebase.ts](server/firebase.ts), getFirestore returns null when Firebase is not initialized or unavailable. Because the vendor routes are protected by this middleware, the access decision becomes effectively fail-open in that condition.
- **Impact**: A blocked vendor may continue to use protected vendor endpoints during a Firestore outage, which weakens the security boundary for the vendor surface.
- **Priority**: Critical

---

## 2. Confirmed Medium Issues

### 1) Admin session revocation can degrade silently when Firestore is unavailable
- **Description**: The admin revocation state is loaded from Firestore during startup. If Firestore is unavailable, the revocation state is not loaded, and the system continues with an incomplete revocation set.
- **File**: [server/adminAuth.ts](server/adminAuth.ts), [server/index.ts](server/index.ts)
- **Function**: loadRevocationState, isValidSession
- **Evidence**: In [server/adminAuth.ts](server/adminAuth.ts), loadRevocationState returns early when getFirestore returns null. The server calls this during startup in [server/index.ts](server/index.ts) before normal traffic is accepted. The code comments explicitly state that the condition degrades revocation.
- **Impact**: Invalidated admin sessions may remain accepted until Firestore becomes available again, which weakens admin access control during an outage.
- **Priority**: Medium

### 2) The image hash cache can grow without bound
- **Description**: The in-memory image-hash cache stores entries indefinitely and does not enforce eviction, TTL, or size limits.
- **File**: [server/routes.ts](server/routes.ts)
- **Function**: image upload handler using imageHashMap
- **Evidence**: The cache is declared as a Map in [server/routes.ts](server/routes.ts) and entries are inserted on each upload. There is no eviction logic, no TTL, and no maximum size guard in the current implementation.
- **Impact**: Memory usage can increase over time, and a restart would discard the in-memory state. This is a reliability concern for long-running processes.
- **Priority**: Medium

### 3) API error responses use inconsistent shapes
- **Description**: Route handlers commonly return an object with an error field, while the global error handler returns an object with a message field.
- **File**: [server/index.ts](server/index.ts), [server/routes.ts](server/routes.ts)
- **Function**: setupErrorHandler, route handlers
- **Evidence**: In [server/index.ts](server/index.ts), the global error handler returns a JSON object with a message field. In [server/routes.ts](server/routes.ts), many route handlers return JSON objects with an error field. This mismatch is visible in the current server code and creates inconsistent client-side error handling.
- **Impact**: Clients may fail to surface the intended server error details, which reduces diagnosability and can lead to misleading fallback messages.
- **Priority**: Medium

---

## 3. Low Priority Improvements

### 1) Centralize client-side API error parsing
- **Description**: The client can benefit from a single shared helper for extracting error text from API responses.
- **File**: [client/context/OrderContext.tsx](client/context/OrderContext.tsx)
- **Function**: client-side error handling logic
- **Evidence**: The current codebase already contains client-side branches that interpret error payloads differently, which suggests that error parsing is handled in multiple places rather than through one shared helper.
- **Impact**: Improves consistency and maintainability, but it is not a confirmed defect by itself.
- **Priority**: Low

### 2) Add explicit observability for degraded auth and vendor checks
- **Description**: When Firestore-backed checks are skipped, the server should emit a clear operational signal.
- **File**: [server/vendor.ts](server/vendor.ts), [server/adminAuth.ts](server/adminAuth.ts)
- **Function**: requireVendor, loadRevocationState
- **Evidence**: The current code logs some failures, but the fail-open conditions are not surfaced through a dedicated operational signal in the middleware paths themselves.
- **Impact**: Helps operators detect degraded security behavior earlier, without changing the core logic.
- **Priority**: Low

### 3) Consider capping or avoiding cache growth for large fallback images
- **Description**: The cache could be made more conservative by limiting or skipping entries that are large fallback payloads.
- **File**: [server/routes.ts](server/routes.ts)
- **Function**: image upload handler
- **Evidence**: The current code stores values into the image cache without any limit or guard. A bounded policy would reduce memory pressure.
- **Impact**: Improves stability and memory usage, but this is a hardening improvement rather than a separate bug.
- **Priority**: Low

---

## 4. Needs Further Verification

### 1) Production impact of the fail-open vendor path during a real Firestore outage
- **Description**: The source code confirms that the path exists, but the exact runtime impact during a live outage cannot be measured from the repository alone.
- **File**: [server/vendor.ts](server/vendor.ts), [server/firebase.ts](server/firebase.ts)
- **Function**: requireVendor, getFirestore
- **Evidence**: The code shows the branch that skips the status check when Firestore is unavailable. The effect on real traffic during an actual incident is not included in the repository.
- **Impact**: Security impact is clear in code, but operational confirmation requires runtime observation.
- **Priority**: Medium

### 2) Full client-side effect of the error-shape mismatch across all screens
- **Description**: The repository shows the mismatch in the server code and multiple client-side consumers, but the full user-visible effect across all screens was not validated in this review.
- **File**: [server/index.ts](server/index.ts), [server/routes.ts](server/routes.ts), [client/context/OrderContext.tsx](client/context/OrderContext.tsx)
- **Function**: setupErrorHandler, client error parsing
- **Evidence**: The server returns different shapes, and some client code already handles both. The exact runtime behavior across every screen is not fully demonstrated by source inspection alone.
- **Impact**: The issue is likely real, but its scope across the UI requires runtime verification.
- **Priority**: Medium

### 3) Whether the image cache growth causes measurable memory pressure under real traffic
- **Description**: The code confirms that the cache is unbounded, but the repository does not include runtime metrics or production logs to prove that this caused memory pressure in practice.
- **File**: [server/routes.ts](server/routes.ts)
- **Function**: image upload handler
- **Evidence**: The current implementation does not impose any cache limits. The repository does not contain load-test results or production memory traces to quantify the effect.
- **Impact**: The reliability risk is evident from the code, but the practical severity requires runtime measurement.
- **Priority**: Medium

---

## Final Note

This report includes only findings that are directly supported by the current source code. No other files were modified beyond this report.
