// PM2 ecosystem configuration for OnWay production deployment.
//
// Usage (on the VPS, after deploying the project):
//   pm2 start ecosystem.config.js
//   pm2 save          # persist across reboots
//   pm2 startup       # generate systemd unit (follow the printed command)
//
// Requirements:
//   - `npm run build` must be run before starting (creates server_dist/)
//   - All required environment variables must be set in .env (or PM2 env block below)
//   - Node.js 20+ recommended

"use strict";

// Load .env HERE, in the config file itself.
//
// This config previously relied on PM2's `env_file: ".env"` option. Verified on
// PM2 7.0.3: that option is silently ignored — the file is never read, none of
// its variables reach the process, and the server exits immediately with
// "JWT_SECRET environment variable is required but not set". PM2 then reports
// the app as "online" while it crash-loops, so the failure is easy to miss.
// Net effect: following the documented deploy step (`pm2 start
// ecosystem.config.js`) produced a dead server.
//
// ecosystem.config.js is plain JavaScript executed by PM2 at start time, so we
// read the file ourselves and hand PM2 a fully-populated `env` block. Anything
// already exported in the shell wins over the file, which keeps
// `JWT_SECRET=... pm2 start ...` and platform-injected secrets (Replit Secrets)
// working as before.
const fs = require("fs");
const path = require("path");

function loadEnvFile(file) {
  const out = {};
  const full = path.resolve(__dirname, file);
  if (!fs.existsSync(full)) return out;
  for (const rawLine of fs.readFileSync(full, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Strip one layer of matching quotes (values like JSON service accounts are
    // routinely quoted).
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

const fileEnv = loadEnvFile(".env");

// Fail loudly at start time rather than crash-looping silently afterwards.
const REQUIRED = ["JWT_SECRET"];
const missing = REQUIRED.filter((k) => !process.env[k] && !fileEnv[k]);
if (missing.length) {
  console.error(
    `\n[ecosystem] Missing required environment variable(s): ${missing.join(", ")}\n` +
      `[ecosystem] Set them in ${path.resolve(__dirname, ".env")} or export them before starting.\n` +
      `[ecosystem] The server cannot boot without them.\n`,
  );
}

module.exports = {
  apps: [
    {
      name: "onway",
      script: "server_dist/index.js",

      // Single-process by design: the driver queue, admin sessions, and
      // rate-limit store are all in-process memory. Running multiple instances
      // would split state between processes. Move that state to Redis first
      // if you ever need horizontal scaling.
      instances: 1,
      exec_mode: "fork",

      // Environment. Precedence (lowest → highest):
      //   defaults below  →  .env file  →  variables already exported in the shell
      // Secrets live in .env (git-ignored), never in this committed file.
      //
      // `env_file` is deliberately NOT used: PM2 7.x ignores it (see the loader
      // at the top of this file for the full explanation).
      env: Object.assign(
        {
          NODE_ENV: "production",
          PORT: 5000,
        },
        fileEnv,
        // Only forward shell values for keys the app actually cares about, so a
        // stray shell variable cannot silently override the .env file.
        Object.fromEntries(
          Object.keys(fileEnv)
            .concat(["NODE_ENV", "PORT"])
            .filter((k) => process.env[k] !== undefined)
            .map((k) => [k, process.env[k]]),
        ),
      ),

      // ── Process management ───────────────────────────────────────────────
      watch: false,                // never watch in production
      max_memory_restart: "512M",  // restart if RSS exceeds 512 MB
      restart_delay: 3000,         // wait 3 s between crash restarts
      max_restarts: 10,            // give up after 10 consecutive crashes
      min_uptime: "10s",           // a restart counts only if up for 10 s

      // ── Logs ─────────────────────────────────────────────────────────────
      // Create the logs/ directory before starting: mkdir -p logs
      error_file: "logs/onway-error.log",
      out_file: "logs/onway-out.log",
      log_file: "logs/onway-combined.log",
      time: true,                  // prepend ISO timestamp to every log line
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",

      // ── Graceful shutdown ────────────────────────────────────────────────
      // The server handles SIGTERM internally (drains active connections).
      kill_timeout: 15000,         // force-kill after 15 s if SIGTERM isn't enough
      listen_timeout: 8000,        // consider start failed if port not open in 8 s
    },
  ],
};
