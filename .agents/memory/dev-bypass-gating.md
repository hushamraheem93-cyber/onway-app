---
name: Dev-only bypass gating
description: How to correctly gate dev/testing-only bypass code paths in this project's Replit environment
---

The "Start Backend" workflow builds and runs the server with `NODE_ENV=production`
explicitly (`npm run server:prod`), even in the dev workspace. This means
`process.env.NODE_ENV !== "production"` is **always false** here — it can never be
used to detect "we're in the Replit dev workspace, not a real deployment."

**Why:** An OTP dev-bypass gated on `NODE_ENV !== "production"` silently never
activated in this workspace, even with the feature flag on, because the server
always reports itself as production.

**How to apply:** To distinguish the Replit dev workspace from an actual published
deployment, gate on `process.env.REPLIT_DEPLOYMENT !== "1"` instead of (or in
addition to) `NODE_ENV`. `REPLIT_DEPLOYMENT` is only set to `"1"` on real published
deployments, never in the workspace — making it the reliable signal for
"is this a live production deployment" in this stack.
