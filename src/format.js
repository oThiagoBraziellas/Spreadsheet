import { isCellError } from './errors.js';

/** Text shown in a cell for a computed value. */
export function formatValue(value) {
  if (value === null || value === undefined) return '';
  if (isCellError(value)) return value.code;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') {
    if (Number.isInteger(value) && Math.abs(value) < 1e15) return String(value);
    const rounded = Number(value.toPrecision(10));
    const abs = Math.abs(rounded);
    if (abs !== 0 && (abs >= 1e15 || abs < 1e-6)) return rounded.toExponential(4).replace(/\.?0+e/, 'e');
    return String(rounded);
  }
  return String(value);
}

/** Interprets what the user typed into a non-formula cell. */
export function parseLiteral(text) {
  const t = String(text);
  const trimmed = t.trim();
  if (trimmed === '') return null;
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) return Number(trimmed);
  const percent = /^([+-]?(?:\d+\.?\d*|\.\d+))%$/.exec(trimmed);
  if (percent) return Number(percent[1]) / 100;
  const upper = trimmed.toUpperCase();
  if (upper === 'TRUE') return true;
  if (upper === 'FALSE') return false;
  return t;
}
