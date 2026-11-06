import { ERR, FormulaError } from './errors.js';
import { tokenize } from './tokenizer.js';
import { parseRef, expandRange } from './refs.js';

/**
 * Precedence, lowest to highest (same as Excel):
 *   comparison  = <> < > <= >=
 *   concat      &
 *   additive    + -
 *   multiplic.  * /
 *   power       ^        (left associative, like Excel: 2^3^2 = 64)
 *   unary       + -      (binds tighter than ^: -2^2 = 4)
 *   postfix     %
 *   primary     number | string | bool | ref | range | call | ( expr )
 *
 * AST nodes:
 *   { type: 'number', value } { type: 'string', value } { type: 'bool', value }
 *   { type: 'ref', col, row, key } { type: 'range', from, to }
 *   { type: 'unary', op, arg } { type: 'percent', arg }
 *   { type: 'binary', op, left, right } { type: 'call', name, args }
 */

const COMPARISON = ['=', '<>', '<', '>', '<=', '>='];

export function parse(source) {
  const text = source.startsWith('=') ? source.slice(1) : source;
  const tokens = tokenize(text);
  if (tokens.length === 0) throw new FormulaError(ERR.SYNTAX, 'empty formula');
  let pos = 0;

  const peek = () => tokens[pos];
  const isOp = (...values) => peek() && peek().type === 'op' && values.includes(peek().value);

  function expect(type, what) {
    const t = peek();
    if (!t || t.type !== type) throw new FormulaError(ERR.SYNTAX, `expected ${what}${t ? ` at ${t.pos}` : ' at end'}`);
    pos += 1;
    return t;
  }

  function binaryLevel(next, ops) {
    let left = next();
    while (isOp(...ops)) {
      const op = tokens[pos++].value;
      left = { type: 'binary', op, left, right: next() };
    }
    return left;
  }

  const expression = () => binaryLevel(concat, COMPARISON);
  const concat = () => binaryLevel(additive, ['&']);
  const additive = () => binaryLevel(multiplicative, ['+', '-']);
  const multiplicative = () => binaryLevel(power, ['*', '/']);
  const power = () => binaryLevel(unary, ['^']);

  function unary() {
    if (isOp('+', '-')) {
      const op = tokens[pos++].value;
      return { type: 'unary', op, arg: unary() };
    }
    return postfix();
  }

  function postfix() {
    let node = primary();
    while (isOp('%')) { pos += 1; node = { type: 'percent', arg: node }; }
    return node;
  }

  function refNode(token) {
    const r = parseRef(token.value);
    if (!r) throw new FormulaError(ERR.REF, token.value);
    return { type: 'ref', col: r.col, row: r.row, key: token.value.replace(/\$/g, '').toUpperCase() };
  }

  function primary() {
    const t = peek();
    if (!t) throw new FormulaError(ERR.SYNTAX, 'unexpected end of formula');
    switch (t.type) {
      case 'num': pos += 1; return { type: 'number', value: t.value };
      case 'str': pos += 1; return { type: 'string', value: t.value };
      case 'ref': {
        pos += 1;
        const from = refNode(t);
        if (peek() && peek().type === 'colon') {
          pos += 1;
          const to = refNode(expect('ref', 'a cell reference after ":"'));
          return { type: 'range', from, to };
        }
        return from;
      }
      case 'ident': {
        pos += 1;
        const upper = t.value.toUpperCase();
        if (peek() && peek().type === 'lparen') {
          pos += 1;
          const args = [];
          if (peek() && peek().type === 'rparen') { pos += 1; return { type: 'call', name: upper, args }; }
          for (;;) {
            args.push(expression());
            if (peek() && peek().type === 'comma') { pos += 1; continue; }
            break;
          }
          expect('rparen', '")"');
          return { type: 'call', name: upper, args };
        }
        if (upper === 'TRUE' || upper === 'FALSE') return { type: 'bool', value: upper === 'TRUE' };
        throw new FormulaError(ERR.NAME, t.value);
      }
      case 'lparen': {
        pos += 1;
        const inner = expression();
        expect('rparen', '")"');
        return inner;
      }
      default:
        throw new FormulaError(ERR.SYNTAX, `unexpected "${t.value}" at ${t.pos}`);
    }
  }

  const ast = expression();
  if (pos < tokens.length) throw new FormulaError(ERR.SYNTAX, `unexpected "${tokens[pos].value}" at ${tokens[pos].pos}`);
  return ast;
}

/** Cell keys a formula depends on, with ranges expanded. `maxRange` guards against huge ranges. */
export function collectReferences(ast, { maxRange = 100000 } = {}) {
  const out = new Set();
  (function walk(node) {
    switch (node.type) {
      case 'ref': out.add(node.key); break;
      case 'range': {
        const size = (Math.abs(node.to.col - node.from.col) + 1) * (Math.abs(node.to.row - node.from.row) + 1);
        if (size > maxRange) throw new FormulaError(ERR.REF, 'range too large');
        for (const key of expandRange(node.from, node.to)) out.add(key);
        break;
      }
      case 'unary': case 'percent': walk(node.arg); break;
      case 'binary': walk(node.left); walk(node.right); break;
      case 'call': node.args.forEach(walk); break;
      default:
    }
  })(ast);
  return out;
}
