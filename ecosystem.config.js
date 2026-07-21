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

      // PM2 will source the .env file from the project root automatically
      // when env_file is set. Alternatively, fill in the env block below.
      env_file: ".env",

      // Environment variables — override or supplement .env values here.
      // Secrets should live in .env, not committed here.
      env: {
        NODE_ENV: "production",
        PORT: 5000,
      },

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
