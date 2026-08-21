import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { globSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(new URL("../..", import.meta.url).pathname);
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");

function assertHas(source, pattern, message) {
  assert.match(source, pattern, message);
}

function assertNotHas(source, pattern, message) {
  assert.doesNotMatch(source, pattern, message);
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255);
}

function luminance(hex) {
  return hexToRgb(hex)
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrastRatio(foreground, background) {
  const foregroundLum = luminance(foreground);
  const backgroundLum = luminance(background);
  const lighter = Math.max(foregroundLum, backgroundLum);
  const darker = Math.min(foregroundLum, backgroundLum);
  return (lighter + 0.05) / (darker + 0.05);
}

test("mobile runtime is Light-only and cannot follow system appearance", async () => {
  const [context, hook, nativeScheme, webScheme, app, config] = await Promise.all([
    read("client/context/ThemeContext.tsx"),
    read("client/hooks/useTheme.ts"),
    read("client/hooks/useColorScheme.ts"),
    read("client/hooks/useColorScheme.web.ts"),
    read("client/App.tsx"),
    read("app.config.js"),
  ]);

  assertHas(context, /type ThemeMode = "light"/);
  assertHas(context, /const effectiveTheme = "light" as const/);
  assertHas(context, /setThemeMode = useCallback\(\(_mode: ThemeMode = "light"\) => \{\}, \[\]\)/);
  assertNotHas(context, /AsyncStorage|useSystemColorScheme|THEME_STORAGE_KEY/);
  assertHas(hook, /const theme = Colors\[effectiveTheme\]/);
  assertNotHas(hook, /\bisDark\b/);
  assertHas(nativeScheme, /return "light" as const/);
  assertHas(webScheme, /return "light" as const/);
  assertNotHas(webScheme, /useRNColorScheme|prefers-color-scheme/);
  assertHas(app, /<StatusBar style="dark" \/>/);
  assertHas(config, /userInterfaceStyle: "light"/);
  assertNotHas(config, /#F83D0D/i);
});

test("dark-capable mobile branches are removed from screen consumers", async () => {
  const files = globSync("client/**/*.{ts,tsx}", { cwd: root, nodir: true });
  for (const file of files) {
    const source = await read(file);
    assertNotHas(source, /\bisDark\b/, `${file} still contains an active isDark branch`);
  }
});

test("central palette keeps legacy dark key light-safe and portal identity unified", async () => {
  const theme = await read("client/constants/theme.ts");
  assertHas(theme, /const lightColors = \{/);
  assertHas(theme, /dark: lightColors/);
  assertHas(theme, /const vendorPurple = primary/);
  assertHas(theme, /const vendorPurpleLight = secondary/);
  assertHas(theme, /const driverBlue = primary/);
  assertHas(theme, /const driverBlueLight = secondary/);
  assertHas(theme, /vendor: \[primary, primaryDark\]/);
  assertHas(theme, /driver: \[primary, primaryDark\]/);
  assertHas(theme, /tajawal: "Cairo_400Regular"/);
  assertNotHas(theme, /backgroundRoot: "#1A1A1A"/);
  assertNotHas(theme, /backgroundDefault: "#2A2A2A"/);
});

test("all web surfaces are light, RTL-aware, branded, and browser dark preference cannot override them", async () => {
  const files = {
    admin: await read("server/templates/admin.html"),
    vendor: await read("server/templates/vendor-dashboard.html"),
    vendorLogin: await read("server/templates/vendor-login.html"),
    landing: await read("server/templates/landing-page.html"),
    publicLanding: await read("server/templates/landing-public.html"),
    adminLogin: await read("server/templates/login.html"),
  };

  assertHas(files.admin, /--primary: #FB5B21/);
  assertHas(files.admin, /background: linear-gradient\(180deg, #FFFFFF 0%, #FFF8F5 100%\)/);
  assertHas(files.admin, /\.live-monitor-card \{ background: #FFFFFF/);
  assertNotHas(files.admin, /#171A21|#1F232C|\.live-monitor-card \{ background: #111827/i);
  assertHas(files.vendor, /--orange: #FB5B21/);
  assertHas(files.vendor, /--bg: #F5F6F8/);
  assertHas(files.vendor, /--bg2: #FFFFFF/);
  assertNotHas(files.vendor, /--bg: #0f0f0f|--bg2: #161616|#1e1e1e/i);
  assertHas(files.vendorLogin, /#FFF8F5 0%, #F5F6F8 50%, #FFFFFF 100%/);
  assertNotHas(files.vendorLogin, /#0f0f0f|#1a1a1a|#111\b/i);
  assertNotHas(files.landing, /prefers-color-scheme\s*:\s*dark/i);
  assertHas(files.landing, /<html lang="ar" dir="rtl">/);
  assertHas(files.publicLanding, /font-family: "Cairo"/);
  assertHas(files.publicLanding, /#FB5B21/);
  assertHas(files.adminLogin, /font-family: 'Cairo'/);
  assertHas(files.adminLogin, /#FB5B21/);
  assertNotHas(files.adminLogin, /#1a1a2e|#16213e|#0f3460/i);
  for (const [name, source] of Object.entries(files)) {
    assertNotHas(source, /#E86520/i, `${name} still uses the old brand primary`);
  }
});

test("OnWay primary text contrast meets WCAG AA for normal-size web controls", () => {
  const ratio = contrastRatio("#1F2937", "#FB5B21");
  assert.ok(ratio >= 4.5, `expected at least 4.5:1 contrast, got ${ratio.toFixed(2)}:1`);
});

test("Sprint 9 style changes do not introduce business or financial logic", async () => {
  const themeOnlyFiles = [
    "client/constants/theme.ts",
    "client/context/ThemeContext.tsx",
    "client/hooks/useTheme.ts",
    "client/hooks/useColorScheme.ts",
    "client/hooks/useColorScheme.web.ts",
    "app.config.js",
  ];
  for (const relativePath of themeOnlyFiles) {
    const source = await read(relativePath);
    assertNotHas(source, /recordAudit|listAuditLog|calculateCommission|settlementLedger|walletBalance|pricingRule/i, `${relativePath} contains protected business logic`);
  }
});
