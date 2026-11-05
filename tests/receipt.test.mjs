// node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReceipt, checkTotals, packRatio, pricePerCatalogPack, parsePack } from '../tools/receipt-lib.mjs';
import { derive } from '../tools/derive-prices.mjs';
import { readSheet, parseCSV, merge } from '../tools/shelf.mjs';

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

const CATALOG = {
  STORES: [{ id: 'costco', name: 'Costco' }, { id: 'wildfork', name: 'Wild Fork', carries: ['Meat & fish'] }],
  ING: { eggs: ['Eggs, pasture-raised', 'Dairy & eggs', 'dozen', 'past'], beef: ['Beef', 'Meat & fish', '16 oz', 'grass'], onion: ['Onion', 'Produce', 'each', 'c15'] },
};
const HEAD = 'store,item_id,item,aisle,must_be,compare_per,known_price,known_date,price,pack,on_sale,none_here,seen_on,notes';
const sheet = (...rows) => [HEAD, ...rows].join('\n') + '\n';
const row = ({ store = 'costco', id = 'eggs', known = '', price = '', pack = '', sale = '', none = '', seen = '', notes = '' } = {}) =>
  `${store},${id},"Eggs, pasture-raised",Dairy & eggs,Pasture-raised,dozen,${known},,${price},${pack},${sale},${none},${seen},${notes}`;
const read = text => readSheet('s.csv', text, CATALOG, '2026-11-05');

test('CSV parser handles quotes, CRLF, a byte order mark and doubled quotes', () => {
  assert.deepEqual(parseCSV('\uFEFFa,"b, c"\r\n"say ""hi""",d'), [['a', 'b, c'], ['say "hi"', 'd']]);
});

test('a sheet price converts to the catalog pack and keeps the pack as sold', () => {
  const { observations, problems } = read(sheet(row({ price: '9', pack: '24 ct', seen: '2026-11-03' })));
  assert.deepEqual(problems, []);
  const o = observations[0];
  assert.deepEqual([o.price, o.pack, o.store_pack, o.provenance, o.purchased_on, o.logged_on], [4.5, 'dozen', '24 ct', 'manual', '2026-11-03', '2026-11-05']);
});

test('blank price changes nothing, even with a known price in the row', () => {
  const r = read(sheet(row({ known: '5.99' }), row({ known: '5.99', pack: '24 ct' }), ',,,,,,,,,,,,,'));
  assert.deepEqual([r.observations, r.none, r.problems], [[], 0, []]);
});

test('Google Sheets formats are accepted', () => {
  const { observations, problems } = read(sheet(row({ price: '$6.29', sale: 'TRUE', seen: '11/3/2026' }), row({ id: 'beef', price: '7', sale: 'FALSE', seen: '11/4/26' })));
  assert.deepEqual(problems, []);
  assert.deepEqual(observations.map(o => [o.price, o.on_sale, o.purchased_on]), [[6.29, true, '2026-11-03'], [7, false, '2026-11-04']]);
});

test('blank pack uses the catalog pack, and blank date uses today', () => {
  const o = read(sheet(row({ price: '6' }))).observations[0];
  assert.deepEqual([o.store_pack, o.purchased_on, o.price], ['dozen', '2026-11-05', 6]);
});

test('rows that cannot be checked are listed by row, never guessed', () => {
  const { observations, problems } = read(sheet(
    row({ id: 'nope', price: '1' }), row({ store: 'nope', price: '1' }), row({ price: 'abc' }), row({ price: '0' }),
    row({ price: '1', pack: 'bunch' }), row({ price: '1', none: 'y' }), row({ price: '1', seen: '2026-02-30' }),
    row({ price: '1', seen: '2026-11-06' }), row({ price: '1', sale: 'maybe' }), row({ none: 'maybe' }), row({ store: 'wildfork', id: 'onion', price: '1' }),
  ));
  assert.equal(observations.length, 0);
  assert.equal(problems.length, 11);
  assert.match(problems[0], /^s\.csv row 2: unknown item/);
  assert.match(problems[10], /Wild Fork doesn't stock Produce/);
});

test('a file that is not a price sheet says so', () => {
  assert.match(read('a,b\n1,2\n').problems[0], /not a Fare price sheet \(missing store/);
});

test('none_here rows are counted, not priced', () => {
  const r = read(sheet(row({ none: 'y', notes: 'no organic' })));
  assert.deepEqual([r.observations.length, r.none, r.problems.length], [0, 1, 0]);
});

test('uploading again replaces the same item, store and date only', () => {
  const first = read(sheet(row({ price: '9', seen: '2026-11-03' }))).observations;
  const again = read(sheet(row({ price: '10', seen: '2026-11-03' }))).observations;
  const receipt = { id: 'r-1', ingredient_id: 'beef', store_id: 'costco', price: 6, purchased_on: '2026-10-01', provenance: 'receipt' };
  assert.deepEqual(merge([receipt, ...first], again).map(o => [o.id, o.price]), [['r-1', 6], ['shelf-eggs-costco-2026-11-03', 10]]);
});

test('sale prices from a sheet are kept but never set the current price', () => {
  const { observations } = read(sheet(row({ price: '4', sale: 'y' })));
  assert.deepEqual(derive(observations).prices, {});
  assert.equal(derive(observations).skipped.sale, 1);
});

test('derived prices carry the pack as sold', () => {
  const { observations } = read(sheet(row({ price: '9', pack: '24 ct' })));
  assert.equal(derive(observations).prices.eggs.costco.store_pack, '24 ct');
});
