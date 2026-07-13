import express from "express";
import type { Request, Response, NextFunction } from "express";
import compression from "compression";
import { registerRoutes } from "./routes";
import { initializeFirebase, getFirestore } from "./firebase";
import vendorRouter from "./vendor";
import { sendVendorOrderReminderNotification } from "./pushNotifications";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import * as bcrypt from "bcryptjs";

initializeFirebase();

// ── Custom admin credentials stored in Firestore ───────────────────────────
// Passwords are hashed with bcrypt (matches vendor password hashing elsewhere).
// verifyPassword() also accepts the OLD unsalted-SHA256 format for any credentials
// that were set before this change, so existing admins aren't locked out — the
// very next password change re-hashes with bcrypt automatically.
function hashPassword(pass: string): Promise<string> {
  return bcrypt.hash(pass, 10);
}

function legacySha256Hash(pass: string): string {
  return crypto.createHash("sha256").update(`onway::${pass}`).digest("hex");
}

async function verifyPassword(pass: string, storedHash: string): Promise<boolean> {
  if (storedHash.startsWith("$2")) {
    return bcrypt.compare(pass, storedHash);
  }
  return legacySha256Hash(pass) === storedHash;
}

async function getCustomCredentials(): Promise<{ username: string; passwordHash: string } | null> {
  try {
    const db = getFirestore();
    if (!db) return null;
    const doc = await db.collection("adminConfig").doc("credentials").get();
    if (!doc.exists) return null;
    const data = doc.data() as { username: string; passwordHash: string };
    return data?.username && data?.passwordHash ? data : null;
  } catch { return null; }
}

async function setCustomCredentials(username: string, password: string): Promise<void> {
  const db = getFirestore();
  if (!db) throw new Error("Database not configured");
  await db.collection("adminConfig").doc("credentials").set({
    username,
    passwordHash: await hashPassword(password),
    updatedAt: new Date().toISOString(),
  });
  // Changing credentials must invalidate every existing session — otherwise a
  // stolen/leaked session cookie would keep working right through a password reset.
  invalidateAllSessions();
}

async function validateAdminCredentials(username: string, password: string): Promise<boolean> {
  const custom = await getCustomCredentials();
  if (custom) {
    // Once custom credentials exist, they are the ONLY valid credentials — the
    // original env-var admin/password no longer work. Otherwise a password
    // "reset" would be pointless if the old env credentials had ever leaked.
    return username === custom.username && await verifyPassword(password, custom.passwordHash);
  }
  // No custom credentials set yet — bootstrap from env vars
  const validUser = process.env.ADMIN_USERNAME;
  const validPass = process.env.ADMIN_PASSWORD;
  return username === validUser && password === validPass;
}

const app = express();

// ── JWT startup guard ─────────────────────────────────────────────────────
if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === "production") {
    console.error("[FATAL] JWT_SECRET environment variable is not set. Refusing to start in production. Add JWT_SECRET to Replit Secrets.");
    process.exit(1);
  }
  console.warn("[SECURITY] JWT_SECRET not set — server running in DEVELOPMENT mode with insecure defaults.");
}

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// ── Gzip/Brotli Compression ──────────────────────────────────────────────────
function setupCompression(app: express.Application) {
  app.use(compression({
    level: 6,
    threshold: 1024,
    filter: (req: express.Request, res: express.Response) => {
      if (req.headers["x-no-compression"]) return false;
      return compression.filter(req, res);
    },
  }));
}

// ── In-Memory Rate Limiter ────────────────────────────────────────────────────
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function setupRateLimiter(app: express.Application) {
  const WINDOW_MS = 60 * 1000;
  const LIMITS: Record<string, number> = {
    "/api/admin/login": 10,
    "/api/vendor/mobile-auth": 20,
    "/api/users": 30,
    // Auth OTP endpoints: strict limits so codes cannot be spammed or brute-forced.
    "/api/auth/send-otp": 5,
    "/api/auth/verify-otp": 15,
    default: 600,
  };

  function rateLimitMiddleware(pathKey: string, overrideLimit?: number) {
    return (req: Request, res: Response, next: NextFunction) => {
      const ip =
        (req.headers["x-forwarded-for"] as string || "").split(",")[0].trim() ||
        req.socket.remoteAddress ||
        "unknown";
      const key = `${ip}:${pathKey}`;
      const now = Date.now();
      const limit = overrideLimit ?? LIMITS[pathKey] ?? LIMITS.default;

      let entry = rateLimitStore.get(key);
      if (!entry || now > entry.resetAt) {
        entry = { count: 1, resetAt: now + WINDOW_MS };
        rateLimitStore.set(key, entry);
      } else {
        entry.count++;
      }

      res.setHeader("X-RateLimit-Limit", limit);
      res.setHeader("X-RateLimit-Remaining", Math.max(0, limit - entry.count));
      res.setHeader("X-RateLimit-Reset", Math.ceil(entry.resetAt / 1000));

      if (entry.count > limit) {
        // Return HTML for browser-facing endpoints, JSON for API
        if (req.accepts("html") && !req.path.startsWith("/api")) {
          return res.status(429).send("<h1>429 - Too Many Requests</h1><p>حاول لاحقاً</p>");
        }
        return res.status(429).json({ error: "طلبات كثيرة، حاول لاحقاً" });
      }
      next();
    };
  }

  // Rate limit HTML admin endpoints (outside /api)
  const ADMIN_HTML_RATE: Record<string, number> = {
    "POST:/admin/login": 10,
    "POST:/admin/google-signin": 10,
    "POST:/admin/reset-password": 5,
  };
  app.use((req: Request, res: Response, next: NextFunction) => {
    const routeKey = `${req.method}:${req.path}`;
    const limit = ADMIN_HTML_RATE[routeKey];
    if (!limit) return next();

    const ip =
      (req.headers["x-forwarded-for"] as string || "").split(",")[0].trim() ||
      req.socket.remoteAddress || "unknown";
    const key = `${ip}:${routeKey}`;
    const now = Date.now();

    let entry = rateLimitStore.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 1, resetAt: now + WINDOW_MS };
      rateLimitStore.set(key, entry);
    } else {
      entry.count++;
    }

    if (entry.count > limit) {
      return res.status(429).send("<h1>429</h1><p>محاولات كثيرة. حاول بعد دقيقة.</p>");
    }
    next();
  });

  app.use("/api", (req: Request, res: Response, next: NextFunction) => {
    const ip =
      (req.headers["x-forwarded-for"] as string || "").split(",")[0].trim() ||
      req.socket.remoteAddress ||
      "unknown";
    const key = `${ip}:${req.path}`;
    const now = Date.now();
    const limit = LIMITS[req.path] ?? LIMITS.default;

    let entry = rateLimitStore.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 1, resetAt: now + WINDOW_MS };
      rateLimitStore.set(key, entry);
    } else {
      entry.count++;
    }

    res.setHeader("X-RateLimit-Limit", limit);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, limit - entry.count));
    res.setHeader("X-RateLimit-Reset", Math.ceil(entry.resetAt / 1000));

    if (entry.count > limit) {
      return res.status(429).json({ error: "طلبات كثيرة، حاول لاحقاً" });
    }
    next();
  });

  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore) {
      if (now > entry.resetAt) rateLimitStore.delete(key);
    }
  }, 5 * 60 * 1000);
}

// ── Security Headers ──────────────────────────────────────────────────────────
function setupSecurityHeaders(app: express.Application) {
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });
}

function setupCors(app: express.Application) {
  const isProd = process.env.NODE_ENV === "production";
  const allowedDomains = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean);

  // Always trust this Repl's own Replit-assigned domains (dev preview + any
  // deployed *.replit.dev/*.replit.app domains). These are not secrets - they
  // are assigned by Replit for this project - so it's safe to always allow
  // them regardless of what the user has configured in ALLOWED_ORIGINS. This
  // ensures the admin dashboard and app always work inside Replit even if
  // ALLOWED_ORIGINS only lists a custom production domain.
  const replitDomains = [
    process.env.REPLIT_DEV_DOMAIN,
    ...(process.env.REPLIT_DOMAINS || "").split(",").map((s: string) => s.trim()),
  ].filter(Boolean) as string[];

  app.use((req, res, next) => {
    const origin = req.header("origin");

    if (origin) {
      const isReplitOwnDomain = replitDomains.some(
        (d: string) => origin === `https://${d}` || origin === `http://${d}`,
      );

      // In production, if ALLOWED_ORIGINS isn't configured, we now fail CLOSED
      // (block) instead of failing open (allow any origin with credentials).
      const allowed =
        !isProd ||
        isReplitOwnDomain ||
        (allowedDomains.length > 0 &&
          allowedDomains.some((d: string) => origin === d || origin.endsWith(`.${d}`)));

      if (allowed) {
        res.header("Access-Control-Allow-Origin", origin);
        res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
        res.header("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization");
        res.header("Access-Control-Allow-Credentials", "true");
      } else {
        return res.status(403).json({ error: "Origin not allowed" });
      }
    }

    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }

    next();
  });
}

function setupBodyParsing(app: express.Application) {
  app.use(
    express.json({
      limit: "10mb",
    }),
  );

  app.use(express.urlencoded({ extended: false, limit: "10mb" }));
}

function setupRequestLogging(app: express.Application) {
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      if (!path.startsWith("/api")) return;

      const duration = Date.now() - start;

      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      console.log(logLine);
    });

    next();
  });
}

function getAppName(): string {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

function serveExpoManifest(platform: string, res: Response) {
  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json",
  );

  if (!fs.existsSync(manifestPath)) {
    return res
      .status(404)
      .json({ error: `Manifest not found for platform: ${platform}` });
  }

  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}

function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName,
}: {
  req: Request;
  res: Response;
  landingPageTemplate: string;
  appName: string;
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;


  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, appName);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}

// ── Admin Auth ────────────────────────────────────────────────────────────
// Session management now lives in ./adminAuth.ts so routes.ts and vendor.ts
// use the exact same session store (see adminAuth.ts header comment for why
// this was previously three separate, inconsistent implementations).
import {
  ADMIN_COOKIE,
  createSession,
  invalidateSession,
  invalidateAllSessions,
  getSessionToken,
  isValidSession,
} from "./adminAuth";

function parseCookies(req: Request): void {
  const header = req.headers.cookie || "";
  const cookies: Record<string, string> = {};
  header.split(";").forEach((part) => {
    const [k, ...v] = part.trim().split("=");
    if (k) cookies[k.trim()] = decodeURIComponent(v.join("=").trim());
  });
  (req as any).cookies = cookies;
}
// ─────────────────────────────────────────────────────────────────────────

function configureExpoAndLanding(app: express.Application) {
  const templatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html",
  );
  const landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  const appName = getAppName();

  const adminTemplatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "admin.html",
  );

  const loginTemplatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "login.html",
  );


  // Cookie parser middleware (lightweight, no dep)
  app.use((req: Request, _res: Response, next: NextFunction) => {
    parseCookies(req);
    next();
  });

  // Helper: render login page with injected values
  function renderLogin(errorPlaceholder: string, googleBtnPlaceholder: string): string {
    const clientId = process.env.GOOGLE_CLIENT_ID || "";
    const template = fs.readFileSync(loginTemplatePath, "utf-8");
    return template
      .replace("ERROR_PLACEHOLDER", errorPlaceholder)
      .replace("GOOGLE_BTN_PLACEHOLDER", googleBtnPlaceholder);
  }

  function buildGoogleBtn(clientId: string): string {
    if (!clientId) return "";
    return `
      <div id="google-signin-div" style="display:flex;justify-content:center;"></div>
      <script>
        window.addEventListener('load', function() {
          if (typeof google === 'undefined') return;
          google.accounts.id.initialize({
            client_id: '${clientId}',
            callback: handleGoogleCredential,
            ux_mode: 'popup',
          });
          google.accounts.id.renderButton(
            document.getElementById('google-signin-div'),
            {
              theme: 'outline',
              size: 'large',
              width: 320,
              text: 'signin_with',
              locale: 'ar',
              shape: 'rectangular',
            }
          );
        });
      <\/script>
    `;
  }

  // GET /admin/login — show login page
  app.get("/admin/login", (req: Request, res: Response) => {
    if (isValidSession(req)) return res.redirect("/admin");
    const clientId = process.env.GOOGLE_CLIENT_ID || "";
    const html = renderLogin("", buildGoogleBtn(clientId));
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(html);
  });

// Detect whether the ORIGINAL client connection was HTTPS. Replit (and most
// PaaS platforms) terminate TLS at a proxy and forward plain HTTP internally,
// so req.protocol / NODE_ENV are NOT reliable signals for this — we must read
// the standard x-forwarded-proto header the proxy sets.
function isRequestSecure(req: Request): boolean {
  const proto = req.header("x-forwarded-proto") || req.protocol;
  return proto === "https";
}

// POST /admin/login — validate credentials (checks Firestore first, then env vars)
  app.post("/admin/login", express.urlencoded({ extended: false }), async (req: Request, res: Response) => {
    const { username, password } = req.body || {};
    const valid = await validateAdminCredentials(username, password);
    if (valid) {
      const token = createSession(username);
      const maxAge = 60 * 60 * 24 * 7; // 7 days
      const secureFlagAdmin = isRequestSecure(req) ? "; Secure" : "";
      res.setHeader(
        "Set-Cookie",
        `${ADMIN_COOKIE}=${token}; HttpOnly; SameSite=Strict; Max-Age=${maxAge}; Path=/${secureFlagAdmin}`
      );
      return res.redirect("/admin");
    }
    const clientId = process.env.GOOGLE_CLIENT_ID || "";
    const html = renderLogin(`<div class="error">اسم المستخدم أو كلمة المرور غير صحيحة</div>`, buildGoogleBtn(clientId));
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(401).send(html);
  });

  // POST /api/admin/login — JSON endpoint for cross-domain clients (e.g. Hostinger admin panel)
  // Returns { success: true, token } — client stores token in localStorage and sends as Bearer header.
  app.post("/api/admin/login", express.json(), async (req: Request, res: Response) => {
    const { username, password } = req.body || {};
    const valid = await validateAdminCredentials(username, password);
    if (!valid) return res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
    const token = createSession(username);
    const maxAge = 60 * 60 * 24 * 7;
    // CRITICAL: SameSite=None cookies are REJECTED OUTRIGHT by every modern browser
    // unless Secure is also present — this was previously gated on NODE_ENV, which is
    // NOT "production" in Replit's dev workspace, so this cookie was silently dropped
    // by the browser on every login. That's why most admin-panel buttons that rely on
    // this cookie (rather than the Bearer token) failed with "error loading" — the
    // session cookie never actually got stored in the first place.
    const secureFlag = isRequestSecure(req) ? "; Secure" : "";
    res.setHeader("Set-Cookie", `${ADMIN_COOKIE}=${token}; HttpOnly; SameSite=None; Max-Age=${maxAge}; Path=/${secureFlag}`);
    return res.json({ success: true, token });
  });

  // POST /admin/google-signin — verify Google ID token and create session
  app.post("/admin/google-signin", express.json(), async (req: Request, res: Response) => {
    const { credential } = req.body || {};
    if (!credential) return res.status(400).json({ error: "بيانات تسجيل الدخول غير موجودة" });

    try {
      // Verify token with Google
      const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
      if (!verifyRes.ok) return res.status(401).json({ error: "فشل التحقق من حساب Google" });

      const payload = await verifyRes.json() as { email?: string; email_verified?: string; aud?: string };

      // Verify the token is for our app
      const expectedClientId = process.env.GOOGLE_CLIENT_ID;
      if (expectedClientId && payload.aud !== expectedClientId) {
        return res.status(401).json({ error: "توكن غير صالح" });
      }

      // Verify email is verified
      if (payload.email_verified !== "true") {
        return res.status(401).json({ error: "يجب أن يكون البريد الإلكتروني موثقاً" });
      }

      // Check email against allowed admin email
      const allowedEmail = process.env.ADMIN_GOOGLE_EMAIL || "";
      if (!allowedEmail || payload.email?.toLowerCase() !== allowedEmail.toLowerCase()) {
        return res.status(403).json({ error: `هذا الحساب (${payload.email}) غير مصرح له بالدخول` });
      }

      // Valid — create session
      const token = createSession(payload.email || "google-admin");
      const maxAge = 60 * 60 * 24 * 7; // 7 days
      const secureFlagGoogle = isRequestSecure(req) ? "; Secure" : "";
      res.setHeader("Set-Cookie", `${ADMIN_COOKIE}=${token}; HttpOnly; SameSite=Strict; Max-Age=${maxAge}; Path=/${secureFlagGoogle}`);
      return res.json({ success: true, redirect: "/admin" });
    } catch (e) {
      console.error("[Google signin error]", e);
      return res.status(500).json({ error: "حدث خطأ داخلي. حاول مرة أخرى." });
    }
  });

  // POST /admin/reset-password — emergency recovery using a SEPARATE secret (MASTER_RECOVERY_PASSWORD).
  // NEVER uses ADMIN_PASSWORD — that would expose daily credentials as a backdoor.
  // If MASTER_RECOVERY_PASSWORD is not set, this endpoint is disabled entirely.
  app.post("/admin/reset-password", express.urlencoded({ extended: false }), async (req: Request, res: Response) => {
    const clientId = process.env.GOOGLE_CLIENT_ID || "";
    const send = (status: number, msg: string, isSuccess = false) => {
      const cls = isSuccess ? "success" : "error";
      const html = renderLogin(`<div class="${cls}">${msg}</div>`, buildGoogleBtn(clientId));
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(status).send(html);
    };

    // Endpoint is disabled if MASTER_RECOVERY_PASSWORD is not configured
    const masterRecoveryPassword = process.env.MASTER_RECOVERY_PASSWORD;
    if (!masterRecoveryPassword) {
      console.warn(`[SECURITY] /admin/reset-password attempted but MASTER_RECOVERY_PASSWORD is not set — endpoint disabled. IP: ${(req.headers["x-forwarded-for"] as string || "").split(",")[0].trim() || req.socket.remoteAddress}`);
      return send(503, "ميزة الاسترداد غير مفعّلة. راجع مدير النظام.");
    }

    const { recoveryCode, newUsername, newPassword, confirmPassword } = req.body || {};
    const ip = (req.headers["x-forwarded-for"] as string || "").split(",")[0].trim() || req.socket.remoteAddress || "unknown";

    if (recoveryCode !== masterRecoveryPassword) {
      console.warn(`[SECURITY] /admin/reset-password failed — wrong recovery code. IP: ${ip} at ${new Date().toISOString()}`);
      return send(401, "رمز الاسترداد غير صحيح");
    }
    if (!newUsername || newUsername.length < 3) return send(400, "اسم المستخدم يجب أن يكون 3 أحرف على الأقل");
    if (!newPassword || newPassword.length < 6) return send(400, "كلمة المرور يجب أن تكون 6 أحرف على الأقل");
    if (newPassword !== confirmPassword) return send(400, "كلمتا المرور غير متطابقتين");
    try {
      console.warn(`[SECURITY] /admin/reset-password SUCCESS — credentials changed. IP: ${ip} at ${new Date().toISOString()}`);
      await setCustomCredentials(newUsername, newPassword);
      return send(200, "تم تغيير بيانات الدخول بنجاح. يمكنك الدخول الآن.", true);
    } catch {
      return send(500, "فشل في حفظ البيانات. حاول مرة أخرى.");
    }
  });

  // POST /api/admin/change-credentials — change from within admin panel
  app.post("/api/admin/change-credentials", express.json(), async (req: Request, res: Response) => {
    if (!isValidSession(req)) return res.status(401).json({ error: "غير مصرح" });
    const { currentPassword, newUsername, newPassword, confirmPassword } = req.body || {};
    if (!currentPassword) return res.status(400).json({ error: "كلمة المرور الحالية مطلوبة" });
    // Validate current password
    const custom = await getCustomCredentials();
    const currentUsername = custom ? custom.username : (process.env.ADMIN_USERNAME || "admin");
    const valid = await validateAdminCredentials(currentUsername, currentPassword);
    if (!valid) return res.status(401).json({ error: "كلمة المرور الحالية غير صحيحة" });
    if (!newUsername || newUsername.length < 3) return res.status(400).json({ error: "اسم المستخدم يجب أن يكون 3 أحرف على الأقل" });
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
    if (newPassword !== confirmPassword) return res.status(400).json({ error: "كلمتا المرور غير متطابقتين" });
    try {
      await setCustomCredentials(newUsername, newPassword);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "فشل في الحفظ. حاول مرة أخرى." });
    }
  });

  // GET /api/admin/credentials-info — current username info
  app.get("/api/admin/credentials-info", async (req: Request, res: Response) => {
    if (!isValidSession(req)) return res.status(401).json({ error: "غير مصرح" });
    const custom = await getCustomCredentials();
    res.json({
      username: custom ? custom.username : (process.env.ADMIN_USERNAME || "admin"),
      isCustom: !!custom,
      updatedAt: (custom as any)?.updatedAt || null,
    });
  });

  // GET /admin/logout — invalidate session server-side and clear cookie
  app.get("/admin/logout", (req: Request, res: Response) => {
    invalidateSession(getSessionToken(req));
    res.setHeader("Set-Cookie", `${ADMIN_COOKIE}=; HttpOnly; Max-Age=0; Path=/`);
    res.redirect("/admin/login");
  });

  // GET /admin — protected
  app.get("/admin", (req: Request, res: Response) => {
    if (!isValidSession(req)) return res.redirect("/admin/login");
    const adminTemplate = fs.readFileSync(adminTemplatePath, "utf-8");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(adminTemplate);
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) {
      return next();
    }

    if (req.path !== "/" && req.path !== "/manifest") {
      return next();
    }

    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      return serveExpoManifest(platform, res);
    }

    if (req.path === "/") {
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName,
      });
    }

    next();
  });

  app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads"), {
    maxAge: 0,
    etag: false,
    lastModified: false,
    setHeaders: (staticRes) => {
      staticRes.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      staticRes.setHeader("Pragma", "no-cache");
      staticRes.setHeader("Expires", "0");
    },
  }));

  app.use("/assets", express.static(path.resolve(process.cwd(), "assets"), {
    maxAge: "7d",
    etag: true,
  }));

  app.use(express.static(path.resolve(process.cwd(), "server", "public"), {
    maxAge: "1d",
    etag: true,
  }));

  app.use(express.static(path.resolve(process.cwd(), "static-build"), {
    maxAge: 0,
    etag: false,
    lastModified: false,
    setHeaders: (staticRes) => {
      staticRes.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      staticRes.setHeader("Pragma", "no-cache");
      staticRes.setHeader("Expires", "0");
    },
  }));

}

function setupErrorHandler(app: express.Application) {
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const error = err as {
      status?: number;
      statusCode?: number;
      message?: string;
    };

    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });
}

let _httpServer: import("http").Server | null = null;
export function setHttpServer(s: import("http").Server) { _httpServer = s; }

// ── Stale-order reminder job ──────────────────────────────────────────────────
// Default thresholds (minutes) — overridden by Firestore appSettings/urgencyThresholds.
const DEFAULT_THRESHOLDS: Record<string, number> = {
  pending:   10,
  confirmed: 10,
  preparing: 25,
  ready:     15,
};

// Cache with a 60-second TTL so changes take effect within one polling cycle.
let _thresholdsCache: Record<string, number> | null = null;
let _thresholdsCacheExpiry = 0;

async function getStaleOrderThresholds(): Promise<Record<string, number>> {
  const now = Date.now();
  if (_thresholdsCache && now < _thresholdsCacheExpiry) return _thresholdsCache;

  const db = getFirestore();
  if (!db) return DEFAULT_THRESHOLDS;

  try {
    const snap = await db.collection("appSettings").doc("urgencyThresholds").get();
    const data = snap.exists ? snap.data() : {};
    const confirmed = (typeof data?.confirmed === "number" && data.confirmed > 0) ? data.confirmed : DEFAULT_THRESHOLDS.confirmed;
    const preparing = (typeof data?.preparing === "number" && data.preparing > 0) ? data.preparing : DEFAULT_THRESHOLDS.preparing;
    const ready     = (typeof data?.ready     === "number" && data.ready > 0)     ? data.ready     : DEFAULT_THRESHOLDS.ready;
    _thresholdsCache = { pending: confirmed, confirmed, preparing, ready };
    _thresholdsCacheExpiry = now + 60_000;
    return _thresholdsCache;
  } catch (err) {
    console.error("[StaleOrders] Failed to load thresholds from Firestore, using defaults:", err);
    return DEFAULT_THRESHOLDS;
  }
}

/**
 * Safely convert a Firestore field value to a JS timestamp (ms).
 * Handles: Firestore Timestamp objects, ISO strings, and numeric epochs.
 * Returns NaN if the value cannot be interpreted.
 */
function toTimestampMs(value: unknown): number {
  if (!value) return NaN;
  // Firestore Admin SDK Timestamp: has toDate() or { seconds, nanoseconds }
  if (typeof (value as any).toDate === "function") {
    return (value as any).toDate().getTime();
  }
  if (typeof (value as any).seconds === "number") {
    return (value as any).seconds * 1000 + Math.floor(((value as any).nanoseconds ?? 0) / 1e6);
  }
  // ISO string or numeric epoch
  const ms = typeof value === "number" ? value : new Date(value as string).getTime();
  return ms;
}

async function checkStaleOrders(): Promise<void> {
  const db = getFirestore();
  if (!db) return;

  const thresholds = await getStaleOrderThresholds();
  const activeStatuses = Object.keys(thresholds);
  let snapshot: FirebaseFirestore.QuerySnapshot;
  try {
    snapshot = await db.collection("orders")
      .where("status", "in", activeStatuses)
      .get();
  } catch (err) {
    console.error("[StaleOrders] Firestore query failed:", err);
    return;
  }

  const now = Date.now();
  // Cache vendor tokens to avoid redundant Firestore reads within one pass.
  const vendorTokenCache = new Map<string, string | null>();

  for (const doc of snapshot.docs) {
    try {
      const order = doc.data() as Record<string, any>;
      const status: string = order.status;
      const thresholdMin = thresholds[status];
      if (!thresholdMin) continue;

      // Determine the reference timestamp for how long we've been in this status.
      // `pending` uses `createdAt`; all other statuses use `vendorStatusAt_<status>`.
      const rawTimestamp: unknown =
        status === "pending" ? order.createdAt : order[`vendorStatusAt_${status}`];
      if (!rawTimestamp) continue;

      // Already notified for this status crossing — skip.
      if (order[`urgencyNotifiedAt_${status}`]) continue;

      const refMs = toTimestampMs(rawTimestamp);
      if (!Number.isFinite(refMs)) {
        console.warn(`[StaleOrders] Order ${doc.id}: unparseable timestamp for status '${status}', skipping`);
        continue;
      }

      const elapsedMin = (now - refMs) / 60000;
      if (elapsedMin < thresholdMin) continue;

      // Resolve vendor push token (cached per run).
      const vendorId: string | undefined = order.vendorId;
      if (!vendorId) continue;

      if (!vendorTokenCache.has(vendorId)) {
        const vendorDoc = await db.collection("vendors").doc(vendorId).get();
        const token = vendorDoc.exists ? ((vendorDoc.data() as any).pushToken as string | undefined) ?? null : null;
        vendorTokenCache.set(vendorId, token);
      }

      const pushToken = vendorTokenCache.get(vendorId);
      if (!pushToken) continue;

      const shortId = doc.id.slice(-6).toUpperCase();
      const elapsedRounded = Math.floor(elapsedMin);

      const sent = await sendVendorOrderReminderNotification(pushToken, doc.id, shortId, status, elapsedRounded);
      if (sent) {
        // Mark this crossing as notified so we don't spam.
        await doc.ref.update({ [`urgencyNotifiedAt_${status}`]: new Date().toISOString() });
      }
    } catch (err) {
      console.error(`[StaleOrders] Error processing order ${doc.id}:`, err);
    }
  }
}

function startStaleOrderJob(): void {
  const INTERVAL_MS = 60 * 1000; // run every minute
  setInterval(() => {
    checkStaleOrders().catch((err) =>
      console.error("[StaleOrders] Unhandled error:", err)
    );
  }, INTERVAL_MS);
  console.log("[StaleOrders] Reminder job started (runs every 60s)");
}

function gracefulShutdown(signal: string) {
  console.error(`[Shutdown] Received ${signal} — closing server gracefully`);
  if (_httpServer) {
    _httpServer.close(() => {
      console.error("[Shutdown] All connections drained. Exiting.");
      process.exit(0);
    });
    setTimeout(() => {
      console.error("[Shutdown] Forced exit after 10s timeout");
      process.exit(1);
    }, 10_000).unref();
  } else {
    process.exit(0);
  }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT",  () => gracefulShutdown("SIGINT"));

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});

process.on("exit", (code) => {
  console.error("Process exit with code:", code);
});

(async () => {
  setupCompression(app);
  setupSecurityHeaders(app);
  setupCors(app);
  setupBodyParsing(app);
  setupRateLimiter(app);
  setupRequestLogging(app);

  configureExpoAndLanding(app);

  // Vendor partner portal routes
  app.use(vendorRouter);

  const server = await registerRoutes(app);

  setupErrorHandler(app);

  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      console.log(`[OnWay] Server listening on port ${port}`);
      startStaleOrderJob();
    },
  );
  setHttpServer(server);
})();
