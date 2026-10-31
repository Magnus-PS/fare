#!/usr/bin/env node
// Receipt logging, Markdown route (docs/RECEIPTS.md section 11). No API calls.
//   node tools/receipt.mjs prompt              print the prompt to paste into Claude chat with your receipt photo
//   node tools/receipt.mjs check <file.md>     parse and run the totals check; changes nothing
//   node tools/receipt.mjs add <file.md>       confirm matches, log prices to local/, rebuild data/prices.json
//   node tools/receipt.mjs add <file.md> --yes the reviewed file is the confirmation: no questions; lines missing
//                                              an id or a usable pack size are skipped and listed, never guessed
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { parseReceipt, checkTotals, packRatio, pricePerCatalogPack, normalize, SOURCING_WORDS, COLUMNS } from './receipt-lib.mjs';
import { run as derivePrices } from './derive-prices.mjs';

const ROOT = new URL('..', import.meta.url);
const catalog = JSON.parse(readFileSync(new URL('data/catalog.json', ROOT), 'utf8'));
const LOCAL = new URL('local/', ROOT);
const readLocal = (name, empty) => { const f = new URL(name, LOCAL); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : empty; };
const writeLocal = (name, data) => { mkdirSync(LOCAL, { recursive: true }); writeFileSync(new URL(name, LOCAL), JSON.stringify(data, null, 2) + '\n'); };

const args = process.argv.slice(2), yes = args.includes('--yes');
const [cmd, file] = args.filter(a => a !== '--yes');
if (cmd === 'prompt') prompt();
else if (cmd === 'check' && file) report(load(file));
else if (cmd === 'add' && file) await add(load(file));
else { console.log('usage: node tools/receipt.mjs prompt | check <file.md> | add <file.md> [--yes]'); process.exit(1); }

function prompt() {
  const stores = catalog.STORES.map(s => `${s.id} (${s.name})`).join(', ');
  const ings = Object.entries(catalog.ING).map(([id, d]) => `${id}: ${d[0]}, ${d[2]}`).join('\n');
  console.log(`Transcribe the attached grocery receipt into the exact Markdown format below. Output only the Markdown, in one code block.

Rules:
- Copy what is printed. Don't guess at text you can't read; write ??? in its place.
- Never include card numbers, loyalty or member numbers, names or cashier ids.
- store: one of ${stores}. date: YYYY-MM-DD. subtotal, tax and total exactly as printed (subtotal blank if none is printed).
- One table row per item line, numbered from 1 in receipt order.
- qty: units bought (1 if not shown). pack: the package size if printed or obvious from the text (e.g. "24 ct", "2 lb", "15 oz"), else blank.
- weight_lb: for items sold by weight, the weight in lb; else blank.
- line_total: the amount printed for the line, before any discount.
- discount: a positive amount taken off this item (coupon, instant savings) if the receipt shows which item it applies to. If it doesn't, add its own row with ingredient "-" and a negative line_total.
- sale: y if the receipt marks the item as on sale or discounted, else blank.
- ingredient: the best matching id from the list below, "?" if unsure, "-" if the item isn't on the list (including bags, deposits and non-food).
  Only match when it is the same kind of product: conventional chicken is not "Chicken thighs, pasture-raised".

---
store: costco
date: 2026-10-18
subtotal: 142.37
tax: 3.12
total: 145.49
---
| ${COLUMNS.join(' | ')} |
|${COLUMNS.map(() => '---').join('|')}|
| 1 | KS ORG EGGS 24CT | 1 | 24 ct |  | 8.99 |  |  | eggs |
| 2 | BANANAS | 1 | 3 lb |  | 1.99 |  |  | - |

Ingredient ids:
${ings}`);
}

function load(path) {
  try { return parseReceipt(readFileSync(path, 'utf8')); }
  catch (e) { console.error(`${path}: can't read this receipt\n${e.message}`); process.exit(1); }
}

function report(r) {
  if (!catalog.STORES.some(s => s.id === r.store)) console.log(`! unknown store "${r.store}"; use one of ${catalog.STORES.map(s => s.id).join(', ')}`);
  console.log(`${r.store} ${r.date}: ${r.lines.length} lines, total ${r.total}`);
  for (const l of r.lines) {
    const ing = catalog.ING[l.ingredient];
    const unknown = !ing && !['-', '?'].includes(l.ingredient);
    console.log(`  ${String(l.line_no).padStart(2)}  ${l.printed.padEnd(28)} ${String(l.line_total).padStart(7)}${l.discount ? ` -${l.discount}` : ''}${l.sale ? ' sale' : ''}  -> ${ing ? ing[0] : l.ingredient}${unknown ? ' (not in catalog)' : ''}`);
  }
  const missing = [...new Set(r.lines.filter(l => !catalog.ING[l.ingredient] && !['-', '?'].includes(l.ingredient)).map(l => l.ingredient))];
  if (missing.length) console.log(`Not in the catalog yet (add skips these lines until they are): ${missing.join(', ')}`);
  const problems = checkTotals(r);
  console.log(problems.length ? `Totals check FAILED:\n  ${problems.join('\n  ')}\nFix the file against the paper receipt before adding it.` : 'Totals check passed.');
  return problems;
}

async function add(r) {
  if (report(r).length) process.exit(1);
  if (!catalog.STORES.some(s => s.id === r.store)) process.exit(1);
  const observations = readLocal('observations.json', []);
  // A receipt is its store, date and total; re-running add only picks up lines not logged before (e.g. after adding an ingredient)
  const done = new Set(observations.filter(o => o.store_id === r.store && o.purchased_on === r.date && o.receipt_total === r.total).map(o => o.line_no));
  if (done.size) console.log(`${done.size} lines of this receipt are already logged; only the rest are asked about.`);
  if (!yes && !process.stdin.isTTY) { console.error('add needs a terminal to confirm matches, or --yes to take the reviewed file as confirmation.'); process.exit(1); }
  const aliases = readLocal('aliases.json', {});
  const rl = yes ? null : createInterface({ input: process.stdin, output: process.stdout });
  const ask = async q => (await rl.question(q)).trim();
  const added = [], skipped = [];
  const skip = (l, why) => { skipped.push(`#${l.line_no} ${l.printed}: ${why}`); };

  for (const l of r.lines) {
    if (l.line_total <= 0 || done.has(l.line_no)) continue;
    const key = `${r.store}|${normalize(l.printed)}`;
    let id = aliases[key];
    if (yes && l.ingredient !== '-' && catalog.ING[l.ingredient] && id && id !== l.ingredient) {
      console.log(`  #${l.line_no} the file says ${l.ingredient}; replacing the earlier match ${id}`);
      id = '';
    }
    if (!id) {
      if (l.ingredient === '-') continue; // not something we price
      const guess = catalog.ING[l.ingredient] ? l.ingredient : '';
      const d = guess && catalog.ING[guess];
      const flags = guess ? (catalog.ING_FLAGS?.[guess] || []).map(f => catalog.FLAGS[f].label) : [];
      const warn = (d && SOURCING_WORDS[d[3]] && !SOURCING_WORDS[d[3]].test(normalize(l.printed)) ? `  ! receipt text doesn't say ${catalog.RULES[d[3]].label.toLowerCase()}` : '')
        + (flags.length ? `  [flag: ${flags.join(', ')}]` : '');
      if (yes) {
        if (!guess) { skip(l, l.ingredient === '?' ? 'ingredient is "?"; set an id or "-"' : `"${l.ingredient}" is not in the catalog`); continue; }
        if (warn) console.log(`  #${l.line_no} ${l.printed} -> ${d[0]}${warn}`);
        id = aliases[key] = guess;
      } else {
        const a = await ask(`\n#${l.line_no} "${l.printed}" ${guess ? `-> ${d[0]} (${d[2]})${warn}\n  Enter = yes, an id = that ingredient, s = skip: ` : `-> no match. An ingredient id, or Enter to skip: `}`);
        id = a === '' ? guess : a === 's' ? '' : a;
        if (!id) continue;
        if (!catalog.ING[id]) { console.log(`  unknown id "${id}", skipped`); continue; }
        aliases[key] = id; // one confirmation per new alias
      }
    }
    const catPack = catalog.ING[id][2];
    let storePack = l.pack;
    if (yes && !l.weight_lb && !storePack) { skip(l, `no pack size; fill the pack column (catalog pack is ${catPack})`); continue; }
    if (yes && !l.weight_lb && packRatio(storePack, catPack) == null) { skip(l, `can't compare pack "${storePack}" with the catalog's "${catPack}"; write it in the same unit`); continue; }
    if (!l.weight_lb && !storePack) {
      storePack = await ask(`  #${l.line_no} the receipt shows no pack size. Size of one (e.g. "2 lb", "18 oz", "24 ct"), Enter if it's the catalog's ${catPack}, s = skip: `) || catPack;
      if (storePack === 's') { console.log('  skipped'); continue; }
    }
    let ratio = l.weight_lb ? null : packRatio(storePack, catPack);
    if (!l.weight_lb && ratio == null) {
      const a = await ask(`  #${l.line_no} store pack "${storePack}" vs catalog pack "${catPack}": how many catalog packs is one store pack? `);
      ratio = Number(a);
      if (!(ratio > 0)) { console.log('  skipped'); continue; }
    }
    if (l.weight_lb && packRatio(`${l.weight_lb} lb`, catPack) == null) { console.log(`  #${l.line_no} sold by weight but the catalog pack is "${catPack}"; skipped`); continue; }
    const price = pricePerCatalogPack(l, catPack, ratio);
    added.push({
      id: `${r.id}-${l.line_no}`, ingredient_id: id, description: l.printed, store_id: r.store, price: Math.round(price * 100) / 100,
      pack: catPack, store_pack: l.weight_lb ? `${l.weight_lb} lb` : storePack, purchased_on: r.date, logged_on: new Date().toISOString().slice(0, 10),
      receipt_id: r.id, receipt_total: r.total, line_no: l.line_no, provenance: 'receipt', on_sale: l.sale || l.discount > 0, needs_review: false,
    });
    console.log(`  ${catalog.ING[id][0]}: $${price.toFixed(2)} per ${catPack}${l.sale || l.discount > 0 ? ' (sale, logged but not used as the current price)' : ''}`);
  }
  rl?.close();
  writeLocal('observations.json', [...observations, ...added]);
  writeLocal('aliases.json', aliases);
  console.log(`\nLogged ${added.length} prices to local/observations.json.`);
  if (skipped.length) console.log(`Skipped ${skipped.length} (fix the file and re-run; logged lines are not repeated):\n  ${skipped.join('\n  ')}`);
  derivePrices();
}
