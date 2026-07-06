---
name: Notification sound architecture across the 4 dashboards
description: How in-app sound alerts work for customer, admin, vendor, driver interfaces and where to add/change them
---

The app has 4 separate interfaces, each with its own notification/alert path (on top of Expo push notifications, which all use `sound: "default"` server-side in `server/pushNotifications.ts`):

- **Customer** (mobile app): relies solely on Expo push notifications (`client/hooks/usePushNotifications.ts`). No custom in-app sound.
- **Admin** (web dashboard, `server/templates/admin.html`): polls `/api/admin/orders` every 10s and plays a synthetic Web Audio API tone via `playAlertSound()` on new pending orders. Sound is enabled by default via a checkbox (`#sound-toggle`, `_soundEnabled`).
- **Vendor** (mobile app): `client/context/VendorNotificationsContext.tsx` polls `/api/vendor/orders` every 20s, detects new pending orders, shows a popup + haptics, and now also plays a loud local alarm via the shared helper.
- **Driver** (mobile app): `client/screens/DriverHomeScreen.tsx` polls driver status every 4-10s; `triggerNewBatchAlert()` fires vibration + haptics + a local scheduled notification, and now also plays the same loud local alarm.

**Shared helper:** `client/lib/alertSound.ts` (`playLoudAlert()`) uses `expo-audio`'s imperative `createAudioPlayer(require(".../alarm.mp3"))` at volume 1.0, one-shot, auto-disposed after ~6s. Reuse this helper for any future "urgent new order/event" sound needs on driver/vendor — don't invent a new pattern per screen.

**Why:** the driver and vendor apps previously relied only on OS-default push sound (easy to miss / not distinct), and the asset `client/assets/sounds/alarm.mp3` existed in the repo but was never wired to any code path.
