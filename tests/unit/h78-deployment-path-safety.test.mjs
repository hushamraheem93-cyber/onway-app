/**
 * H-78 — "the deployment guide instructs `curl | bash` as root from a raw URL,
 * and the script never asks for the promised access token — so the clone stops
 * at a private repository."
 *
 * Both halves were literally true. deployment/README.md line 42 was
 *
 *     curl -fsSL https://raw.githubusercontent.com/.../server-setup.sh | bash
 *
 * run as root, and the step below it promised "You will be asked for your GitHub
 * PAT token (to clone the private repo)". server-setup.sh had exactly one
 * `read` — for the domain — and cloned over anonymous HTTPS. It could only fail.
 * Piping into a shell also leaves no terminal to prompt on, so the promised
 * prompt could never have appeared even if it had existed.
 *
 * These checks read the real deployment files. Nothing is executed against a
 * server and no deployment is performed.
 *
 * Run:  node --test tests/unit/h78-deployment-path-safety.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const read = (p) => readFileSync(join(root, p), "utf8");

const README = read("deployment/README.md");
const SETUP = read("deployment/server-setup.sh");
const SHELL_SCRIPTS = readdirSync(join(root, "deployment"))
  .filter((f) => f.endsWith(".sh"))
  .map((f) => [`deployment/${f}`, read(`deployment/${f}`)]);

/** Lines outside fenced code blocks are prose and may discuss the old pattern. */
function codeLines(markdown) {
  const out = [];
  let inFence = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) out.push(line);
  }
  return out;
}

// ═════════════════════════════════════════════════════════════════════════════
describe("H-78 · A+B. nothing is piped from the network into a shell", () => {
  const CODE = codeLines(README);

  test("A. no curl|bash or wget|sh anywhere in the runnable steps", () => {
    const offenders = CODE.filter((l) =>
      /\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba)?sh\b/.test(l),
    );
    assert.deepEqual(offenders, [],
      `the guide still pipes a download into a shell:\n  ${offenders.join("\n  ")}`);
  });

  test("B. nothing is fetched from raw.githubusercontent.com to be executed", () => {
    const offenders = CODE.filter((l) => /raw\.githubusercontent\.com/.test(l));
    assert.deepEqual(offenders, [],
      `a raw URL is still used in a runnable step:\n  ${offenders.join("\n  ")}`);
  });

  test("B. the only pipe-into-shell left is NodeSource's own installer", () => {
    // H-78 was about piping OUR deployment script from a raw file host into a
    // root shell, unread. Adding an apt repository through the vendor's signed
    // installer is the same trust decision as `apt-get install`, and is kept
    // deliberately — but pinned, so a second one cannot appear unnoticed.
    const found = [];
    for (const [name, src] of SHELL_SCRIPTS) {
      for (const line of src.split("\n")) {
        // Comments legitimately describe the pattern H-78 removed.
        if (/^\s*#/.test(line)) continue;
        if (/\b(curl|wget)\b[^|\n]*\|\s*(sudo\s+)?(ba)?sh\b/.test(line)) {
          found.push(`${name}: ${line.trim()}`);
        }
      }
    }
    assert.equal(found.length, 1, `unexpected pipe-into-shell:\n  ${found.join("\n  ")}`);
    assert.match(found[0], /deb\.nodesource\.com/, `not the documented exception: ${found[0]}`);
  });

  test("H. the setup script is run from the cloned repository", () => {
    // A local path the operator can read first, not a URL.
    assert.match(README, /bash deployment\/server-setup\.sh/,
      "the guide no longer runs the script from the checked-out repository");
    assert.match(README, /git clone https:\/\/github\.com\/[\w-]+\/[\w-]+\.git/,
      "the guide never clones the repository it deploys");
  });

  test("H. the operator is told to read the script and name the commit", () => {
    assert.match(README, /less deployment\/server-setup\.sh/,
      "nothing tells the operator to read the script before running it");
    assert.match(README, /git log -1/,
      "the guide does not confirm which commit is being deployed");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-78 · D. authentication for the private repository", () => {
  test("D. the guide explains how to supply a credential", () => {
    assert.match(README, /GITHUB_TOKEN/,
      "the guide never says how to authenticate to a private repository");
    assert.match(README, /read -rsp/,
      "the token is not read with a hidden prompt");
  });

  test("D. it offers the SSH deploy-key alternative", () => {
    assert.match(README, /deploy key/i);
    assert.match(README, /ONWAY_CLONE_METHOD=ssh/);
  });

  test("D. it warns against putting the token in the URL", () => {
    assert.match(README, /https:\/\/<token>@github\.com|token into `git clone/i,
      "nothing warns that a token in the clone URL persists in .git/config");
  });

  test("the script actually consumes a token — the promise is kept", () => {
    assert.match(SETUP, /GITHUB_TOKEN/,
      "server-setup.sh still ignores the token the guide asks for");
    assert.match(SETUP, /read -rsp/,
      "there is no hidden prompt for the token when a terminal is attached");
  });

  test("the token never reaches the clone URL or .git/config", () => {
    assert.ok(!/https:\/\/\$\{?GITHUB_TOKEN/.test(SETUP),
      "the token is interpolated into the clone URL");
    assert.ok(!/@github\.com/.test(SETUP.replace(/git@github\.com/g, "")),
      "a credential is embedded in a GitHub URL");
    assert.match(SETUP, /GIT_ASKPASS/,
      "the token is not handed to git through an askpass helper");
  });

  test("the askpass helper is removed however the script ends", () => {
    assert.match(SETUP, /trap 'rm -f "\$GIT_ASKPASS_FILE"' EXIT/,
      "the temporary askpass file can be left behind holding a credential");
  });

  test("git is told not to hang waiting on a hidden prompt", () => {
    assert.match(SETUP, /GIT_TERMINAL_PROMPT=0/,
      "an unauthenticated clone would block forever instead of failing");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-78 · E+F. failure is never hidden", () => {
  test("E. a missing credential aborts with a non-zero exit", () => {
    // err() ends in `exit 1`; the guard must call it, not warn.
    assert.match(SETUP, /err "GITHUB_TOKEN is not set/,
      "a missing token no longer stops the deployment");
    const errLine = SETUP.split("\n").find((l) => /^err\(\)/.test(l));
    assert.ok(errLine, "err() disappeared");
    assert.match(errLine, /exit 1;/, `err() no longer exits non-zero: ${errLine}`);
  });

  test("F. clone and pull failures abort with a message", () => {
    assert.match(SETUP, /git clone "\$CLONE_URL" "\$APP_DIR" \\\n\s*\|\| err /,
      "a failed clone is not reported");
    assert.match(SETUP, /git pull origin main \\\n\s*\|\| err /,
      "a failed pull is not reported");
  });

  test("F. the checkout is verified before anything is built from it", () => {
    assert.match(SETUP, /git rev-parse --verify HEAD/,
      "the script builds without confirming a commit is checked out");
  });

  test("F. no `|| true` or `set +e` was introduced on the repository path", () => {
    // Two pre-existing `|| true` calls guard idempotent pm2 cleanup (deleting a
    // process that may not exist). What must never be tolerated is a swallowed
    // failure on the clone/pull/build path.
    const at = SETUP.indexOf("Repository authentication");
    const end = SETUP.indexOf("Directory structure");
    assert.ok(at > 0 && end > at);
    const repoSection = SETUP.slice(at, end);
    assert.ok(!/\|\|\s*true/.test(repoSection),
      "a failure on the clone/build path is swallowed by `|| true`");
    assert.ok(!/set \+e/.test(SETUP), "set +e disables failure detection");
  });

  test("the script still runs under strict mode", () => {
    assert.match(SETUP, /^set -euo pipefail$/m,
      "an unset variable or a failed command would no longer stop the script");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-78 · C. no credentials in the tracked files", () => {
  const PATTERNS = [
    [/ghp_[A-Za-z0-9]{20,}/, "a GitHub token"],
    [/github_pat_[A-Za-z0-9_]{20,}/, "a fine-grained GitHub token"],
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "a private key"],
    [/"private_key"\s*:/, "a service-account key"],
    [/AIza[0-9A-Za-z_-]{30,}/, "a Google API key"],
    [/PASSWORD=["']?\S{8,}/, "a hardcoded password"],
  ];

  for (const [name, src] of [["deployment/README.md", README], ...SHELL_SCRIPTS]) {
    test(`C. ${name} carries no secret`, () => {
      for (const [re, what] of PATTERNS) {
        assert.ok(!re.test(src), `${name} contains ${what}`);
      }
    });
  }

  test("C. the script never echoes the token to the operator", () => {
    // The askpass helper writes the token on stdout ON PURPOSE — that is the
    // channel git reads the credential from, and it is a separate process whose
    // output never reaches the terminal. Everything outside that heredoc must
    // not mention the token at all.
    const askpassStart = SETUP.indexOf("<<'ASKPASS'");
    const askpassEnd = SETUP.indexOf("ASKPASS\n", askpassStart + 1);
    assert.ok(askpassStart > 0 && askpassEnd > askpassStart, "askpass helper not found");
    const outside = SETUP.slice(0, askpassStart) + SETUP.slice(askpassEnd);

    for (const m of outside.match(/echo[^\n]*/g) ?? []) {
      assert.ok(!/\$\{?GITHUB_TOKEN/.test(m), `the token is printed: ${m}`);
    }
    // And the helper itself must be the only place the value is expanded.
    const expansions = (outside.match(/\$\{?GITHUB_TOKEN\}?/g) ?? []).length;
    const guards = (outside.match(/\$\{GITHUB_TOKEN:-\}/g) ?? []).length;
    assert.equal(expansions - guards, 0,
      "the token is expanded outside the askpass helper and the emptiness guards");
  });

  test("C. the prompt hides what is typed", () => {
    const promptLine = SETUP.split("\n").find((l) => /read -r.*GITHUB_TOKEN/.test(l));
    assert.ok(promptLine, "no token prompt found");
    assert.match(promptLine, /read -rsp/, "the token would be echoed to the screen");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-78 · G. the application does not run as root", () => {
  test("G. a dedicated unprivileged service user is created", () => {
    assert.match(SETUP, /SERVICE_USER="onway"/);
    assert.match(README, /never runs as root/i,
      "the guide does not make clear that the app runs unprivileged");
  });

  test("G. the update path refuses to run as root", () => {
    const update = read("deployment/update.sh");
    assert.match(update, /Do not update as root/,
      "update.sh would start a second root-owned PM2 daemon");
  });

  test("G. root is used only for the system-level setup", () => {
    assert.match(SETUP, /\[\[ \$EUID -ne 0 \]\] && err/,
      "the setup script no longer requires root for package installation");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H-78 · the scripts are valid and self-consistent", () => {
  for (const [name] of SHELL_SCRIPTS) {
    test(`${name} parses`, () => {
      // `bash -n` — syntax only, nothing is executed.
      execFileSync("bash", ["-n", join(root, name)], { stdio: "pipe" });
    });
  }

  test("every path the guide names matches where the setup script installs", () => {
    const appDir = SETUP.match(/APP_DIR="([^"]+)"/)?.[1];
    assert.equal(appDir, "/var/www/onway-app");
    const stale = codeLines(README).filter((l) => /\/var\/www\/onway(?![-\w])/.test(l));
    assert.deepEqual(stale, [],
      `the guide points at a directory the installer does not create:\n  ${stale.join("\n  ")}`);
  });

  test("the other scripts derive the same directory instead of hardcoding it", () => {
    for (const f of ["deployment/env-setup.sh", "deployment/ssl-setup.sh", "deployment/update.sh"]) {
      assert.match(read(f), /APP_DIR="\$\{ONWAY_APP_DIR:-\$\(cd "\$\(dirname "\$\{BASH_SOURCE\[0\]\}"\)\/\.\." && pwd\)\}"/,
        `${f} hardcodes an install directory again`);
    }
  });
});
