// Pure helpers for receipt logging: parse the Markdown transcript, check totals, convert packs.
// No I/O here, so node --test can cover all of it.
import { createHash } from 'node:crypto';

export const COLUMNS = ['#', 'printed', 'qty', 'pack', 'weight_lb', 'line_total', 'discount', 'sale', 'ingredient'];
const HEADER_KEYS = ['store', 'date', 'subtotal', 'tax', 'total'];
const num = v => (v === '' || v == null ? null : Number(String(v).replace(/[$,]/g, '')));

// Parse one receipt file: a front-matter header plus a pipe table. Throws with the line number on bad input.
export function parseReceipt(text) {
  const errors = [];
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error('missing the --- header block at the top');
  const head = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^\s*([a-z_]+)\s*:\s*(.*?)\s*$/);
    if (kv) head[kv[1]] = kv[2];
  }
  for (const k of HEADER_KEYS) if (!(k in head) && k !== 'subtotal') errors.push(`header: missing ${k}`);
  if (head.date && !/^\d{4}-\d{2}-\d{2}$/.test(head.date)) errors.push(`header: date must be YYYY-MM-DD, got "${head.date}"`);

  const rows = m[2].split('\n').map((l, i) => ({ l: l.trim(), n: i + 1 })).filter(r => r.l.startsWith('|'));
  const cells = r => r.l.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
  if (!rows.length) throw new Error('no table found');
  const cols = cells(rows[0]).map(c => c.toLowerCase());
  if (cols.join() !== COLUMNS.join()) errors.push(`table columns must be: ${COLUMNS.join(' | ')}`);

  const lines = [];
  for (const r of rows.slice(1)) {
    const c = cells(r);
    if (c.every(x => /^:?-+:?$/.test(x))) continue; // the |---| separator row
    const row = Object.fromEntries(COLUMNS.map((k, i) => [k, c[i] ?? '']));
    const line = {
      line_no: Number(row['#']), printed: row.printed, qty: num(row.qty) ?? 1, pack: row.pack,
      weight_lb: num(row.weight_lb), line_total: num(row.line_total), discount: num(row.discount) ?? 0,
      sale: /^(y|yes|true)$/i.test(row.sale), ingredient: row.ingredient || '?',
    };
    for (const k of ['qty', 'weight_lb', 'line_total', 'discount'])
      if (Number.isNaN(line[k])) errors.push(`table row ${line.line_no || '?'}: ${k} is not a number`);
    if (line.line_total == null) errors.push(`table row ${line.line_no || '?'}: line_total is empty`);
    lines.push(line);
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return {
    store: head.store, date: head.date, subtotal: num(head.subtotal), tax: num(head.tax) ?? 0, total: num(head.total),
    lines, id: createHash('sha256').update(text).digest('hex').slice(0, 12),
  };
}

// lines - discounts + tax must equal the printed total within 2 cents (and the subtotal, if printed).
export function checkTotals(r) {
  const cents = n => Math.round(n * 100);
  const items = r.lines.reduce((s, l) => s + cents(l.line_total) - cents(l.discount), 0);
  const problems = [];
  if (r.subtotal != null && Math.abs(items - cents(r.subtotal)) > 2)
    problems.push(`lines add up to ${(items / 100).toFixed(2)} but the subtotal is ${r.subtotal.toFixed(2)}`);
  if (Math.abs(items + cents(r.tax) - cents(r.total)) > 2)
    problems.push(`lines + tax = ${((items + cents(r.tax)) / 100).toFixed(2)} but the total is ${r.total.toFixed(2)}`);
  return problems;
}

// "24 ct" -> {n:24, unit:'ct'}; "15 oz can" -> {n:15, unit:'oz'}; "dozen" -> {n:12, unit:'ct'}; "bunch" -> {n:1, unit:'bunch'}
const UNIT = { lb: 'lb', lbs: 'lb', pound: 'lb', oz: 'oz', ounce: 'oz', ct: 'ct', count: 'ct', each: 'ct', ea: 'ct', dozen: 'dozen', doz: 'dozen' };
export function parsePack(s) {
  const m = String(s || '').toLowerCase().match(/^\s*(\d+(?:\.\d+)?)?\s*(fl oz|[a-z]+)/);
  if (!m) return null;
  let n = m[1] ? Number(m[1]) : 1, unit = UNIT[m[2]] || m[2];
  if (unit === 'dozen') { n *= 12; unit = 'ct'; }
  return { n, unit };
}
const BASE = { oz: ['w', 1], lb: ['w', 16] };
// How many catalog packs one store pack holds, or null when the units can't be compared (then a person decides).
export function packRatio(storePack, catalogPack) {
  const a = parsePack(storePack), b = parsePack(catalogPack);
  if (!a || !b) return null;
  if (a.unit === b.unit) return a.n / b.n;
  if (BASE[a.unit] && BASE[b.unit]) return (a.n * BASE[a.unit][1]) / (b.n * BASE[b.unit][1]);
  return null;
}

// Paid per catalog pack for one line. Weighed lines use weight_lb as the store pack.
export function pricePerCatalogPack(line, catalogPack, ratio) {
  const paid = line.line_total - line.discount;
  if (line.weight_lb) return paid / (ratio ?? packRatio(`${line.weight_lb} lb`, catalogPack));
  return paid / line.qty / ratio;
}

export const normalize = s => String(s).toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

// Words a receipt usually prints when an item meets our sourcing rules (keta, chum and sockeye salmon are wild-caught). Missing ones get a warning before confirming.
export const SOURCING_WORDS = { wild: /WILD|KETA|CHUM|SOCKEYE/, past: /PAST|ORG/, grass: /GRASS|GF/, dairy: /ORG|GRASS/, dd: /ORG/, org: /ORG/, pantry: /ORG/ };
