# Fare: notes for Claude Code

Weekly clean-eating dinner plan, grocery list with "why", real price comparison between stores, and cheapest store route. Read `docs/PRODUCT.md` first: it holds the product principles, data model and roadmap. `docs/RECEIPTS.md` is the receipt logging and price sources spec.

## Conventions
- **No build step for the app.** The app is `index.html`: plain HTML, CSS and vanilla JS. Don't add bundlers or frameworks to it. If a page grows past about 1,500 lines, propose Vite + Preact before splitting it.
- **Local tools are Node.** `tools/` and `tests/` are Node ESM scripts (`.mjs`) that never ship to the browser. Their only dependencies are `@anthropic-ai/sdk` and `sharp`; ask before adding anything else.
- **Data is separate from UI.** Curated data (ingredients, recipes, stores, prices, EWG lists) and config live in `data/*.json` and load at boot. To change what we recommend, edit the JSON and leave the code alone. Catalog changes go through a PR so they get reviewed.
- **Rules are code, taste is the LLM.** Prices, food rules, macros and store routing are deterministic JS. The LLM only picks recipe ids from an allowed list, writes short "why" text, and reads receipts into a fixed schema. Never let generated text invent foods or prices.
- **Foods outside the principles need a flag.** Factory-farmed, processed or non-organic items may be in the catalog only with an `ING_FLAGS` entry (and the `conv` rule when sourcing falls short), so the app always shows why. Dirty Dozen and unlisted produce default to organic; Clean 15 may be conventional.
- **Every recommendation has a "why".** Every meal and grocery item carries one line, and it keeps evidence separate from preference.
- **Every price carries its provenance** (receipt, manual, store API, estimate) and a date where one exists. `data/prices.json` is derived by `tools/derive-prices.mjs`; never hand-edit it.
- **LLM calls never come from the browser.** Phase 0 makes no API calls: receipts are transcribed in Claude chat. Any automated call added later goes through a spend guard first (`docs/RECEIPTS.md` section 8), and in Phase 1 the app calls the server function, which follows the guardrails in `docs/PRODUCT.md` section 6.
- **State** lives in localStorage under `KEY` in `index.html`. Access is wrapped in try/catch and the app must work without it. Bump the key only when the saved state shape changes in a way that breaks it.
- **Private stays local.** Receipts, extractions, the observation log, aliases, usage logs and the admin page live in the gitignored `local/` folder. Only the derived `data/prices.json` is committed. The repo is public, so anything committed is public too.
- Use relative paths (`data/...`), because the site is served from `/fare/` on GitHub Pages.

## Layout
- `index.html`: the app, served at the site root
- `data/`: `catalog.json` (stores, rules, ingredients, unit conversions, recipes), `config.json` (styles, goals, portions, restrictions), `prices.json` (derived real prices), `estimates.json` (store-less fallback prices, each with a source)
- `tools/`, `tests/`: receipt logging (Markdown route), shelf price import (`tools/shelf.mjs`) and their tests
- `local/` (gitignored): receipts, observation log, aliases, `admin.html`
- `docs/`: `PRODUCT.md` (brief and roadmap), `RECEIPTS.md` (receipt logging spec)

## Workflow
- Keep each session to one feature. When a product decision changes, update `docs/PRODUCT.md` (and `docs/RECEIPTS.md` for price and receipt decisions).

## Run and check
- `python3 -m http.server 8000`, then open http://localhost:8000/. `file://` won't work because of fetch.
- Validate the data with `python3 -m json.tool data/catalog.json > /dev/null` (repeat for each file).
- `node --test` runs the price tool tests. Shelf prices copied from the Prices tab: `pbpaste | node tools/shelf.mjs`. Receipts: `node tools/receipt.mjs prompt | check <file> | add <file> [--yes]`; see `docs/RECEIPTS.md` section 11.
- Smoke test: profile → plan → swap → approve → Prices (log a price, None here) → grocery list → CSV download → feedback. The stop-value slider appears once half the list has prices from two stores. The console should stay clean.
- Check UI changes in a browser at phone width (390 px) and desktop.

## Deploy
Push to `main`. GitHub Pages serves the repo root (`.nojekyll` is present).
