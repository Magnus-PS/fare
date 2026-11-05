#!/usr/bin/env node
// Log prices from filled-in store sheets, the CSVs from the app's Prices tab (docs/RECEIPTS.md section 11). No API calls.
//   node tools/shelf.mjs fare-prices-costco.csv [more.csv ...]
// Prices go to local/observations.json as provenance "manual", then data/prices.json is rebuilt. Re-running is safe:
// one item, store and date is one price, and the latest file replaces it. index.html applies the same rules; change both together.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packRatio } from './receipt-lib.mjs';
import { run as derivePrices } from './derive-prices.mjs';

const ROOT = new URL('..', import.meta.url);
const round2 = n => Math.round(n * 100) / 100;
const localToday = () => new Date().toLocaleDateString('en-CA');
const REQUIRED = ['store', 'item_id', 'price', 'pack', 'on_sale', 'none_here', 'seen_on'];

export function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const readFlag = v => {
  const s = v.trim().toLowerCase();
  return ['', 'n', 'no', 'false', '0'].includes(s) ? false : ['y', 'yes', 'true', 'x', '1'].includes(s) ? true : null;
};
const readPrice = v => {
  const s = v.replace(/[$,\s]/g, '');
  return /^(\d+(\.\d*)?|\.\d+)$/.test(s) && Number(s) > 0 ? Number(s) : null;
};
// YYYY-MM-DD or the M/D/YYYY Sheets often exports. Null when it isn't a real date, or is in the future.
function readDate(v, today) {
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/), y, mo, d;
  if (m) [y, mo, d] = [+m[1], +m[2], +m[3]];
  else {
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})$/);
    if (!m) return null;
    [mo, d, y] = [+m[1], +m[2], +m[3] < 100 ? 2000 + +m[3] : +m[3]];
  }
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  const iso = t.toISOString().slice(0, 10);
  return iso > today ? null : iso;
}

// One sheet's text into observations. Blank price means no change. Anything that can't be checked is listed in `problems`, never guessed.
export function readSheet(name, text, catalog, today = localToday()) {
  const rows = parseCSV(text), head = (rows[0] || []).map(h => h.trim().toLowerCase());
  const out = { observations: [], none: 0, problems: [] };
  const missing = REQUIRED.filter(c => !head.includes(c));
  if (missing.length) { out.problems.push(`${name}: not a Fare price sheet (missing ${missing.join(', ')})`); return out; }
  rows.slice(1).forEach((cells, i) => {
    const get = c => (cells[head.indexOf(c)] || '').trim();
    const bad = msg => { out.problems.push(`${name} row ${i + 2}: ${msg}`); };
    if (!cells.some(c => c.trim())) return;
    const sid = get('store'), id = get('item_id'), rawPrice = get('price'), none = readFlag(get('none_here'));
    const store = catalog.STORES.find(s => s.id === sid), ing = catalog.ING[id];
    if (!store) return bad(`unknown store "${sid}"`);
    if (!ing) return bad(`unknown item "${id}"`);
    if (none === null) return bad(`can't read none_here "${get('none_here')}"; use y or leave it blank`);
    if (none && rawPrice) return bad(`${ing[0]} has a price and none_here; keep one`);
    if (store.carries && !store.carries.includes(ing[1])) return rawPrice || none ? bad(`${store.name} doesn't stock ${ing[1]}`) : undefined;
    if (!none && !rawPrice) return;
    const date = get('seen_on') ? readDate(get('seen_on'), today) : today;
    if (!date) return bad(`can't use date "${get('seen_on')}"; use a past date like 2026-11-08`);
    if (none) { out.none++; return; }
    const price = readPrice(rawPrice), onSale = readFlag(get('on_sale')), pack = get('pack') || ing[2], ratio = packRatio(pack, ing[2]);
    if (price == null) return bad(`can't read price "${rawPrice}"`);
    if (onSale === null) return bad(`can't read on_sale "${get('on_sale')}"; use y or leave it blank`);
    if (!ratio) return bad(`can't compare pack "${pack}" with ${ing[2]}; use oz or a count`);
    out.observations.push({
      id: `shelf-${id}-${sid}-${date}${onSale ? '-sale' : ''}`, ingredient_id: id, description: get('notes') ? `Shelf price: ${get('notes')}` : 'Shelf price', store_id: sid,
      price: round2(price / ratio), pack: ing[2], store_pack: pack, purchased_on: date, logged_on: today,
      provenance: 'manual', on_sale: onSale, needs_review: false,
    });
  });
  return out;
}

// New rows replace an earlier file's row with the same id; everything else in the log is untouched.
export function merge(existing, incoming) {
  const ids = new Set(incoming.map(o => o.id));
  return [...existing.filter(o => !ids.has(o.id)), ...incoming];
}

function main() {
  const files = process.argv.slice(2);
  if (!files.length) { console.log('usage: node tools/shelf.mjs <sheet.csv> [more.csv ...]'); process.exit(1); }
  const catalog = JSON.parse(readFileSync(new URL('data/catalog.json', ROOT), 'utf8'));
  const added = [], problems = [];
  let none = 0;
  for (const f of files) {
    let text;
    try { text = readFileSync(f, 'utf8'); } catch { problems.push(`${f}: can't read this file`); continue; }
    const r = readSheet(basename(f), text, catalog);
    added.push(...r.observations); problems.push(...r.problems); none += r.none;
  }
  if (added.length) {
    const log = new URL('local/observations.json', ROOT);
    mkdirSync(new URL('local/', ROOT), { recursive: true });
    writeFileSync(log, JSON.stringify(merge(existsSync(log) ? JSON.parse(readFileSync(log, 'utf8')) : [], added), null, 2) + '\n');
  }
  console.log(`Logged ${added.length} shelf prices to local/observations.json.`);
  if (none) console.log(`Skipped ${none} none_here rows: those marks stay in the app, so upload the sheet there too.`);
  if (problems.length) console.log(`Skipped ${problems.length} with problems:\n  ${problems.join('\n  ')}`);
  if (added.length) derivePrices();
  if (!added.length && problems.length) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
