import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/parser.js';
import { evaluate, toNumber, toText, toBoolean, compareValues, FUNCTION_NAMES } from '../src/evaluator.js';
import { CellError, ERR, isCellError } from '../src/errors.js';

function run(src, cells = {}) {
  const context = { getCell: (key) => (key in cells ? cells[key] : null) };
  return evaluate(parse(src), context);
}
const code = (v) => (isCellError(v) ? v.code : v);

test('arithmetic', () => {
  assert.equal(run('=1+2*3'), 7);
  assert.equal(run('=(1+2)*3'), 9);
  assert.equal(run('=10/4'), 2.5);
  assert.equal(run('=2^10'), 1024);
  assert.equal(run('=-2^2'), 4);
  assert.equal(run('=2^3^2'), 64);
  assert.equal(run('=7-10'), -3);
  assert.equal(run('=50%'), 0.5);
  assert.equal(run('=200*10%'), 20);
});

test('floating point results are returned as-is (formatting happens later)', () => {
  assert.ok(Math.abs(run('=0.1+0.2') - 0.3) < 1e-12);
});

test('references read cell values; empty cells are zero in arithmetic', () => {
  assert.equal(run('=A1+B1', { A1: 2, B1: 3 }), 5);
  assert.equal(run('=A1+1'), 1);
  assert.equal(run('=A1*5'), 0);
});

test('numeric strings are coerced, other strings are #VALUE!', () => {
  assert.equal(run('=A1+1', { A1: '41' }), 42);
  assert.equal(code(run('=A1+1', { A1: 'abc' })), ERR.VALUE);
});

test('booleans coerce to 1 and 0', () => {
  assert.equal(run('=TRUE+TRUE'), 2);
  assert.equal(run('=FALSE+5'), 5);
});

test('division by zero', () => {
  assert.equal(code(run('=1/0')), ERR.DIV0);
  assert.equal(code(run('=1/A1', { A1: 0 })), ERR.DIV0);
  assert.equal(code(run('=1/A1')), ERR.DIV0);
});

test('numeric overflow and invalid power are #NUM!', () => {
  assert.equal(code(run('=10^1000')), ERR.NUM);
  assert.equal(code(run('=(-8)^0.5')), ERR.NUM);
  assert.equal(code(run('=SQRT(-1)')), ERR.NUM);
});

test('errors propagate through operators and functions', () => {
  const err = new CellError(ERR.REF);
  assert.equal(code(run('=A1+1', { A1: err })), ERR.REF);
  assert.equal(code(run('=SUM(A1,2)', { A1: err })), ERR.REF);
  assert.equal(code(run('=SUM(A1:A2)', { A1: 1, A2: err })), ERR.REF);
  assert.equal(code(run('=IF(A1,1,2)', { A1: err })), ERR.REF);
  assert.equal(code(run('=A1&"x"', { A1: new CellError(ERR.DIV0) })), ERR.DIV0);
});

test('SUM over ranges, refs and literals', () => {
  const cells = { A1: 1, A2: 2, A3: 3, B1: 10 };
  assert.equal(run('=SUM(A1:A3)', cells), 6);
  assert.equal(run('=SUM(A1:B3)', cells), 16);
  assert.equal(run('=SUM(A1:A3, B1, 100)', cells), 116);
  assert.equal(run('=SUM(A3:A1)', cells), 6);
  assert.equal(run('=SUM()'), 0);
  assert.equal(run('=SUM(C1:C5)'), 0);
});

test('aggregates ignore text, booleans and blanks inside ranges', () => {
  const cells = { A1: 5, A2: 'text', A3: true, A5: 15 };
  assert.equal(run('=SUM(A1:A5)', cells), 20);
  assert.equal(run('=AVERAGE(A1:A5)', cells), 10);
  assert.equal(run('=COUNT(A1:A5)', cells), 2);
  assert.equal(run('=MAX(A1:A5)', cells), 15);
  assert.equal(run('=MIN(A1:A5)', cells), 5);
});

test('direct arguments are coerced, so text that is not numeric is #VALUE!', () => {
  assert.equal(run('=SUM("3", 4)'), 7);
  assert.equal(code(run('=SUM("x", 4)')), ERR.VALUE);
  assert.equal(run('=SUM(TRUE, 1)'), 2);
});

test('AVERAGE and AVG', () => {
  assert.equal(run('=AVERAGE(1,2,3,4)'), 2.5);
  assert.equal(run('=AVG(2,4)'), 3);
  assert.equal(code(run('=AVERAGE(A1:A3)')), ERR.DIV0);
  assert.equal(run('=AVERAGE(A1:A3)', { A1: 4, A3: 8 }), 6);
});

test('MIN and MAX', () => {
  assert.equal(run('=MIN(3,1,2)'), 1);
  assert.equal(run('=MAX(3,1,2)'), 3);
  assert.equal(run('=MAX(-5,-2)'), -2);
  assert.equal(run('=MIN(A1:A3)'), 0);
  assert.equal(run('=MAX(A1:A3)'), 0);
});

test('COUNT counts numbers only', () => {
  assert.equal(run('=COUNT(1,2,3)'), 3);
  assert.equal(run('=COUNT(A1:A4)', { A1: 1, A2: 'x', A3: null, A4: 4 }), 2);
});

test('ABS, SQRT and ROUND', () => {
  assert.equal(run('=ABS(-4.5)'), 4.5);
  assert.equal(run('=SQRT(16)'), 4);
  assert.equal(run('=ROUND(2.5)'), 3);
  assert.equal(run('=ROUND(-2.5)'), -3);
  assert.equal(run('=ROUND(3.14159, 2)'), 3.14);
  assert.equal(run('=ROUND(1234.5, -2)'), 1200);
  assert.equal(run('=ROUND(1.005, 2)'), 1.01);
  assert.equal(code(run('=ROUND()')), ERR.VALUE);
  assert.equal(code(run('=ABS(1,2)')), ERR.VALUE);
});

test('IF is lazy: only the chosen branch is evaluated', () => {
  assert.equal(run('=IF(TRUE, 1, 1/0)'), 1);
  assert.equal(run('=IF(FALSE, 1/0, 2)'), 2);
  assert.equal(code(run('=IF(TRUE, 1/0, 2)')), ERR.DIV0);
  assert.equal(run('=IF(FALSE, 1)'), false);
  assert.equal(run('=IF(A1>5, "big", "small")', { A1: 9 }), 'big');
  assert.equal(code(run('=IF(1)')), ERR.VALUE);
});

test('logical functions', () => {
  assert.equal(run('=AND(TRUE, 1, 2>1)'), true);
  assert.equal(run('=AND(TRUE, 0)'), false);
  assert.equal(run('=OR(FALSE, 0, 3)'), true);
  assert.equal(run('=OR(FALSE, 0)'), false);
  assert.equal(run('=NOT(FALSE)'), true);
  assert.equal(run('=NOT(5)'), false);
});

test('string concatenation with & and CONCAT', () => {
  assert.equal(run('="a"&"b"'), 'ab');
  assert.equal(run('="n="&5'), 'n=5');
  assert.equal(run('=A1&B1', { A1: 'x', B1: 2.5 }), 'x2.5');
  assert.equal(run('="v"&TRUE'), 'vTRUE');
  assert.equal(run('=CONCAT("a", 1, "c")'), 'a1c');
  assert.equal(run('=A1&"!"'), '!');
});

test('comparison operators', () => {
  assert.equal(run('=1<2'), true);
  assert.equal(run('=2<=2'), true);
  assert.equal(run('=3>4'), false);
  assert.equal(run('=3>=4'), false);
  assert.equal(run('=1=1'), true);
  assert.equal(run('=1<>1'), false);
  assert.equal(run('="a"="A"'), true);
  assert.equal(run('="a"<"b"'), true);
  assert.equal(run('=A1=0'), true);
  assert.equal(run('=A1=""'), true);
});

test('unknown functions are #NAME?', () => {
  assert.equal(code(run('=FOO(1)')), ERR.NAME);
});

test('a range used as a plain value is #VALUE!', () => {
  assert.equal(code(run('=A1:A3+1')), ERR.VALUE);
  assert.equal(code(run('=A1:A3')), ERR.VALUE);
});

test('references outside the sheet are #REF!', () => {
  const context = { getCell: () => 1, inBounds: (c, r) => c < 3 && r < 3 };
  assert.equal(evaluate(parse('=C3'), context), 1);
  assert.equal(code(evaluate(parse('=D1'), context)), ERR.REF);
  assert.equal(code(evaluate(parse('=A4+1'), context)), ERR.REF);
});

test('coercion helpers', () => {
  assert.equal(toNumber(null), 0);
  assert.equal(toNumber(' 12 '), 12);
  assert.throws(() => toNumber('x'));
  assert.equal(toText(1.5), '1.5');
  assert.equal(toText(0.1 + 0.2), '0.3');
  assert.equal(toText(null), '');
  assert.equal(toBoolean('true'), true);
  assert.equal(toBoolean(0), false);
  assert.throws(() => toBoolean('maybe'));
});

test('compareValues ordering across types', () => {
  assert.equal(compareValues(1, 2), -1);
  assert.equal(compareValues('b', 'a'), 1);
  assert.equal(compareValues(5, 'a'), -1);
  assert.equal(compareValues('a', true), -1);
  assert.equal(compareValues(null, 0), 0);
  assert.equal(compareValues(null, ''), 0);
  assert.equal(compareValues('A', 'a'), 0);
});

test('every advertised function name is implemented', () => {
  for (const name of ['SUM', 'AVERAGE', 'AVG', 'MIN', 'MAX', 'COUNT', 'IF']) assert.ok(FUNCTION_NAMES.includes(name), name);
});
