# Fare: receipt logging and price sources

> Real prices from real receipts, every price labelled with where it came from, at a fraction of a cent per receipt.

Status: proposed, v0.1 (Oct 2026). Owner: Magnus. Read with [PRODUCT.md](PRODUCT.md).

---

## 1. Goal

Replace illustrative prices with prices read from receipts, item by item, so Fare can show true differences in price, products and produce between stores. Where no receipt exists yet, fall back to clearly labelled estimates.

**MVP success:** after 4 receipts, at least 80% of a typical week's grocery list is priced from receipts under 180 days old at the stores Magnus uses, and every wrong line was caught by the totals check or human review.

## 2. Scope

| Now (Phase 0, local tool) | Later (Phase 1, with Supabase) | Not planned |
|---|---|---|
| `tools/receipt.mjs` for phone photos and PDFs (email receipts saved as PDF) | In-app "Add receipt" upload to a private bucket | Scraping store websites |
| One vision-LLM extraction call per receipt | Inbound email address for forwarded receipts | Classic OCR engines, paid receipt APIs |
| Alias matching with one human confirmation per new alias | Admin role with row-level security | A separate search service |
| Price observation log + derived current prices in `data/` | User export of their own receipts and prices | Price charts, coupons, nutrition from receipts |
| Local admin page, spend guard and usage ledger | Kroger Product API fallback; reviewed ToS and privacy policy | |

## 3. Pipeline

```
Receipt in (photo / PDF)
  -> vision extraction (Claude Haiku 5.5, JSON schema)          # the only LLM step
  -> totals check (lines + tax - discounts = total +/- $0.02)    # fail = needs_review
  -> match to catalog (alias table, else model suggestion you confirm)
  -> price observation log (append-only, with receipt reference)
  -> current price per (ingredient, store)  <- fallbacks when no receipt
  -> app price breakdown + admin view, each price labelled by source
```

**Ingestion.** Images are resized to a 1,600 px long edge (HEIC converted to JPEG). PDFs go to the model directly. Duplicates are caught by file SHA-256 and by (store, date, total).

**Extraction.** Returns store name and location, purchase date and time, subtotal, tax, total, a verbatim `raw_text` transcript, and per line: printed text, qty, weight, unit, unit price, line total, discount, suggested ingredient id (enum of catalog ids or `none`), pack size, confidence 0 to 1. Payment card digits, loyalty ids and names are never returned or stored. Sonnet 5.5 is an optional retry for low-confidence receipts.

**Why a vision LLM and not OCR.** About $0.001 per receipt (about 2.5K input and 1.5K output tokens at section 6 prices) returns structure and searchable text in one call. Tesseract is free but needs image cleanup and per-store parsers; paid receipt APIs solve extraction but not catalog matching, which is the hard part.

**Search.** `raw_text` is the searchable layer: substring search on the admin page now, a `tsvector` column with a GIN index in Supabase later.

**Matching.** `data/aliases.json` maps (store, normalized text) to an ingredient id. Misses get the model's suggestion, which a human accepts, corrects or skips; confirmations become aliases. Units are normalized in code to Fare's pack and a unit price per lb, oz or each (a medium apple is about 0.4 lb). Lines that break the product principles are kept in the receipt record but never priced.

## 4. Data

`data/price_observations.json` (append-only):

```
{id, ingredient_id, description, store_id, store_location, price, pack, unit_price, unit,
 purchased_on, logged_on, receipt_id, line_no, provenance, confidence, on_sale, needs_review}
```

`data/prices.json` is derived, never hand-edited: for each (ingredient, store), the newest reviewed, non-sale receipt observation. Older observations stay in the log with their references.

Also: `receipts/<id>.json` (full extraction, gitignored, as are the images), `data/aliases.json`, `logs/llm_usage.jsonl` (gitignored).

In Supabase this extends the planned `prices` table with `description, unit_price, receipt_id, line_no, provenance, confidence, on_sale, needs_review, logged_on`, plus `receipts` and `receipt_lines` tables.

## 5. Refresh and staleness

Every observation is logged. A newer receipt for the same store and product replaces the current price and keeps the old one in history. At 90 to 180 days a receipt price is due for a refresh (shown in the admin view); past 180 days it is stale and drops a confidence level. Sale prices are kept and flagged but never set the current price on their own.

## 6. Price sources and labels

| Rank | Source | Label in the app | Confidence |
|---|---|---|---|
| 1 | Receipt under 180 days | Receipt · date | High |
| 2 | Manual entry (shelf price typed in) | Logged · date | High |
| 3 | Store's official API (Kroger Product API) | Kroger listing · date | Medium |
| 4 | Online listing with saved URL | Online estimate | Low to medium |
| 5 | Median of public averages (BLS, USDA AMS) scaled by store | Typical price | Low |

Scraping is excluded: store terms prohibit it, sites break scrapers silently, and the legal position on scraping public pages is unsettled. Revisit only with legal advice and a public product.

## 7. Admin view

`admin/prices.html`, for Magnus only: product, description, store, price, unit price, purchased on, logged on, receipt reference, provenance, confidence and flags, with filters, receipt text search, a per-product store comparison, receipt coverage of this week's list, and the spend summary. Not linked from the app and excluded from the GitHub Pages deploy (an unlinked page on Pages is still public). In Phase 1 it moves behind Supabase auth with an admin claim.

## 8. Spend caps and monitoring

Every LLM call goes through one guard (`tools/llm.mjs`). Limits live in one config file.

| Control | Default | When hit |
|---|---|---|
| Per-document cap | $0.05 | Stop calling for that document; mark needs_review |
| Checkpoint | Every $5 cumulative | Ask "Continue for another $5? [y/N]"; no, no answer or non-interactive = pause |
| Daily cap | $1 | No calls until tomorrow |
| Pre-call estimate | Token counting endpoint | Calls that would cross a cap are never sent |
| Backstop | Dedicated API key, $10/month limit in the Anthropic Console | Provider refuses calls |

Each call is logged to `logs/llm_usage.jsonl` (time, document id, model, input/output/cached tokens, USD from `tools/pricing.json`, latency, outcome, retry number). `node tools/spend.mjs` reports spend by day, week, month, model and document and flags any call over $0.02. Reconcile with the Anthropic Console monthly; a gap over 5% means the price table is stale.

## 9. Data ownership and privacy

- Users own their receipts and can export (Phase 1) and delete them. Fare keeps a license to de-identified price observations (store, product, price, date) after deletion.
- Payment and loyalty fields are dropped at extraction. Images are kept out of git and, in Phase 1, deleted 90 days after verified extraction.
- Images are processed by Anthropic's API; the privacy policy must say so.
- **Legal review required** before anyone other than Magnus uploads receipts: Terms of Service, privacy policy, retention and deletion (CCPA and similar laws).

## 10. Testing and trust

1. **Real receipts:** draft expected JSON from the extraction, then Magnus corrects it line by line against the paper receipt. That file is ground truth and is never edited to make a test pass.
2. **Synthetic fixtures:** at least 8 rendered receipts with known values covering abbreviations, weighed items, multi-buys, discounts, sale prices, partial tax, a rotated low-contrast photo, a non-catalog item, and a non-principled item.
3. **Field-level accuracy:** store, date and total exact; line totals within $0.01; ingredient match precision and recall; unit price within 1%. Targets: totals 100%, line prices 98%+, matches 95%+ after alias confirmation, zero priced non-principled items.
4. **Deterministic unit tests:** totals check, unit normalization, aliases, dedup, the derive step (newest wins, sale never wins alone, staleness, fallback order, references kept), PII stripping, and the spend guard against a mocked API.
5. **Model comparison:** Haiku 5.5 vs Sonnet 5.5 on the real receipts, accuracy and cost per receipt from the ledger.
6. **Human sign-off:** a side-by-side review per real receipt before `data/prices.json` is committed.

Why it can be trusted: the totals check verifies every receipt with no ground truth needed, synthetic fixtures give exact answers for the hard cases, and the human-corrected real receipts are ground truth the model cannot have influenced. What still gets through: a wrong match on a line whose price is right (caught only by review), and stores whose receipts omit unit sizes.

## 11. Phase 0 decisions (Oct 26, 2026, starter logic, subject to change)

- **Only `data/prices.json` is committed.** Receipts, extractions, the observation log, aliases, usage logs and the admin page all live in one gitignored `local/` folder. View them at http://127.0.0.1:8000/local/ with `python3 -m http.server 8000 --bind 127.0.0.1` (the bind keeps the page off your network). Nothing in `local/` is backed up by git, so copy it somewhere safe.
- **Stores:** Costco (`costco`), Trader Joe's (`traderjoes`), Wild Fork (`wildfork`), ShopRite (`shoprite`). Kroger and Whole Foods are gone. Until a receipt prices them, Wild Fork and ShopRite have no prices and are never picked.
- **Models:** Haiku 5.5 at low effort only. Sonnet or more thinking is opt-in per receipt and capped at about 4,000 output tokens, inside the $0.05 per-document cap. A low-confidence receipt goes to human review before it goes to a bigger model.
- **Rendering synthetic receipts and screenshots (trial):** headless Chrome, already installed, takes the place of Playwright. Pros: no dependency; `--dump-dom` and `--screenshot` are enough to check that a view renders. Cons, found so far: no scripted clicks or waits; console capture through `--enable-logging` is noisy; and **the viewport never goes below 500 px**, so the 390 px phone check can't be done this way. Fallback: Claude in Chrome (resize the window) or the browser's device toolbar for phone width, and Playwright as a dev-only dependency if this keeps falling short. Record what we learn here.
- **Intake: Markdown via Claude chat (decided).** No API key, SDK or spend guard in Phase 0; sections 3 and 8 describe the later automated route, which will write the same Markdown.
  1. `node tools/receipt.mjs prompt` prints the prompt. Paste it into Claude chat with the photo (card digits and member number covered).
  2. Save the reply as `local/receipts/<date>-<store>.md` and correct it against the paper receipt. The corrected file is that receipt's ground truth.
  3. `node tools/receipt.mjs check <file>` parses it and runs the totals check.
  4. `node tools/receipt.mjs add <file>` asks you to confirm each new match (it warns when the printed text lacks the sourcing word the rule needs, e.g. "ORG"). It converts store packs to catalog packs, asking when units can't be compared, and appends to `local/observations.json` and `local/aliases.json`. Then it rebuilds `data/prices.json`.
     With `--yes`, the reviewed file is the confirmation: no questions are asked, warnings still print, and lines missing a catalog id or a usable `pack` size are skipped and listed, never guessed. Fill those in and re-run; logged lines are never repeated. This is the default way to log, since it runs inside a Claude Code session.
  5. Commit `data/prices.json`. Browse everything at `local/admin.html`.
- **Fallback prices:** `data/estimates.json` holds one store-less price per catalog pack, each with a source. Routing compares stores on real prices only. An item with no real price in a store set rides along at that set's main store for its aisle (the "always include" store, else the one with the most real prices), priced at the cheapest real price you've paid at any of your stores ("Estimate · Wild Fork price"), else the estimate. A placeholder never undercuts a real price, so a store with real data is never penalised against made-up numbers. Savings between stores show only once both have real prices.
- **Aisles per store:** a store may list the aisles it carries (`carries` in `STORES`). Wild Fork carries "Meat & fish" only, so it is never picked for produce or pantry.
- **Shelf prices in the app (Oct 31):** "Edit price" on any grocery item logs a price you saw for any store and pack size, converted to the catalog pack and saved in that browser as "Logged · date". The newer of a receipt price and a logged price wins. Logged prices stay in the browser (localStorage) until Phase 1 adds accounts. The app labels each price (Receipt · date, Estimate, Not priced yet) and shows how much of the total is estimated. Estimates from Claude chat are allowed only with a named source, typed in by hand. The prototype's old per-store prices are now placeholder estimates.
- **Simplifications to revisit:** a sale-only price never becomes current, so that item stays on its estimate. The list buys catalog packs even when the store sells another size (Costco eggs come in 24s).
- **Ids follow the receipts (Oct 31):** `traderjoes`, `grdbeef` (ground beef), `whitepotatoes` (gold or russet). Saved browser state with the old ids (`tj`, `beef`, `potatoes`) is migrated at load. Lines bought for someone else (e.g. the baby's food pouches) are marked `-` and never tracked.
- **Flags at intake:** `add` shows an ingredient's flags when you confirm a match, and the admin page lists them. Checks you still make by eye: whether the TJ eggs and bone broth are pasture-raised and organic (yes, per Magnus). The TJ bone broth carton is 17 oz.
- **Ounces first (Nov 2):** catalog packs and recipe amounts use oz wherever they can (1 lb = 16 oz, 1 pint = 16 oz), and fl oz for liquids. Count items (each, head, bunch, dozen, loaf) and kitchen units (tsp, tbsp, cup) stay as they are. Receipts can still say lb, and the tools convert it.
- **Items priced each but sold by weight (Nov 2):** write the count first and the weight after it, e.g. `12 ct (3 lb)` for Costco bananas. Only the count is needed: it sets the price per each, and the weight is kept in `store_pack` for reference. Leave `weight_lb` blank, since that column means the item is priced by weight.
- **Buying outside the organic rule (Nov 2):** what we actually buy is what the catalog says. An item bought conventional gets the `conv` rule and a flag. A Dirty Dozen item gets the red `dd-not-organic` flag (the TJ gold potatoes); anything else gets the amber `not-organic` flag (TJ steamed beets and sourdough, Costco yogurt and almond flour).
