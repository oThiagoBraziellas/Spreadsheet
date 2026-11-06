import { Sheet } from './sheet.js';
import { refToString, indexToCol, parseRef } from './refs.js';
import { isCellError } from './errors.js';
import { DEMO } from './demo.js';

const STORAGE_KEY = 'spreadsheet.v1';
const sheet = new Sheet({ cols: 26, rows: 100 });

function loadInitial() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === 'object') return saved;
  } catch { /* fall through to demo */ }
  return DEMO;
}
sheet.load(loadInitial());

const gridEl = document.getElementById('grid');
const nameBox = document.getElementById('name-box');
const formulaBar = document.getElementById('formula');
const info = document.getElementById('info');
const cells = new Map();
let selected = { col: 0, row: 0 };
let editor = null; // { input, original }

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sheet.toJSON())); } catch { /* ignore */ }
}

function buildGrid() {
  const table = document.createElement('table');
  const head = table.createTHead().insertRow();
  head.append(document.createElement('th'));
  for (let c = 0; c < sheet.cols; c++) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = indexToCol(c);
    head.append(th);
  }
  const body = table.createTBody();
  for (let r = 0; r < sheet.rows; r++) {
    const tr = body.insertRow();
    const rh = document.createElement('th');
    rh.scope = 'row';
    rh.textContent = String(r + 1);
    tr.append(rh);
    for (let c = 0; c < sheet.cols; c++) {
      const td = tr.insertCell();
      const key = refToString(c, r);
      td.dataset.key = key;
      td.dataset.col = String(c);
      td.dataset.row = String(r);
      cells.set(key, td);
    }
  }
  gridEl.replaceChildren(table);
}

function paint(key) {
  const td = cells.get(key);
  if (!td || (editor && editor.td === td)) return;
  const value = sheet.getValue(key);
  td.textContent = sheet.getDisplay(key);
  td.classList.toggle('err', isCellError(value));
  td.classList.toggle('num', typeof value === 'number');
  td.classList.toggle('formula', sheet.isFormula(key));
  td.title = isCellError(value) ? `${value.code}${value.detail ? `: ${value.detail}` : ''}` : '';
}

function paintAll() { for (const key of cells.keys()) paint(key); }

function select(col, row, { scroll = true } = {}) {
  col = Math.min(Math.max(col, 0), sheet.cols - 1);
  row = Math.min(Math.max(row, 0), sheet.rows - 1);
  cells.get(refToString(selected.col, selected.row))?.classList.remove('selected');
  selected = { col, row };
  const key = refToString(col, row);
  const td = cells.get(key);
  td.classList.add('selected');
  if (scroll) td.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  nameBox.textContent = key;
  formulaBar.value = sheet.getRaw(key);
  const deps = sheet.dependenciesOf(key);
  const users = sheet.dependentsOf(key);
  const cycle = sheet.cycleThrough(key);
  info.textContent = [
    deps.length ? `Reads: ${deps.slice(0, 8).join(', ')}${deps.length > 8 ? ` (+${deps.length - 8})` : ''}` : 'Reads: nothing',
    users.length ? `Used by: ${users.slice(0, 8).join(', ')}${users.length > 8 ? ` (+${users.length - 8})` : ''}` : 'Used by: nothing',
    cycle ? `Cycle: ${cycle.join(' → ')}` : '',
  ].filter(Boolean).join('   ·   ');
}

function commit(key, text) {
  const changed = sheet.setCell(key, text);
  for (const k of changed) paint(k);
  persist();
}

function startEdit(initial) {
  if (editor) return;
  const key = refToString(selected.col, selected.row);
  const td = cells.get(key);
  const input = document.createElement('input');
  input.className = 'cell-input';
  input.value = initial ?? sheet.getRaw(key);
  input.setAttribute('aria-label', `Edit ${key}`);
  td.textContent = '';
  td.append(input);
  editor = { input, td, key };
  input.focus();
  if (initial === undefined) input.select(); else input.setSelectionRange(input.value.length, input.value.length);
  input.addEventListener('input', () => { formulaBar.value = input.value; });
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { finishEdit(true); select(selected.col, selected.row + (e.shiftKey ? -1 : 1)); gridEl.focus(); }
    else if (e.key === 'Tab') { e.preventDefault(); finishEdit(true); select(selected.col + (e.shiftKey ? -1 : 1), selected.row); gridEl.focus(); }
    else if (e.key === 'Escape') { finishEdit(false); gridEl.focus(); }
  });
  input.addEventListener('blur', () => { if (editor && editor.input === input) finishEdit(true); });
}

function finishEdit(save) {
  if (!editor) return;
  const { input, key } = editor;
  editor = null;
  const text = input.value;
  input.remove();
  if (save && text !== sheet.getRaw(key)) commit(key, text);
  else paint(key);
  select(selected.col, selected.row, { scroll: false });
}

gridEl.tabIndex = 0;
gridEl.addEventListener('mousedown', (e) => {
  const td = e.target.closest('td');
  if (!td) return;
  if (editor && editor.td === td) return;
  finishEdit(true);
  select(Number(td.dataset.col), Number(td.dataset.row), { scroll: false });
});
gridEl.addEventListener('dblclick', (e) => { if (e.target.closest('td')) startEdit(); });

gridEl.addEventListener('keydown', (e) => {
  if (editor) return;
  const { col, row } = selected;
  const mod = e.ctrlKey || e.metaKey;
  switch (e.key) {
    case 'ArrowUp': e.preventDefault(); select(col, row - 1); return;
    case 'ArrowDown': case 'Enter': e.preventDefault(); select(col, row + (e.key === 'Enter' && e.shiftKey ? -1 : 1)); return;
    case 'ArrowLeft': e.preventDefault(); select(col - 1, row); return;
    case 'ArrowRight': e.preventDefault(); select(col + 1, row); return;
    case 'Tab': e.preventDefault(); select(col + (e.shiftKey ? -1 : 1), row); return;
    case 'Home': e.preventDefault(); select(0, mod ? 0 : row); return;
    case 'PageDown': e.preventDefault(); select(col, row + 15); return;
    case 'PageUp': e.preventDefault(); select(col, row - 15); return;
    case 'F2': e.preventDefault(); startEdit(); return;
    case 'Delete': case 'Backspace': e.preventDefault(); commit(refToString(col, row), ''); select(col, row, { scroll: false }); return;
    default:
  }
  if (!mod && e.key.length === 1) { e.preventDefault(); startEdit(e.key); }
});

formulaBar.addEventListener('keydown', (e) => {
  const key = refToString(selected.col, selected.row);
  if (e.key === 'Enter') { commit(key, formulaBar.value); select(selected.col, selected.row + 1); gridEl.focus(); }
  if (e.key === 'Escape') { formulaBar.value = sheet.getRaw(key); gridEl.focus(); }
});

nameBox.addEventListener('click', () => {
  const answer = window.prompt('Go to cell (e.g. C12)');
  const ref = answer && parseRef(answer);
  if (ref) select(ref.col, ref.row);
});

document.getElementById('export').addEventListener('click', () => {
  const blob = new Blob([sheet.toCsv()], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'spreadsheet.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
document.getElementById('demo').addEventListener('click', () => {
  sheet.load(DEMO);
  paintAll();
  persist();
  select(0, 0);
});
document.getElementById('clear').addEventListener('click', () => {
  if (!window.confirm('Clear the whole sheet?')) return;
  sheet.load({});
  paintAll();
  persist();
  select(0, 0);
});

buildGrid();
paintAll();
select(0, 0);
gridEl.focus();
