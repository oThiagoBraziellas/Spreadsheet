import { CellError, ERR, FormulaError, isCellError } from './errors.js';
import { parse, collectReferences } from './parser.js';
import { evaluate } from './evaluator.js';
import { DependencyGraph } from './graph.js';
import { parseRef, refToString, compareRefs, normalizeRef } from './refs.js';
import { formatValue, parseLiteral } from './format.js';

/**
 * The spreadsheet model. Cells are stored by key ("A1"). Setting a cell:
 *   1. parses the formula (syntax errors become cell errors),
 *   2. updates the dependency graph,
 *   3. recomputes the cell and everything downstream in topological order,
 *   4. marks cells on (or depending on) a cycle with #CYCLE!.
 * setCell returns the list of keys whose displayed value may have changed.
 */
export class Sheet {
  constructor({ cols = 26, rows = 100 } = {}) {
    this.cols = cols;
    this.rows = rows;
    this.raw = new Map(); // key -> text typed by the user
    this.ast = new Map(); // key -> parsed formula
    this.values = new Map(); // key -> computed value
    this.graph = new DependencyGraph();
  }

  inBounds(col, row) {
    return col >= 0 && row >= 0 && col < this.cols && row < this.rows;
  }

  keyFor(ref) {
    const key = normalizeRef(ref);
    if (!key) return null;
    const { col, row } = parseRef(key);
    return this.inBounds(col, row) ? key : null;
  }

  getRaw(ref) {
    return this.raw.get(this.keyFor(ref)) ?? '';
  }

  getValue(ref) {
    const key = this.keyFor(ref);
    return key === null ? new CellError(ERR.REF, String(ref)) : this.values.get(key) ?? null;
  }

  getDisplay(ref) {
    return formatValue(this.getValue(ref));
  }

  isFormula(ref) {
    return this.getRaw(ref).trimStart().startsWith('=');
  }

  dependenciesOf(ref) {
    return this.graph.getDependencies(this.keyFor(ref)).sort(compareRefs);
  }

  dependentsOf(ref) {
    return this.graph.getDependents(this.keyFor(ref)).sort(compareRefs);
  }

  /** Cycle through `ref` as a list of keys, or null. */
  cycleThrough(ref) {
    return this.graph.findCycle(this.keyFor(ref));
  }

  /** Sets the raw content of a cell and returns every key that was recomputed. */
  setCell(ref, text) {
    const key = this.keyFor(ref);
    if (key === null) throw new RangeError(`Cell out of bounds: ${ref}`);
    const content = String(text ?? '');

    if (content.trim() === '') {
      this.raw.delete(key);
    } else {
      this.raw.set(key, content);
    }
    this.compileCell(key);
    return this.recalculate([key]);
  }

  /** Bulk load without recomputing after every cell. Returns all keys. */
  load(cells) {
    this.raw.clear();
    this.ast.clear();
    this.values.clear();
    this.graph = new DependencyGraph();
    const keys = [];
    for (const [ref, text] of Object.entries(cells)) {
      const key = this.keyFor(ref);
      if (key === null || String(text).trim() === '') continue;
      this.raw.set(key, String(text));
      keys.push(key);
    }
    for (const key of keys) this.compileCell(key);
    this.recalculate(keys);
    return keys;
  }

  toJSON() {
    return Object.fromEntries([...this.raw].sort(([a], [b]) => compareRefs(a, b)));
  }

  /** Parses raw text into either a literal value or an AST plus graph edges. */
  compileCell(key) {
    this.ast.delete(key);
    const text = this.raw.get(key);
    if (text === undefined) {
      this.graph.removeDependencies(key);
      this.values.delete(key);
      return;
    }
    if (!text.trimStart().startsWith('=')) {
      this.graph.removeDependencies(key);
      this.values.set(key, parseLiteral(text));
      return;
    }
    try {
      const ast = parse(text.trimStart());
      this.ast.set(key, ast);
      this.graph.setDependencies(key, collectReferences(ast, { maxRange: this.cols * this.rows }));
    } catch (err) {
      if (!(err instanceof FormulaError)) throw err;
      this.graph.removeDependencies(key);
      this.values.set(key, new CellError(err.code, err.detail));
    }
  }

  recalculate(changedKeys) {
    const affected = this.graph.affected(changedKeys);
    const { order, cyclic } = this.graph.topologicalOrder(affected, compareRefs);
    const context = {
      getCell: (k) => this.values.get(k) ?? null,
      inBounds: (c, r) => this.inBounds(c, r),
    };
    for (const key of order) {
      const ast = this.ast.get(key);
      if (ast) this.values.set(key, evaluate(ast, context));
    }
    for (const key of cyclic) {
      if (this.ast.has(key)) this.values.set(key, new CellError(ERR.CYCLE, 'circular reference'));
    }
    return [...affected];
  }

  /** CSV of the used area (or of an explicit rectangle) using displayed values. */
  toCsv({ cols, rows } = {}) {
    let maxCol = -1;
    let maxRow = -1;
    for (const key of this.raw.keys()) {
      const { col, row } = parseRef(key);
      maxCol = Math.max(maxCol, col);
      maxRow = Math.max(maxRow, row);
    }
    const c = cols ?? maxCol + 1;
    const r = rows ?? maxRow + 1;
    const lines = [];
    for (let row = 0; row < r; row++) {
      const cells = [];
      for (let col = 0; col < c; col++) cells.push(csvEscape(this.getDisplay(refToString(col, row))));
      lines.push(cells.join(','));
    }
    return lines.join('\n');
  }
}

export function csvEscape(text) {
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export { isCellError };
