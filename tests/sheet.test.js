import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sheet, csvEscape } from '../src/sheet.js';
import { ERR, isCellError } from '../src/errors.js';

const shown = (sheet, ref) => sheet.getDisplay(ref);

test('literals: numbers, text and booleans', () => {
  const s = new Sheet();
  s.setCell('A1', '42');
  s.setCell('A2', '  3.5 ');
  s.setCell('A3', 'hello');
  s.setCell('A4', 'true');
  assert.equal(s.getValue('A1'), 42);
  assert.equal(s.getValue('A2'), 3.5);
  assert.equal(s.getValue('A3'), 'hello');
  assert.equal(s.getValue('A4'), true);
  assert.equal(shown(s, 'A4'), 'TRUE');
  assert.equal(s.getValue('Z99'), null);
});

test('raw text is preserved exactly as typed', () => {
  const s = new Sheet();
  s.setCell('A1', '=1+1');
  assert.equal(s.getRaw('A1'), '=1+1');
  assert.equal(s.isFormula('A1'), true);
  assert.equal(s.isFormula('B1'), false);
  assert.equal(s.getRaw('B1'), '');
});

test('formulas compute from other cells', () => {
  const s = new Sheet();
  s.setCell('A1', '10');
  s.setCell('A2', '20');
  s.setCell('A3', '=A1+A2');
  assert.equal(s.getValue('A3'), 30);
});

test('changing a precedent recalculates dependents, including chains', () => {
  const s = new Sheet();
  s.setCell('A1', '1');
  s.setCell('B1', '=A1+1');
  s.setCell('C1', '=B1*2');
  s.setCell('D1', '=C1+B1+A1');
  assert.equal(s.getValue('D1'), 7);
  s.setCell('A1', '5');
  assert.equal(s.getValue('B1'), 6);
  assert.equal(s.getValue('C1'), 12);
  assert.equal(s.getValue('D1'), 23);
});

test('setCell returns every recomputed key', () => {
  const s = new Sheet();
  s.setCell('A1', '1');
  s.setCell('B1', '=A1');
  s.setCell('C1', '=B1');
  s.setCell('D1', '=Z1');
  const changed = s.setCell('A1', '2');
  assert.deepEqual(changed.sort(), ['A1', 'B1', 'C1']);
});

test('diamond dependencies compute each cell once, in the right order', () => {
  const s = new Sheet();
  s.setCell('A1', '2');
  s.setCell('B1', '=A1*2');
  s.setCell('B2', '=A1*3');
  s.setCell('C1', '=B1+B2');
  assert.equal(s.getValue('C1'), 10);
  s.setCell('A1', '10');
  assert.equal(s.getValue('C1'), 50);
});

test('formulas may be defined before their precedents exist', () => {
  const s = new Sheet();
  s.setCell('A1', '=B1+1');
  assert.equal(s.getValue('A1'), 1);
  s.setCell('B1', '41');
  assert.equal(s.getValue('A1'), 42);
});

test('clearing a cell recalculates dependents as if it were empty', () => {
  const s = new Sheet();
  s.setCell('A1', '5');
  s.setCell('B1', '=A1+1');
  s.setCell('A1', '');
  assert.equal(s.getValue('A1'), null);
  assert.equal(s.getValue('B1'), 1);
  assert.equal(s.getRaw('A1'), '');
});

test('replacing a formula with a literal drops its old dependencies', () => {
  const s = new Sheet();
  s.setCell('A1', '1');
  s.setCell('B1', '=A1');
  s.setCell('B1', '99');
  assert.deepEqual(s.dependentsOf('A1'), []);
  s.setCell('A1', '2');
  assert.equal(s.getValue('B1'), 99);
});

test('dependenciesOf and dependentsOf are sorted and expand ranges', () => {
  const s = new Sheet();
  s.setCell('D1', '=SUM(A1:A3)+B1');
  assert.deepEqual(s.dependenciesOf('D1'), ['A1', 'B1', 'A2', 'A3']);
  assert.deepEqual(s.dependentsOf('A2'), ['D1']);
});

test('SUM, AVERAGE, MIN and MAX over a range update live', () => {
  const s = new Sheet();
  [4, 8, 15, 16].forEach((n, i) => s.setCell(`A${i + 1}`, String(n)));
  s.setCell('B1', '=SUM(A1:A4)');
  s.setCell('B2', '=AVERAGE(A1:A4)');
  s.setCell('B3', '=MIN(A1:A4)');
  s.setCell('B4', '=MAX(A1:A4)');
  assert.deepEqual(['B1', 'B2', 'B3', 'B4'].map((r) => s.getValue(r)), [43, 10.75, 4, 16]);
  s.setCell('A2', '100');
  assert.deepEqual(['B1', 'B2', 'B3', 'B4'].map((r) => s.getValue(r)), [135, 33.75, 4, 100]);
});

test('aggregates over a 2D block', () => {
  const s = new Sheet();
  let n = 1;
  for (const row of [1, 2, 3]) for (const col of ['A', 'B', 'C']) s.setCell(`${col}${row}`, String(n++));
  s.setCell('E1', '=SUM(A1:C3)');
  s.setCell('E2', '=MAX(B2:C3)');
  assert.equal(s.getValue('E1'), 45);
  assert.equal(s.getValue('E2'), 9);
});

test('a range that includes the formula cell itself is a cycle', () => {
  const s = new Sheet();
  s.setCell('A1', '1');
  s.setCell('A3', '=SUM(A1:A3)');
  assert.equal(s.getValue('A3').code, ERR.CYCLE);
});

test('direct self reference is #CYCLE!', () => {
  const s = new Sheet();
  s.setCell('A1', '=A1+1');
  assert.equal(s.getValue('A1').code, ERR.CYCLE);
  assert.deepEqual(s.cycleThrough('A1'), ['A1', 'A1']);
});

test('two-cell cycle marks both cells', () => {
  const s = new Sheet();
  s.setCell('A1', '=B1');
  assert.equal(shown(s, 'A1'), '0');
  s.setCell('B1', '=A1');
  assert.equal(shown(s, 'A1'), '#CYCLE!');
  assert.equal(shown(s, 'B1'), '#CYCLE!');
  assert.deepEqual(s.cycleThrough('A1'), ['A1', 'B1', 'A1']);
});

test('long cycles and cells that depend on a cycle are all #CYCLE!', () => {
  const s = new Sheet();
  s.setCell('A1', '=B1');
  s.setCell('B1', '=C1');
  s.setCell('C1', '=D1');
  s.setCell('E1', '=A1+1');
  s.setCell('D1', '=A1');
  for (const ref of ['A1', 'B1', 'C1', 'D1', 'E1']) assert.equal(shown(s, ref), '#CYCLE!', ref);
});

test('breaking a cycle recovers every affected cell', () => {
  const s = new Sheet();
  s.setCell('A1', '=B1');
  s.setCell('B1', '=A1');
  s.setCell('C1', '=A1+10');
  assert.equal(shown(s, 'C1'), '#CYCLE!');
  s.setCell('B1', '7');
  assert.equal(s.getValue('A1'), 7);
  assert.equal(s.getValue('B1'), 7);
  assert.equal(s.getValue('C1'), 17);
  assert.equal(s.cycleThrough('A1'), null);
});

test('an unrelated cell is not disturbed by a nearby cycle', () => {
  const s = new Sheet();
  s.setCell('A1', '5');
  s.setCell('B1', '=A1*2');
  s.setCell('C1', '=D1');
  s.setCell('D1', '=C1');
  assert.equal(s.getValue('B1'), 10);
});

test('creating a cycle through a chain that was previously valid', () => {
  const s = new Sheet();
  s.setCell('A1', '1');
  s.setCell('A2', '=A1+1');
  s.setCell('A3', '=A2+1');
  assert.equal(s.getValue('A3'), 3);
  s.setCell('A1', '=A3');
  assert.equal(shown(s, 'A3'), '#CYCLE!');
  s.setCell('A1', '10');
  assert.equal(s.getValue('A3'), 12);
});

test('error values propagate to dependents and recover', () => {
  const s = new Sheet();
  s.setCell('A1', '0');
  s.setCell('B1', '=1/A1');
  s.setCell('C1', '=B1+1');
  s.setCell('D1', '=SUM(C1,5)');
  assert.equal(shown(s, 'B1'), '#DIV/0!');
  assert.equal(shown(s, 'C1'), '#DIV/0!');
  assert.equal(shown(s, 'D1'), '#DIV/0!');
  s.setCell('A1', '4');
  assert.equal(s.getValue('B1'), 0.25);
  assert.equal(s.getValue('D1'), 6.25);
});

test('syntax errors are shown in the cell and do not throw', () => {
  const s = new Sheet();
  assert.doesNotThrow(() => s.setCell('A1', '=1+'));
  assert.equal(shown(s, 'A1'), '#ERROR!');
  s.setCell('A1', '=(1+2');
  assert.equal(shown(s, 'A1'), '#ERROR!');
  s.setCell('A1', '=1+2');
  assert.equal(shown(s, 'A1'), '3');
});

test('unknown names and functions', () => {
  const s = new Sheet();
  s.setCell('A1', '=FOO(1)');
  s.setCell('A2', '=bar');
  assert.equal(shown(s, 'A1'), '#NAME?');
  assert.equal(shown(s, 'A2'), '#NAME?');
});

test('references outside the grid are #REF!', () => {
  const s = new Sheet({ cols: 5, rows: 5 });
  s.setCell('A1', '=F1');
  s.setCell('A2', '=A6');
  s.setCell('A3', '=SUM(A1:A9)');
  assert.equal(shown(s, 'A1'), '#REF!');
  assert.equal(shown(s, 'A2'), '#REF!');
  assert.equal(isCellError(s.getValue('A9')), true);
  assert.throws(() => s.setCell('Z9', '1'), RangeError);
  assert.throws(() => s.setCell('bogus', '1'), RangeError);
});

test('text and boolean results from formulas', () => {
  const s = new Sheet();
  s.setCell('A1', '5');
  s.setCell('B1', '=IF(A1>3, "high", "low")');
  s.setCell('B2', '=A1>3');
  s.setCell('B3', '="Total: "&A1');
  assert.equal(s.getValue('B1'), 'high');
  assert.equal(shown(s, 'B2'), 'TRUE');
  assert.equal(shown(s, 'B3'), 'Total: 5');
  s.setCell('A1', '1');
  assert.equal(s.getValue('B1'), 'low');
});

test('absolute references behave like relative ones in this engine', () => {
  const s = new Sheet();
  s.setCell('A1', '3');
  s.setCell('B1', '=$A$1*2');
  assert.equal(s.getValue('B1'), 6);
  s.setCell('A1', '4');
  assert.equal(s.getValue('B1'), 8);
});

test('references are case-insensitive', () => {
  const s = new Sheet();
  s.setCell('a1', '2');
  s.setCell('b1', '=A1+a1');
  assert.equal(s.getValue('B1'), 4);
});

test('display formatting avoids floating point noise', () => {
  const s = new Sheet();
  s.setCell('A1', '=0.1+0.2');
  s.setCell('A2', '=1/3');
  s.setCell('A3', '=2/4');
  s.setCell('A4', '=1000000*1000000');
  s.setCell('A5', '=1/1000000000');
  assert.equal(shown(s, 'A1'), '0.3');
  assert.equal(shown(s, 'A2'), '0.3333333333');
  assert.equal(shown(s, 'A3'), '0.5');
  assert.equal(shown(s, 'A4'), '1000000000000');
  assert.match(shown(s, 'A5'), /e-9$/);
});

test('load builds a consistent sheet from raw data in any key order', () => {
  const s = new Sheet();
  s.load({ C1: '=B1+A1', B1: '=A1*2', A1: '3', D1: '' });
  assert.equal(s.getValue('C1'), 9);
  assert.equal(s.getRaw('D1'), '');
  s.setCell('A1', '4');
  assert.equal(s.getValue('C1'), 12);
});

test('load replaces previous content and ignores invalid keys', () => {
  const s = new Sheet({ cols: 3, rows: 3 });
  s.setCell('A1', '1');
  s.load({ B2: '5', X9: '1', nonsense: '2' });
  assert.equal(s.getRaw('A1'), '');
  assert.equal(s.getValue('B2'), 5);
  assert.deepEqual(s.toJSON(), { B2: '5' });
});

test('toJSON sorts cells and round-trips through load', () => {
  const s = new Sheet();
  s.setCell('B2', '=A1+1');
  s.setCell('A1', '9');
  s.setCell('A2', 'text');
  assert.deepEqual(Object.keys(s.toJSON()), ['A1', 'A2', 'B2']);
  const copy = new Sheet();
  copy.load(JSON.parse(JSON.stringify(s.toJSON())));
  assert.equal(copy.getValue('B2'), 10);
});

test('load keeps cycles detected', () => {
  const s = new Sheet();
  s.load({ A1: '=B1', B1: '=A1', C1: '1' });
  assert.equal(shown(s, 'A1'), '#CYCLE!');
  assert.equal(shown(s, 'C1'), '1');
});

test('toCsv exports displayed values with proper quoting', () => {
  const s = new Sheet();
  s.setCell('A1', 'name');
  s.setCell('B1', 'qty');
  s.setCell('A2', 'say "hi", ok');
  s.setCell('B2', '=1+2');
  assert.equal(s.toCsv(), 'name,qty\n"say ""hi"", ok",3');
  assert.equal(new Sheet().toCsv(), '');
  assert.equal(csvEscape('plain'), 'plain');
  assert.equal(csvEscape('a\nb'), '"a\nb"');
});

test('a larger sheet recalculates a long dependency chain', () => {
  const s = new Sheet({ cols: 26, rows: 600 });
  s.setCell('A1', '1');
  for (let r = 2; r <= 600; r++) s.setCell(`A${r}`, `=A${r - 1}+1`);
  assert.equal(s.getValue('A600'), 600);
  const start = performance.now();
  s.setCell('A1', '1000');
  assert.equal(s.getValue('A600'), 1599);
  assert.ok(performance.now() - start < 2000);
});

test('a wide fan-in (SUM of 2,000 cells) stays correct after edits', () => {
  const s = new Sheet({ cols: 26, rows: 100 });
  for (let r = 1; r <= 100; r++) for (let c = 0; c < 20; c++) s.setCell(`${String.fromCharCode(65 + c)}${r}`, '1');
  s.setCell('Z1', '=SUM(A1:T100)');
  assert.equal(s.getValue('Z1'), 2000);
  s.setCell('J50', '101');
  assert.equal(s.getValue('Z1'), 2100);
});

test('out-of-range cells referenced via bounds do not corrupt other cells', () => {
  const s = new Sheet({ cols: 3, rows: 3 });
  s.setCell('A1', '=D4');
  s.setCell('B1', '2');
  assert.equal(shown(s, 'A1'), '#REF!');
  assert.equal(s.getValue('B1'), 2);
});

test('typing a percentage literal stores the fraction, so it works in formulas', () => {
  const s = new Sheet();
  s.setCell('A1', '200');
  s.setCell('A2', '8%');
  s.setCell('A3', '=A1*A2');
  assert.equal(s.getValue('A2'), 0.08);
  assert.equal(s.getValue('A3'), 16);
  s.setCell('B1', '12abc%');
  assert.equal(s.getValue('B1'), '12abc%');
});
