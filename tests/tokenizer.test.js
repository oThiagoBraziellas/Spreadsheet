import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize } from '../src/tokenizer.js';
import { FormulaError, ERR } from '../src/errors.js';

const kinds = (src) => tokenize(src).map((t) => t.type);
const values = (src) => tokenize(src).map((t) => t.value);

test('numbers: integers, decimals, leading dot and exponents', () => {
  assert.deepEqual(values('42 3.14 .5 1e3 2.5E-2 7.'), [42, 3.14, 0.5, 1000, 0.025, 7]);
});

test('strings support doubled quotes as escapes', () => {
  assert.deepEqual(values('"hello" "say ""hi""" ""'), ['hello', 'say "hi"', '']);
});

test('unterminated strings are syntax errors', () => {
  assert.throws(() => tokenize('"abc'), (e) => e instanceof FormulaError && e.code === ERR.SYNTAX);
});

test('references, absolute references and ranges', () => {
  assert.deepEqual(kinds('A1'), ['ref']);
  assert.deepEqual(values('$B$2 c3'), ['$B$2', 'c3']);
  assert.deepEqual(kinds('A1:B2'), ['ref', 'colon', 'ref']);
});

test('identifiers and function calls', () => {
  assert.deepEqual(kinds('SUM(A1)'), ['ident', 'lparen', 'ref', 'rparen']);
  assert.deepEqual(kinds('TRUE'), ['ident']);
});

test('names that look like references are identifiers when followed by "("', () => {
  assert.deepEqual(kinds('LOG10(5)'), ['ident', 'lparen', 'num', 'rparen']);
  assert.deepEqual(kinds('LOG10 (5)'), ['ident', 'lparen', 'num', 'rparen']);
  assert.deepEqual(kinds('LOG10'), ['ref']);
});

test('multi-character operators are not split', () => {
  assert.deepEqual(values('A1<=B1'), ['A1', '<=', 'B1']);
  assert.deepEqual(values('A1>=B1'), ['A1', '>=', 'B1']);
  assert.deepEqual(values('A1<>B1'), ['A1', '<>', 'B1']);
  assert.deepEqual(values('1<2'), [1, '<', 2]);
});

test('all single-character operators', () => {
  assert.deepEqual(values('+ - * / ^ & = < > %'), ['+', '-', '*', '/', '^', '&', '=', '<', '>', '%']);
});

test('commas and semicolons both separate arguments', () => {
  assert.deepEqual(kinds('SUM(1,2;3)'), ['ident', 'lparen', 'num', 'comma', 'num', 'comma', 'num', 'rparen']);
});

test('whitespace is ignored and positions are tracked', () => {
  const toks = tokenize('  1 +   2 ');
  assert.deepEqual(toks.map((t) => t.pos), [2, 4, 8]);
});

test('unexpected characters are syntax errors', () => {
  for (const bad of ['1 # 2', '@', '1 ? 2', '{1}']) {
    assert.throws(() => tokenize(bad), (e) => e.code === ERR.SYNTAX, bad);
  }
});

test('empty input produces no tokens', () => {
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize('   '), []);
});
