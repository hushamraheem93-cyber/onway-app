/**
 * H-64 — 782 lines of dead code: VendorWalletScreen.tsx and
 * VendorRatingsScreen.tsx were bound to no navigator, and their contents were
 * duplicated inside VendorAnalyticsScreen.
 *
 * The audit's stated harm is not hypothetical. Commit c0964ea applied the H-50
 * settlement fix to VendorWalletScreen.tsx — fifty lines deleted from a screen
 * the app never mounts — while the live copy of the same listener sat in
 * VendorAnalyticsScreen. A developer fixing the wallet edited the dead file and
 * saw no effect.
 *
 * Both screens are deleted. This suite keeps them deleted, and keeps the
 * survivor honest.
 *
 * ── Why this parses instead of greps ────────────────────────────────────────
 * The old screens are named legitimately in explanatory comments (this file,
 * VendorAnalyticsScreen's header, server/vendor.ts) and in historical audit
 * reports. A text search calls those usages; they are not. So every check here
 * runs over a real TypeScript AST: module specifiers come from
 * ImportDeclaration / ExportDeclaration / ImportEqualsDeclaration /
 * require() / dynamic import() / import-type nodes, and the disk-read check
 * looks at string-literal NODES. Comments are not nodes, so they cannot
 * produce a false positive — and a commented-out import cannot hide a real one.
 *
 * Run:  node --test tests/unit/h64-dead-vendor-screens.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const read = (p) => readFileSync(join(root, p), "utf8");

/** The two screens H-64 removed. */
const DEAD_SCREENS = [
  "client/screens/VendorWalletScreen.tsx",
  "client/screens/VendorRatingsScreen.tsx",
];
/** Module basenames a specifier would resolve to if it named a dead screen. */
const DEAD_MODULES = DEAD_SCREENS.map((p) =>
  p.split("/").pop().replace(/\.tsx$/, ""),
);

/** The live screen that absorbed both, and the navigator that mounts it. */
const LIVE_SCREEN = "client/screens/VendorAnalyticsScreen.tsx";
const LIVE_MODULE = "VendorAnalyticsScreen";
const VENDOR_NAV = "client/navigation/VendorTabNavigator.tsx";

/** This file names the dead paths on purpose; it is not a leftover reference. */
const SELF = "tests/unit/h64-dead-vendor-screens.test.mjs";

// ─── AST helpers ─────────────────────────────────────────────────────────────

const SCRIPT_KIND = {
  ".ts": ts.ScriptKind.TS,
  ".tsx": ts.ScriptKind.TSX,
  ".js": ts.ScriptKind.JS,
  ".jsx": ts.ScriptKind.JSX,
  ".mjs": ts.ScriptKind.JS,
  ".cjs": ts.ScriptKind.JS,
};

function parse(rel, src) {
  const ext = rel.slice(rel.lastIndexOf("."));
  return ts.createSourceFile(
    rel,
    src,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    SCRIPT_KIND[ext] ?? ts.ScriptKind.TS,
  );
}

function walk(node, visit) {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

const literalText = (n) =>
  n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n))
    ? n.text
    : null;

/**
 * Every module specifier the file actually imports, with the syntax that
 * produced it — so a failure says *how* the dead screen crept back in.
 */
function importSpecifiers(sf) {
  const found = [];
  const push = (node, form) => {
    const t = literalText(node);
    if (t !== null) found.push({ spec: t, form });
  };

  walk(sf, (n) => {
    if (ts.isImportDeclaration(n)) push(n.moduleSpecifier, "import");
    else if (ts.isExportDeclaration(n) && n.moduleSpecifier)
      push(n.moduleSpecifier, "export-from");
    else if (
      ts.isImportEqualsDeclaration(n) &&
      ts.isExternalModuleReference(n.moduleReference)
    )
      push(n.moduleReference.expression, "import=require");
    else if (ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument))
      push(n.argument.literal, "import-type");
    else if (ts.isCallExpression(n)) {
      const arg = n.arguments[0];
      if (n.expression.kind === ts.SyntaxKind.ImportKeyword)
        push(arg, "dynamic-import"); // covers React.lazy(() => import(…))
      else if (ts.isIdentifier(n.expression) && n.expression.text === "require")
        push(arg, "require");
    }
  });
  return found;
}

/** Every string-literal node in the file. Comments are not nodes. */
function stringLiterals(sf) {
  const out = [];
  walk(sf, (n) => {
    const t = literalText(n);
    if (t !== null) out.push(t);
  });
  return out;
}

/** The identifiers a file imports by local name, e.g. `VendorAnalyticsScreen`. */
function importedBindings(sf) {
  const names = new Map(); // localName -> specifier
  walk(sf, (n) => {
    if (!ts.isImportDeclaration(n) || !n.importClause) return;
    const spec = literalText(n.moduleSpecifier);
    const c = n.importClause;
    if (c.name) names.set(c.name.text, spec);
    if (c.namedBindings) {
      if (ts.isNamespaceImport(c.namedBindings))
        names.set(c.namedBindings.name.text, spec);
      else
        for (const e of c.namedBindings.elements) names.set(e.name.text, spec);
    }
  });
  return names;
}

/** Identifiers passed as a JSX `component={…}` prop — i.e. mounted screens. */
function mountedComponents(sf) {
  const out = [];
  walk(sf, (n) => {
    if (!ts.isJsxAttribute(n) || n.name.getText(sf) !== "component") return;
    const init = n.initializer;
    if (init && ts.isJsxExpression(init) && init.expression && ts.isIdentifier(init.expression))
      out.push(init.expression.text);
  });
  return out;
}

/**
 * The first argument of every `new URL(…)`, as written — i.e. the endpoints the
 * screen actually requests.
 *
 * Asserting that "/api/vendor/wallet" merely appears as a string literal is not
 * enough: it is also the react-query cache key, so rewriting the fetch target
 * alone left the literal in place and the check passed. Mutation M3a caught
 * that. Reading the URL construction instead ties the assertion to the request.
 */
function requestUrls(sf) {
  const out = [];
  walk(sf, (n) => {
    if (!ts.isNewExpression(n)) return;
    if (!ts.isIdentifier(n.expression) || n.expression.text !== "URL") return;
    const arg = n.arguments?.[0];
    if (arg) out.push(arg.getText(sf));
  });
  return out;
}

/** Arguments of every `x.searchParams.set(…)` call, as written. */
function searchParamSets(sf) {
  const out = [];
  walk(sf, (n) => {
    if (!ts.isCallExpression(n) || !ts.isPropertyAccessExpression(n.expression))
      return;
    const prop = n.expression;
    if (prop.name.text !== "set") return;
    if (
      !ts.isPropertyAccessExpression(prop.expression) ||
      prop.expression.name.text !== "searchParams"
    )
      return;
    out.push(n.arguments.map((a) => a.getText(sf)).join(", "));
  });
  return out;
}

/** Top-level and nested function declarations, by name. */
function functionNames(sf) {
  const out = new Set();
  walk(sf, (n) => {
    if (ts.isFunctionDeclaration(n) && n.name) out.add(n.name.text);
  });
  return out;
}

/** Source files this project owns. `tests/` included: a stale read breaks it. */
function sourceFiles() {
  const roots = ["client", "server", "shared", "scripts", "tests"];
  const skipDirs = new Set(["node_modules", "reports", "__snapshots__"]);
  const out = [];
  const walkDir = (abs) => {
    for (const entry of readdirSync(abs)) {
      if (entry.startsWith(".") || skipDirs.has(entry)) continue;
      const child = join(abs, entry);
      if (statSync(child).isDirectory()) walkDir(child);
      else if (SCRIPT_KIND[entry.slice(entry.lastIndexOf("."))]) out.push(child);
    }
  };
  for (const r of roots) {
    const abs = join(root, r);
    if (existsSync(abs)) walkDir(abs);
  }
  return out.map((abs) => relative(root, abs).split(sep).join("/"));
}

/** Parsed once — 300+ files, and every describe below reads from this. */
const PROJECT = sourceFiles().map((rel) => ({ rel, sf: parse(rel, read(rel)) }));

// ─────────────────────────────────────────────────────────────────────────────
describe("H-64 · the dead screens are gone", () => {
  for (const p of DEAD_SCREENS) {
    test(`${p} does not exist`, () => {
      assert.equal(
        existsSync(join(root, p)),
        false,
        `${p} is back. No navigator can reach it, so anything changed in it ` +
          `has no effect on the running app — which is what H-64 reported.`,
      );
    });
  }

  test("the merge target is still there", () => {
    assert.ok(
      existsSync(join(root, LIVE_SCREEN)),
      "VendorAnalyticsScreen.tsx is missing — the vendor lost both surfaces",
    );
  });

  test("the AST scan actually covered the project", () => {
    // A silent walk failure would make every check below vacuously pass.
    assert.ok(PROJECT.length > 250, `only ${PROJECT.length} files parsed`);
    assert.ok(
      PROJECT.some((f) => f.rel === LIVE_SCREEN),
      "the live screen was not among the parsed files",
    );
    assert.ok(
      PROJECT.some((f) => f.rel === VENDOR_NAV),
      "the vendor navigator was not among the parsed files",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("H-64 · nothing imports the dead screens", () => {
  test("no import, export-from, require, dynamic import or import-type resolves to them", () => {
    const offenders = [];
    for (const { rel, sf } of PROJECT) {
      for (const { spec, form } of importSpecifiers(sf)) {
        const tail = spec
          .split("/")
          .pop()
          .replace(/\.(tsx?|jsx?|mjs|cjs)$/, "");
        if (DEAD_MODULES.includes(tail))
          offenders.push(`${rel} → ${spec}  [${form}]`);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `a dead vendor screen is imported again:\n  ${offenders.join("\n  ")}`,
    );
  });

  test("no test or script reads either screen off disk", () => {
    // h50-settlement-ledger-listeners.test.mjs used to readFileSync
    // VendorWalletScreen.tsx. That is not an import, and it breaks the moment
    // the file goes away, so the path needs its own check — over literal
    // NODES, so the comment above does not trip it.
    const offenders = [];
    for (const { rel, sf } of PROJECT) {
      if (rel === SELF) continue;
      for (const lit of stringLiterals(sf)) {
        if (DEAD_SCREENS.some((d) => lit === d || lit.endsWith(`/${d.split("/").pop()}`)))
          offenders.push(`${rel} → "${lit}"`);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `a file still names a deleted screen's path:\n  ${offenders.join("\n  ")}`,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("H-64 · VendorAnalyticsScreen is the live vendor surface", () => {
  const nav = PROJECT.find((f) => f.rel === VENDOR_NAV).sf;

  test("the navigator imports it", () => {
    assert.equal(
      importedBindings(nav).get(LIVE_MODULE)?.split("/").pop(),
      LIVE_MODULE,
      "VendorTabNavigator no longer imports VendorAnalyticsScreen",
    );
  });

  test("the navigator mounts it as a screen component", () => {
    assert.ok(
      mountedComponents(nav).includes(LIVE_MODULE),
      "VendorAnalyticsScreen is imported but not mounted on any tab",
    );
  });

  test("no navigator in the project mounts a dead screen", () => {
    const offenders = [];
    for (const { rel, sf } of PROJECT) {
      if (!rel.startsWith("client/navigation/")) continue;
      for (const name of mountedComponents(sf))
        if (DEAD_MODULES.includes(name)) offenders.push(`${rel} → ${name}`);
    }
    assert.deepEqual(offenders, [], `a dead screen is mounted: ${offenders}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
/**
 * Deleting a duplicate is only safe while the surviving copy is intact. These
 * pin what the two dead screens contributed, so a later "cleanup" cannot strip
 * the live half and still pass.
 */
describe("H-64 · the merged screen still carries both halves", () => {
  const sf = PROJECT.find((f) => f.rel === LIVE_SCREEN).sf;
  const fns = functionNames(sf);
  const live = sf.text;

  test("both tab components exist", () => {
    assert.ok(fns.has("WalletTab"), "the wallet half is gone");
    assert.ok(fns.has("RatingsTab"), "the ratings half is gone");
    assert.ok(
      fns.has("VendorAnalyticsScreen"),
      "the screen's own component is gone",
    );
  });

  test("the inner tab bar still offers both surfaces", () => {
    const lits = new Set(stringLiterals(sf));
    for (const key of ["wallet", "ratings", "الأرباح", "التقييمات"])
      assert.ok(lits.has(key), `the "${key}" tab entry is gone`);
  });

  // ── what VendorWalletScreen contributed ──────────────────────────────────
  test("the wallet endpoint and its period filter survive", () => {
    const urls = requestUrls(sf);
    assert.ok(
      urls.some((u) => u === '"/api/vendor/wallet"'),
      `the wallet request no longer targets /api/vendor/wallet — it builds: ${urls.join(" · ")}`,
    );
    assert.ok(
      searchParamSets(sf).some((a) => a === '"period", period'),
      "the selected period is no longer sent to the wallet endpoint",
    );
    const lits = new Set(stringLiterals(sf));
    for (const p of ["today", "week", "month", "all"])
      assert.ok(lits.has(p), `the "${p}" period option is gone`);
  });

  test("the REST settlement view survives, and H-50 stays closed here", () => {
    assert.match(live, /useSettlement\("vendor"\)/, "the settlement hook is gone");
    assert.match(
      live,
      /settlement\.requestSettlement\(\)/,
      "the vendor can no longer request a settlement",
    );
    // The closed-collection guard, restated on the one screen that renders.
    const lits = new Set(stringLiterals(sf));
    assert.ok(
      !lits.has("settlementLedger"),
      "a client-SDK path to the closed financial ledger is back",
    );
    assert.doesNotMatch(
      live,
      /onSnapshot\s*\(/,
      "a Firestore listener is back on a screen that cannot read the collection",
    );
  });

  test("per-order net earning and commission survive", () => {
    assert.match(live, /sale\.netEarning/, "the per-order net earning is gone");
    assert.match(live, /sale\.commissionRate/, "the per-order commission is gone");
  });

  // ── what VendorRatingsScreen contributed ─────────────────────────────────
  test("the ratings endpoint and its filters survive", () => {
    const urls = requestUrls(sf);
    assert.ok(
      urls.some((u) => u === "`/api/stores/${vendorId}/ratings`"),
      `the ratings request no longer targets /api/stores/:id/ratings — it builds: ${urls.join(" · ")}`,
    );
    assert.ok(
      searchParamSets(sf).some((a) => a === '"filter", filter'),
      "the selected filter is no longer sent to the ratings endpoint",
    );
    const lits = new Set(stringLiterals(sf));
    for (const f of ["all", "unanswered", "high", "low"])
      assert.ok(lits.has(f), `the "${f}" ratings filter is gone`);
  });

  test("the vendor reply write survives", () => {
    const urls = requestUrls(sf);
    assert.ok(
      urls.some((u) => u === "`/api/ratings/${ratingId}/vendor-reply`"),
      `the reply no longer targets /api/ratings/:id/vendor-reply — it builds: ${urls.join(" · ")}`,
    );
    const lits = new Set(stringLiterals(sf));
    assert.ok(lits.has("PATCH"), "the reply is no longer a PATCH");
    assert.match(
      live,
      /queryClient\.invalidateQueries\(\{\s*queryKey\s*\}\)/,
      "the ratings list is no longer refreshed after a reply",
    );
  });

  test("the customer phone is masked on both halves", () => {
    // Wallet rows pad the tail; rating cards prefix a fixed mask.
    assert.match(
      live,
      /customerPhone\s*\n?\s*\.slice\(-4\)\s*\n?\s*\.padStart\(/,
      "the wallet rows print an unmasked customer phone",
    );
    assert.match(
      live,
      /\*\*\*\*\*\$\{item\.customerPhone\.slice\(-4\)\}/,
      "the rating cards print an unmasked customer phone",
    );
  });
});
