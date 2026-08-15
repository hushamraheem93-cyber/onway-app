/**
 * H-48 — production deploys must install from the lockfile, not resolve afresh.
 *
 * Both deploy scripts ran `npm install --prefer-offline`, while CI ran `npm ci`.
 * Measured, the damage was not what the finding described: with a COMPLETE
 * lockfile, `npm install` does not upgrade in-range packages — express,
 * firebase-admin, firebase, ws and tsx all stayed exactly where the lock pinned
 * them. Two real defects remained underneath:
 *
 *   1. `npm install` WRITES package-lock.json. Against the committed lock it
 *      added react-refresh@0.18.0 — a package that had passed through no review
 *      and no CI run — straight into the production tree.
 *
 *   2. package-lock.json is TRACKED. That write left the server's working tree
 *      dirty, so the NEXT deploy's `git pull origin main` (update.sh) aborted
 *      with "Your local changes would be overwritten by merge". The deploy
 *      script wedged itself, one run later.
 *
 * `npm ci` fixes both: it installs the locked tree verbatim and never writes the
 * lockfile back.
 *
 * Section 3 does not read the scripts — it runs real npm against the repo's own
 * package.json + package-lock.json.
 *
 * Run:  node --test tests/unit/h48-deploy-npm-ci.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripShellComments } from "./_source.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const read = (p) => readFileSync(join(root, p), "utf8");

const UPDATE = read("deployment/update.sh");
const SETUP = read("deployment/server-setup.sh");
/** The comments explain the OLD `npm install` on purpose — never let them pass a check. */
const updateCode = stripShellComments(UPDATE);
const setupCode = stripShellComments(SETUP);

// ─────────────────────────────────────────────────────────────────────────────
describe("H-48 · the deploy scripts install from the lockfile", () => {
  for (const [name, code] of [
    ["deployment/update.sh", updateCode],
    ["deployment/server-setup.sh", setupCode],
  ]) {
    test(`${name} uses npm ci`, () => {
      assert.match(code, /^\s*npm ci --prefer-offline --no-audit --no-fund\b/m,
        "the deploy no longer installs from the lockfile");
    });

    test(`${name} does not install project dependencies with npm install`, () => {
      // `npm install -g pm2` is a TOOL install, not the project tree — it is fine.
      const projectInstalls = code
        .split("\n")
        .filter((l) => /^\s*npm (install|i)\b/.test(l) && !/\s-g\b|--global/.test(l));
      assert.deepEqual(projectInstalls, [],
        `npm install came back: ${projectInstalls.join(" | ")}`);
    });
  }

  test("CI and production now agree on how dependencies are installed", () => {
    const ci = read(".github/workflows/ci.yml");
    assert.match(ci, /npm ci\b/, "CI stopped using npm ci");
    for (const code of [updateCode, setupCode]) assert.match(code, /npm ci\b/);
  });

  test("package-lock.json is tracked, which is why a write to it matters", () => {
    assert.doesNotMatch(read(".gitignore"), /package-lock/,
      "if the lockfile were ignored the wedge could not happen — this test's premise moved");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("H-48 · the lockfile actually supports npm ci", () => {
  /** package.json + package-lock.json alone, in a temp dir. */
  const stage = () => {
    const dir = mkdtempSync(join(tmpdir(), "h48-"));
    writeFileSync(join(dir, "package.json"), read("package.json"));
    writeFileSync(join(dir, "package-lock.json"), read("package-lock.json"));
    return dir;
  };

  test("npm ci resolves against the committed lockfile", () => {
    const dir = stage();
    try {
      execFileSync("npm", ["ci", "--dry-run", "--no-audit", "--no-fund"],
        { cwd: dir, encoding: "utf8", stdio: "pipe" });
    } catch (e) {
      assert.fail(
        "npm ci cannot run — package.json and package-lock.json are out of sync:\n" +
        `${e.stdout || ""}${e.stderr || ""}`.split("\n").slice(0, 6).join("\n"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("npm ci does NOT rewrite package-lock.json", () => {
    const dir = stage();
    try {
      const before = readFileSync(join(dir, "package-lock.json"), "utf8");
      execFileSync("npm", ["ci", "--dry-run", "--no-audit", "--no-fund"],
        { cwd: dir, encoding: "utf8", stdio: "pipe" });
      const after = readFileSync(join(dir, "package-lock.json"), "utf8");
      assert.equal(after, before,
        "npm ci wrote to the lockfile — the git-pull wedge would still be possible");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("react-refresh — the package npm install used to inject — is in the lock", () => {
    const lock = JSON.parse(read("package-lock.json"));
    assert.ok(lock.packages["node_modules/react-refresh"],
      "the peer npm install kept adding is missing again; npm ci will fail on the server");
  });

  test("the lockfile carries no Replit-internal URLs", () => {
    // npm ci fetches every tarball from `resolved`; a firewall URL there fails the
    // deploy outright, with no `npm install` left to silently re-resolve it.
    assert.doesNotMatch(read("package-lock.json"), /replit\.local|package-firewall/,
      "a Replit-internal tarball URL would break npm ci on the VPS");
  });
});
