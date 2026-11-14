// node --test
// Every committed price must come from an allowed source. LLM-provided prices are blocked in the product and at PR merge:
// see CLAUDE.md ("No LLM-provided prices, ever") and docs/RECEIPTS.md sections 6 and 12. Don't loosen this without a
// recorded decision there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const json = f => JSON.parse(read(f));

const STORE_PROVENANCE = new Set(['receipt', 'manual', 'store_api']);
// Stand-ins: USDA AMS advertised averages for the Northeast only. The prototype placeholders are allowed by their exact
// text until the first USDA run replaces them; add nothing new to this list.
const USDA_SOURCE = /^USDA AMS advertised average, Northeast, \S/;
const LEGACY_PLACEHOLDERS = new Set(['Placeholder from the original prototype (illustrative, not a real price)']);
const LLM_WORDS = /\b(llm|gpt|chatgpt|claude|openai|anthropic|gemini|language model|ai[- ]generated|ai[- ]estimated?|model[- ](estimate|generated|provided))\b/i;

test('store prices come only from receipts, shelf entries or an official store API', () => {
  const { prices } = json('data/prices.json');
  for (const [id, byStore] of Object.entries(prices)) {
    for (const [sid, p] of Object.entries(byStore)) {
      assert.ok(STORE_PROVENANCE.has(p.provenance), `${id} at ${sid}: provenance "${p.provenance}" is not receipt, manual or store_api`);
      assert.ok(!LLM_WORDS.test(JSON.stringify(p)), `${id} at ${sid}: mentions an LLM`);
    }
  }
});

test('stand-ins come only from USDA AMS (Northeast), never an LLM', () => {
  const { estimates } = json('data/estimates.json');
  for (const [id, e] of Object.entries(estimates)) {
    assert.ok(typeof e.source === 'string' && e.source.trim(), `${id}: estimate has no source`);
    assert.ok(!LLM_WORDS.test(JSON.stringify(e)), `${id}: estimate mentions an LLM ("${e.source}")`);
    assert.ok(USDA_SOURCE.test(e.source) || LEGACY_PLACEHOLDERS.has(e.source),
      `${id}: source "${e.source}" is not "USDA AMS advertised average, Northeast, <period>"`);
  }
});

test('the app never calls a model API', () => {
  const html = read('index.html');
  for (const host of ['api.anthropic.com', 'api.openai.com', 'generativelanguage.googleapis.com'])
    assert.ok(!html.includes(host), `index.html calls ${host}`);
});
