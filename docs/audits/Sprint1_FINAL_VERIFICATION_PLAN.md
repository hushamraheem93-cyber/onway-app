# Sprint 1 Final Verification Plan

## Safety boundary

All verification is local and isolated. No Firebase service-account variables, Google application credentials, or Firestore/Auth emulator variables are present in the sandbox. Therefore no request will be sent to a real Firestore project, no production Admin account will be created, no real balance will be changed, and no financial transaction will be seeded.

## Practical verification strategy

The verification will use signed test sessions and a real Express-style authorization boundary invocation for every role. It will exercise the same JWT creation, claim parsing, permission mapping, 401/403 decisions, and audit-sanitization functions used by the application. Firestore-backed flows will be validated through deterministic source checks and existing transaction/audit unit tests rather than by inventing a production-like database.

## Scenarios

| Area | Safe test |
|---|---|
| Authentication | Create signed sessions for Super, Finance, Operations, and Support identities; recover all identity claims; check invalid/expired/wrong-type sessions. |
| RBAC | Call the real central boundary with role-specific requests and verify ALLOW/403. |
| Finance | Verify Finance permissions for approve/reject/complete and adjustment capabilities; verify Operations and Support are denied. |
| Operations | Verify Operations permissions for order reads/updates, driver assignment/management, merchant management, and operations management; verify Finance cannot manage drivers or merchants. |
| Super Admin | Verify wildcard access to all mapped permissions and Admin User management. |
| Unknown API | Verify non-Super roles receive 403 for unmapped Admin paths. |
| Audit | Persist a test audit record through `recordAudit` with fake in-memory storage, then verify identity, before/after, and secret scrubbing. |
| Legacy migration | Verify the migration state machine and bootstrap guards statically and through isolated code-path tests; do not call Firestore because no isolated database is configured. |
| Disabled Admin | Verify disabled identities cannot authenticate from the Admin User path and the last Super Admin invariant is enforced by the implementation. |
| Financial integrity | Compare Sprint 1 diff against protected financial identifiers and run existing ledger/settlement regression tests; no financial data is touched. |
| Regression | Run typecheck, server build, Sprint 1 tests, targeted regressions, full unit suite, baseline comparison, and Git diff checks. |

## Evidence classification

A `PASS` means the behavior was executed in the isolated runtime or the relevant regression test passed. A `PASS WITH LIMITATION` means the implementation and tests are present but live Firestore execution could not be performed because no isolated Firebase emulator or service account is available. A `FAIL` is reserved for a new behavior failure attributable to Sprint 1.
