import { ERR, CellError, FormulaError, isCellError } from './errors.js';
import { expandRange } from './refs.js';

/**
 * Values: number | string | boolean | null (empty) | CellError.
 * `context.getCell(key)` returns the current value of a cell. `context.inBounds(col,row)` is optional.
 * Errors are thrown as FormulaError internally and converted to CellError at the boundary.
 */

export function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') {
    const t = value.trim();
    if (t !== '' && Number.isFinite(Number(t))) return Number(t);
  }
  throw new FormulaError(ERR.VALUE, `"${value}" is not a number`);
}

export function toText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return formatNumberForText(value);
  return String(value);
}

function formatNumberForText(n) {
  return Number.isInteger(n) ? String(n) : String(Number(n.toPrecision(15)));
}

export function toBoolean(value) {
  if (value === null || value === undefined || value === '') return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const t = String(value).trim().toUpperCase();
  if (t === 'TRUE') return true;
  if (t === 'FALSE') return false;
  throw new FormulaError(ERR.VALUE, `"${value}" is not a boolean`);
}

const typeRank = (v) => (typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2);

/** Excel-like ordering: numbers < text < booleans; text compared case-insensitively; empty acts as 0 or "". */
export function compareValues(a, b) {
  if (a === null || a === undefined) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0;
  if (b === null || b === undefined) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0;
  const ra = typeRank(a);
  const rb = typeRank(b);
  if (ra !== rb) return ra < rb ? -1 : 1;
  if (typeof a === 'string') {
    const x = a.toLowerCase();
    const y = b.toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

function checkNumber(n) {
  if (Number.isNaN(n)) throw new FormulaError(ERR.NUM);
  if (!Number.isFinite(n)) throw new FormulaError(ERR.NUM, 'overflow');
  return n;
}

function readCell(key, context) {
  const v = context.getCell(key);
  if (isCellError(v)) throw new FormulaError(v.code, v.detail);
  return v === undefined ? null : v;
}

/** Flattens aggregate arguments: ranges contribute only numbers; direct arguments are coerced. */
function numbersFrom(args, context) {
  const out = [];
  for (const arg of args) {
    if (arg.type === 'range') {
      for (const key of expandRange(arg.from, arg.to)) {
        const v = readCell(key, context);
        if (typeof v === 'number') out.push(v);
      }
    } else if (arg.type === 'ref') {
      const v = readCell(arg.key, context);
      if (typeof v === 'number') out.push(v);
    } else {
      out.push(toNumber(evalNode(arg, context)));
    }
  }
  return out;
}

const FUNCTIONS = {
  SUM: (args, c) => numbersFrom(args, c).reduce((a, b) => a + b, 0),
  AVERAGE: (args, c) => {
    const nums = numbersFrom(args, c);
    if (nums.length === 0) throw new FormulaError(ERR.DIV0);
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  },
  MIN: (args, c) => { const n = numbersFrom(args, c); return n.length ? Math.min(...n) : 0; },
  MAX: (args, c) => { const n = numbersFrom(args, c); return n.length ? Math.max(...n) : 0; },
  COUNT: (args, c) => numbersFrom(args, c).length,
  ABS: (args, c) => Math.abs(toNumber(single(args, c, 'ABS'))),
  SQRT: (args, c) => {
    const n = toNumber(single(args, c, 'SQRT'));
    if (n < 0) throw new FormulaError(ERR.NUM);
    return Math.sqrt(n);
  },
  ROUND: (args, c) => {
    if (args.length < 1 || args.length > 2) throw new FormulaError(ERR.VALUE, 'ROUND takes 1 or 2 arguments');
    const n = toNumber(evalNode(args[0], c));
    const digits = args.length === 2 ? Math.trunc(toNumber(evalNode(args[1], c))) : 0;
    return roundHalfAwayFromZero(n, digits);
  },
  IF: (args, c) => {
    if (args.length < 2 || args.length > 3) throw new FormulaError(ERR.VALUE, 'IF takes 2 or 3 arguments');
    const cond = toBoolean(evalNode(args[0], c));
    if (cond) return evalNode(args[1], c);
    return args.length === 3 ? evalNode(args[2], c) : false;
  },
  AND: (args, c) => args.every((a) => toBoolean(scalarOrFirst(a, c))),
  OR: (args, c) => args.some((a) => toBoolean(scalarOrFirst(a, c))),
  NOT: (args, c) => !toBoolean(single(args, c, 'NOT')),
  CONCAT: (args, c) => args.map((a) => toText(scalarOrFirst(a, c))).join(''),
};
FUNCTIONS.AVG = FUNCTIONS.AVERAGE;

/** Rounds using the decimal representation so 1.005 rounds to 1.01 (binary math would give 1.00). */
function roundHalfAwayFromZero(n, digits) {
  const abs = Math.abs(n);
  const text = String(abs);
  let rounded;
  if (text.includes('e')) {
    const f = 10 ** digits;
    rounded = Math.round(abs * f) / f;
  } else {
    rounded = Number(`${Math.round(Number(`${text}e${digits}`))}e${-digits}`);
  }
  return n < 0 ? -rounded : rounded;
}

function single(args, c, name) {
  if (args.length !== 1) throw new FormulaError(ERR.VALUE, `${name} takes 1 argument`);
  return evalNode(args[0], c);
}

function scalarOrFirst(node, context) {
  return evalNode(node, context);
}

export const FUNCTION_NAMES = Object.keys(FUNCTIONS);

function evalNode(node, context) {
  switch (node.type) {
    case 'number': return node.value;
    case 'string': return node.value;
    case 'bool': return node.value;
    case 'ref':
      if (context.inBounds && !context.inBounds(node.col, node.row)) throw new FormulaError(ERR.REF, node.key);
      return readCell(node.key, context);
    case 'range':
      // A range is only meaningful inside an aggregate function.
      throw new FormulaError(ERR.VALUE, 'a range cannot be used as a single value');
    case 'percent':
      return checkNumber(toNumber(evalNode(node.arg, context)) / 100);
    case 'unary': {
      const n = toNumber(evalNode(node.arg, context));
      return node.op === '-' ? -n : n;
    }
    case 'binary': return evalBinary(node, context);
    case 'call': {
      const fn = FUNCTIONS[node.name];
      if (!fn) throw new FormulaError(ERR.NAME, node.name);
      return fn(node.args, context);
    }
    default:
      throw new FormulaError(ERR.SYNTAX, `unknown node ${node.type}`);
  }
}

function evalBinary(node, context) {
  const { op } = node;
  const left = evalNode(node.left, context);
  const right = evalNode(node.right, context);
  switch (op) {
    case '+': return checkNumber(toNumber(left) + toNumber(right));
    case '-': return checkNumber(toNumber(left) - toNumber(right));
    case '*': return checkNumber(toNumber(left) * toNumber(right));
    case '/': {
      const d = toNumber(right);
      if (d === 0) throw new FormulaError(ERR.DIV0);
      return checkNumber(toNumber(left) / d);
    }
    case '^': return checkNumber(toNumber(left) ** toNumber(right));
    case '&': return toText(left) + toText(right);
    case '=': return compareValues(left, right) === 0;
    case '<>': return compareValues(left, right) !== 0;
    case '<': return compareValues(left, right) < 0;
    case '>': return compareValues(left, right) > 0;
    case '<=': return compareValues(left, right) <= 0;
    case '>=': return compareValues(left, right) >= 0;
    default:
      throw new FormulaError(ERR.SYNTAX, `unknown operator ${op}`);
  }
}

/** Evaluates an AST and never throws: failures become CellError values. */
export function evaluate(ast, context) {
  try {
    const value = evalNode(ast, context);
    return value === undefined || value === null ? 0 : value; // a formula that points at an empty cell shows 0
  } catch (err) {
    if (err instanceof FormulaError) return new CellError(err.code, err.detail);
    throw err;
  }
}
