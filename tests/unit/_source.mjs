/**
 * Comment stripping for source-level assertions.
 *
 * Several suites assert against the shipped source with comments removed, so that a
 * sentence of prose can never satisfy an assertion about code. They each carried the
 * same two-regex helper: one regex deleting every block comment, then one deleting
 * every line comment.
 *
 * That is wrong on this codebase. server/routes.ts documents route families as
 * "/api/driver/" followed by a star, and to the block-comment regex that slash-star
 * opens a comment — even though it sits inside a line comment. The "comment" then
 * runs to the next genuine terminator, dozens of lines away. It deleted 140,258 of
 * 421,436 characters: the whole socket handshake, the admin guard, and the
 * settlement accrual all vanished.
 *
 * The damage is not merely a false negative. A `doesNotMatch` assertion over text
 * that has had a third of its code silently removed passes for the wrong reason, so
 * every "this pattern is absent" guard over routes.ts was unsound.
 *
 * Reordering the two regexes does not fix it either — then a line comment nested
 * inside a block comment truncates that block's terminator, and the same swallow
 * happens in the other direction. Comments are not a regular language once strings, template
 * literals and regex literals can contain their delimiters, so this walks the source
 * once and tracks which of those it is inside.
 *
 * Comments are replaced with an equal number of newlines rather than deleted, so
 * line numbers and `indexOf` distances stay comparable to the original file.
 */

/** Source with comments blanked out, strings and regex literals left intact. */
export function stripComments(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  // The token before the current position decides whether `/` starts a regex or
  // divides. Only the last significant character matters for that call.
  let prevSignificant = "";

  while (i < n) {
    const c = src[i];
    const next = src[i + 1];

    if (c === "/" && next === "/") {
      const end = src.indexOf("\n", i);
      i = end === -1 ? n : end;
      continue;
    }

    if (c === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      // Keep the newlines so line numbers do not shift.
      for (let k = i; k < stop; k += 1) if (src[k] === "\n") out += "\n";
      i = stop;
      continue;
    }

    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      let j = i + 1;
      while (j < n) {
        if (src[j] === "\\") { j += 2; continue; }
        if (src[j] === quote) break;
        // A template literal can nest arbitrary code, including comments, inside
        // ${...}. Handing the whole span through verbatim is fine: this codebase
        // never puts a comment there, and keeping it cannot delete code.
        j += 1;
      }
      out += src.slice(i, Math.min(j + 1, n));
      prevSignificant = quote;
      i = j + 1;
      continue;
    }

    if (c === "/" && startsRegex(prevSignificant)) {
      let j = i + 1;
      let inClass = false;
      while (j < n) {
        const d = src[j];
        if (d === "\\") { j += 2; continue; }
        if (d === "\n") break; // unterminated — not a regex after all
        if (d === "[") inClass = true;
        else if (d === "]") inClass = false;
        else if (d === "/" && !inClass) break;
        j += 1;
      }
      if (j < n && src[j] === "/") {
        out += src.slice(i, j + 1);
        prevSignificant = "/";
        i = j + 1;
        continue;
      }
      // Fall through: it was a division after all.
    }

    out += c;
    if (!/\s/.test(c)) prevSignificant = c;
    i += 1;
  }

  return out;
}

/** Whether a `/` at this point opens a regex literal rather than dividing. */
function startsRegex(prev) {
  if (prev === "") return true;
  return !/[\w$)\]"'`]/.test(prev);
}

/** Shell/config source with `#` comments and blank lines removed. */
export function stripShellComments(src) {
  return src
    .split("\n")
    .map((l) => l.replace(/(^|\s)#.*$/, ""))
    .filter((l) => l.trim())
    .join("\n");
}
