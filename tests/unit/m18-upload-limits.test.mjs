/**
 * M-18 — «رفع الملفات بلا حدود لعدد الملفات والحقول، وخطأ الحجم يظهر كـ500 بدل 413».
 *
 * Two separate defects behind one finding.
 *
 * 1. The multer instance caps `fileSize` and nothing else. With no `files`, `parts`
 *    or `fields` cap, a single multipart request may carry thousands of parts. Each
 *    one is buffered in memory by `memoryStorage()` before any handler sees it, in
 *    the same 512MB process the audit already flagged for OOM under C-13. `fileSize`
 *    bounds one part, not the request.
 *
 * 2. Multer signals a breached limit by calling `next(err)` with a `MulterError`
 *    carrying a `code` — and no `status`. The global handler reads `status ||
 *    statusCode || 500`, so every breach became a 500 whose body is the deliberately
 *    generic "Internal Server Error". The uploader is told the server broke when in
 *    fact their file was too large, and the log fills with false 5xx.
 *
 * Nothing here re-implements either piece: the real multer options object is lifted
 * out of server/routes.ts and evaluated, and the real error middleware is lifted out
 * of server/index.ts and invoked.
 *
 * Run:  node --test tests/unit/m18-upload-limits.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "./_source.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const read = (p) => readFileSync(join(root, p), "utf8");

const ROUTES = stripComments(read("server/routes.ts"));
const INDEX = stripComments(read("server/index.ts"));
const ts = (await import(join(root, "node_modules/typescript/lib/typescript.js")))
  .default;

// ── lifting ──────────────────────────────────────────────────────────────────

function liftStatement(src, marker, terminator = "});") {
  const at = src.indexOf(marker);
  assert.notEqual(at, -1, `moved or renamed: ${JSON.stringify(marker)}`);
  const end = src.indexOf(terminator, at);
  assert.notEqual(end, -1, `no terminator after ${marker}`);
  return src.slice(at, end + terminator.length);
}

function liftFunction(src, marker) {
  const at = src.indexOf(marker);
  assert.notEqual(at, -1, `moved or renamed: ${JSON.stringify(marker)}`);
  const open = src.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error(`unbalanced braces after ${marker}`);
}

const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;

// ── the real multer configuration ────────────────────────────────────────────

/** Evaluate the shipped `multer({...})` call and hand back the options it passes. */
const uploadOptions = (() => {
  const src = liftStatement(ROUTES, "const uploadWebP = multer({");
  let captured = null;
  const multer = (opts) => { captured = opts; return { single: () => {} }; };
  multer.memoryStorage = () => ({ __memory: true });
  new Function("multer", compile(src))(multer);
  assert.ok(captured, "multer was never called");
  return captured;
})();

// ── the real error middleware ────────────────────────────────────────────────

const errorMiddleware = (() => {
  const src = liftFunction(INDEX, "function setupErrorHandler(");
  let mw = null;
  const app = { use: (fn) => { mw = fn; } };
  new Function("app", `${compile(src)}\nsetupErrorHandler(app);`)(app);
  assert.equal(typeof mw, "function", "the error middleware was not registered");
  return mw;
})();

/** Push an error through the real middleware and report what the client receives. */
function handle(err, { headersSent = false } = {}) {
  let status = 200;
  let body = null;
  let passedOn = false;
  const res = {
    headersSent,
    status: (s) => { status = s; return res; },
    json: (b) => { body = b; return res; },
  };
  errorMiddleware(err, {}, res, () => { passedOn = true; });
  return { status, body, passedOn };
}

/** What multer actually throws — name and code, never a status. */
function multerError(code, field = "image") {
  const e = new Error(code);
  e.name = "MulterError";
  e.code = code;
  e.field = field;
  return e;
}

// ─────────────────────────────────────────────────────────────────────────────
describe("M-18 · the upload is bounded by more than one file's size", () => {
  test("a per-file size cap is still in place", () => {
    assert.equal(uploadOptions.limits.fileSize, 5 * 1024 * 1024);
  });

  test("the request cannot carry an unbounded number of files", () => {
    const { files } = uploadOptions.limits;
    assert.equal(typeof files, "number", "no `files` cap — one request may carry any number");
    assert.ok(files >= 1 && files <= 5, `files cap out of range: ${files}`);
  });

  test("the request cannot carry an unbounded number of parts or fields", () => {
    const { parts, fields } = uploadOptions.limits;
    assert.equal(typeof parts, "number", "no `parts` cap");
    assert.equal(typeof fields, "number", "no `fields` cap");
    assert.ok(parts <= 50, `parts cap too loose: ${parts}`);
    assert.ok(fields <= 50, `fields cap too loose: ${fields}`);
  });

  test("a text field cannot be used to smuggle a payload past fileSize", () => {
    const { fieldSize } = uploadOptions.limits;
    assert.equal(typeof fieldSize, "number", "no `fieldSize` cap");
    assert.ok(
      fieldSize <= 1024 * 1024,
      `fieldSize cap too loose: ${fieldSize}`,
    );
  });

  test("memory storage and the image filter are unchanged", () => {
    assert.deepEqual(uploadOptions.storage, { __memory: true });
    assert.equal(typeof uploadOptions.fileFilter, "function");
  });
});

describe("M-18 · a breached limit is reported as a client error, not a server fault", () => {
  test("an oversized file answers 413, not 500", () => {
    const { status } = handle(multerError("LIMIT_FILE_SIZE"));
    assert.equal(status, 413, "an oversized upload is still reported as a server error");
  });

  test("the 413 body says what went wrong instead of «Internal Server Error»", () => {
    const { body } = handle(multerError("LIMIT_FILE_SIZE"));
    const text = JSON.stringify(body);
    assert.doesNotMatch(text, /Internal Server Error/);
    assert.match(text, /[؀-ۿ]/, "the message must be user-facing Arabic");
  });

  test("too many files or parts is also a client error", () => {
    for (const code of ["LIMIT_FILE_COUNT", "LIMIT_PART_COUNT"]) {
      const { status } = handle(multerError(code));
      assert.ok(status === 413 || status === 400, `${code} answered ${status}`);
    }
  });

  test("an unexpected field is a 400, not a 500", () => {
    const { status } = handle(multerError("LIMIT_UNEXPECTED_FILE"));
    assert.equal(status, 400);
  });
});

describe("M-18 · the rest of the error handler is untouched", () => {
  test("a genuine server fault still answers 500 and leaks nothing", () => {
    const { status, body } = handle(new Error("db credentials rotated"));
    assert.equal(status, 500);
    assert.equal(body.message, "Internal Server Error");
    assert.doesNotMatch(JSON.stringify(body), /credentials/);
  });

  test("an explicit 4xx keeps its own message", () => {
    const err = Object.assign(new Error("رقم غير صالح"), { status: 400 });
    const { status, body } = handle(err);
    assert.equal(status, 400);
    assert.equal(body.message, "رقم غير صالح");
  });

  test("a response already sent is handed on rather than written to twice", () => {
    const { passedOn } = handle(multerError("LIMIT_FILE_SIZE"), { headersSent: true });
    assert.equal(passedOn, true);
  });
});
