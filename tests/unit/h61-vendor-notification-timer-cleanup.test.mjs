/**
 * H-61 — the vendor's new-order alarm must not outlive its provider.
 *
 * Correction to the audit's location: VendorNotificationsContext.tsx:97 is the
 * new-order filter, not a timer. The alarm's timers live at MODULE scope in
 * client/lib/alertSound.ts, scheduled by playRepeatingAlert(). The audit's
 * substance is right though — they are outside React, and none of the provider's
 * four cleanups called stopAlert(), so the sequence kept firing after the vendor
 * left with no popup left to silence it. Measured window: pulses at 0/5/10/15 s
 * and the last tone's player removed at 21 s (the audit says 25 s).
 *
 * Everything here executes the SHIPPED alertSound module under a fake clock and a
 * fake audio player, so "a tone played" means play() was really called.
 *
 * Run:  node --test tests/unit/h61-vendor-notification-timer-cleanup.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { stripComments } from "./_source.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const ALERT = read("client/lib/alertSound.ts");
const CONTEXT = read("client/context/VendorNotificationsContext.tsx");

// ── a controllable clock ────────────────────────────────────────────────────

function makeClock() {
  let now = 0;
  let seq = 0;
  const scheduled = new Map();
  return {
    get pending() {
      return scheduled.size;
    },
    get now() {
      return now;
    },
    setTimeout(fn, ms) {
      const id = ++seq;
      scheduled.set(id, { fn, at: now + (ms || 0) });
      return id;
    },
    clearTimeout(id) {
      scheduled.delete(id);
    },
    async advance(ms) {
      const target = now + ms;
      for (;;) {
        const due = [...scheduled.entries()]
          .filter(([, t]) => t.at <= target)
          .sort((a, b) => a[1].at - b[1].at);
        if (!due.length) break;
        const [id, t] = due[0];
        scheduled.delete(id);
        now = t.at;
        await t.fn();
        await Promise.resolve();
      }
      now = target;
    },
  };
}

/**
 * Load the real alertSound module with the platform, audio and timer APIs injected.
 *
 * Only the three imports are replaced; every line of logic is the shipped one.
 * Each instance gets its own module state, which is what makes the remount case (E)
 * meaningful: two instances must not clear each other's timers.
 */
function loadAlertSound() {
  const clock = makeClock();
  const plays = [];
  const players = [];
  const haptics = [];

  const src = ALERT.replace(/^import[\s\S]*?from "expo-audio";/m, "")
    .replace(/^import \{ Platform \} from "react-native";/m, "")
    .replace(
      /^const alarmSource = require\(.*\);$/m,
      "const alarmSource = 'alarm.mp3';",
    );

  const js = ts
    .transpileModule(src, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    })
    .outputText.replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gm, "")
    .replace(/^export /gm, "");

  const api = new Function(
    "Platform",
    "createAudioPlayer",
    "setAudioModeAsync",
    "setTimeout",
    "clearTimeout",
    `${js}\nreturn { playLoudAlert, playRepeatingAlert, stopAlert };`,
  )(
    { OS: "ios" },
    () => {
      const p = {
        volume: 0,
        removed: false,
        playing: false,
        play() {
          this.playing = true;
          plays.push(clock.now);
        },
        remove() {
          this.removed = true;
          this.playing = false;
        },
      };
      players.push(p);
      return p;
    },
    async () => {},
    (fn, ms) => clock.setTimeout(fn, ms),
    (id) => clock.clearTimeout(id),
  );

  return { ...api, clock, plays, players, haptics };
}

/**
 * The provider's alert lifecycle, driven the way React would drive it.
 *
 * mount() runs the effect body; unmount() runs the cleanup the effect returns —
 * both lifted from the shipped context, so if the cleanup is missing there is
 * simply nothing to run and the tests fail on their merits.
 */
function mountProvider(alert) {
  const src = stripComments(CONTEXT);
  const marker =
    "useEffect(() => {\n    return () => {\n      stopAlert();\n    };\n  }, []);";
  const hasCleanupEffect =
    src.includes(marker.replace(/\n\s*/g, "\n    ").trim()) ||
    /useEffect\(\(\) => \{\s*return \(\) => \{\s*stopAlert\(\);\s*\};\s*\}, \[\]\);/.test(
      src,
    );

  return {
    hasCleanupEffect,
    /** A new pending order arrives while mounted. */
    newOrder() {
      alert.playRepeatingAlert();
    },
    /** The vendor taps the popup. */
    dismiss() {
      alert.stopAlert();
    },
    /** React unmounts the provider — run the alert cleanup if one exists. */
    unmount() {
      if (hasCleanupEffect) alert.stopAlert();
    },
  };
}

// ════════════════════════════════════════════════════════════════════════════
describe("H-61 · where the timers actually are", () => {
  test("the repeat timers are module-level in alertSound.ts", () => {
    assert.match(stripComments(ALERT), /let repeatTimers/);
  });

  test("the context creates no alert timer of its own", () => {
    const timers = [
      ...stripComments(CONTEXT).matchAll(/set(Timeout|Interval)\(/g),
    ].map((m) => m[0]);
    assert.deepEqual(timers, ["setInterval("], "only the 20s fallback poll");
  });

  test("the audit's line 97 is the new-order filter, not a timer", () => {
    const line = CONTEXT.split("\n")[96];
    assert.match(line, /newOrders|pendingOrders|filter/);
  });
});

// ── F. the existing contract ────────────────────────────────────────────────
describe("H-61 · F · the alert window is unchanged", () => {
  test("the default sequence is still 4 pulses, 5s apart", async () => {
    const a = loadAlertSound();
    a.playRepeatingAlert();
    await a.clock.advance(60_000);
    assert.deepEqual(a.plays, [0, 5000, 10000, 15000]);
  });

  test("explicit arguments still control the sequence", async () => {
    const a = loadAlertSound();
    a.playRepeatingAlert(3, 4000); // AdminScreen uses exactly this
    await a.clock.advance(60_000);
    assert.deepEqual(a.plays, [0, 4000, 8000]);
  });

  test("the pulse count is still clamped to 1..6", async () => {
    const few = loadAlertSound();
    few.playRepeatingAlert(0, 1000);
    await few.clock.advance(60_000);
    assert.equal(few.plays.length, 1);

    const many = loadAlertSound();
    many.playRepeatingAlert(99, 1000);
    await many.clock.advance(60_000);
    assert.equal(many.plays.length, 6);
  });

  test("each tone's player is still removed 6s after it starts", async () => {
    const a = loadAlertSound();
    a.playRepeatingAlert(1);
    await a.clock.advance(5_999);
    assert.equal(a.players[0].removed, false);
    await a.clock.advance(2);
    assert.equal(a.players[0].removed, true);
  });
});

// ── A & G. normal operation ─────────────────────────────────────────────────
describe("H-61 · A/G · a new order while mounted still alerts", () => {
  test("the alarm plays for the whole window", async () => {
    const a = loadAlertSound();
    const provider = mountProvider(a);
    provider.newOrder();
    await a.clock.advance(30_000);
    assert.equal(a.plays.length, 4, "the alert must not be weakened");
  });

  test("dismissing silences it early, as before", async () => {
    const a = loadAlertSound();
    const provider = mountProvider(a);
    provider.newOrder();
    await a.clock.advance(6_000);
    const heard = a.plays.length;
    provider.dismiss();
    await a.clock.advance(60_000);
    assert.equal(a.plays.length, heard, "dismiss should stop further pulses");
    assert.ok(
      a.players.every((p) => p.removed),
      "dismiss must silence the tone that is playing",
    );
  });

  test("a second order while mounted restarts the sequence", async () => {
    const a = loadAlertSound();
    const provider = mountProvider(a);
    provider.newOrder();
    await a.clock.advance(6_000); // pulses at 0 and 5000 have played
    assert.deepEqual(a.plays, [0, 5000]);

    provider.newOrder(); // playRepeatingAlert resets any in-flight sequence
    await a.clock.advance(60_000);

    // The first sequence's remaining pulses (10s, 15s) are cancelled and replaced
    // by a fresh four starting now.
    assert.deepEqual(a.plays, [0, 5000, 6000, 11000, 16000, 21000]);
  });

  test("the popup path still calls stopAlert on dismiss", () => {
    const src = stripComments(CONTEXT);
    assert.match(
      src,
      /const dismissNewOrderPopup = useCallback\(\(\) => \{\s*stopAlert\(\);/,
    );
  });
});

// ── B. unmount cancels the timers ───────────────────────────────────────────
describe("H-61 · B · unmount cancels a pending alert", () => {
  test("the provider HAS an unmount cleanup that stops the alert", () => {
    const provider = mountProvider(loadAlertSound());
    assert.ok(
      provider.hasCleanupEffect,
      "VendorNotificationsProvider has no unmount effect calling stopAlert()",
    );
  });

  test("no tone plays after unmount", async () => {
    const a = loadAlertSound();
    const provider = mountProvider(a);
    provider.newOrder();
    await a.clock.advance(3_000); // the vendor hears the first pulse, then leaves
    const heard = a.plays.length;

    provider.unmount();
    await a.clock.advance(60_000);

    assert.equal(
      a.plays.length,
      heard,
      "the alarm kept firing on a screen that no longer exists",
    );
  });

  test("the timers themselves are cleared, not merely ignored", async () => {
    const a = loadAlertSound();
    const provider = mountProvider(a);
    provider.newOrder();
    await a.clock.advance(1_000);
    assert.ok(a.clock.pending > 0, "the sequence should have pending timers");

    provider.unmount();
    assert.equal(
      a.clock.pending,
      0,
      "pending timers must be cleared, not left running behind a flag",
    );
  });

  test("the tone that was playing is stopped too", async () => {
    const a = loadAlertSound();
    const provider = mountProvider(a);
    provider.newOrder();
    await a.clock.advance(100); // a tone is mid-play
    assert.equal(a.players[0].playing, true);

    provider.unmount();
    assert.equal(
      a.players[0].removed,
      true,
      "the audio player was left running",
    );
  });

  test("unmount with no alert in flight is harmless", async () => {
    const a = loadAlertSound();
    const provider = mountProvider(a);
    provider.unmount();
    await a.clock.advance(60_000);
    assert.equal(a.plays.length, 0);
    assert.equal(a.clock.pending, 0);
  });
});

// ── C. several timers ───────────────────────────────────────────────────────
describe("H-61 · C · every timer is cancelled, not just the last", () => {
  test("a full 6-pulse sequence leaves nothing pending after unmount", async () => {
    const a = loadAlertSound();
    const provider = mountProvider(a);
    a.playRepeatingAlert(6, 5000);
    assert.equal(a.clock.pending, 6, "six pulses should be scheduled");

    provider.unmount();
    assert.equal(a.clock.pending, 0, "not every pulse timer was cleared");

    await a.clock.advance(120_000);
    assert.equal(a.plays.length, 0);
  });

  test("pulse timers AND the removal timer are both cleared", async () => {
    const a = loadAlertSound();
    const provider = mountProvider(a);
    a.playRepeatingAlert(3, 5000);
    await a.clock.advance(100); // first tone playing → its 6s removal timer exists
    assert.ok(a.clock.pending >= 3, "two pulses + one removal timer at least");

    provider.unmount();
    assert.equal(
      a.clock.pending,
      0,
      "the tone-removal timer was left scheduled after unmount",
    );
  });

  test("orders arriving back to back leave nothing behind", async () => {
    const a = loadAlertSound();
    const provider = mountProvider(a);
    a.playRepeatingAlert();
    await a.clock.advance(2_000);
    a.playRepeatingAlert();
    await a.clock.advance(2_000);
    a.playRepeatingAlert();

    provider.unmount();
    assert.equal(a.clock.pending, 0);
    const heard = a.plays.length;
    await a.clock.advance(120_000);
    assert.equal(a.plays.length, heard);
  });
});

// ── D. the race ─────────────────────────────────────────────────────────────
describe("H-61 · D · a pulse in flight cannot outrun the unmount", () => {
  test("a play already past its await does NOT start a tone", async () => {
    // playLoudAlert awaits ensureAudioMode() before creating a player. Clearing
    // timers cannot stop a callback that has already fired — only the generation
    // guard can.
    const a = loadAlertSound();
    const provider = mountProvider(a);

    const inFlight = a.playLoudAlert(); // fired, now suspended at the await
    provider.unmount(); // the vendor leaves at exactly this instant
    await inFlight;
    await a.clock.advance(10_000);

    assert.equal(
      a.plays.length,
      0,
      "a tone started after the provider was gone",
    );
  });

  test("no orphan player is left alive", async () => {
    const a = loadAlertSound();
    const provider = mountProvider(a);

    const inFlight = a.playLoudAlert();
    provider.unmount();
    await inFlight;
    await a.clock.advance(10_000);

    assert.ok(
      a.players.every((p) => p.removed),
      "a live audio player survived the unmount with nothing able to silence it",
    );
  });

  test("a pulse whose timer fires during unmount stays silent", async () => {
    const a = loadAlertSound();
    const provider = mountProvider(a);
    a.playRepeatingAlert();
    const heard = a.plays.length;

    // Drive the 5s pulse and unmount inside the same turn.
    const advancing = a.clock.advance(5_000);
    provider.unmount();
    await advancing;
    await a.clock.advance(60_000);

    assert.equal(a.plays.length, heard, "a queued pulse played after unmount");
  });

  test("the guard is a real generation check, not a boolean flag", () => {
    const src = stripComments(ALERT);
    assert.match(src, /let alertGeneration = 0/);
    assert.match(
      src,
      /alertGeneration \+= 1/,
      "stopAlert must invalidate in-flight plays",
    );
    assert.match(
      src,
      /if \(generation !== alertGeneration\) return;/,
      "playLoudAlert must abandon itself after a stop",
    );
  });
});

// ── E. remount ──────────────────────────────────────────────────────────────
describe("H-61 · E · a later mount works normally", () => {
  test("a fresh provider can schedule and play a new alert", async () => {
    const a = loadAlertSound();
    const first = mountProvider(a);
    first.newOrder();
    await a.clock.advance(2_000);
    first.unmount();
    const heardBefore = a.plays.length;

    const second = mountProvider(a);
    second.newOrder();
    await a.clock.advance(30_000);

    assert.equal(
      a.plays.length - heardBefore,
      4,
      "the remounted provider must get a full alert",
    );
  });

  test("the old instance's cleanup does not cancel the new one's timers", async () => {
    const a = loadAlertSound();
    const stale = mountProvider(a);
    stale.newOrder();
    await a.clock.advance(1_000);
    stale.unmount();

    const fresh = mountProvider(a);
    fresh.newOrder();
    const scheduled = a.clock.pending;
    assert.ok(scheduled > 0, "the new sequence should be scheduled");

    // A late cleanup from the dead instance must not silence the live one.
    // (This is why the fix must not rely on shared mutable "is mounted" state.)
    await a.clock.advance(30_000);
    assert.equal(a.plays.filter((t) => t >= 1_000).length, 4);
  });

  test("dismiss still works after a remount", async () => {
    const a = loadAlertSound();
    mountProvider(a).unmount();

    const provider = mountProvider(a);
    provider.newOrder();
    await a.clock.advance(6_000);
    const heard = a.plays.length;
    provider.dismiss();
    await a.clock.advance(60_000);
    assert.equal(a.plays.length, heard);
  });
});

// ── no collateral damage ────────────────────────────────────────────────────
describe("H-61 · the other alert callers are unaffected", () => {
  test("the driver and admin call sites are untouched", () => {
    assert.match(
      stripComments(read("client/screens/DriverHomeScreen.tsx")),
      /playRepeatingAlert\(\)/,
    );
    assert.match(
      stripComments(read("client/screens/AdminScreen.tsx")),
      /playRepeatingAlert\(3, 4000\)/,
    );
  });

  test("OrderContext's single-shot alert still plays", async () => {
    const a = loadAlertSound();
    await a.playLoudAlert();
    assert.equal(a.plays.length, 1);
    assert.match(
      stripComments(read("client/context/OrderContext.tsx")),
      /playLoudAlert\(\)/,
    );
  });

  test("no new dependency was introduced", () => {
    const pkg = JSON.parse(read("package.json"));
    assert.ok(pkg.dependencies["expo-audio"], "expo-audio was already present");
    assert.equal(
      stripComments(ALERT).includes('require("../assets/sounds/alarm.mp3")'),
      true,
      "the alarm asset source is unchanged",
    );
  });
});
