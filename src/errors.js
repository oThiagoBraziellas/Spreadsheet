/** Error codes shown in cells, plus the exception used internally while evaluating. */

export const ERR = Object.freeze({
  DIV0: '#DIV/0!',
  REF: '#REF!',
  NAME: '#NAME?',
  VALUE: '#VALUE!',
  NUM: '#NUM!',
  CYCLE: '#CYCLE!',
  SYNTAX: '#ERROR!',
});

/** A value stored in a cell when evaluation fails. */
export class CellError {
  constructor(code, detail = '') {
    this.code = code;
    this.detail = detail;
  }
  toString() { return this.code; }
}

export const isCellError = (v) => v instanceof CellError;

/** Thrown by the tokenizer, parser and evaluator; converted to a CellError at the boundary. */
export class FormulaError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code} ${detail}` : code);
    this.name = 'FormulaError';
    this.code = code;
    this.detail = detail;
  }
}
