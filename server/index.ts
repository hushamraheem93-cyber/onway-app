import express from "express";
import type { Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { initializeFirebase } from "./firebase";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

initializeFirebase();

const app = express();
const log = console.log;

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

function setupCors(app: express.Application) {
  app.use((req, res, next) => {
    const origin = req.header("origin");

    // Allow all origins in development for hotspot/network access
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      res.header("Access-Control-Allow-Headers", "Content-Type, Accept");
      res.header("Access-Control-Allow-Credentials", "true");
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
      limit: "100mb",
    }),
  );

  app.use(express.urlencoded({ extended: false, limit: "100mb" }));
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

      log(logLine);
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

  log(`baseUrl`, baseUrl);
  log(`expsUrl`, expsUrl);

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, appName);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}

// ── Admin Auth ────────────────────────────────────────────────────────────
const ADMIN_COOKIE = "onway_admin_session";

function makeToken(): string {
  const secret = `${process.env.ADMIN_USERNAME}:${process.env.ADMIN_PASSWORD}`;
  return crypto.createHmac("sha256", secret).update("onway_admin").digest("hex");
}

function isValidSession(req: Request): boolean {
  const raw = req.cookies?.[ADMIN_COOKIE];
  if (!raw) return false;
  return raw === makeToken();
}

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

  log("Serving static Expo files with dynamic manifest routing");

  // Cookie parser middleware (lightweight, no dep)
  app.use((req: Request, _res: Response, next: NextFunction) => {
    parseCookies(req);
    next();
  });

  // GET /admin/login — show login page
  app.get("/admin/login", (req: Request, res: Response) => {
    if (isValidSession(req)) return res.redirect("/admin");
    const loginTemplate = fs.readFileSync(loginTemplatePath, "utf-8");
    const html = loginTemplate.replace("ERROR_PLACEHOLDER", "");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(html);
  });

  // POST /admin/login — validate credentials
  app.post("/admin/login", express.urlencoded({ extended: false }), (req: Request, res: Response) => {
    const { username, password } = req.body || {};
    const validUser = process.env.ADMIN_USERNAME;
    const validPass = process.env.ADMIN_PASSWORD;

    if (username === validUser && password === validPass) {
      const token = makeToken();
      const maxAge = 60 * 60 * 24 * 7; // 7 days
      res.setHeader(
        "Set-Cookie",
        `${ADMIN_COOKIE}=${token}; HttpOnly; SameSite=Strict; Max-Age=${maxAge}; Path=/`
      );
      return res.redirect("/admin");
    }

    const loginTemplate = fs.readFileSync(loginTemplatePath, "utf-8");
    const errorHtml = `<div class="error">اسم المستخدم أو كلمة المرور غير صحيحة</div>`;
    const html = loginTemplate.replace("ERROR_PLACEHOLDER", errorHtml);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(401).send(html);
  });

  // GET /admin/logout — clear session
  app.get("/admin/logout", (_req: Request, res: Response) => {
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

  log("Expo routing: Checking expo-platform header on / and /manifest");
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

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});

process.on("SIGTERM", () => {
  console.error("Received SIGTERM");
});

process.on("SIGINT", () => {
  console.error("Received SIGINT");
});

process.on("exit", (code) => {
  console.error("Process exit with code:", code);
});

(async () => {
  setupCors(app);
  setupBodyParsing(app);
  setupRequestLogging(app);

  configureExpoAndLanding(app);

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
      log(`express server serving on port ${port}`);
    },
  );
})();
