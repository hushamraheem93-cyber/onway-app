import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("../..", import.meta.url).pathname);
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const routes = read("server/routes.ts");
const support = read("client/screens/SupportChatScreen.tsx");
const adminAuth = read("server/adminAuth.ts");
const index = read("server/index.ts");
const envSetup = read("deployment/env-setup.sh");
const replit = read(".replit");
const pkg = JSON.parse(read("package.json"));
const lock = JSON.parse(read("package-lock.json"));
const ci = read(".github/workflows/ci.yml");
const tsconfig = JSON.parse(read("tsconfig.json"));
const clientFirebase = read("client/lib/firebase.ts");
const serverFirebase = read("server/firebase.ts");
const sharedStorage = read("shared/storageConfig.ts");
const jwtHelper = read("tests/utils/jwt.mjs");
const eslint = read("eslint.config.js");

const serverOnly = new Set(["express", "firebase-admin", "jsonwebtoken", "multer", "sharp", "@octokit/rest", "http-proxy-middleware", "ws"]);
const clientFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel);
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) clientFiles.push(rel);
  }
}
walk("client");


describe("M-49 — support polling and bounded product picker", () => {
  test("polling is gated by AppState and cleaned on unmount", () => {
    assert.match(support, /AppState\.currentState === "active"/);
    assert.match(support, /AppState\.addEventListener\("change"/);
    assert.match(support, /subscription\.remove\(\)/);
  });
  test("product picker requests a bounded page", () => {
    assert.match(support, /url\.searchParams\.set\("limit", "100"\)/);
    assert.match(routes, /Optional pagination: only applied when the caller passes `limit`/);
  });
});

describe("M-84 — admin sessions have a dedicated secret", () => {
  test("SESSION_SECRET is used and production refuses to start without it", () => {
    assert.match(adminAuth, /process\.env\.SESSION_SECRET \|\| process\.env\.JWT_SECRET/);
    assert.match(index, /!process\.env\.JWT_SECRET \|\| !process\.env\.SESSION_SECRET/);
    assert.match(index, /Refusing to start in production/);
  });
});

describe("M-85 and M-91 — no orphan dev OTP flag or tracked admin email", () => {
  test(".replit contains neither orphan flag nor concrete admin email", () => {
    assert.doesNotMatch(replit, /ALLOW_DEV_OTP/);
    assert.doesNotMatch(replit, /ADMIN_GOOGLE_EMAIL\s*=\s*"[^"]+@[^\"]+"/);
  });
});

describe("M-86/M-87 — dependency classification", () => {
  test("unused production packages are absent from root dependencies", () => {
    for (const name of ["@octokit/rest", "http-proxy-middleware", "ws"]) {
      assert.equal(pkg.dependencies?.[name], undefined, `${name} remains a production dependency`);
      assert.equal(lock.packages[""].dependencies?.[name], undefined, `${name} remains in lock root dependencies`);
    }
  });
  test("type packages and tsx are dev dependencies", () => {
    for (const name of ["@types/bcryptjs", "@types/compression", "@types/multer", "tsx"]) {
      assert.equal(pkg.dependencies?.[name], undefined, `${name} remains under dependencies`);
      assert.ok(pkg.devDependencies?.[name], `${name} is missing from devDependencies`);
    }
  });
});

describe("M-88 — client/server package boundary", () => {
  test("client source has no server-only imports", () => {
    for (const file of clientFiles) {
      const source = read(file);
      for (const name of serverOnly) {
        assert.doesNotMatch(source, new RegExp(`(?:from|require\\()\\s*[\\\"']${name.replace(/[.*+?^${}()|[\]\\]/g, "\\\\$&")}`), `${file} imports ${name}`);
      }
    }
  });
  test("eslint enforces the boundary", () => {
    assert.match(eslint, /no-restricted-imports/);
    assert.ok(eslint.includes('files: ["client/**/*.{js,jsx,ts,tsx}"]'));
    assert.match(eslint, /Server-only packages must not be imported/);
  });
});

describe("M-89 — CI/runtime consistency", () => {
  test("Node 22 is declared consistently", () => {
    assert.equal(pkg.engines?.node, ">=22 <23");
    assert.equal(lock.packages[""].engines?.node, ">=22 <23");
    assert.match(ci, /node-version: "22"/);
  });
});

describe("M-92 — TypeScript includes test/build TypeScript", () => {
  test("test.ts is no longer excluded", () => {
    assert.ok(!tsconfig.exclude.includes("**/*.test.ts"));
    assert.ok(tsconfig.include.includes("**/*.ts"));
  });
});

describe("M-93 — shared Firebase Storage bucket configuration", () => {
  test("client and server import the same resolver", () => {
    assert.match(clientFirebase, /@shared\/storageConfig/);
    assert.match(serverFirebase, /\.\.\/shared\/storageConfig/);
    assert.match(sharedStorage, /resolveFirebaseStorageBucket/);
    assert.match(sharedStorage, /DEFAULT_FIREBASE_STORAGE_BUCKET/);
  });
});

describe("M-94 — test JWT helper has no hardcoded secret", () => {
  test("signing fails explicitly when JWT_SECRET is absent", () => {
    assert.doesNotMatch(jwtHelper, /onway-vendor-secret-2024/);
    assert.match(jwtHelper, /process\.env\.JWT_SECRET/);
    assert.match(jwtHelper, /JWT_SECRET is required for test JWT signing/);
  });
});
