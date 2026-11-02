# Fare

One place to go each week for what to eat, why to eat it, and where it's cheapest to buy.

**Live:** https://magnus-ps.github.io/fare/

Fare suggests a weekly dinner plan (batch-cook or nightly) from a curated catalog. It gives a one-line reason for every meal and grocery item, builds a list that follows organic, Clean 15 and sourcing rules, and picks the set of stores that best balances total cost against the number of stops.

Status: Phase 0 (personal use). Static site with no backend, and state lives in your browser's localStorage. See [docs/PRODUCT.md](docs/PRODUCT.md) for the brief and roadmap.

## Run locally

The app loads its catalog from `data/` with `fetch`, so serve it over HTTP instead of opening the file directly:

```sh
python3 -m http.server 8000
# open http://localhost:8000/
```

## Layout

| Path | What |
|---|---|
| `index.html` | The whole app: markup, styles and JS, with no build step |
| `data/catalog.json` | Stores, food rules, ingredients, unit conversions, recipes, breakfasts |
| `data/prices.json` | Real prices from receipts, derived by `tools/derive-prices.mjs` |
| `data/estimates.json` | Fallback price per ingredient, each with a source |
| `data/config.json` | Eating styles, goals, portion sizes, restrictions |
| `tools/`, `tests/` | Receipt logging (`node tools/receipt.mjs`) and its tests (`node --test`) |
| `docs/PRODUCT.md` | Product brief, principles, roadmap, LLM cost plan |
| `docs/RECEIPTS.md` | Receipt logging and price sources spec |

Pushing to `main` deploys to GitHub Pages.
