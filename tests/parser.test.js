import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, collectReferences } from '../src/parser.js';
import { ERR } from '../src/errors.js';

/** Compact S-expression rendering so precedence is easy to assert. */
function show(node) {
  switch (node.type) {
    case 'number': return String(node.value);
    case 'string': return JSON.stringify(node.value);
    case 'bool': return node.value ? 'TRUE' : 'FALSE';
    case 'ref': return node.key;
    case 'range': return `${node.from.key}:${node.to.key}`;
    case 'unary': return `(${node.op}u ${show(node.arg)})`;
    case 'percent': return `(% ${show(node.arg)})`;
    case 'binary': return `(${node.op} ${show(node.left)} ${show(node.right)})`;
    case 'call': return `${node.name}(${node.args.map(show).join(' ')})`;
    default: return '?';
  }
}
const sx = (src) => show(parse(src));
const errorCode = (src) => { try { parse(src); } catch (e) { return e.code; } return null; };

test('literals', () => {
  assert.equal(sx('=42'), '42');
  assert.equal(sx('="hi"'), '"hi"');
  assert.equal(sx('=TRUE'), 'TRUE');
  assert.equal(sx('=false'), 'FALSE');
});

test('multiplication binds tighter than addition', () => {
  assert.equal(sx('=1+2*3'), '(+ 1 (* 2 3))');
  assert.equal(sx('=1*2+3'), '(+ (* 1 2) 3)');
});

test('operators of the same level are left associative', () => {
  assert.equal(sx('=10-4-3'), '(- (- 10 4) 3)');
  assert.equal(sx('=100/10/5'), '(/ (/ 100 10) 5)');
  assert.equal(sx('=2^3^2'), '(^ (^ 2 3) 2)');
});

test('parentheses override precedence', () => {
  assert.equal(sx('=(1+2)*3'), '(* (+ 1 2) 3)');
  assert.equal(sx('=((1))'), '1');
});

test('unary minus binds tighter than power, like Excel', () => {
  assert.equal(sx('=-2^2'), '(^ (-u 2) 2)');
  assert.equal(sx('=--3'), '(-u (-u 3))');
  assert.equal(sx('=+5'), '(+u 5)');
  assert.equal(sx('=2*-3'), '(* 2 (-u 3))');
});

test('percent is a postfix operator', () => {
  assert.equal(sx('=50%'), '(% 50)');
  assert.equal(sx('=200*10%'), '(* 200 (% 10))');
  assert.equal(sx('=5%%'), '(% (% 5))');
});

test('concat sits between comparison and additive', () => {
  assert.equal(sx('="a"&1+2'), '(& "a" (+ 1 2))');
  assert.equal(sx('=A1&B1=C1'), '(= (& A1 B1) C1)');
});

test('comparison has the lowest precedence', () => {
  assert.equal(sx('=1+2>=3*1'), '(>= (+ 1 2) (* 3 1))');
  assert.equal(sx('=A1<>B1'), '(<> A1 B1)');
});

test('references normalise absolute markers and case', () => {
  assert.equal(sx('=$a$1+b2'), '(+ A1 B2)');
});

test('ranges', () => {
  assert.equal(sx('=SUM(A1:B3)'), 'SUM(A1:B3)');
  assert.equal(sx('=sum(a1:b3, 10)'), 'SUM(A1:B3 10)');
});

test('function calls with zero, one and many arguments', () => {
  assert.equal(sx('=IF()'), 'IF()');
  assert.equal(sx('=MAX(1)'), 'MAX(1)');
  assert.equal(sx('=MAX(1,2,3)'), 'MAX(1 2 3)');
  assert.equal(sx('=IF(A1>0,SUM(B1:B2),0)'), 'IF((> A1 0) SUM(B1:B2) 0)');
  assert.equal(sx('=SUM(MAX(1,2),MIN(3,4))'), 'SUM(MAX(1 2) MIN(3 4))');
});

test('formulas parse without the leading equals sign', () => {
  assert.equal(sx('1+1'), '(+ 1 1)');
});

test('syntax errors', () => {
  for (const bad of ['=', '=1+', '=*2', '=(1+2', '=1+2)', '=SUM(1,', '=SUM(1 2)', '=A1:', '=A1:5', '=1 2', '=,', '=SUM(,)']) {
    assert.equal(errorCode(bad), ERR.SYNTAX, bad);
  }
});

test('unknown bare names are #NAME?', () => {
  assert.equal(errorCode('=foo'), ERR.NAME);
  assert.equal(errorCode('=1+bar'), ERR.NAME);
});

test('collectReferences gathers refs and expands ranges', () => {
  const refs = collectReferences(parse('=A1+SUM(B1:B3)*IF(C1>0,D1,E1)'));
  assert.deepEqual([...refs].sort(), ['A1', 'B1', 'B2', 'B3', 'C1', 'D1', 'E1']);
  assert.equal(collectReferences(parse('=1+2')).size, 0);
  assert.deepEqual([...collectReferences(parse('=A1+A1'))], ['A1']);
});

test('collectReferences refuses absurdly large ranges', () => {
  assert.throws(() => collectReferences(parse('=SUM(A1:ZZ9999)'), { maxRange: 1000 }), (e) => e.code === ERR.REF);
});
