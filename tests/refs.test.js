import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  colToIndex, indexToCol, parseRef, refToString, isValidRef, normalizeRef, expandRange, rangeSize, compareRefs,
} from '../src/refs.js';

test('colToIndex and indexToCol are inverses, including multi-letter columns', () => {
  const samples = { A: 0, B: 1, Z: 25, AA: 26, AB: 27, AZ: 51, BA: 52, ZZ: 701, AAA: 702 };
  for (const [letters, index] of Object.entries(samples)) {
    assert.equal(colToIndex(letters), index, letters);
    assert.equal(indexToCol(index), letters, String(index));
  }
  for (let i = 0; i < 2000; i++) assert.equal(colToIndex(indexToCol(i)), i);
});

test('colToIndex is case-insensitive', () => {
  assert.equal(colToIndex('ab'), colToIndex('AB'));
});

test('parseRef reads plain and absolute references', () => {
  assert.deepEqual(parseRef('A1'), { col: 0, row: 0 });
  assert.deepEqual(parseRef('b12'), { col: 1, row: 11 });
  assert.deepEqual(parseRef('$C$3'), { col: 2, row: 2 });
  assert.deepEqual(parseRef('$C3'), { col: 2, row: 2 });
  assert.deepEqual(parseRef('AA100'), { col: 26, row: 99 });
  assert.deepEqual(parseRef(' D4 '), { col: 3, row: 3 });
});

test('parseRef rejects malformed references', () => {
  for (const bad of ['', 'A', '1', 'A0', '1A', 'A-1', 'A1B', 'AAAA1', 'A 1', '$$A1', 'A1:B2']) {
    assert.equal(parseRef(bad), null, bad);
    assert.equal(isValidRef(bad), false, bad);
  }
});

test('refToString and normalizeRef', () => {
  assert.equal(refToString(0, 0), 'A1');
  assert.equal(refToString(27, 9), 'AB10');
  assert.equal(normalizeRef('$b$2'), 'B2');
  assert.equal(normalizeRef('nope'), null);
});

test('expandRange lists cells in row-major order regardless of corner order', () => {
  const a = parseRef('A1');
  const c = parseRef('C2');
  assert.deepEqual(expandRange(a, c), ['A1', 'B1', 'C1', 'A2', 'B2', 'C2']);
  assert.deepEqual(expandRange(c, a), ['A1', 'B1', 'C1', 'A2', 'B2', 'C2']);
  assert.deepEqual(expandRange(a, a), ['A1']);
  assert.deepEqual(expandRange(parseRef('B3'), parseRef('B1')), ['B1', 'B2', 'B3']);
});

test('rangeSize counts cells', () => {
  assert.equal(rangeSize(parseRef('A1'), parseRef('C4')), 12);
  assert.equal(rangeSize(parseRef('C4'), parseRef('A1')), 12);
  assert.equal(rangeSize(parseRef('A1'), parseRef('A1')), 1);
});

test('compareRefs orders by row then column', () => {
  const sorted = ['B2', 'A10', 'C1', 'A2', 'A1'].sort(compareRefs);
  assert.deepEqual(sorted, ['A1', 'C1', 'A2', 'B2', 'A10']);
});
