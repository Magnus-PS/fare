# Fare: product brief

> One place to go each week for what to eat, why to eat it, and where it's cheapest to buy.

Status: ideation, v0.1 (Oct 2026). Owner: Magnus.

---

## 1. Vision

Clean eating with less thought. Every week Fare hands you a meal plan you already mostly agree with, the reasons behind it, a grocery list that only contains food worth buying, and a shopping route that fits how *you* like to shop (one stop, cheapest, or your favourite chain).

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

1. **Unhealthy options never appear.** The catalog is curated. If it isn't something we'd recommend, it isn't in the meal plan or the price comparison. No "budget" factory-farmed tier.
2. **Organic by default, conventional when it doesn't matter.** Dirty Dozen and anything not on a list: organic. Clean 15: conventional is fine, and we say so (that's where the savings come from). Meat and fish: wild-caught, pasture-raised, grass-fed.
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
                              Grocery list (with why) ──► Store plan (cost vs stops)
                                                             ▼
                                              Log actual prices (receipt) ──► better prices
```

**Two ways to cook** (chosen in the profile):
- **Batch cook (default):** 3 recipes that reheat well, at least 4 servings each (2 dinners per recipe for the household), cooked in one session and reheated across 6 nights. Mon to Wed come from the fridge; Thu to Sat portions are frozen and thawed the night before (cooked food keeps 3 to 4 days in the fridge). Night 7 is a **flex night**: a cheat takeout (pizza), a healthier takeout (a Chipotle-style bowl), or one new recipe cooked fresh, which adds its ingredients to the list. Recipes carry a `batch` flag and a `keeps` note.
- **Cook most nights:** 3 to 7 individual dinners.

**Profile inputs**: cooking style; household members, each with a portion size and optional weight; eating style; restrictions (dairy-free, gluten-free only); goals (gain muscle, lose weight, eat healthy for less, simpler meals, more fun meals); dinners per week (nightly mode); shopping style (value of an extra stop, loyal store, stores you'll visit).

**Meal size (stated assumption, editable).** Everyone eats the same meals; portions differ. Each member picks a portion multiplier: small child 0.5×, child 0.67×, standard 1×, hungry 1.33×, large or training 1.67× (so 2, 3 and 5 eggs reads as 0.67×, 1× and 1.67×). One standard portion is about 3 eggs, 5 oz cooked meat or fish, or 1 cup cooked grains. Meal size = sum of multipliers; every ingredient scales by it, and a batch is `max(4, ceil(2 × meal size))` portions. Weight only drives protein targets (0.9 to 1 g per lb). Later: "we had leftovers / ran short" feedback nudges the multipliers.

**Eating styles** filter recipe components by ingredient attributes (grain, legume, dairy, soy, starchy, fruit, red meat, shellfish): Clean (none), Paleo, Keto (also ≤ ~20 g carbs per dinner), Animal-based (allow-list: animal foods, fruit, avocado, squash, aromatics), Whole30, Slow-Carb, and Custom (pick components to leave out). Seasonings (garlic, onion, lemon) pass every style.

**Macros** are always labelled as estimated averages per standard portion, with a scaled line per member, because the cut, brand and cooking change real values.

**Recipe ingredients** are editable per recipe (amounts, notes, added items) and downloadable as CSV or copyable. Edits are stored per standard portion so they scale, flow into the grocery list (added items show as "added by you, not priced"), and stay with the recipe for next week.

**Grocery list** downloads in full or per store (CSV, or copy as a checklist). Prices sit in a separate **price breakdown** with three levels: by item, by meal or batch (counting only what each recipe uses, plus what carries over in partly used packs), and plan total. Receipts will replace estimates item by item, which is what makes item, meal, batch and plan level savings visible.

**Store routing (the clever bit, already in the POC):** instead of asking "1 stop or 4?", ask *"An extra stop is worth it if it saves at least $X."* Fare enumerates every combination of the user's stores, costs the list in each, and picks the one with the lowest `total + X × (stops − 1)`. $0 means cheapest at any cost; $50 means one-stop. A loyal store is forced into the set. This one slider covers the "4 stops is fine", "one place only" and "I'm a Kroger person" users.

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
prices       (ingredient_id, store_id, price, observed_at, source)  -- mock -> receipts -> APIs
plans        (id, user_id, week_of, status, style, recipe_ids[], flex, flex_recipe_id, llm_notes jsonb, cost_est)
plan_events  (plan_id, type: swap|thumb_up|thumb_down|approve, recipe_id, at)
feedback     (user_id, screen, text, plan_id, at)
llm_usage    (user_id, model, input_tokens, output_tokens, cached_tokens, usd, at)
```

Curated catalog data (ingredients, recipes, EWG lists) lives as **JSON files in the repo** first and is seeded into Supabase. Editing the catalog is a PR, which keeps "what we recommend" reviewable.

---

## 5. Roadmap

### Phase 0: "Replace my spreadsheet" (now, 1 to 2 weekends)
- [x] Clickable POC with mock data (`index.html`): profile, plan with why, swap, approve, grocery list, store routing, feedback box
- [x] Batch cook mode: 3 recipes over 6 nights plus a flex night (cheat, healthy takeout, or a new recipe)
- [x] Per-member portion sizes, eating styles, estimated-macro labels, editable recipe ingredients, list downloads, price breakdown by item / meal / plan
- [ ] Swap the mock catalog for **your real recipes** (the 15 to 25 you actually cook) and **your real stores**
- [ ] Enter real prices from your last 3 to 4 receipts (a `prices.json`)
- [ ] Use it yourself for 2 weeks. Keep a list of every time you went back to the spreadsheet.
- No backend, no LLM. State in localStorage. Host on GitHub Pages.

### Phase 1: Friends alpha (5 to 15 people)
- Supabase auth (magic link) and tables above; profile and plans saved per user
- In-app feedback widget to the `feedback` table, plus thumbs and swap events
- LLM plan generation through the Edge Function (Haiku 5.5, structured output, caps)
- "Why" text written by the LLM, grounded in the rule metadata
- Weekly email or push: "Your plan for next week is ready" (Supabase cron + Resend free tier)
- Price logging: tap an item on the list to correct its price at the store you bought it

### Phase 2: Make it stick
- Preference learning: summarize swaps and thumbs into a short `prefs` note per user that feeds next week's prompt
- Receipt photo to prices (Haiku vision, batched overnight at 50% off)
- Leftovers and "cook once, eat twice" planning; pantry staples you already have
- PWA manifest and offline list for the store
- Share a plan or recipe with another user

### Phase 3: Public-ready
- Real price data (Kroger has a public product API; others via receipts and crowd-sourced price logs)
- Online ordering hand-off (Instacart / store cart links)
- Bring-your-own recipes with automatic rule checks
- Pricing model, if any (a small subscription covers LLM and data costs)

### Explicitly not now
Native apps, nutrition-label scanning, calorie-level meal tracking, social feeds, scraping store websites.

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
- Breakfast and lunch: plan them, or just dinners plus a default breakfast? (POC: dinners plus an optional default breakfast.)
- How strict is "organic unless no proven difference" for items on neither EWG list? (POC: organic preferred.)
- Do friends share your stores, or does each user pick stores and enter prices for them? (Affects how fast price data improves.)
