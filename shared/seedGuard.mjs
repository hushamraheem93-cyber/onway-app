/**
 * The demo/test seeding guard (H-68) — one implementation, every seed path.
 *
 * Written as plain ESM JavaScript on purpose. Three callers need it and they do
 * not share a loader:
 *
 *   • server/routes.ts        (TypeScript, bundled by esbuild)
 *   • server/seed-data.ts     (TypeScript, run through tsx)
 *   • scripts/seed-test-data.mjs (plain node, no TypeScript loader at all)
 *
 * A .ts module could not be imported by the third without changing how it is
 * invoked, so the guard lives here and `server/env.ts` re-exports it. That leaves
 * exactly one place where the rule is written down — the earlier arrangement had
 * the same conditions spelled out twice and relied on a test to notice drift.
 *
 * ── What went wrong ────────────────────────────────────────────────────────
 *
 * Two seeders each decided "is this production?" by testing one exact string:
 *
 *   routes.ts    if (NODE_ENV === "production" || REPLIT_DEPLOYMENT === "1") deny
 *   seed-data.ts if (NODE_ENV === "production" && ALLOW_SEED !== "true")     deny
 *
 * and scripts/seed-test-data.mjs tested nothing at all. All of them fail OPEN:
 * anything that is not the literal "production" — unset, "Production", "prod", a
 * trailing space — falls through and the seed runs. That is the state `.replit`
 * actually publishes in:
 *
 *     run = ["sh", "-c", "node server_dist/index.js"]     ← no NODE_ENV
 *
 * so the whole protection rested on REPLIT_DEPLOYMENT happening to be exactly
 * "1". One authenticated admin request could then write demo stores, demo
 * products and working discount codes into the live catalogue.
 *
 * ── The rule ───────────────────────────────────────────────────────────────
 *
 * Inverted: recognise a known-safe environment and deny everything else, so a
 * missing or unexpected value denies rather than permits. Three independent
 * conditions, each of which alone denies. Nothing about the caller is consulted —
 * holding an admin session cannot satisfy any of them.
 */

/** The only opt-in that can enable a demo seed. Absent ⇒ denied, always. */
export const DEMO_SEED_OPT_IN = "ALLOW_DEMO_SEED";

/** The exact value the opt-in must carry. Nothing else counts. */
export const DEMO_SEED_OPT_IN_VALUE = "true";

/**
 * NODE_ENV values recognised as definitely-not-production.
 *
 * An allowlist, not a denylist: "" (unset), "production", "staging" and anything
 * unrecognised all deny. `staging` is deliberately absent — a staging deployment
 * usually points at the live Firestore project, which is the database this guard
 * exists to protect.
 */
export const NON_PRODUCTION_NODE_ENVS = ["development", "test"];

/**
 * Why a demo seed is refused, or `null` when it is permitted.
 *
 * `env` defaults to `process.env` and is injectable so tests can exercise the
 * contract without mutating the running process.
 *
 * Returning the reason rather than a bare boolean keeps the refusal explainable
 * in a log, and lets a test assert WHICH condition refused — so a test cannot
 * pass because some unrelated condition happened to deny.
 */
export function demoSeedDenialReason(env = process.env) {
  // 1. Explicit opt-in. No fallback, no default-on, no alternative spelling.
  if (env[DEMO_SEED_OPT_IN] !== DEMO_SEED_OPT_IN_VALUE) {
    return `${DEMO_SEED_OPT_IN} is not set to "${DEMO_SEED_OPT_IN_VALUE}"`;
  }

  // 2. The environment must positively identify itself as safe. Unset or
  //    unrecognised denies — this is the half that used to fail open.
  const nodeEnv = String(env.NODE_ENV ?? "")
    .trim()
    .toLowerCase();
  if (!NON_PRODUCTION_NODE_ENVS.includes(nodeEnv)) {
    return `NODE_ENV=${JSON.stringify(env.NODE_ENV ?? null)} is not one of ${NON_PRODUCTION_NODE_ENVS.join(", ")}`;
  }

  // 3. Replit sets REPLIT_DEPLOYMENT on published deployments. Its PRESENCE is
  //    the signal, not the string "1": testing for one exact value is the same
  //    mistake as testing NODE_ENV for one exact value, and would let a future
  //    "true"/"yes"/" 1" through. A developer's own machine never sets it.
  const replit = String(env.REPLIT_DEPLOYMENT ?? "").trim();
  if (replit !== "") {
    return `REPLIT_DEPLOYMENT=${JSON.stringify(env.REPLIT_DEPLOYMENT)} (published deployment)`;
  }

  return null;
}

/**
 * May this process seed demo stores, products, banners or promo codes?
 *
 * Deny by default. Read at call time, never cached, so a process cannot start in
 * a safe state and have the answer go stale.
 */
export function isDemoSeedAllowed(env = process.env) {
  return demoSeedDenialReason(env) === null;
}
