# Fare: notes for Claude Code

Read `docs/PRODUCT.md` first. It holds the product principles, data model and roadmap.

## Conventions
- **No build step.** The app is `index.html`: plain HTML, CSS and vanilla JS. Don't add npm, bundlers or frameworks. If the file grows past about 1,500 lines, propose Vite + Preact before splitting it.
- **Data is separate from UI.** Catalog and config live in `data/*.json` and are loaded at boot. To change what we recommend (recipes, ingredients, prices, stores), edit the JSON and leave the code alone. Catalog changes go through a PR so they get reviewed.
- **Rules are code, taste is the LLM.** Prices, food rules, store routing and macros stay deterministic. Never let generated text invent foods or prices.
- **Every recommendation has a "why".** New recipes and ingredients need one, and it should keep evidence separate from preference.
- **State** lives in localStorage under `KEY` in `index.html`. Bump the key only when the saved state shape changes in a way that breaks it.
- Use relative paths (`data/...`), because the site is served from `/fare/` on GitHub Pages.
- Keep each session to one feature. When a product decision changes, update `docs/PRODUCT.md`.

## Run and check
- `python3 -m http.server 8000`, then open http://localhost:8000/. `file://` won't work because of fetch.
- Validate the data with `python3 -m json.tool data/catalog.json > /dev/null` (repeat for each file).
- Smoke test: profile → plan → swap → approve → grocery list → store slider → CSV download → feedback. The console should stay clean.

## Deploy
Push to `main`. GitHub Pages serves the repo root (`.nojekyll` is present).
