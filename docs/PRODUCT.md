# Fare: product brief

> One place to go each week for what to eat, why to eat it, and where it's cheapest to buy.

Status: ideation, v0.3 (Nov 2026). Owner: Magnus.

---

## 1. Vision

Clean eating with less thought. Every week Fare hands you a meal plan you already mostly agree with, the reasons behind it, a grocery list that only contains food worth buying, and a shopping route that fits how *you* like to shop (one stop, cheapest, or your favourite chain).

Prices come from real receipts and shelf prices wherever possible, and every price says where it came from (receipt, shelf, store listing or stand-in). See [RECEIPTS.md](RECEIPTS.md).

It starts as Magnus's own weekly routine, systematized. If it saves him an hour a week, it goes to a handful of friends. If it saves them time too, it earns a public version.

### Who it's for (in order)

1. **Magnus**: already does this weekly by hand (plan, list, cost tracking). The bar: Fare replaces the spreadsheet.
2. **5 to 15 friends**: similar values, different goals, restrictions and shopping habits. The bar: they use it 3 weeks in a row without being nagged.
3. **Public**: only after 2 is true.

### What success looks like

| Stage | Signal |
|---|---|
| Me | I approve a plan in under 5 minutes and stop opening my old spreadsheet |
| Friends | 60%+ of invited friends approve a plan in 3 consecutive weeks |
| Friends | Median 2 or fewer swaps per plan by week 3 (the profile is "learning") |
| Public | Friends ask to invite others |

---

## 2. Product principles

1. **Unhealthy options never appear unlabelled.** The catalog is curated, and Fare's own recommendations stay inside the principles: no "budget" factory-farmed tier. Things you actually buy that fall outside them (processed meat, conventional beef, non-organic cheese, a jarred item to double-check) can be tracked and priced, but always carry a flag with its reason: *Processed meat · in moderation*, *In moderation*, *Not grass-fed*, *Confirm organic*, *Check the label*, *Contains alcohol*. Flags live in `data/catalog.json` (`FLAGS`, `ING_FLAGS`).
2. **Organic by default, conventional when it doesn't matter.** Dirty Dozen and anything not on a list: organic. Clean 15: conventional is fine, and we say so (that's where the savings come from). A Dirty Dozen item we actually buy conventional stays in the catalog with a red flag, so the break from the rule is always visible. Meat and fish: wild-caught, pasture-raised, grass-fed.
3. **Every recommendation has a "why".** One line, plain language, on every meal and every grocery item. Distinguish *evidence* ("Dirty Dozen: highest pesticide residue in USDA testing") from *preference* ("we prefer grass-fed for animal welfare and fat profile"). Credibility is the product.
4. **Recommend, then listen.** Fare proposes; the person swaps, thumbs-down, or overrides. Every override is a signal that improves next week.
5. **Rules are code, taste is the LLM.** Prices, food rules, store routing and macros are deterministic. The LLM only chooses among pre-approved recipes and writes the why. It can't invent a food we wouldn't sell or a price that doesn't exist.
6. **Less thought.** Defaults for everything. Onboarding in under 2 minutes. The weekly loop is: open, glance, approve, shop.

---

## 3. The core loop

```
Profile ──► Proposed plan + guidelines + macros ──► Swap / thumbs / approve
   ▲                                                         │
   └──────────── learned preferences (likes, dislikes) ◄─────┘
                                                             ▼
                     Prices (real vs stand-in, by store) ──► Grocery list (with why) ──► Store plan
                                                             ▼
                               Log prices (shelf or receipt) ──► better prices
```

**Dinner only for now (Nov 3).** Fare plans and prices dinners only until dinner works end to end. Ingredients that might serve breakfast or lunch can stay in the catalog and be logged, but they aren't planned or counted. `BREAKFASTS` stays in `data/catalog.json`, unused.

**Two ways to cook** (chosen in the profile):
- **Batch cook (default):** 3 recipes that reheat well, at least 4 servings each (2 dinners per recipe for the household), cooked in one session and reheated across 6 nights. Mon to Wed come from the fridge; Thu to Sat portions are frozen and thawed the night before (cooked food keeps 3 to 4 days in the fridge). Night 7 is a **flex night**: a cheat takeout (pizza), a healthier takeout (a Chipotle-style bowl), or one new recipe cooked fresh, which adds its ingredients to the list. Recipes carry a `batch` flag and a `keeps` note.
- **Cook most nights:** 3 to 7 individual dinners.

**Profile inputs**: cooking style; household members, each with a portion size and optional weight; eating style; restrictions (dairy-free, gluten-free only); goals (gain muscle, lose weight, eat healthy for less, simpler meals, more fun meals); dinners per week (nightly mode). Stores you'll visit, the value of an extra stop and a loyal store are set on List & stores.

**Meal size (stated assumption, editable).** Everyone eats the same meals; portions differ. Each member picks a portion multiplier: small child 0.5×, child 0.67×, standard 1×, hungry 1.33×, large or training 1.67× (so 2, 3 and 5 eggs reads as 0.67×, 1× and 1.67×). One standard portion is about 3 eggs, 5 oz cooked meat or fish, or 1 cup cooked grains. Meal size = sum of multipliers; every ingredient scales by it, and a batch is `max(4, ceil(2 × meal size))` portions. Weight only drives protein targets (0.9 to 1 g per lb). Later: "we had leftovers / ran short" feedback nudges the multipliers.

**Eating styles** filter recipe components by ingredient attributes (grain, legume, dairy, soy, starchy, fruit, red meat, shellfish): Clean (none), Paleo, Keto (also ≤ ~20 g carbs per dinner), Animal-based (allow-list: animal foods, fruit, avocado, squash, aromatics), Whole30 (also no added sugar, so recipes with honey drop out), Slow-Carb, and Custom (pick components to leave out). Seasonings (garlic, onion, lemon) pass every style.

**Macros** are always labelled as estimated averages per standard portion, with a scaled line per member, because the cut, brand and cooking change real values.

**Recipes are written as you cook them** ("2 tbsp tomato paste", serves 8). Each ingredient has an approximate conversion from its pack to kitchen units (`CONV` in `data/catalog.json`), and code turns recipe amounts into fractions of a pack: meals cost what they use, the list buys whole packs, and the rest carries over. A unit that can't be converted is an error at load, never a guess. New recipes start as Markdown files in the private `local/recipes/` folder (`_template.md` shows the minimum: name, serves, ingredients with amounts) and are turned into catalog entries in a PR. Salt, oil and spices are pantry items: shown with the recipe, never listed or priced. In batch mode a recipe cooks its full yield when that covers the household. The catalog holds only your real recipes; the prototype's placeholder recipes were removed on 2026-11-07, so plans are short until it grows.

**Recipe ingredients** are editable per recipe (amounts, notes, added items) and downloadable as CSV or copyable. Edits are stored per standard portion so they scale, flow into the grocery list (added items show as "added by you, not priced"), and stay with the recipe for next week.

**Grocery list** copies in full or per store as a checklist, and downloads as CSV. **Dinner costs** count only what each recipe uses, plus what carries over in partly used packs, and say so when a meal has items with no price ("at least $15.10").

**Prices tab.** One row per dinner item and one column per store, with progress toward two goals: one real price per item, then two competing prices per item (an item only one of your stores sells counts as done once it has that price). Prices need no receipt or purchase. Each store has a **price sheet**: a CSV to download, fill in with Google Sheets and upload, with a preview before anything is saved. Any table cell also takes one price directly. "None here" marks an item a store doesn't stock, or doesn't stock to our standard. Format: [RECEIPTS.md](RECEIPTS.md) section 11.

**Three kinds of price.** Real: a receipt or shelf price at that store. Stand-in: a store-less placeholder from `data/estimates.json`. Missing: nothing yet. A store never borrows another store's price. Store totals use real prices only and show the gap ("$35.50 for 4 of 18 items, 14 unknown"); stand-ins appear only in week and meal costs, and always look different.

**Store routing:** ask *"An extra stop is worth it if it saves at least $X."* Fare tries every combination of the user's stores and ranks them on items with real prices at two or more stores, plus $X for each extra stop. A loyal store is forced into the set. Fare recommends a route only once half the list is compared; before that, one item could decide the whole trip, so it says how many items are compared and leaves the choice open. Savings count only items with a real price on both sides.

---

## 4. Recommended tech stack

### The key choice: static web app + Supabase, no native app

| Layer | Pick | Why |
|---|---|---|
| Front end | **Plain HTML + vanilla JS (or Preact via CDN), no build step** | Claude Code is excellent at single-file HTML. No toolchain, instant reload, the POC *is* the app. Graduate to Vite + Preact only when a file passes ~1,500 lines. |
| Hosting | **GitHub Pages** (or Cloudflare Pages) | Free, deploys on push to `main`, same repo as the docs. Friends get a URL; "Add to Home Screen" makes it feel like an app (add a PWA manifest in phase 2). |
| Auth + DB | **Supabase** (free tier) | Magic-link email login (no passwords for friends), Postgres with row-level security, called straight from the browser with the JS client. One vendor, generous free tier for <50 users. |
| LLM proxy | **Supabase Edge Function** (`/plan`) | The only server code. Holds the Anthropic API key, enforces caps, caches, logs cost. ~150 lines. |
| LLM | **Claude Haiku 5.5** by default, **Sonnet 5.5** for onboarding | See section 6. |
| Feedback | **In-app widget writing to a Supabase `feedback` table** | A floating "Feedback" button that captures the text plus the screen and plan id. Read it in the Supabase table view; later pipe it to a weekly digest. No third-party plugin needed. |
| Analytics | Supabase tables (`plan_events`) to start; PostHog free tier if needed | Track approve / swap / thumbs, which drive the success metrics above. |

**Why not Next.js / React Native / Firebase?** They all work, but each adds a build system, a framework to reason about, or a second vendor. For <50 users the bottleneck is iteration speed, and a single HTML file that Claude Code edits end to end is the fastest loop there is.

**Alternative if you'd rather avoid Supabase:** Cloudflare Pages + a Worker + D1 (SQLite) + KV for the cache. Same shape, slightly more DIY on auth.

### Data model (v1)

```
profiles     (user_id, cook_style, eat_style, custom_exclusions[], goals[], restrictions[], dinners_per_week,
              stop_value, loyal_store, stores[], prefs jsonb)
members      (id, user_id, name, portion_multiplier, weight_lb)
ingredients  (id, name, category, rule, why, pack_label, attributes[], cook_unit, cook_per_pack)
recipe_edits (user_id, recipe_id, rows jsonb)  -- per-portion amounts, notes, added items          -- curated, seeded from JSON
recipes      (id, name, batch, keeps, carbs_g, tags[], contains[], minutes, kcal, p, c, f, why, ingredients jsonb)
prices       (ingredient_id, store_id, price, observed_at, source, description, unit_price, receipt_id, line_no,
              provenance, confidence, on_sale, needs_review, logged_on)  -- receipts first; see RECEIPTS.md
receipts     (id, user_id, store_id, purchased_at, total, raw_text, file_hash, status)
plans        (id, user_id, week_of, status, style, recipe_ids[], flex, flex_recipe_id, llm_notes jsonb, cost_est)
plan_events  (plan_id, type: swap|thumb_up|thumb_down|approve, recipe_id, at)
feedback     (user_id, screen, text, plan_id, at)
llm_usage    (user_id, model, input_tokens, output_tokens, cached_tokens, usd, at)
```

Curated catalog data (ingredients, recipes, EWG lists) lives as **JSON files in the repo** first and is seeded into Supabase. Editing the catalog is a PR, which keeps "what we recommend" reviewable.

---

## 5. Roadmap

### MVP path (set Nov 9, 2026): the order we work in
Each stage finishes before the next starts. Dinner only throughout.
1. **10 solid dinner recipes** that we actually cook or want to cook (3 in on Nov 9: chili, salmon, borscht; all 10 in on Nov 11, adding turkey meatloaf, hakklihakaste with mash, klimbisupp, Irish beef and Guinness stew, grass-fed burgers, paleo buffalo chicken and cod tacos). Drafts in `local/recipes/`, reviewed, then into the catalog. Macros come from USDA FoodData Central (SR Legacy), product labels or the source recipe card, each named in the draft.
2. **Full ingredient list** for those 10, derived from the catalog (not typed by hand), including what's assumed in the pantry.
3. **Shorter list:** lightly simplify recipes to share ingredients (fewer single-use items). Every change is proposed and reviewed by Magnus; nothing is simplified silently.
4. **Prices from two or more stores for every ingredient**, through price sheets and receipts.
5. **Design packet:** a minimal design system reused across future apps, then the Fare UI refined to it.
6. **Use it for about 2 weeks** (Magnus and partner), fixing what gets in the way.
7. **Share with friends and family:** a short what-and-how video of the build, a way for them to send feedback, then iterate.

### Phase 0: "Replace my spreadsheet" (now, 1 to 2 weekends)
- [x] Clickable POC with mock data (`index.html`): profile, plan with why, swap, approve, grocery list, store routing, feedback box
- [x] Batch cook mode: 3 recipes over 6 nights plus a flex night (cheat, healthy takeout, or a new recipe)
- [x] Per-member portion sizes, eating styles, estimated-macro labels, editable recipe ingredients, list downloads, dinner costs by meal
- [x] Real stores: Costco, Trader Joe's, Wild Fork, ShopRite
- [x] Swap the mock catalog for **your real recipes**: 10 for the MVP (was 15 to 25; see MVP path above). First one in: paleo beef & sausage chili; the mock recipes are removed (Nov 7); all 10 in (Nov 11)
- Recipe items can be **optional** (`optional: true`): shown with the recipe as "Optional, not priced yet", kept off the grocery list and prices. Every optional item will be priced eventually (Nov 11).
- **Pack size to add** (`PACK_TBD`, Nov 11): a new ingredient whose pack size we don't know yet is priced per 1 oz or 1 fl oz, and the list shows the amount needed instead of packs. Once a real pack size is known, set it in `ING` and drop the id from `PACK_TBD`. Never guess a pack size. Nov 12: nine of ten resolved (cod 24 oz, bacon 48 oz (the largest pack seen; sizes vary), cheddar 12 oz, sour cream 16 oz, flour 320 oz, panko 8 oz, ketchup 18.5 oz, mustard 9 oz, hot sauce 8.5 fl oz). Worcestershire stays in `PACK_TBD` and is now optional in the meatloaf, since we may not buy it.
- **Pantry staples are listed, not priced** (`PANTRY_UNPRICED`, Nov 12): flour, panko, ketchup, Worcestershire, mustard and hot sauce show in their own "Pantry staples" section of the grocery list (and in the copied list and CSV), marked "check pantry", with the amount needed and the pack size. They are left out of prices, store totals, routes, dinner costs and the Prices tab, because their cost per recipe is near negligible. Other Pantry-aisle items with real prices (broth, tomato paste, oats and so on) are still priced; to move one, add its id to `PANTRY_UNPRICED`.
  - **Decision to finalize:** add a **quarterly pantry estimate**: one store-less figure per quarter for restocking staples, spread across the dinners in that quarter and shown as an estimate (with its source and date) in dinner costs, instead of pricing each staple. Open questions: how to set the figure (receipts for staples over a quarter, or a manual estimate), and whether it counts in the week's total or sits beside it.
- [x] Receipt logging as a local tool (`tools/receipt.mjs`): receipt transcribed in Claude chat to Markdown, then checked and logged to `local/`, with derived prices in `data/prices.json`, provenance labels, store-less estimates as fallback and a local admin view. Spec: [RECEIPTS.md](RECEIPTS.md) section 11
- [x] Log your last 3 to 4 receipts with it (all 4 logged, Nov 2)
- [x] Log shelf prices without a receipt: a price sheet per store (CSV, filled in with Google Sheets) uploaded on the Prices tab or logged with `tools/shelf.mjs`, or one price at a time in the table
- [ ] One real price for every item in the week's dinner plan (6 of 18 on Nov 3)
- [ ] Two prices from competing stores for every item (0 of 18 on Nov 3)
- [ ] Use it yourself for 2 weeks. Keep a list of every time you went back to the spreadsheet.
- No backend, no LLM. State in localStorage. Host on GitHub Pages.

### Phase 1: Friends alpha (5 to 15 people)
- Supabase auth (magic link) and tables above; profile and plans saved per user
- In-app feedback widget to the `feedback` table, plus thumbs and swap events
- LLM plan generation through the Edge Function (Haiku 5.5, structured output, caps)
- "Why" text written by the LLM, grounded in the rule metadata
- Weekly email or push: "Your plan for next week is ready" (Supabase cron + Resend free tier)
- Price logging: sync the shelf prices people log in the app (Phase 0 keeps them in the browser)
- Receipts in the app: upload to a private bucket, inbound email address, admin-only price view, user export of their own data, Kroger Product API fallback
- Terms of Service and privacy policy reviewed before friends upload receipts

### Phase 2: Make it stick
- Preference learning: summarize swaps and thumbs into a short `prefs` note per user that feeds next week's prompt
- Batch receipt parsing overnight at 50% off once uploads are routine
- Leftovers and "cook once, eat twice" planning; pantry staples you already have
- PWA manifest and offline list for the store
- Share a plan or recipe with another user
- **Recipe view with cooking steps** (future, wanted): show a full recipe with its method, download it (likely a PDF with ingredients and simple steps; decided Nov 9 to wait until the background logic is in place, so recipes stay Markdown-only with no source field until then), and take live feedback while cooking ("too salty", "needed 20 more minutes") so the recipe improves and adapts over time. Steps are kept in the `local/recipes/` drafts until then; the catalog has no steps field yet

### Phase 3: Public-ready
- Real price data (Kroger has a public product API; others via receipts and crowd-sourced price logs)
- Online ordering hand-off (Instacart / store cart links)
- Bring-your-own recipes with automatic rule checks
- Pricing model, if any (a small subscription covers LLM and data costs)

### Explicitly not now
Phone support in the POC (Nov 5: price sheets replace phone entry and sync), native apps, nutrition-label scanning, calorie-level meal tracking, social feeds, scraping store websites.

---

## 6. LLM use without draining your wallet

### What the LLM does (and doesn't)

| LLM does | Code does |
|---|---|
| Pick N recipe ids from the allowed list that fit goals, taste and variety | Filter recipes by restrictions and rules (the LLM never sees disallowed ones) |
| Write a 1-line "why" per meal and 3 to 5 weekly guidelines | Compute macros, quantities, grocery list, prices and store routing |
| Turn free-text feedback ("less fish, kids hate spicy") into structured prefs | Enforce the Clean 15 / Dirty Dozen / meat-sourcing rules |
| Onboarding chat: interpret a vague goal into profile fields | Everything involving money or health thresholds |

This split is the biggest guardrail: the model's output is a list of ids from an enum and short strings, validated against a JSON schema. If it fails validation, fall back to the deterministic picker (which already exists in the POC).

### Cost math (Claude API list prices, Oct 2026)

| Model | Input / 1M tokens | Output / 1M tokens |
|---|---|---|
| Claude Haiku 5.5 | $0.10 | $0.50 |
| Claude Sonnet 5.5 | $2.00 | $10.00 |

A plan generation is roughly 3K input tokens (system prompt + catalog summary + profile) and 1.5K output tokens (JSON).

- **Haiku 5.5:** about $0.001 per plan. 15 users × (1 plan + 10 tweaks) per week ≈ **$0.75/month**.
- **Sonnet 5.5:** about $0.02 per plan. Same usage ≈ **$15/month**.

So: **default to Haiku 5.5.** Use Sonnet 5.5 only for the one-time onboarding interpretation and the weekly preference summary, if Haiku's quality is noticeably worse there. Measure before upgrading.

### Guardrails (build these into the Edge Function on day one)

1. **Server-side key only.** The browser never sees the API key; it calls `/plan` with the user's Supabase JWT.
2. **Hard spend cap at the account level.** Set a monthly limit in the Anthropic Console (e.g. $20). This is the backstop if everything else fails.
3. **Per-user quotas.** E.g. 3 full plan generations and 20 swap/feedback calls per user per week, counted in `llm_usage`. Over quota, fall back to the deterministic picker and say so.
4. **Global daily budget.** The function sums today's `llm_usage.usd` and refuses LLM calls past, say, $1/day.
5. **Cap output.** `max_tokens` around 2,000; ask for ids and short strings, never full recipes.
6. **Structured output.** JSON schema with recipe ids as an enum. Validate; on failure, one retry, then fallback.
7. **Prompt caching.** Put the stable part first (system prompt, rules, recipe catalog) with a cache breakpoint; the profile and request go after it. Cached reads cost a fraction of normal input.
8. **Response cache.** Hash `(profile, prefs, catalog version, week)`; if unchanged, return the stored plan without a call.
9. **Small context.** Send recipe ids, names and tags, not full ingredient lists. The catalog stays well under 5K tokens until it has hundreds of recipes.
10. **Batch the non-urgent.** Sunday-night "next week's plan" generation and receipt parsing go through the Message Batches API at 50% off.
11. **Log every call.** Model, tokens, cache hits, cost. Review weekly in the Supabase table view.
12. **Spend checkpoints for receipts.** $0.05 cap per document, $1 per day, and a continue-or-pause prompt every $5 of cumulative spend (RECEIPTS.md section 8).

### The weekly prompt (shape)

```
system (cached):  You are Fare's meal planner. Principles... Output JSON only.
                  Recipe catalog: [{id, name, tags, minutes, protein}, ...]
user:             Profile: {goals, restrictions-already-applied, dinners: 5, household: 2}
                  Learned prefs: "likes salmon, dislikes spicy, tired of quinoa"
                  Last 2 weeks' recipe ids: [...]
                  Return {recipe_ids: [5 ids], meal_why: {id: "..."}, guidelines: ["..."]}
```

---

## 7. Where to start the build (with Claude Code)

1. **Create the repo** `fare` with this layout and push:
   ```
   fare/
     CLAUDE.md          # conventions for Claude Code
     README.md
     docs/PRODUCT.md    # this file
     index.html         # the app, served at the site root
     data/              # ingredients.json, recipes.json, stores.json, prices.json, ewg.json
   ```
2. **Turn on GitHub Pages** (Settings → Pages → deploy from `main`). The POC is now a link you can text friends.
3. **First Claude Code session:** "Move the catalog data out of `index.html` into `data/*.json` and load it with fetch." This makes the data editable without touching UI code.
4. **Second session:** "Replace the mock recipes with these" (paste your real recipe list and recent receipt prices).
5. **Use it for 2 weeks.** Log friction in GitHub Issues.
6. **Then Phase 1:** "Add Supabase magic-link auth and save profile and plans per user" and "Add a `/plan` Edge Function with the guardrails in PRODUCT.md section 6."

Keep each Claude Code session to one feature, and ask it to update `docs/PRODUCT.md` when a decision changes.

---

## 8. Food rules reference

**EWG Dirty Dozen (buy organic), 2025 list:** strawberries, spinach, kale/collard/mustard greens, grapes, peaches, cherries, nectarines, pears, apples, blackberries, blueberries, potatoes.

**EWG Clean 15 (conventional is fine), 2025 list:** pineapple, sweet corn, avocados, papaya, onions, frozen sweet peas, asparagus, cabbage, watermelon, cauliflower, bananas, mangoes, carrots, mushrooms, kiwi.

EWG republishes each spring; check ewg.org for the current year and update `data/ewg.json`. Note for credibility: EWG's lists rank *residue detected*, not proven health harm. Fare's stance ("organic where residue is highest, save money where it's lowest") is a sensible precaution, and the app should word it that way.

**Animal protein:** wild-caught fish and shellfish; pasture-raised (or at minimum organic) poultry and eggs; grass-fed and finished beef; organic, grass-fed dairy. Conventional feedlot meat is excluded from plans and pricing.

---

## 9. Open questions

- Batch cook: should leftovers from a 1-person household's 4-serving batches become planned lunches?
- Breakfast and lunch: plan them once dinner works? (POC: dinners only, decided Nov 3.)
- How strict is "organic unless no proven difference" for items on neither EWG list? (POC: organic preferred.)
- Receipts: should friends' receipts improve prices for everyone at the same store, and what does the ToS need to say first?
- Do friends share your stores, or does each user pick stores and enter prices for them? (Affects how fast price data improves.)
