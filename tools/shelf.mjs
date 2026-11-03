#!/usr/bin/env node
// Log shelf prices copied from the app's Prices tab ("Copy my prices"). No API calls.
//   pbpaste | node tools/shelf.mjs      or      node tools/shelf.mjs <file.json>
// Prices go to local/observations.json as provenance "manual", then data/prices.json is rebuilt. Re-running is safe:
// one item, store and date is one price, and the latest paste replaces it.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { packRatio } from './receipt-lib.mjs';
import { run as derivePrices } from './derive-prices.mjs';

const ROOT = new URL('..', import.meta.url);

// Turns a pasted payload into observations. Anything that can't be checked is listed in `problems`, never guessed.
export function toObservations(payload, catalog, today = new Date().toISOString().slice(0, 10)) {
  if (!payload || payload.fare_shelf_prices !== 1 || !Array.isArray(payload.entries)) throw new Error('This is not a "Copy my prices" paste from the Prices tab.');
  const stores = new Set(catalog.STORES.map(s => s.id));
  const observations = [], problems = [];
  for (const e of payload.entries) {
    const label = `${e.ingredient_id} at ${e.store_id}`;
    const ing = catalog.ING[e.ingredient_id];
    if (!ing) { problems.push(`${label}: not in the catalog`); continue; }
    if (!stores.has(e.store_id)) { problems.push(`${label}: unknown store`); continue; }
    if (!(e.entered_price > 0)) { problems.push(`${label}: no price`); continue; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.observed_on || '')) { problems.push(`${label}: no date`); continue; }
    const ratio = packRatio(e.store_pack, ing[2]);
    if (!ratio) { problems.push(`${label}: can't compare pack "${e.store_pack}" with "${ing[2]}"`); continue; }
    observations.push({
      id: `shelf-${e.ingredient_id}-${e.store_id}-${e.observed_on}${e.on_sale ? '-sale' : ''}`, ingredient_id: e.ingredient_id, description: 'Shelf price', store_id: e.store_id,
      price: Math.round(e.entered_price / ratio * 100) / 100, pack: ing[2], store_pack: e.store_pack, purchased_on: e.observed_on, logged_on: today,
      provenance: 'manual', on_sale: !!e.on_sale, needs_review: false,
    });
  }
  return { observations, problems };
}

// The new entries replace any earlier paste with the same id; everything else in the log is untouched.
export function merge(existing, incoming) {
  const ids = new Set(incoming.map(o => o.id));
  return [...existing.filter(o => !ids.has(o.id)), ...incoming];
}

function main() {
  const file = process.argv[2];
  const text = readFileSync(file || 0, 'utf8');
  let parsed;
  try { parsed = toObservations(JSON.parse(text), JSON.parse(readFileSync(new URL('data/catalog.json', ROOT), 'utf8'))); }
  catch (e) { console.error(`Can't read these prices: ${e.message}`); process.exit(1); }
  const log = new URL('local/observations.json', ROOT);
  mkdirSync(new URL('local/', ROOT), { recursive: true });
  const existing = existsSync(log) ? JSON.parse(readFileSync(log, 'utf8')) : [];
  writeFileSync(log, JSON.stringify(merge(existing, parsed.observations), null, 2) + '\n');
  console.log(`Logged ${parsed.observations.length} shelf prices to local/observations.json.`);
  if (parsed.problems.length) console.log(`Skipped ${parsed.problems.length}:\n  ${parsed.problems.join('\n  ')}`);
  derivePrices();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
