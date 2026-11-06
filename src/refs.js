/** A1-style reference helpers. Columns and rows are zero-based internally. */

const REF_RE = /^\$?([A-Za-z]{1,3})\$?([0-9]{1,7})$/;

export function colToIndex(letters) {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function indexToCol(index) {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** "B12" or "$B$12" -> { col: 1, row: 11 }, or null when malformed (row 0 is invalid). */
export function parseRef(text) {
  const m = REF_RE.exec(String(text).trim());
  if (!m) return null;
  const row = Number(m[2]) - 1;
  if (row < 0) return null;
  return { col: colToIndex(m[1]), row };
}

export function refToString(col, row) {
  return `${indexToCol(col)}${row + 1}`;
}

export function isValidRef(text) {
  return parseRef(text) !== null;
}

export function normalizeRef(text) {
  const r = parseRef(text);
  return r ? refToString(r.col, r.row) : null;
}

/** Every cell key inside the rectangle spanned by two corners, in row-major order. */
export function expandRange(from, to) {
  const c1 = Math.min(from.col, to.col);
  const c2 = Math.max(from.col, to.col);
  const r1 = Math.min(from.row, to.row);
  const r2 = Math.max(from.row, to.row);
  const out = [];
  for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) out.push(refToString(c, r));
  return out;
}

export function rangeSize(from, to) {
  return (Math.abs(to.col - from.col) + 1) * (Math.abs(to.row - from.row) + 1);
}

/** Compares keys by row then column, for deterministic ordering. */
export function compareRefs(a, b) {
  const ra = parseRef(a);
  const rb = parseRef(b);
  return ra.row - rb.row || ra.col - rb.col;
}
