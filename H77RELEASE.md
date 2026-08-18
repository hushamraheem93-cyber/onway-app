# OnWay — Release, Update and Rollback (H-77)

Before this, the project had no release configuration at all: no `submit` section,
no native build numbering, no channels, and no `expo-updates`. Every fix — a typo
in an Arabic string, a wrong delivery fee — required a full App Store and Play
review, and there was no mechanism to take a bad release back.

This document is the operational half of that fix. Nothing here has been run.

---

## 1. What ships where

| Profile | Channel | Distribution | Android artifact | Native version |
|---|---|---|---|---|
| `development` | `development` | internal, dev client | apk (default) | not incremented |
| `preview` | `preview` | internal | `apk` | auto-incremented |
| `production` | `production` | store | `app-bundle` | auto-incremented |

A binary is bound to its channel **at build time**. A production binary only ever
accepts updates published to `production`; nothing published to `preview` or
`development` can reach a customer's phone.

`development` is deliberately **not** auto-incremented — those builds never reach
a store, and burning remote version numbers on them only inflates the counter.

## 2. Native build numbers

`eas.json` sets `cli.appVersionSource: "remote"`, so **EAS owns** the iOS
`buildNumber` and the Android `versionCode`. They must **not** be written into
`app.config.js` — EAS ignores them there and the two sources drift apart.

`"autoIncrement": true` on `preview` and `production` is what makes each build
distinguishable: EAS bumps the stored number for the platform being built, so no
two binaries ever carry the same one and both stores accept consecutive uploads.

The user-facing `version` (`1.0.0`) is unchanged and is bumped by hand when you
decide a release deserves a new marketing version.

To inspect or set the counters (no build is triggered):

```bash
eas build:version:get  --platform ios
eas build:version:get  --platform android
eas build:version:set  --platform ios       # only if you must align with an existing store build
```

## 3. Updates and the compatibility guarantee

`app.config.js` sets:

```js
updates:        { url: `https://u.expo.dev/${EAS_PROJECT_ID}`, fallbackToCacheTimeout: 0 }
runtimeVersion: { policy: "fingerprint" }
```

The update URL is derived from the same `EAS_PROJECT_ID` constant as
`extra.eas.projectId`, so the app can never ask a different project for its
updates than the one you publish to.

**`fingerprint` is the safety property.** The runtime version is computed from the
native project itself, so any change to native code, a native dependency, or the
config that generates them yields a different fingerprint. An update is only
delivered to a binary whose fingerprint matches — so a JS bundle expecting a
native module the installed binary does not have can never be handed to it.

`appVersion` would not give that: adding a native dependency without touching
`version` would let an incompatible bundle reach an old binary and crash it on
launch.

**Consequence to plan around:** a native change means a **new build**, not an OTA.
`eas update` will refuse to serve it to older binaries — which is the point.

## 4. Publishing an update

```bash
eas update --channel preview     --message "what changed"   # test first
eas update --channel production  --message "what changed"
```

Always exercise `preview` on a real device before touching `production`.

## 5. Rollback — three options, fastest first

### 5a. Roll back to the previous update (seconds)

```bash
eas update:list --branch production          # find the last good update group
eas update:republish --group <GOOD_GROUP_ID> --message "rollback: <why>"
```

Republishing re-points the channel at a known-good bundle. Phones pick it up on
next launch (the current session keeps running the bad bundle until relaunch).

### 5b. Roll back to the embedded bundle (when no good update exists)

```bash
eas update:roll-back-to-embedded --channel production --message "rollback to store build"
```

Sends every phone back to the JS that shipped inside the installed binary. This is
the correct move when the newest *and* previous updates are both bad.

### 5c. Stop an update reaching anyone else

```bash
eas channel:edit production --branch <KNOWN_GOOD_BRANCH>
```

Re-points the channel at a different branch entirely.

> **Rollback is not instant for a phone already running the bad bundle.** The app
> fetches on launch, so a user mid-session keeps the bad code until they reopen
> the app. Anything that must stop immediately for everyone — a wrong price, a
> broken order flow — needs a server-side switch, not an OTA.

## 6. Submitting to the stores

```bash
eas submit --platform ios      --profile production
eas submit --platform android  --profile production
```

Android is submitted with `releaseStatus: "draft"` on purpose: the upload happens
automatically, the decision to release to users stays a human one in Play Console.

---

## 7. What you must configure — none of it done here

### 7a. Environment variables for `eas submit` (iOS)

`eas.json` references these; they hold no secret and are read at submit time:

| Variable | What it is |
|---|---|
| `EXPO_APPLE_ID` | the Apple account email used to submit |
| `EXPO_ASC_APP_ID` | App Store Connect app id (numeric) |
| `EXPO_APPLE_TEAM_ID` | Apple developer team id |

The **app-specific password** must never be committed. Provide it as
`EXPO_APPLE_APP_SPECIFIC_PASSWORD` in the submit environment, or let EAS prompt
and store it.

### 7b. Google Play service account

`eas.json` deliberately carries **no** `serviceAccountKeyPath` — that would put a
key path (and invite the key itself) into the repository. Register it once with
EAS instead:

```bash
eas credentials         # Android → Google Service Account → upload the JSON key
```

### 7c. First build after this change

`expo-updates` is a **native** module. It only takes effect in a binary built
after this commit — an existing installed app will not start receiving updates.
Build and distribute once per platform before relying on OTA:

```bash
eas build --platform ios     --profile production
eas build --platform android --profile production
```

### 7d. Channel creation

`eas update` creates a channel on first publish. Nothing to pre-create.

---

## 8. Not addressed here

- No CI wiring for builds or submissions (out of H-77's scope).
- No staged/percentage rollout — `eas update` supports `--rollout-percentage`; it
  is a deliberate operational choice, not configuration, and is left to you.
