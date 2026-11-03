// node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReceipt, checkTotals, packRatio, pricePerCatalogPack, parsePack } from '../tools/receipt-lib.mjs';
import { derive } from '../tools/derive-prices.mjs';

const receipt = (rows, head = 'subtotal: 21.47\ntax: 0.53\ntotal: 22.00') => `---
store: costco
date: 2026-10-18
${head}
---
| # | printed | qty | pack | weight_lb | line_total | discount | sale | ingredient |
|---|---|---|---|---|---|---|---|---|
${rows}
`;
const GOOD = receipt(`| 1 | KS ORG EGGS 24CT | 1 | 24 ct |  | 8.99 |  |  | eggs |
| 2 | GRASSFED BEEF | 1 |  | 2.25 | 13.48 | 1.00 | y | beef |`);

test('parses header and lines', () => {
  const r = parseReceipt(GOOD);
  assert.equal(r.store, 'costco');
  assert.equal(r.lines.length, 2);
  assert.deepEqual([r.lines[1].weight_lb, r.lines[1].discount, r.lines[1].sale], [2.25, 1, true]);
});

test('rejects bad files with a reason', () => {
  assert.throws(() => parseReceipt('no header'), /header/);
  assert.throws(() => parseReceipt(receipt('| 1 | X | 1 |  |  | abc |  |  | - |')), /line_total is not a number/);
  assert.throws(() => parseReceipt(GOOD.replace('2026-10-18', '10/18/26')), /YYYY-MM-DD/);
});

test('totals check: passes within 2 cents, fails beyond', () => {
  assert.deepEqual(checkTotals(parseReceipt(GOOD)), []);
  assert.equal(checkTotals(parseReceipt(GOOD.replace('total: 22.00', 'total: 22.05'))).length, 1);
  assert.equal(checkTotals(parseReceipt(GOOD.replace('8.99', '9.99'))).length, 2);
});

test('pack ratios compare like units and refuse unlike ones', () => {
  assert.equal(packRatio('24 ct', 'dozen'), 2);
  assert.equal(packRatio('2 lb', '1 lb'), 2);
  assert.equal(packRatio('40 oz', '2 lb'), 1.25);
  assert.equal(packRatio('16 oz bag', '1 lb'), 1);
  assert.equal(packRatio('each', 'bunch'), null);
  assert.equal(packRatio('12 ct (3 lb)', 'each'), 12); // count sets the price; the weight is kept for reference
  assert.deepEqual(parsePack('15 oz can'), { n: 15, unit: 'oz' });
});

test('price per catalog pack: counts, weights and discounts', () => {
  const [eggs, beef] = parseReceipt(GOOD).lines;
  assert.equal(pricePerCatalogPack(eggs, 'dozen', 2), 4.495);
  assert.equal(pricePerCatalogPack(beef, '1 lb', null).toFixed(2), '5.55'); // (13.48 - 1.00) / 2.25 lb
});

test('derive: newest wins, sale and review never set the price, stale is flagged', () => {
  const o = (purchased_on, price, extra = {}) => ({ ingredient_id: 'eggs', store_id: 'costco', price, provenance: 'receipt', purchased_on, ...extra });
  const { prices, skipped } = derive([o('2026-09-01', 4.2), o('2026-10-18', 4.5), o('2026-10-20', 3.0, { on_sale: true }), o('2026-10-21', 9, { needs_review: true })], new Date('2026-10-27'));
  assert.deepEqual(prices.eggs.costco, { price: 4.5, provenance: 'receipt', observed_on: '2026-10-18' });
  assert.deepEqual(skipped, { sale: 1, review: 1 });
  assert.equal(derive([o('2026-01-02', 4)], new Date('2026-10-27')).prices.eggs.costco.stale, true);
});
