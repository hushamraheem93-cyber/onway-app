#!/usr/bin/env node
/**
 * build-admin-dist.js
 * Generates admin-dist/ — a self-contained static admin panel ready for Hostinger.
 * Run: node scripts/build-admin-dist.js
 */

const fs   = require("fs");
const path = require("path");

const ROOT       = path.resolve(__dirname, "..");
const TEMPLATES  = path.join(ROOT, "server", "templates");
const OUT_DIR    = path.join(ROOT, "admin-dist");

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// ─────────────────────────────────────────────────────────────────────────────
// 1.  admin-dist/config.js   (user edits BACKEND_URL before uploading)
// ─────────────────────────────────────────────────────────────────────────────
const configJs = `/**
 * OnWay Admin — Configuration
 * ─────────────────────────────
 * Set BACKEND_URL to the full URL of your Replit (or any) backend.
 * Example:  https://onway-backend.husham.repl.co
 *           https://api.onway.iq
 *
 * DO NOT add a trailing slash.
 * This file must be uploaded alongside index.html and login.html.
 */
window.ONWAY_CONFIG = {
  BACKEND_URL: "https://YOUR_BACKEND_URL_HERE"
};
`;
fs.writeFileSync(path.join(OUT_DIR, "config.js"), configJs, "utf-8");
console.log("✅ config.js");

// ─────────────────────────────────────────────────────────────────────────────
// 2.  admin-dist/.htaccess   (Apache / Hostinger)
// ─────────────────────────────────────────────────────────────────────────────
const htaccess = `# OnWay Admin — Hostinger .htaccess
# ─────────────────────────────────────────────────────
# Force HTTPS
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]

# Serve login.html for /login
RewriteRule ^login/?$ login.html [L]

# Serve index.html for / or /admin
RewriteRule ^(admin/?)?$ index.html [L]

# Security headers
<IfModule mod_headers.c>
  Header always set X-Content-Type-Options  "nosniff"
  Header always set X-Frame-Options         "DENY"
  Header always set X-XSS-Protection        "1; mode=block"
  Header always set Referrer-Policy         "strict-origin-when-cross-origin"
</IfModule>

# Cache: HTML files — no cache; JS/CSS/images — 7 days
<FilesMatch "\.(html|htm)$">
  Header set Cache-Control "no-cache, no-store, must-revalidate"
  Header set Pragma "no-cache"
  Header set Expires "0"
</FilesMatch>
<FilesMatch "\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?)$">
  Header set Cache-Control "public, max-age=604800, immutable"
</FilesMatch>
`;
fs.writeFileSync(path.join(OUT_DIR, ".htaccess"), htaccess, "utf-8");
console.log("✅ .htaccess");

// ─────────────────────────────────────────────────────────────────────────────
// 3.  Fetch interceptor — injected into admin.html right after API_BASE
// ─────────────────────────────────────────────────────────────────────────────
const FETCH_INTERCEPTOR = `
    // ═══════════════════════════════════════════════════════════════
    // CROSS-DOMAIN BUILD — Hostinger standalone mode
    // Intercepts every fetch() call to:
    //   1. Prepend the remote backend URL for relative /api & /admin paths
    //   2. Attach Authorization: Bearer <token> from localStorage
    //   3. Redirect to login.html on 401
    // ═══════════════════════════════════════════════════════════════
    (function () {
      const cfg    = window.ONWAY_CONFIG || {};
      const REMOTE = (cfg.BACKEND_URL || "").replace(/\\/$/, "");
      if (!REMOTE || REMOTE === "https://YOUR_BACKEND_URL_HERE") {
        console.warn("[OnWay] BACKEND_URL not set in config.js — running in same-domain mode.");
        return;
      }

      // Auth gate: if no token in localStorage, go to login
      const _storedToken = localStorage.getItem("onway_admin_token");
      if (!_storedToken) {
        window.location.replace("login.html");
        return;
      }

      const _nativeFetch = window.fetch.bind(window);
      window.fetch = function (input, init) {
        let url = (typeof input === "string")
          ? input
          : (input instanceof Request ? input.url : String(input));

        // Rewrite relative backend paths
        if (url.startsWith("/api") || url.startsWith("/admin") || url.startsWith("/uploads")) {
          url = REMOTE + url;
        }

        init = Object.assign({}, init || {});
        if (!init.credentials) init.credentials = "include";

        const token = localStorage.getItem("onway_admin_token");
        if (token) {
          init.headers = Object.assign(
            { Authorization: "Bearer " + token },
            init.headers || {}
          );
        }

        const finalInput =
          (typeof input === "string" || input instanceof URL)
            ? url
            : new Request(url, input);

        return _nativeFetch(finalInput, init).then(function (res) {
          if (res.status === 401 && !window._redirectingToLogin) {
            window._redirectingToLogin = true;
            localStorage.removeItem("onway_admin_token");
            window.location.replace("login.html");
          }
          return res;
        });
      };
    })();
    // ═══════════════════════════════════════════════════════════════

`;

// ─────────────────────────────────────────────────────────────────────────────
// 4.  Build admin-dist/index.html  (from server/templates/admin.html)
// ─────────────────────────────────────────────────────────────────────────────
let adminHtml = fs.readFileSync(path.join(TEMPLATES, "admin.html"), "utf-8");

// 4a. Inject config.js into <head>
adminHtml = adminHtml.replace(
  /<\/head>/i,
  `  <script src="config.js"></script>\n</head>`
);

// 4b. Inject fetch interceptor right after  const API_BASE = '/api';
//     (line ~3940 in original file)
adminHtml = adminHtml.replace(
  `const API_BASE = '/api';`,
  `const API_BASE = (window.ONWAY_CONFIG?.BACKEND_URL || '') + '/api';
${FETCH_INTERCEPTOR}`
);

// 4c. Fix /admin/logout path so it works cross-domain (navigate to backend URL)
adminHtml = adminHtml.replace(
  `window.location.href = '/api/vendor/logout';`,
  `window.location.href = (window.ONWAY_CONFIG?.BACKEND_URL || '') + '/api/vendor/logout';`
);

fs.writeFileSync(path.join(OUT_DIR, "index.html"), adminHtml, "utf-8");
console.log(`✅ index.html  (${(adminHtml.length / 1024).toFixed(0)} KB)`);

// ─────────────────────────────────────────────────────────────────────────────
// 5.  Build admin-dist/login.html  (standalone, no server-side placeholders)
// ─────────────────────────────────────────────────────────────────────────────
const loginHtml = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>تسجيل الدخول — لوحة التحكم</title>
  <script src="config.js"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: rgba(255,255,255,0.05);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 24px;
      padding: 48px 40px;
      width: 100%;
      max-width: 400px;
      box-shadow: 0 25px 50px rgba(0,0,0,0.4);
    }
    .logo { text-align: center; margin-bottom: 32px; }
    .logo h1 { color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }
    .logo p  { color: rgba(255,255,255,0.5); font-size: 13px; margin-top: 4px; }
    .form-group { margin-bottom: 16px; }
    label {
      display: block; color: rgba(255,255,255,0.7);
      font-size: 13px; font-weight: 600; margin-bottom: 8px;
    }
    input[type="text"], input[type="password"] {
      width: 100%; padding: 13px 16px;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 12px; color: #ffffff; font-size: 14px;
      font-family: inherit; outline: none;
      transition: border-color 0.2s, background 0.2s; text-align: right;
    }
    input[type="text"]:focus, input[type="password"]:focus {
      border-color: #E86520; background: rgba(232,101,32,0.08);
    }
    input::placeholder { color: rgba(255,255,255,0.3); }
    .btn {
      width: 100%; padding: 14px;
      background: linear-gradient(135deg, #E86520, #FF8C4B);
      border: none; border-radius: 12px;
      color: #ffffff; font-size: 15px; font-weight: 700;
      font-family: inherit; cursor: pointer; margin-top: 4px;
      transition: opacity 0.2s, transform 0.1s;
      box-shadow: 0 4px 16px rgba(232,101,32,0.4);
    }
    .btn:hover { opacity: 0.92; }
    .btn:active { transform: scale(0.98); }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .error {
      background: rgba(239,68,68,0.15);
      border: 1px solid rgba(239,68,68,0.3);
      border-radius: 10px; color: #fca5a5;
      font-size: 13px; padding: 12px 14px;
      margin-bottom: 18px; text-align: center;
    }
    .loading-overlay {
      display: none; position: fixed; inset: 0;
      background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
      align-items: center; justify-content: center; z-index: 999;
    }
    .loading-overlay.active { display: flex; }
    .spinner {
      width: 48px; height: 48px;
      border: 4px solid rgba(255,255,255,0.1);
      border-top-color: #E86520;
      border-radius: 50%; animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="loading-overlay" id="loading-overlay">
    <div style="text-align:center;">
      <div class="spinner"></div>
      <p style="color:white;margin-top:16px;font-size:14px;">جاري التحقق...</p>
    </div>
  </div>

  <div class="card">
    <div class="logo">
      <h1>OnWay</h1>
      <p>لوحة التحكم</p>
    </div>

    <div id="error-box" class="error" style="display:none;"></div>

    <div class="form-group">
      <label>اسم المستخدم</label>
      <input type="text" id="username" placeholder="أدخل اسم المستخدم" autocomplete="username" />
    </div>
    <div class="form-group">
      <label>كلمة المرور</label>
      <input type="password" id="password" placeholder="أدخل كلمة المرور" autocomplete="current-password" />
    </div>
    <button class="btn" id="login-btn" onclick="doLogin()">دخول</button>
  </div>

  <script>
    // If already logged in, go to admin
    if (localStorage.getItem("onway_admin_token")) {
      window.location.replace("index.html");
    }

    // Validate config
    const _cfg    = window.ONWAY_CONFIG || {};
    const _remote = (_cfg.BACKEND_URL || "").replace(/\\/$/, "");
    if (!_remote || _remote === "https://YOUR_BACKEND_URL_HERE") {
      document.getElementById("error-box").style.display = "block";
      document.getElementById("error-box").textContent =
        "⚠️ لم يتم ضبط BACKEND_URL في config.js. افتح الملف وأدخل رابط الـ backend.";
    }

    function showError(msg) {
      document.getElementById("loading-overlay").classList.remove("active");
      const box = document.getElementById("error-box");
      box.textContent = msg;
      box.style.display = "block";
    }

    async function doLogin() {
      const username = document.getElementById("username").value.trim();
      const password = document.getElementById("password").value;
      if (!username || !password) { showError("يرجى إدخال اسم المستخدم وكلمة المرور"); return; }
      if (!_remote || _remote === "https://YOUR_BACKEND_URL_HERE") {
        showError("يرجى ضبط BACKEND_URL في config.js أولاً");
        return;
      }
      document.getElementById("loading-overlay").classList.add("active");
      document.getElementById("login-btn").disabled = true;
      try {
        const res  = await fetch(_remote + "/api/admin/login", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ username, password }),
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success && data.token) {
          localStorage.setItem("onway_admin_token", data.token);
          window.location.replace("index.html");
        } else {
          showError(data.error || "فشل تسجيل الدخول");
          document.getElementById("login-btn").disabled = false;
        }
      } catch (e) {
        showError("تعذّر الاتصال بالخادم. تأكد من أن BACKEND_URL صحيح.");
        document.getElementById("login-btn").disabled = false;
      }
    }

    // Allow Enter key
    document.addEventListener("keydown", function(e) {
      if (e.key === "Enter") doLogin();
    });
  </script>
</body>
</html>
`;
fs.writeFileSync(path.join(OUT_DIR, "login.html"), loginHtml, "utf-8");
console.log("✅ login.html");

// ─────────────────────────────────────────────────────────────────────────────
// 6.  Summary
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n✅  Build complete →  admin-dist/");
console.log("   index.html   — admin dashboard");
console.log("   login.html   — standalone login");
console.log("   config.js    — ⚠️  set BACKEND_URL before uploading!");
console.log("   .htaccess    — Apache / Hostinger config\n");
