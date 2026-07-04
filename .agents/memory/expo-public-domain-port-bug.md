---
name: EXPO_PUBLIC_DOMAIN must not include an explicit port for native/public API calls
description: Root cause of native app hangs on any API call (login, OTP, etc.) — the public Replit domain is unreachable with an explicit internal port appended.
---

`package.json`'s `expo:dev` script sets `EXPO_PUBLIC_DOMAIN=$REPLIT_DEV_DOMAIN:5000` (with an explicit `:5000` suffix). This value gets inlined into the client bundle and used by `getApiUrl()` (`client/lib/query-client.ts`) to build the base URL for every API call.

**Bug:** Replit's public HTTPS domain only accepts standard 443 traffic and proxies it internally to the workflow's port — it does NOT accept an explicit alternate port in the URL from outside the workspace. `https://<repl-domain>:5000/...` times out / connection-refused (confirmed via curl: HTTP code `000`), while the same request without the port (`https://<repl-domain>/...`) returns 200. Any native (or truly external) client hitting `getApiUrl()` therefore hung forever on every request (login/send-otp, etc.) even though the server itself was completely healthy.

**Why it was hard to spot:** in-workspace previews/screenshots and curl-from-the-container tests don't go through the public edge the same way, so the server looked "fine" in every direct health check; only requests actually routed through the public domain with the port attached failed.

**Fix:** cannot edit `package.json` (forbidden), so the fix lives in `client/lib/query-client.ts` — `getApiUrl()` now strips any trailing `:<port>` from `EXPO_PUBLIC_DOMAIN` before constructing the URL, for both web and native branches.

**How to apply:** if a mobile/native screen appears to "hang" or "freeze" indefinitely on any network action (not erroring, just never resolving) while the backend tests fine via direct curl, suspect a stale/incorrect `EXPO_PUBLIC_DOMAIN` (or similar hardcoded API base) carrying an explicit port meant for internal-only use. Test by curling `https://<domain>:<port>/...` from outside vs. `https://<domain>/...` — a `000`/timeout on the ported version vs. 200 on the bare domain confirms this class of bug.
