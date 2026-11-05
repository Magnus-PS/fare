// Derive data/prices.json from local/observations.json: per (ingredient, store), the newest reviewed, non-sale price.
// Only store, price, provenance, date and the pack as sold are written; receipt references stay in local/.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('..', import.meta.url);
export const STALE_DAYS = 180;

export function derive(observations, today = new Date()) {
  const best = {};
  const skipped = { sale: 0, review: 0 };
  for (const o of observations) {
    if (o.needs_review) { skipped.review++; continue; }
    if (o.on_sale) { skipped.sale++; continue; } // sale prices are kept in the log but never set the current price
    const cur = best[o.ingredient_id]?.[o.store_id];
    if (!cur || o.purchased_on > cur.observed_on)
      (best[o.ingredient_id] ??= {})[o.store_id] = { price: round2(o.price), provenance: o.provenance, observed_on: o.purchased_on, ...(o.store_pack ? { store_pack: o.store_pack } : {}) };
  }
  for (const stores of Object.values(best))
    for (const p of Object.values(stores))
      if ((today - new Date(p.observed_on)) / 864e5 > STALE_DAYS) p.stale = true;
  return { prices: best, skipped };
}
const round2 = n => Math.round(n * 100) / 100;

export function writePrices(prices) {
  const ids = Object.keys(prices).sort();
  const body = ids.map(id => `    "${id}": ${JSON.stringify(prices[id])}`).join(',\n');
  const notes = 'Derived by tools/derive-prices.mjs from receipts and typed shelf prices; do not hand-edit. Per ingredient, per store: price per catalog pack, provenance (receipt | manual | store_api), observed_on and store_pack (the pack as sold).';
  writeFileSync(new URL('data/prices.json', ROOT), `{\n  "_notes": ${JSON.stringify(notes)},\n  "prices": {${ids.length ? '\n' + body + '\n  ' : ''}}\n}\n`);
}

export function run() {
  const f = new URL('local/observations.json', ROOT);
  const obs = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : [];
  const { prices, skipped } = derive(obs);
  writePrices(prices);
  const n = Object.values(prices).reduce((s, st) => s + Object.keys(st).length, 0);
  console.log(`data/prices.json: ${n} store prices from ${obs.length} observations (skipped ${skipped.sale} sale, ${skipped.review} needing review)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run();
