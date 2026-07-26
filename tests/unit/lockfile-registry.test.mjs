/**
 * Guards package-lock.json against private-registry URLs.
 *
 * WHAT HAPPENED
 * ─────────────
 * `npm install` records the URL it ACTUALLY fetched from into each package's
 * `resolved` field. Run inside Replit — where npm is pointed at the internal
 * package firewall — that writes URLs like
 *
 *     http://package-firewall.replit.local/npm/<pkg>/-/<pkg>-<version>.tgz
 *
 * into the lockfile. That host only resolves inside Replit's network, so
 * `npm ci` on a GitHub Actions runner cannot reach it and the whole job dies at
 * the install step, before a single test runs.
 *
 * WHY A TEST AND NOT JUST A ONE-OFF EDIT
 * ──────────────────────────────────────
 * The bad URL is written by an ordinary `npm install` in the normal dev
 * environment. Nothing about it looks wrong locally: the install succeeds, the
 * app runs, and the diff is a single line buried in a 20,000-line lockfile. It is
 * only fatal somewhere else, later. So it will happen again unless something
 * checks — and the check has to run locally too, not only in CI, or the failure is
 * still discovered by a red pipeline.
 *
 * Verified with a cold npm cache: `npm ci` fetches the `resolved` URL verbatim and
 * fails, and passing `--registry https://registry.npmjs.org/` does NOT override it.
 * Correcting the lockfile is the only fix.
 *
 * Run:  npm run test:unit
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const LOCK = JSON.parse(readFileSync(join(here, "../../package-lock.json"), "utf8"));

/** Hosts a `resolved` URL is allowed to point at. */
const ALLOWED_HOSTS = new Set(["registry.npmjs.org"]);

function resolvedEntries() {
  const out = [];
  for (const [path, pkg] of Object.entries(LOCK.packages ?? {})) {
    if (typeof pkg?.resolved === "string") out.push([path, pkg.resolved]);
  }
  return out;
}

describe("package-lock.json — every tarball must come from the public registry", () => {
  test("the lockfile is readable and has resolved entries", () => {
    const entries = resolvedEntries();
    assert.ok(entries.length > 100, `expected a populated lockfile, found ${entries.length} resolved entries`);
  });

  test("no dependency resolves through a private or internal registry", () => {
    const offenders = resolvedEntries()
      .filter(([, url]) => {
        try {
          return !ALLOWED_HOSTS.has(new URL(url).hostname);
        } catch {
          return true; // an unparseable URL is not something CI can fetch either
        }
      })
      .map(([path, url]) => `${path} → ${url}`);

    assert.deepEqual(
      offenders,
      [],
      "REGRESSION: a dependency resolves through a host GitHub Actions cannot reach, so `npm ci` fails before any test runs. " +
        "This is what an `npm install` inside Replit writes. Fix with:\n" +
        "  npm install --package-lock-only --registry https://registry.npmjs.org/\n" +
        "Offending entries:\n  " +
        offenders.join("\n  "),
    );
  });

  test("no dependency is fetched over plain HTTP", () => {
    // A tarball over http:// is both unreachable from CI (in this case) and
    // unverified in transit. The integrity hash is the real protection, but there
    // is no reason to accept a downgrade.
    const insecure = resolvedEntries()
      .filter(([, url]) => url.startsWith("http://"))
      .map(([path, url]) => `${path} → ${url}`);
    assert.deepEqual(insecure, [], `tarballs must be fetched over https:\n  ${insecure.join("\n  ")}`);
  });

  test("every resolved entry carries an integrity hash", () => {
    // The hash is what makes rewriting a `resolved` URL safe: identical hash means
    // identical bytes, whichever mirror served them.
    const missing = Object.entries(LOCK.packages ?? {})
      .filter(([, pkg]) => typeof pkg?.resolved === "string" && !pkg.integrity && !pkg.link)
      .map(([path]) => path);
    assert.deepEqual(missing, [], `resolved without integrity:\n  ${missing.join("\n  ")}`);
  });
});
