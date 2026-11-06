import { ERR, FormulaError } from './errors.js';

/**
 * Token types: num, str, ref, ident, op, lparen, rparen, comma, colon.
 * Every token carries its position so errors can point at the source.
 */

const NUMBER_RE = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;
const REF_RE = /^\$?[A-Za-z]{1,3}\$?\d+(?![A-Za-z0-9_])/;
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_.]*/;
const TWO_CHAR_OPS = ['<=', '>=', '<>'];
const ONE_CHAR_OPS = '+-*/^&=<>%';

export function tokenize(source) {
  const tokens = [];
  let i = 0;
  const n = source.length;

  while (i < n) {
    const ch = source[i];
    if (/\s/.test(ch)) { i += 1; continue; }

    const rest = source.slice(i);

    if (ch === '"') {
      let j = i + 1;
      let value = '';
      let closed = false;
      while (j < n) {
        if (source[j] === '"') {
          if (source[j + 1] === '"') { value += '"'; j += 2; continue; }
          closed = true;
          j += 1;
          break;
        }
        value += source[j];
        j += 1;
      }
      if (!closed) throw new FormulaError(ERR.SYNTAX, `unterminated string at ${i}`);
      tokens.push({ type: 'str', value, pos: i });
      i = j;
      continue;
    }

    if (/[0-9.]/.test(ch)) {
      const m = NUMBER_RE.exec(rest);
      if (!m) throw new FormulaError(ERR.SYNTAX, `bad number at ${i}`);
      tokens.push({ type: 'num', value: Number(m[0]), pos: i });
      i += m[0].length;
      continue;
    }

    if (/[A-Za-z_$]/.test(ch)) {
      const refMatch = REF_RE.exec(rest);
      if (refMatch) {
        // "LOG10(" looks like a reference but is a function call.
        const after = source.slice(i + refMatch[0].length).trimStart()[0];
        if (after !== '(') {
          tokens.push({ type: 'ref', value: refMatch[0], pos: i });
          i += refMatch[0].length;
          continue;
        }
      }
      const idMatch = IDENT_RE.exec(rest);
      if (!idMatch) throw new FormulaError(ERR.SYNTAX, `unexpected "${ch}" at ${i}`);
      tokens.push({ type: 'ident', value: idMatch[0], pos: i });
      i += idMatch[0].length;
      continue;
    }

    const two = source.slice(i, i + 2);
    if (TWO_CHAR_OPS.includes(two)) {
      tokens.push({ type: 'op', value: two, pos: i });
      i += 2;
      continue;
    }
    if (ONE_CHAR_OPS.includes(ch)) { tokens.push({ type: 'op', value: ch, pos: i }); i += 1; continue; }
    if (ch === '(') { tokens.push({ type: 'lparen', value: ch, pos: i }); i += 1; continue; }
    if (ch === ')') { tokens.push({ type: 'rparen', value: ch, pos: i }); i += 1; continue; }
    if (ch === ',' || ch === ';') { tokens.push({ type: 'comma', value: ',', pos: i }); i += 1; continue; }
    if (ch === ':') { tokens.push({ type: 'colon', value: ch, pos: i }); i += 1; continue; }

    throw new FormulaError(ERR.SYNTAX, `unexpected "${ch}" at ${i}`);
  }
  return tokens;
}
