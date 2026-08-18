/**
 * H-77 — "there is no store release configuration at all: no submit section, no
 * buildNumber/versionCode, no channels, no expo-updates — meaning no remote
 * update and no rollback, and any defect needs a full review cycle."
 *
 * Measured on the pre-fix tree, every clause was literally true:
 *   eas.json       → cli + 3 build profiles. No submit, no channel, no autoIncrement.
 *   app.config.js  → no updates block, no runtimeVersion, no buildNumber/versionCode.
 *   package.json   → expo-updates not a dependency, not in node_modules.
 *
 * These checks read the REAL configuration — eas.json as JSON, and app.config.js
 * by evaluating the module the way Expo does — rather than asserting on text. A
 * config that merely mentions the right words but does not resolve would pass a
 * grep and fail here.
 *
 * Nothing builds, submits or publishes. This is configuration validation only.
 *
 * Run:  node --test tests/unit/h77-release-configuration.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const read = (p) => readFileSync(join(root, p), "utf8");
const require_ = createRequire(join(root, "package.json"));

const EAS = JSON.parse(read("eas.json"));
const PKG = JSON.parse(read("package.json"));
const EAS_RAW = read("eas.json");
const APP_RAW = read("app.config.js");

/** app.config.js evaluated exactly as Expo evaluates it (EAS_BUILD unset). */
const APP = require_(join(root, "app.config.js")).expo;

const BUILD_PROFILES = ["development", "preview", "production"];
/** Profiles that produce an artifact a human installs, so must be distinguishable. */
const RELEASE_PROFILES = ["preview", "production"];

// ═════════════════════════════════════════════════════════════════════════════
describe("H-77 · A. build profiles", () => {
  test("A. all three profiles exist", () => {
    for (const p of BUILD_PROFILES) {
      assert.ok(EAS.build?.[p], `eas.json has no build profile "${p}"`);
    }
  });

  test("A. every profile carries the API base URL it builds against", () => {
    for (const p of BUILD_PROFILES) {
      assert.ok(
        EAS.build[p].env?.EXPO_PUBLIC_API_BASE_URL,
        `profile "${p}" would build against an undefined API host`,
      );
    }
  });

  test("A. production ships an app bundle, not an apk", () => {
    // Play Store requires .aab; an apk profile cannot be submitted.
    assert.equal(EAS.build.production.android?.buildType, "app-bundle");
    assert.equal(EAS.build.preview.android?.buildType, "apk",
      "the internal preview should stay a directly-installable apk");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-77 · B. submit profiles", () => {
  test("B. a submit section exists", () => {
    assert.ok(EAS.submit, "eas.json still has no submit section — H-77's first clause");
  });

  test("B. production can be submitted to both stores", () => {
    assert.ok(EAS.submit.production?.ios, "no iOS submit configuration");
    assert.ok(EAS.submit.production?.android, "no Android submit configuration");
  });

  test("B. iOS submission names the account, the app and the team", () => {
    const ios = EAS.submit.production.ios;
    for (const k of ["appleId", "ascAppId", "appleTeamId"]) {
      assert.ok(ios[k], `iOS submit is missing ${k}`);
    }
  });

  test("B. Android submission targets a real Play track", () => {
    const android = EAS.submit.production.android;
    assert.ok(["production", "beta", "alpha", "internal"].includes(android.track),
      `unknown Play track: ${android.track}`);
    assert.equal(android.releaseStatus, "draft",
      "an automatic upload should land as a draft — releasing to users stays a human decision");
  });

  test("B. neither platform is configured alone", () => {
    // A submit profile that only knows about one platform silently makes the
    // other one a manual, undocumented step.
    for (const [name, prof] of Object.entries(EAS.submit)) {
      assert.ok(prof.ios, `submit profile "${name}" has no iOS half`);
      assert.ok(prof.android, `submit profile "${name}" has no Android half`);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-77 · C+D. native build numbers are issuable and increment", () => {
  test("the versioning source is declared", () => {
    assert.equal(EAS.cli?.appVersionSource, "remote",
      "without an explicit appVersionSource the numbering scheme is ambiguous");
  });

  test("C+D. every store-bound profile auto-increments", () => {
    for (const p of RELEASE_PROFILES) {
      assert.equal(EAS.build[p].autoIncrement, true,
        `profile "${p}" reuses the same build number — the second upload is rejected`);
    }
  });

  test("C+D. autoIncrement covers BOTH platforms, not one", () => {
    // `true` means both. A platform-scoped object would silently leave the other
    // platform stuck on one number.
    for (const p of RELEASE_PROFILES) {
      const inc = EAS.build[p].autoIncrement;
      assert.notEqual(typeof inc, "string",
        `profile "${p}" increments only "${inc}" — the other platform never moves`);
      assert.equal(inc, true);
    }
  });

  test("C+D. the numbers are NOT also hardcoded in the app config", () => {
    // With remote versioning EAS owns them; values here are ignored and the two
    // sources drift apart, which is worse than having none.
    assert.equal(APP.ios?.buildNumber, undefined,
      "ios.buildNumber is hardcoded while appVersionSource is remote");
    assert.equal(APP.android?.versionCode, undefined,
      "android.versionCode is hardcoded while appVersionSource is remote");
  });

  test("the user-facing version is untouched and still valid", () => {
    assert.equal(APP.version, "1.0.0", "the marketing version was changed unnecessarily");
    assert.match(APP.version, /^\d+\.\d+\.\d+$/);
  });

  test("development does not burn store version numbers", () => {
    assert.notEqual(EAS.build.development.autoIncrement, true,
      "dev-client builds never reach a store; incrementing for them inflates the counter");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-77 · E+F. channels keep the streams apart", () => {
  test("E+F. every profile declares a channel", () => {
    for (const p of BUILD_PROFILES) {
      assert.ok(EAS.build[p].channel,
        `profile "${p}" has no channel — its binary accepts no updates at all`);
    }
  });

  test("E. production is bound to the production channel", () => {
    assert.equal(EAS.build.production.channel, "production");
  });

  test("F. no non-production profile uses the production channel", () => {
    for (const p of BUILD_PROFILES.filter((x) => x !== "production")) {
      assert.notEqual(EAS.build[p].channel, "production",
        `"${p}" publishes into the production stream — a test build would reach customers`);
    }
  });

  test("F. each profile has its own channel — none are shared", () => {
    const channels = BUILD_PROFILES.map((p) => EAS.build[p].channel);
    assert.equal(new Set(channels).size, channels.length,
      `two profiles share a channel: ${channels.join(", ")}`);
  });

  test("channel names match their profile, so the mapping is not surprising", () => {
    for (const p of BUILD_PROFILES) {
      assert.equal(EAS.build[p].channel, p);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-77 · G+H. expo-updates is installed and pointed at this project", () => {
  test("G. expo-updates is a dependency", () => {
    assert.ok(PKG.dependencies?.["expo-updates"],
      "expo-updates is not installed — there is no remote update mechanism");
  });

  test("G. it is actually present, not just declared", () => {
    assert.ok(existsSync(join(root, "node_modules/expo-updates")),
      "expo-updates is in package.json but not installed");
  });

  test("G. its version is the one this Expo SDK pins", () => {
    // Taken from Expo's own bundled manifest rather than guessed.
    const bundled = require_(join(root, "node_modules/expo/bundledNativeModules.json"));
    const pinned = bundled["expo-updates"];
    assert.ok(pinned, "the SDK no longer pins expo-updates");
    assert.equal(PKG.dependencies["expo-updates"], pinned,
      `expo-updates ${PKG.dependencies["expo-updates"]} does not match the SDK's ${pinned}`);
  });

  test("G. the config declares an updates block", () => {
    assert.ok(APP.updates?.url, "no updates.url — the app would never look for one");
  });

  test("H. the update URL is an Expo updates endpoint", () => {
    assert.match(APP.updates.url, /^https:\/\/u\.expo\.dev\//,
      `unexpected updates host: ${APP.updates.url}`);
  });

  test("H. a projectId exists and is a UUID", () => {
    const id = APP.extra?.eas?.projectId;
    assert.ok(id, "no EAS projectId");
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  test("H. the URL and the projectId cannot disagree", () => {
    // If they drift, the app asks a different project for updates than the one
    // publishes go to: updates never arrive and rollback is dead when needed.
    assert.equal(APP.updates.url, `https://u.expo.dev/${APP.extra.eas.projectId}`);
  });

  test("H. the id is written once, not repeated by hand", () => {
    const literals = APP_RAW.match(/31018b2b-d742-4f09-8d17-48d00575216c/g) ?? [];
    assert.equal(literals.length, 1,
      `the project id is typed ${literals.length} times — they can drift apart`);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-77 · I+K. an incompatible bundle cannot reach a binary", () => {
  test("I. a runtimeVersion policy is declared", () => {
    assert.ok(APP.runtimeVersion, "no runtimeVersion — updates would have no compatibility gate");
  });

  test("K. the policy is derived from the NATIVE project", () => {
    // fingerprint / nativeVersion change whenever the native side changes.
    // appVersion and sdkVersion do not: adding a native dependency without
    // touching `version` would let an incompatible bundle reach an old binary.
    const policy = APP.runtimeVersion.policy ?? APP.runtimeVersion;
    assert.ok(["fingerprint", "nativeVersion"].includes(policy),
      `runtimeVersion policy "${policy}" does not track native changes — an OTA ` +
        `could be delivered to a binary that cannot run it`);
  });

  test("K. it is a policy, never a hand-written string", () => {
    assert.equal(typeof APP.runtimeVersion, "object",
      "a literal runtimeVersion has to be remembered on every native change");
    assert.ok(APP.runtimeVersion.policy);
  });

  test("K. the app is not told to block startup on a fetch", () => {
    // A blocking fetch on a slow connection is indistinguishable from a frozen
    // splash screen; it is also how a bad update becomes a bad launch.
    assert.equal(APP.updates.fallbackToCacheTimeout, 0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-77 · J. no credentials in tracked configuration", () => {
  const SECRET_PATTERNS = [
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "a private key"],
    [/"private_key"\s*:/, "a service-account private_key"],
    [/AIza[0-9A-Za-z_-]{30,}/, "a Google API key"],
    [/"type"\s*:\s*"service_account"/, "an inline service account"],
    [/ghp_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}/, "an access token"],
    [/app-specific|appSpecificPassword/i, "an Apple app-specific password"],
  ];

  for (const [file, src] of [["eas.json", EAS_RAW], ["app.config.js", APP_RAW]]) {
    test(`J. ${file} contains no secret`, () => {
      for (const [re, what] of SECRET_PATTERNS) {
        assert.ok(!re.test(src), `${file} contains ${what}`);
      }
    });
  }

  test("J. Apple identifiers come from the environment", () => {
    const ios = EAS.submit.production.ios;
    for (const k of ["appleId", "ascAppId", "appleTeamId"]) {
      assert.match(String(ios[k]), /^\$[A-Z0-9_]+$/,
        `${k} is a literal in eas.json — it should be an $ENV reference`);
    }
  });

  test("J. no Google Play key path is committed", () => {
    // The key is registered with EAS (eas credentials) instead, so neither the
    // key nor a path to it lives in the repository.
    for (const prof of Object.values(EAS.submit)) {
      assert.equal(prof.android?.serviceAccountKeyPath, undefined,
        "a Play service-account key path is committed");
    }
  });

  test("J. the Maps key and Sentry values still come from the environment", () => {
    // H-77 must not have inlined anything the project already sourced from env.
    assert.match(APP_RAW, /process\.env\.GOOGLE_MAPS_API_KEY/);
    assert.match(APP_RAW, /process\.env\.SENTRY_ORG/);
    assert.ok(!/SENTRY_AUTH_TOKEN\s*:/.test(APP_RAW), "the Sentry auth token was inlined");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-77 · L. rollback is actually possible, and written down", () => {
  const DOC = "H77RELEASE.md";

  test("L. the release/rollback procedure is documented", () => {
    assert.ok(existsSync(join(root, DOC)), `${DOC} is missing`);
  });

  test("L. it names a concrete way back", () => {
    const doc = read(DOC);
    // Republish a known-good group, or fall back to the bundle inside the binary.
    assert.match(doc, /eas update:republish/, "no way to return to a previous update");
    assert.match(doc, /eas update:roll-back-to-embedded/,
      "no way back when every published update is bad");
  });

  test("L. it states the limit of an OTA rollback", () => {
    // A phone already running the bad bundle keeps it until relaunch. Anything
    // that must stop instantly needs a server switch, not an update.
    assert.match(read(DOC), /until they reopen the app|not instant/i,
      "the doc implies rollback is instant for every user, which it is not");
  });

  test("L. the configuration supports it — a channel to re-point", () => {
    // Republishing targets a channel; without one there is nothing to re-point.
    assert.equal(EAS.build.production.channel, "production");
    assert.ok(APP.updates?.url, "no update endpoint to serve the rollback from");
  });

  test("L. the external setup that is NOT done here is listed", () => {
    const doc = read(DOC);
    for (const needle of ["EXPO_APPLE_ID", "eas credentials", "EXPO_APPLE_APP_SPECIFIC_PASSWORD"]) {
      assert.ok(doc.includes(needle), `${DOC} does not mention ${needle}`);
    }
  });

  test("L. it warns that OTA only works from the next native build", () => {
    assert.match(read(DOC), /native module|built after this/i,
      "an operator could expect existing installs to start receiving updates");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-77 · the config is internally consistent", () => {
  test("eas.json and app.config.js do not contradict each other", () => {
    // Remote versioning + hardcoded native versions is the classic conflict.
    if (EAS.cli.appVersionSource === "remote") {
      assert.equal(APP.ios?.buildNumber, undefined);
      assert.equal(APP.android?.versionCode, undefined);
    }
  });

  test("every submit profile names a build profile that exists", () => {
    for (const name of Object.keys(EAS.submit)) {
      assert.ok(EAS.build[name], `submit profile "${name}" has no matching build profile`);
    }
  });

  test("both platforms are still configured for building", () => {
    assert.ok(APP.ios?.bundleIdentifier, "iOS bundle identifier disappeared");
    assert.ok(APP.android?.package, "Android package disappeared");
    assert.equal(APP.ios.bundleIdentifier, APP.android.package,
      "the two platform identifiers drifted apart");
  });

  test("the C-14 build-time environment guard is intact", () => {
    // H-77 must not have weakened the check that refuses to build a binary with
    // missing configuration.
    assert.match(APP_RAW, /EAS_BUILD === "true"/);
    assert.match(APP_RAW, /Refusing to build/);
  });
});
