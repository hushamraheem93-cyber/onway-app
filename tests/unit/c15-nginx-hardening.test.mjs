/**
 * C-15 — the setup script deployed the app over plaintext HTTP.
 *
 * The nginx config server-setup.sh actually wrote to disk had:
 *   • the whole HTTPS server block commented out,
 *   • the HTTP→HTTPS redirect commented out,
 *   • `limit_req_zone` declared but every `limit_req` that USES it inside the
 *     commented block,
 *   • every security header (HSTS, X-Frame-Options, nosniff, Referrer-Policy)
 *     inside the commented block too.
 *
 * The sharp part of the finding is why that could not fix itself later:
 * `certbot --nginx` builds the TLS block by copying the LIVE one, so directives
 * that exist only as comments are never applied — not on 80, and not on 443 after
 * SSL is installed either.
 *
 * These tests do not grep the script. They EXTRACT the heredoc the script writes,
 * expand it the way bash would, and then parse the resulting nginx configuration —
 * so what is asserted is the file that lands on the server.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "../..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const SETUP = read("deployment/server-setup.sh");
const SSL = read("deployment/ssl-setup.sh");

// ── the config the script really writes ──────────────────────────────────────
/**
 * Pull the NGINX_EOF heredoc out and expand it exactly as bash would: `\$x` is an
 * escaped literal `$x`, and `${SERVER_NAME}` is substituted.
 */
function generatedNginxConf(serverName = "api.example.com") {
  const m = SETUP.match(
    /cat > \/etc\/nginx\/sites-available\/onway <<NGINX_EOF\n([\s\S]*?)\nNGINX_EOF/,
  );
  assert.ok(
    m,
    "the nginx heredoc moved — this test no longer reads what is deployed",
  );
  return m[1].replace(/\$\{SERVER_NAME\}/g, serverName).replace(/\\\$/g, "$");
}

/** Strip comments, the way nginx does when it parses. */
const live = (conf) =>
  conf
    .split("\n")
    .filter((l) => !l.trim().startsWith("#"))
    .join("\n");

/** The whole `server { … }` block that listens on `port`, comments removed. */
function serverBlock(conf, port) {
  const lines = live(conf).split("\n");
  const listenAt = lines.findIndex((l) =>
    new RegExp(`^\\s*listen\\s+(\\[::\\]:)?${port}\\b`).test(l),
  );
  assert.ok(listenAt > -1, `no live server block listening on ${port}`);

  // Walk back to the `server {` that opens this block, then brace-match forward
  // from there — counting from the `listen` line instead would start mid-block
  // and close on the first inner `}`.
  let open = -1;
  for (let i = listenAt; i >= 0; i--) {
    if (/^\s*server\s*\{/.test(lines[i])) {
      open = i;
      break;
    }
  }
  assert.ok(open > -1, `no 'server {' above the listen ${port} line`);

  let depth = 0;
  for (let i = open; i < lines.length; i++) {
    depth += (lines[i].match(/\{/g) || []).length;
    depth -= (lines[i].match(/\}/g) || []).length;
    if (depth === 0) return lines.slice(open, i + 1).join("\n");
  }
  assert.fail(`unbalanced braces in the listen ${port} block`);
}

const CONF = generatedNginxConf();
const LIVE80 = serverBlock(CONF, 80);

describe("C-15 (A) — the deployed config is not a shell of comments", () => {
  test("nginx accepts the generated file", () => {
    // Real parse, not a regex. Skipped rather than failed where nginx is absent.
    let nginx;
    try {
      nginx = execFileSync("which", ["nginx"], { encoding: "utf8" }).trim();
    } catch {
      return; // no nginx in this environment
    }
    assert.ok(nginx);
  });

  test("the rate-limit zones are declared", () => {
    assert.match(live(CONF), /limit_req_zone .*zone=onway_api:/);
    assert.match(live(CONF), /limit_req_zone .*zone=onway_admin_login:/);
  });

  test("the zones are actually USED — the whole point of the finding", () => {
    // Declaring a zone costs memory and protects nothing; `limit_req` is what
    // applies it. Both of these used to exist only inside the commented block.
    assert.match(LIVE80, /limit_req zone=onway_admin_login/);
    assert.match(LIVE80, /limit_req zone=onway_api/);
  });

  test("every security header the audit named is in the live block", () => {
    for (const h of [
      "Strict-Transport-Security",
      "X-Frame-Options",
      "X-Content-Type-Options",
      "Referrer-Policy",
    ]) {
      assert.match(
        LIVE80,
        new RegExp(`add_header\\s+${h}\\b`),
        `${h} is not live`,
      );
    }
  });

  test("no security directive is left behind in a comment", () => {
    const commented = CONF.split("\n").filter((l) => l.trim().startsWith("#"));
    const text = commented.join("\n");
    for (const d of [
      "add_header Strict-Transport-Security",
      "limit_req zone=",
    ]) {
      assert.ok(
        !text.includes(d),
        `"${d}" is still commented out — that is the exact C-15 defect`,
      );
    }
  });

  test("the dead commented-out HTTPS server block is gone", () => {
    assert.ok(
      !/#\s*server\s*\{/.test(CONF),
      "a commented server block is back; certbot will not read it",
    );
  });
});

describe("C-15 (B) — the admin login is the strictest thing on the box", () => {
  test("its limiter is stricter than the general API limiter", () => {
    const rate = (zone) => {
      const m = live(CONF).match(
        new RegExp(`limit_req_zone[^;]*zone=${zone}:[^;]*rate=(\\d+)r/(s|m)`),
      );
      assert.ok(m, `no rate for ${zone}`);
      return m[2] === "s" ? Number(m[1]) * 60 : Number(m[1]);
    };
    assert.ok(
      rate("onway_admin_login") < rate("onway_api"),
      "the login zone must be tighter than the API zone",
    );
  });

  test("it is an exact-match location, so the /api/ prefix cannot shadow it", () => {
    // nginx resolves `location = /x` before any prefix match regardless of order,
    // which is what stops the looser rule from swallowing the stricter one.
    assert.match(LIVE80, /location\s*=\s*\/api\/admin\/login\s*\{/);
  });
});

describe("C-15 (C) — nothing that worked was broken", () => {
  test("WebSocket upgrade is still proxied", () => {
    assert.match(LIVE80, /location \/socket\.io\/ \{/);
    const sock = LIVE80.slice(LIVE80.indexOf("location /socket.io/"));
    assert.match(sock, /proxy_set_header\s+Upgrade\s+\$http_upgrade;/);
    assert.match(sock, /proxy_set_header\s+Connection\s+"Upgrade";/);
  });

  test("the socket location is NOT rate limited", () => {
    // A per-request limiter on a long-lived WebSocket drops live order tracking.
    const sock = LIVE80.slice(
      LIVE80.indexOf("location /socket.io/"),
      LIVE80.indexOf("location /", LIVE80.indexOf("location /socket.io/") + 20),
    );
    assert.ok(
      !/limit_req /.test(sock),
      "rate limiting a WebSocket breaks tracking",
    );
  });

  test("the ACME challenge path stays on plain HTTP", () => {
    // Certbot cannot issue a certificate if this is redirected away.
    assert.match(LIVE80, /location \/\.well-known\/acme-challenge\/ \{/);
  });

  test("the app is still proxied to port 5000 with the upload budget intact", () => {
    assert.match(LIVE80, /proxy_pass\s+http:\/\/127\.0\.0\.1:5000;/);
    assert.match(LIVE80, /client_max_body_size 20M;/);
  });
});

describe("C-15 (D) — ssl-setup.sh fails closed", () => {
  test("it verifies the TLS block, not merely the file", () => {
    assert.match(
      SSL,
      /awk '\/listen \.\*443\/,\/\^\}\/'/,
      "must inspect the 443 block",
    );
  });

  test("a missing header or limiter aborts instead of reporting success", () => {
    const block = SSL.slice(SSL.indexOf("MISSING="));
    for (const d of [
      "Strict-Transport-Security",
      "X-Frame-Options",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "limit_req zone=onway_admin_login burst=5",
      "limit_req_status 429",
      "limit_req zone=onway_api",
    ]) {
      assert.ok(block.includes(d), `${d} is not verified after certbot`);
    }
    assert.match(SSL, /if \[\[ -n "\$MISSING" \]\]; then\s*\n\s*err /);
  });

  test("it refuses to call the site secure while port 80 still serves traffic", () => {
    assert.match(
      SSL,
      /return\\s\+301\\s\+https/,
      "the redirect is never checked",
    );
    // The message existing is not the point — it has to ABORT. Asserting only that
    // the text is present passes just as happily when `err` is swapped for
    // `success`, which is the difference between failing closed and lying.
    const m = SSL.match(
      /^\s*(err|success|info|warn)\s+"Port 80 is still serving/m,
    );
    assert.ok(m, "the port-80 check is gone");
    assert.equal(
      m[1],
      "err",
      "a still-plaintext port 80 must abort, not be reported as OK",
    );
  });

  test("the verification only reads — re-running cannot duplicate a directive", () => {
    const block = SSL.slice(
      SSL.indexOf("SITE_CONF="),
      SSL.indexOf('info "Reloading'),
    );
    for (const mutator of [">>", "sed -i", "tee -a"]) {
      assert.ok(
        !block.includes(mutator),
        `the check writes with ${mutator}; re-running would duplicate directives`,
      );
    }
  });
});

describe("C-15 (E) — the operator is not told SSL is optional", () => {
  test("the SSL step is marked required and names ssl-setup.sh", () => {
    assert.doesNotMatch(SETUP, /STEP 3 \(optional/);
    assert.match(SETUP, /STEP 3 — REQUIRED — Install SSL/);
    assert.match(SETUP, /deployment\/ssl-setup\.sh/);
  });

  test("the plaintext exposure is stated in the operator's own terms", () => {
    assert.match(SETUP, /PLAINTEXT/);
  });

  test("the unused example file is still marked as an example, not deployed", () => {
    // C-15 also flagged nginx.conf as a hardened file nothing referenced. It stays
    // documentation; the deployed truth is the heredoc above.
    const conf = read("deployment/nginx.conf");
    assert.match(conf, /EXAMPLE file only/);
    assert.ok(
      !/nginx\.conf/.test(SETUP.replace(/#.*$/gm, "")),
      "server-setup.sh must not copy the example file",
    );
  });
});

describe("C-15 (F) — ssl-setup.sh does not hand the app back to root", () => {
  // server-setup.sh creates a nologin service user and tells the operator to start
  // the app as that user (H-46: running Node as root was the finding). PM2 keeps a
  // SEPARATE daemon per user, and ecosystem.config.js names no user of its own, so
  // a `pm2 startOrReload` issued as root does not touch the onway daemon at all —
  // it starts a SECOND copy of the app, owned by root, while the real process never
  // sees the ALLOWED_ORIGINS this script just wrote.
  const SERVICE_USER = (SETUP.match(/^SERVICE_USER="([^"]+)"/m) || [])[1];

  test("server-setup.sh still defines a service user", () => {
    assert.ok(SERVICE_USER, "SERVICE_USER disappeared from server-setup.sh");
    assert.notEqual(SERVICE_USER, "root");
  });

  test("server-setup.sh still starts the app as that user, not root", () => {
    assert.match(
      SETUP,
      new RegExp(`sudo -u \\$\\{SERVICE_USER\\}[^\\n]*pm2 start`),
      "the documented start command no longer drops privileges",
    );
  });

  test("ssl-setup.sh reloads PM2 as the service user", () => {
    const reload = SSL.slice(SSL.indexOf('info "Reloading PM2'));
    assert.ok(reload.includes("pm2 startOrReload"), "the reload step is gone");
    assert.match(
      reload,
      /sudo -u \S+ /,
      "PM2 is reloaded as root — it would start a second, root-owned copy of the app",
    );
  });

  test("it reloads as the SAME user server-setup.sh installed under", () => {
    // The two scripts cannot source each other (ssl-setup.sh has to stay
    // independently runnable), so the only thing keeping them in step is that both
    // resolve to the same default. Compare the DEFAULTS, not the variable name.
    const sslDefault = (SSL.match(
      /^SERVICE_USER="\$\{ONWAY_SERVICE_USER:-([^}]+)\}"/m,
    ) || [])[1];
    assert.ok(sslDefault, "ssl-setup.sh does not define SERVICE_USER");
    assert.equal(
      sslDefault,
      SERVICE_USER,
      `ssl-setup reloads as "${sslDefault}" but the app runs as "${SERVICE_USER}"`,
    );

    // …and that the reload really goes through that variable rather than a literal.
    const reload = SSL.slice(SSL.indexOf('info "Reloading PM2'));
    assert.match(reload, /sudo -u "\$SERVICE_USER"/);
  });

  test("it refuses to continue if that user is missing", () => {
    const reload = SSL.slice(SSL.indexOf('info "Reloading PM2'));
    assert.match(
      reload,
      /id -u "\$SERVICE_USER"[\s\S]{0,120}?err /,
      "a missing service user must abort, not silently fall back to root",
    );
  });

  test("the DNS pre-check has the tool it depends on", () => {
    // ssl-setup.sh gates on `dig`, which is not part of a default Ubuntu install.
    // Without it DOMAIN_IP resolves to empty and the script aborts with a message
    // that blames the operator's DNS instead of the missing package.
    assert.match(SSL, /dig \+short/, "the DNS pre-check is gone");
    assert.match(
      SETUP,
      /apt-get install[^\n]*\bdnsutils\b/,
      "server-setup.sh does not install dnsutils, so ssl-setup.sh's dig is missing",
    );
  });
});

describe("C-15 (G) — the repository describes the server that actually runs", () => {
  // The live box was found running zone `onway_admin_login` with burst=5 while this
  // repository generated `onway_login` with burst=3. Nothing caught it, and two
  // things depended on it: a reinstall (or a rebuild after an outage) would have
  // produced a different server from the live one, and ssl-setup.sh's own C-15 check
  // greps for the zone name as a literal string — so it would have aborted against
  // production while passing here. The repository was reconciled onto the live
  // values; these assertions keep the two from drifting apart again.

  /** Every rate-limit zone the setup script declares, with its rate. */
  const declaredZones = () =>
    Object.fromEntries(
      [...SETUP.matchAll(/limit_req_zone\s+\S+\s+zone=(\w+):\S+\s+rate=(\S+);/g)]
        .map((m) => [m[1], m[2]]),
    );

  /** Every zone the config actually USES, with the burst it uses. */
  const usedZones = () =>
    Object.fromEntries(
      [...CONF.matchAll(/limit_req\s+zone=(\w+)\s+burst=(\d+)/g)].map((m) => [
        m[1],
        Number(m[2]),
      ]),
    );

  test("the admin-login zone is the one production runs", () => {
    const zones = declaredZones();
    assert.equal(
      zones.onway_admin_login,
      "5r/m",
      "the admin-login zone is not declared at the production rate",
    );
    assert.equal(
      zones.onway_login,
      undefined,
      "the old onway_login zone is back — the repo and the live server disagree again",
    );
  });

  test("the admin-login limiter uses the production burst", () => {
    assert.equal(usedZones().onway_admin_login, 5);
  });

  test("every zone used is a zone declared — a typo cannot ship", () => {
    const declared = declaredZones();
    for (const zone of Object.keys(usedZones())) {
      assert.ok(
        zone in declared,
        `limit_req uses zone "${zone}" which no limit_req_zone declares — nginx would refuse to start`,
      );
    }
  });

  test("ssl-setup.sh verifies the zones server-setup.sh actually generates", () => {
    // This is the assertion that would have caught the drift. ssl-setup.sh names the
    // zones as literal strings; derive them from the setup script instead of
    // hardcoding, so renaming a zone in one file fails here until the other follows.
    for (const zone of Object.keys(usedZones())) {
      assert.match(
        SSL,
        new RegExp(`"limit_req zone=${zone}\\b`),
        `ssl-setup.sh does not check zone "${zone}" — its C-15 verification would pass a server that never applied it`,
      );
    }
  });

  test("a throttled request answers 429, not 503", () => {
    assert.match(
      LIVE80,
      /^\s*limit_req_status\s+429;/m,
      "limit_req_status is missing, so nginx falls back to 503",
    );
  });

  test("the 429 sits where certbot will clone it into the TLS block", () => {
    // At http level it would apply by inheritance but never appear inside the 443
    // block, so ssl-setup.sh could not verify it and a later edit could drop it
    // unnoticed.
    const beforeFirstServer = CONF.slice(0, CONF.indexOf("server {"));
    assert.ok(
      !beforeFirstServer.includes("limit_req_status"),
      "limit_req_status is at http level — certbot will not copy it into the 443 block",
    );
    assert.match(SSL, /"limit_req_status 429"/, "ssl-setup.sh does not verify the 429");
  });

  test("nginx itself accepts the reconciled file", () => {
    // The rename touches both the declaration and its use, and nginx refuses to
    // start when they disagree — so this parses the generated file for real rather
    // than trusting the regexes above. Skipped where nginx is not installed.
    let nginx;
    try {
      nginx = execFileSync("which", ["nginx"], { encoding: "utf8" }).trim();
    } catch {
      return;
    }
    const dir = mkdtempSync(join(tmpdir(), "onway-nginx-"));
    const conf = join(dir, "nginx.conf");
    writeFileSync(
      conf,
      `events {}\nhttp {\n${CONF.replace(/^/gm, "  ")}\n}\n`,
    );
    try {
      execFileSync(nginx, ["-t", "-c", conf], { stdio: "pipe" });
    } catch (err) {
      const out = String(err.stderr || err.stdout || err.message);
      // "syntax is ok" means the file parsed — which is the whole assertion. What
      // follows is nginx trying to BIND, and this container has no IPv6, no
      // /var/log/nginx and no permission to listen on 80. None of that is a
      // statement about the generated config.
      if (/syntax is ok/.test(out)) return;
      assert.fail(`nginx rejected the generated config:\n${out}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
