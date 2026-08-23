/**
 * M-70 … M-75 — a store whose hours cross midnight showed "مغلق" all day, every day.
 *
 * `isStoreOpenNow` compared the current minute against the window with one
 * expression:
 *
 *     return cur >= oh * 60 + om && cur < ch * 60 + cm;
 *
 * For a restaurant working 18:00–02:00 that is `cur >= 1080 && cur < 120`, which no
 * value of `cur` can satisfy. The badge read "مغلق" at every hour of the twenty-four,
 * and the vendor app takes the closing time in a free text field, so nothing stopped
 * an owner from entering 02:00 — those are ordinary hours for a restaurant here.
 *
 * The day is the half of this that is easy to get wrong. At 01:00 the shift that is
 * running started YESTERDAY, so a store open Mon–Sat must be open at 01:00 on Sunday
 * (Saturday's tail) and shut at 01:00 on Monday (Sunday's shift, and Sunday is not an
 * open day). Checking today's `openDays` for both halves of a crossing window gets
 * both of those backwards.
 *
 * Scope: this pins `isStoreOpenNow` only. The predicate that actually blocks adding
 * to a cart is `getStoreClosure` in client/lib/storeStatus.ts, which reads
 * isVacation/isBusy/isOpen and never calls this function — it is deliberately not
 * touched here.
 *
 * Run:  node --test tests/unit/m70-store-hours-midnight.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");

const { isStoreOpenNow, normalizeWorkingHours, DEFAULT_OPEN_DAYS } = await import(
  join(root, "shared/storeHours.ts")
);

const SUN = 0, MON = 1, TUE = 2, SAT = 6;

/** 2026-08-23 is a Sunday, so `SUN + n` lands on the 23rd + n. */
const at = (weekday, hh, mm = 0) => new Date(2026, 7, 23 + weekday, hh, mm);

const hours = (openTime, closeTime, openDays = DEFAULT_OPEN_DAYS) => ({
  openTime,
  closeTime,
  openDays: [...openDays],
});

/** The restaurant from the finding: opens in the evening, closes after midnight. */
const NIGHT = hours("18:00", "02:00");

// ─────────────────────────────────────────────────────────────────────────────
describe("M-70 · a window that crosses midnight is a real window", () => {
  test("the store is open at SOME hour of the day", () => {
    const openHours = [...Array(24).keys()].filter((h) =>
      isStoreOpenNow(NIGHT, at(MON, h)),
    );
    assert.notDeepEqual(
      openHours,
      [],
      "an 18:00–02:00 store is shut at all 24 hours — this is the finding",
    );
  });

  test("open through the evening, up to midnight", () => {
    for (const [h, m] of [[18, 0], [19, 30], [21, 0], [23, 59]]) {
      assert.equal(
        isStoreOpenNow(NIGHT, at(MON, h, m)),
        true,
        `must be open at ${h}:${String(m).padStart(2, "0")}`,
      );
    }
  });

  test("still open after midnight, until closing", () => {
    for (const [h, m] of [[0, 0], [0, 30], [1, 0], [1, 59]]) {
      assert.equal(
        isStoreOpenNow(NIGHT, at(TUE, h, m)),
        true,
        `must still be open at ${h}:${String(m).padStart(2, "0")}`,
      );
    }
  });

  test("shut from closing time until it opens again", () => {
    for (const [h, m] of [[2, 0], [2, 1], [6, 0], [12, 0], [17, 59]]) {
      assert.equal(
        isStoreOpenNow(NIGHT, at(TUE, h, m)),
        false,
        `must be shut at ${h}:${String(m).padStart(2, "0")}`,
      );
    }
  });

  test("the boundaries are half-open: open at 18:00 exactly, shut at 02:00 exactly", () => {
    assert.equal(isStoreOpenNow(NIGHT, at(MON, 18, 0)), true);
    assert.equal(isStoreOpenNow(NIGHT, at(TUE, 2, 0)), false);
    assert.equal(isStoreOpenNow(NIGHT, at(TUE, 1, 59)), true);
  });
});

describe("M-70 · the after-midnight hours belong to the PREVIOUS day's shift", () => {
  // Open Monday through Saturday, 18:00–02:00.
  const MON_TO_SAT = hours("18:00", "02:00", [1, 2, 3, 4, 5, 6]);

  test("Saturday's shift is still running at 01:00 on Sunday", () => {
    assert.equal(
      isStoreOpenNow(MON_TO_SAT, at(SAT, 23, 0)),
      true,
      "precondition: open late on Saturday",
    );
    assert.equal(
      isStoreOpenNow(MON_TO_SAT, at(SUN + 7, 1, 0)),
      true,
      "the Saturday shift was cut off at midnight",
    );
  });

  test("Monday 01:00 is Sunday's shift — and Sunday is closed", () => {
    assert.equal(
      isStoreOpenNow(MON_TO_SAT, at(SUN, 19, 0)),
      false,
      "precondition: Sunday is not an open day",
    );
    assert.equal(
      isStoreOpenNow(MON_TO_SAT, at(MON, 1, 0)),
      false,
      "a shift was invented on a day the store does not open",
    );
  });

  test("Monday evening opens normally", () => {
    assert.equal(isStoreOpenNow(MON_TO_SAT, at(MON, 19, 0)), true);
  });

  test("Sunday 01:00 stays shut when Saturday is closed too", () => {
    const WEEKDAYS = hours("18:00", "02:00", [1, 2, 3, 4, 5]);
    assert.equal(isStoreOpenNow(WEEKDAYS, at(SUN + 7, 1, 0)), false);
  });
});

describe("M-70 · ordinary same-day windows are unchanged", () => {
  const DAY = hours("09:00", "17:00");

  test("open inside the window, shut outside it", () => {
    assert.equal(isStoreOpenNow(DAY, at(MON, 10, 30)), true);
    assert.equal(isStoreOpenNow(DAY, at(MON, 9, 0)), true);
    assert.equal(isStoreOpenNow(DAY, at(MON, 8, 59)), false);
    assert.equal(isStoreOpenNow(DAY, at(MON, 17, 0)), false);
    assert.equal(isStoreOpenNow(DAY, at(MON, 23, 0)), false);
  });

  test("a closed day is closed all day", () => {
    const WEEKDAYS = hours("09:00", "17:00", [1, 2, 3, 4, 5]);
    for (const h of [8, 10, 16, 23]) {
      assert.equal(isStoreOpenNow(WEEKDAYS, at(SUN, h)), false);
    }
  });

  test("00:00–23:59 still behaves as the near-all-day window it is", () => {
    const ALMOST = hours("00:00", "23:59");
    assert.equal(isStoreOpenNow(ALMOST, at(MON, 12, 0)), true);
    assert.equal(isStoreOpenNow(ALMOST, at(MON, 23, 58)), true);
    assert.equal(isStoreOpenNow(ALMOST, at(MON, 23, 59)), false);
  });
});

describe("M-70 · the existing contract is preserved", () => {
  test("no stored hours still means always open", () => {
    assert.equal(isStoreOpenNow(null), true);
    assert.equal(isStoreOpenNow(undefined), true);
  });

  test("normalizeWorkingHours still fills the default open days", () => {
    const wh = normalizeWorkingHours({ openTime: "18:00", closeTime: "02:00" });
    assert.deepEqual(wh.openDays, DEFAULT_OPEN_DAYS);
    assert.equal(isStoreOpenNow(wh, at(MON, 20, 0)), true);
  });

  test("junk hours resolve to null, which means always open", () => {
    for (const bad of [null, undefined, {}, { openTime: "nonsense" }]) {
      assert.equal(normalizeWorkingHours(bad), null);
    }
  });

  test("an empty openDays list still closes the store", () => {
    assert.equal(isStoreOpenNow(hours("18:00", "02:00", []), at(MON, 20)), false);
    assert.equal(isStoreOpenNow(hours("18:00", "02:00", []), at(TUE, 1)), false);
  });
});

describe("M-70 · equal open and close reads as twenty-four hours", () => {
  // A vendor typing the same time twice means "we never shut", not "we never open".
  // The module already resolves unusable hours to "always open" rather than "always
  // shut", so this is the reading consistent with the rest of the file.
  const ALWAYS = hours("00:00", "00:00");

  test("open at every hour on an open day", () => {
    for (const h of [0, 6, 12, 18, 23]) {
      assert.equal(isStoreOpenNow(ALWAYS, at(MON, h)), true);
    }
  });

  test("still respects a closed day", () => {
    const MONDAYS = hours("00:00", "00:00", [MON]);
    assert.equal(isStoreOpenNow(MONDAYS, at(MON, 12)), true);
    assert.equal(isStoreOpenNow(MONDAYS, at(TUE, 12)), false);
  });
});
