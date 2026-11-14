## What and why


## Checklist
- [ ] **No LLM-provided prices.** Every price comes from a receipt, a shelf entry, an official store API or USDA AMS (Northeast) as a stand-in; otherwise the item shows "No price". No model supplied, estimated or filled in a number.
- [ ] Every price change carries its provenance and date; `data/prices.json` was derived by `tools/derive-prices.mjs`, not hand-edited.
- [ ] No scraped data, and only free, open sources.
- [ ] Nothing private committed (receipts, recipe drafts and logs stay in `local/`).
- [ ] `node --test` passes and `data/*.json` validates.
