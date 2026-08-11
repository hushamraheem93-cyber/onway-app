/**
 * Deployment privilege-separation tests (audit finding H-46).
 *
 * server-setup.sh created no service account and configured PM2 with
 * `pm2 startup systemd -u root --hp /root`, so the Node process ran as root — and
 * was resurrected as root on every reboot. The app accepts image uploads and
 * decodes them with sharp, a native library with a long history of memory-safety
 * bugs, so any flaw there escalated straight to full control of the machine,
 * including .env and the Firebase service account inside it, which carries
 * unrestricted admin rights over the whole project.
 *
 * The fix is only safe because of what the server actually needs, which was checked
 * against the code rather than assumed:
 *   • every multer instance uses memoryStorage() and images go to Firebase Storage,
 *     so the process writes NO files at all;
 *   • server/*.ts contains no writeFile/mkdir/createWriteStream of any kind;
 *   • session revocation state persists to Firestore, not to disk;
 *   • the Firebase credential arrives as an env var, not a key file;
 *   • port 5000 is above 1024, so no capability and no root are needed to bind it.
 *
 * These tests guard both halves: that the scripts drop privileges, and that the
 * application does not grow a requirement that would force them back.
 *
 * Run:  node --test tests/unit/deployment-privileges.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments as sharedStripComments } from "./_source.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const setup = readFileSync(join(root, "deployment/server-setup.sh"), "utf8");
const update = readFileSync(join(root, "deployment/update.sh"), "utf8");

/** Shell lines with comments and blanks removed. */
const code = (s) =>
  s.split("\n").map((l) => l.replace(/(^|\s)#.*$/, "")).filter((l) => l.trim()).join("\n");
const SETUP = code(setup);
const UPDATE = code(update);

describe("H-46 · the service must not run as root", () => {
  test("a dedicated system user is created", () => {
    assert.match(SETUP, /useradd\s+--system/,
      "no service account is created — the app still runs as whoever ran the script");
    assert.match(SETUP, /--shell\s+\/usr\/sbin\/nologin/,
      "the service account can log in; it should not be able to");
  });

  test("PM2's boot-time resurrection does not use root", () => {
    const startup = SETUP.match(/pm2 startup[^\n]*/)?.[0] ?? "";
    assert.ok(startup, "the pm2 startup line disappeared");
    assert.doesNotMatch(startup, /-u\s+root|--hp\s+\/root/,
      "the server is resurrected as root on every reboot");
    assert.match(startup, /-u\s+"?\$\{?SERVICE_USER/,
      "the startup unit is not bound to the service user");
  });

  test("the application tree and .env belong to the service user", () => {
    assert.match(SETUP, /chown -R "\$\{SERVICE_USER\}:\$\{SERVICE_USER\}" "\$APP_DIR"/,
      "the app directory is still root-owned, so the service cannot read its own files");
    assert.match(SETUP, /chown "\$\{SERVICE_USER\}:\$\{SERVICE_USER\}" "\$\{APP_DIR\}\/\.env"/,
      ".env is still root-owned");
    assert.match(SETUP, /chmod 600 "\$\{APP_DIR\}\/\.env"/,
      ".env is readable by more than its owner");
  });

  test("the operator is told to start the server as the service user", () => {
    const step = setup.slice(setup.indexOf("STEP 2"), setup.indexOf("STEP 3"));
    assert.match(step, /sudo -u \$\{SERVICE_USER\}/,
      "the printed start command would run the server as root again");
    assert.doesNotMatch(step, /^\s*echo\s+"\s*pm2 start ecosystem/m);
  });

  test("updating refuses to run as root", () => {
    assert.match(UPDATE, /EUID -eq 0/,
      "update.sh would start a second, root-owned PM2 daemon");
    assert.match(UPDATE, /sudo -u \$\{SERVICE_USER\}/,
      "update.sh does not say how to run it correctly");
  });

  test("root is still used only for setup-time system work", () => {
    // apt, nginx, ufw and certbot genuinely need it; nothing at RUN time may.
    const runtimeRootRefs = SETUP.split("\n").filter(
      (l) => /\broot\b/.test(l) && !/EUID|certbot|nginx|apt|ufw|STEP|echo/.test(l),
    );
    assert.deepEqual(runtimeRootRefs, [],
      `these lines still put root in the runtime path:\n${runtimeRootRefs.join("\n")}`);
  });
});

describe("H-46 · the application must not need privileges back", () => {
  const serverFiles = readdirSync(join(root, "server"))
    .filter((f) => f.endsWith(".ts"))
    .map((f) => ({ name: f, src: readFileSync(join(root, "server", f), "utf8") }));
  const strip = sharedStripComments;

  test("no upload is written to disk — every multer uses memory storage", () => {
    for (const { name, src } of serverFiles) {
      const clean = strip(src);
      if (!/multer\(/.test(clean)) continue;
      assert.doesNotMatch(clean, /diskStorage|dest\s*:/,
        `${name} writes uploads to disk, which needs a writable directory`);
      assert.match(clean, /memoryStorage\(\)/,
        `${name} configures multer without memoryStorage`);
    }
  });

  test("the server writes no files at all", () => {
    for (const { name, src } of serverFiles) {
      const clean = strip(src);
      assert.doesNotMatch(clean, /\bfs\.(writeFile|appendFile|mkdir|createWriteStream)|writeFileSync|mkdirSync|appendFileSync/,
        `${name} writes to the filesystem — the service user would need write access`);
    }
  });

  test("nothing reaches outside the application directory", () => {
    for (const { name, src } of serverFiles) {
      const clean = strip(src);
      assert.doesNotMatch(clean, /["'`]\/(etc|var\/log|usr|root|opt|proc)\//,
        `${name} references an absolute system path an unprivileged user cannot use`);
    }
  });

  test("the listening port stays above 1024, so no capability is needed", () => {
    const eco = readFileSync(join(root, "ecosystem.config.js"), "utf8");
    const port = Number(eco.match(/PORT:\s*(\d+)/)?.[1]);
    assert.ok(port > 1024, `port ${port} requires root or CAP_NET_BIND_SERVICE`);
  });

  test("the Firebase credential is an environment variable, not a key file", () => {
    const fb = readFileSync(join(root, "server/firebase.ts"), "utf8");
    assert.match(fb, /process\.env\.FIREBASE_SERVICE_ACCOUNT/,
      "the credential source changed — a key file would need its own ownership rules");
    assert.doesNotMatch(strip(fb), /readFileSync\([^)]*serviceAccount|require\([^)]*serviceAccount.*\.json/,
      "a Firebase key file is read from disk");
  });
});
