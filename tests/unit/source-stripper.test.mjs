/**
 * Tests for the comment stripper that the source-level suites depend on.
 *
 * Seventeen suites assert against shipped source with comments removed, so a
 * sentence of prose can never satisfy an assertion about code. They all used the
 * same helper: delete every block comment with one regex, then every line comment
 * with another.
 *
 * On this codebase that helper was destructive. server/routes.ts documents route
 * families as "/api/driver/" followed by a star, and the block-comment regex treats
 * that slash-star as an opener even though it sits inside a line comment. The
 * "comment" then ran to the next genuine terminator. It removed 140,258 of 421,436
 * characters of routes.ts — the socket handshake, the admin guard and the settlement
 * accrual among them.
 *
 * That is worse than a false negative. Every `doesNotMatch` guard over routes.ts was
 * asserting that a pattern was absent from text a third of which had been silently
 * deleted, so those guards passed for the wrong reason and would not have caught a
 * regression in the deleted regions.
 *
 * These tests pin the replacement against the shapes that actually appear here.
 *
 * Run:  node --test tests/unit/source-stripper.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { stripComments } from "./_source.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const require = createRequire(import.meta.url);
const ts = require("typescript");

describe("the stripper removes comments", () => {
  test("a line comment goes", () => {
    assert.equal(stripComments("const a = 1; // note\n").trim(), "const a = 1;");
  });

  test("a block comment goes", () => {
    assert.equal(stripComments("const a = /* note */ 1;"), "const a =  1;");
  });

  test("a doc block spanning lines goes, and the lines stay", () => {
    const src = "/**\n * note\n */\nconst a = 1;\n";
    const out = stripComments(src);
    assert.equal(out.trim(), "const a = 1;");
    assert.equal(out.split("\n").length, src.split("\n").length,
      "line numbering shifted");
    // Character offsets are NOT preserved — a comment collapses to its newlines,
    // so the text closes up. Suites that slice a window around an indexOf hit are
    // slicing the stripped text, so they stay self-consistent; only a suite that
    // mixed raw offsets with stripped text would be wrong, and none does.
    assert.ok(out.indexOf("const a") < src.indexOf("const a"));
  });
});

describe("the stripper does not eat code — the bug this replaces", () => {
  test("a star inside a line comment does not open a block comment", () => {
    const src = [
      "// Identity for all /api/driver/* routes comes from the token.",
      "const KEEP_ME = 1;",
      "/* a real block */",
      "const ALSO_KEEP = 2;",
    ].join("\n");
    const out = stripComments(src);
    assert.match(out, /const KEEP_ME = 1;/,
      "code between a line comment and the next block comment was deleted");
    assert.match(out, /const ALSO_KEEP = 2;/);
    assert.doesNotMatch(out, /api\/driver/, "the comment survived");
  });

  test("a line comment inside a block comment does not truncate it", () => {
    const src = "/* note // aside */\nconst KEEP = 1;\n";
    const out = stripComments(src);
    assert.match(out, /const KEEP = 1;/);
    assert.doesNotMatch(out, /aside/);
  });

  test("a comment opener inside a string is not a comment", () => {
    const src = 'const p = "/api/driver/*";\nconst KEEP = 1;\n';
    const out = stripComments(src);
    assert.match(out, /const KEEP = 1;/, "a string swallowed the following code");
    assert.match(out, /api\/driver/, "a string literal was treated as a comment");
  });

  test("a comment opener inside a regex literal is not a comment", () => {
    const src = "const re = /[/*]+/g;\nconst KEEP = 1;\n";
    assert.match(stripComments(src), /const KEEP = 1;/);
  });

  test("a URL's double slash is not a line comment", () => {
    const src = 'const u = "https://onwayiq.com/x";\nconst KEEP = 1;\n';
    const out = stripComments(src);
    assert.match(out, /const KEEP = 1;/);
    assert.match(out, /https:\/\/onwayiq\.com\/x/, "a URL inside a string was truncated");
  });

  test("division is not mistaken for a regex", () => {
    const src = "const r = total / count; // ratio\nconst KEEP = 1;\n";
    const out = stripComments(src);
    assert.match(out, /const r = total \/ count;/);
    assert.match(out, /const KEEP = 1;/);
    assert.doesNotMatch(out, /ratio/);
  });

  test("an escaped quote does not end a string early", () => {
    const src = 'const s = "he said \\" // not a comment";\nconst KEEP = 1;\n';
    const out = stripComments(src);
    assert.match(out, /const KEEP = 1;/);
    assert.match(out, /not a comment/, "the string ended at the escaped quote");
  });
});

describe("the stripper is safe across the whole codebase", () => {
  const walk = (dir, acc = []) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules") walk(p, acc); }
      else if (/\.(ts|tsx)$/.test(e.name)) acc.push(p);
    }
    return acc;
  };
  const files = [...walk(join(root, "server")), ...walk(join(root, "client"))];

  test("every source file still parses after stripping", () => {
    assert.ok(files.length > 100, `only ${files.length} files found — the walk is wrong`);
    const broken = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      const kind = f.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
      const before = ts.createSourceFile(f, src, ts.ScriptTarget.ES2022, true, kind);
      const after = ts.createSourceFile(f, stripComments(src), ts.ScriptTarget.ES2022, true, kind);
      if (after.parseDiagnostics.length > before.parseDiagnostics.length) {
        broken.push(f.slice(root.length + 1));
      }
    }
    assert.deepEqual(broken, [],
      `stripping deleted code from these files:\n${broken.join("\n")}`);
  });

  test("routes.ts keeps the regions the old helper deleted", () => {
    const clean = stripComments(readFileSync(join(root, "server/routes.ts"), "utf8"));
    for (const marker of [
      "ioServer.use((socket, next)",
      "jwt.verify(String(raw), ROUTES_JWT_SECRET",
      'socket.on("order:watch"',
      'socket.on("driver:location"',
    ]) {
      assert.ok(clean.includes(marker), `${marker} was deleted by the stripper`);
    }
  });

  test("routes.ts still loses its prose", () => {
    const clean = stripComments(readFileSync(join(root, "server/routes.ts"), "utf8"));
    assert.doesNotMatch(clean, /DO NOT attach fields here/,
      "comment prose survived, so it could satisfy an assertion about code");
  });

  test("line numbers are preserved, so indexOf offsets stay comparable", () => {
    for (const f of ["server/routes.ts", "server/vendor.ts", "server/settlement.ts"]) {
      const src = readFileSync(join(root, f), "utf8");
      assert.equal(stripComments(src).split("\n").length, src.split("\n").length,
        `${f}: stripping shifted line numbers`);
    }
  });
});
