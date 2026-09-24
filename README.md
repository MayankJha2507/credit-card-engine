# CardFit — India credit card recommendation engine

A consumer web app that answers one question: **given how I spend and what I care
about, which credit card should I get?**

The user enters approximate monthly spending and a few preferences. A
deterministic TypeScript engine values every eligible card against that profile
using the card's published terms — earn rates, caps, exclusions, fee waivers and
forex markup — and shows the three strongest matches with the full calculation
behind each one.

No bank connection, no card linking, no statement upload, no account, no LLM in
the runtime path.

---

## Quick start

```bash
npm install
npm run import-data     # finds the workbook, validates it, loads the database
npm run dev             # http://localhost:3000
```

`import-data` locates the `.xlsx` workbook in the project root automatically. With
no `DATABASE_URL` set it writes `db/snapshot.json` and the app reads that, so the
product runs end to end with zero database setup. To use PostgreSQL:

```bash
cp .env.example .env    # set DATABASE_URL
npm run migrate         # create the schema
npm run import-data     # writes PostgreSQL and the snapshot
```

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | Local development server |
| `npm run build` | Production build |
| `npm run migrate` | Apply `db/migrations/*.sql` (needs `DATABASE_URL`) |
| `npm run import-data` | Workbook → validation → normalized data → PostgreSQL + snapshot |
| `npm run import-data -- --dry-run` | Validate the workbook without writing anything |
| `npm test` | Unit tests (parsers, calculation engine, recommendation engine, SQL path) |
| `npm run eval` | Calculation and recommendation eval suites |
| `npm run eval:verbose` | The same, printing the hand-derived arithmetic behind every case |
| `npm run eval:json` | The same as a machine-readable report |
| `npm run typecheck` | `tsc --noEmit` |

Run `npm test` **and** `npm run eval` after any change to the calculation or
recommendation engine.

---

## How it works

```
workbook (.xlsx)
      │  scripts/import-workbook.ts
      ▼
parse + normalize (lib/data) ──► validate (lib/validation) ──► PostgreSQL / snapshot
      │
      ▼
user profile ──► calculation engine (lib/calculations) ──► recommendation engine (lib/recommendations) ──► UI
```

### Raw facts vs derived values

This is the central design rule. The database stores **only what the issuer
published**. Everything a user sees as a number is derived at request time.

| Stored (raw) | Derived at request time |
|---|---|
| `5 Reward Points per ₹150 spent` | 3.33% effective reward rate |
| `1 RP = ₹1.00` | rupee value of the points earned |
| `₹12,500 annual fee` + `waived at ₹10,00,000 annual spend` | "fee waived for this user, because estimated annual spend is ₹11,40,000" |
| `Max 15,000 RP/day on SmartBuy` | the rupees a cap removed from this user's estimate |

A conclusion is never written back into a card rule. Re-running the calculation
with different inputs always re-derives from the raw text, and the raw text is
shown next to every derived figure in the UI.

### Why there is no annual-fee question

The fee is already subtracted from every card's value, so filtering on the
sticker fee before showing anything hides cards that are worth more after paying
it — and nearly everyone would answer "₹0". A fee ceiling is offered as a
refinement on the results instead, the fee is shown on every card, and year-one
value carries the joining fee. "Low annual fee" stays available as a priority,
where it breaks ties rather than removing cards.

### Cards that cannot be valued

Ten of the 103 cards publish their earn rate only as a multiplier with no
absolute rate ("3X RPs offline"), so no rupee value can be derived. Rather than
rank them at ₹0 — which would bury a card like IDFC FIRST Mayura, a 0% forex
premium card — they are held out of the ranking and surfaced separately under
"Also worth knowing" whenever they match a priority the user selected, with the
reason stated and the raw text quoted.

### What the engine refuses to invent

* **Lounge access, milestones, insurance, concierge** have no rupee value
  assigned. They are qualitative benefits and appear as such.
* **Points with no stated rupee conversion** (e.g. "1 EDGE Mile = 2 Partner
  Miles") are reported as non-monetizable rather than valued at a guess. The card
  still appears, with an explicit note.
* **Earn rates expressed only as a multiplier with no absolute base** (e.g. "3X
  Reward Points on offline spends") are likewise left unresolved and reported by
  the import as a warning.
* **Forex is a cost, never a reward.** International spend × markup is subtracted.
* **Estimates versus upper bounds.** A card that states a cap without an amount
  ("Monthly category cap applies") cannot have that cap applied, so its figure is
  an upper bound. Those cards are marked, the UI writes "up to ₹X", and a firm
  estimate outranks an upper bound of comparable value.
* **Redemption ranges use the lowest stated rate.** "1 RP = ₹0.20 – ₹1.00" is
  valued at ₹0.20 — a published number, kept conservative, and labelled as such.

The full ranking methodology is in
[`lib/recommendations/README.md`](lib/recommendations/README.md).

---

## The workbook

The supplied workbook is the source of truth. When several workbooks are present,
the import picks the one carrying the most fully-researched cards, prints which
it chose and which it ignored, and `WORKBOOK_PATH` overrides the choice. Column
names differ between editions ("Base Rate" vs "Base Reward Earn Rate Raw"), so
`lib/data/columns.ts` maps whatever a sheet carries onto canonical names —
adding a differently-labelled workbook is a one-line change there.

If the workbook has a universe/coverage sheet, the import cross-checks its card
IDs against the card master and reports either side's omissions. The import:

1. locates it (`WORKBOOK_PATH`, else the first `.xlsx` in the repo root or `data/`),
2. finds the header row of the `Card Master` sheet,
3. parses each cell into structured raw facts,
4. validates (duplicate IDs, missing names/sources/dates, invalid fees, negative
   values, impossible rates, malformed URLs, inactive-but-available cards),
5. upserts cards, rules and sources by stable card ID, and
6. records the run in `import_runs` with a checksum.

Errors abort the import before anything is written. Warnings (text that could not
be machine-resolved) are printed and the card is still stored — with the
unresolved rule kept verbatim so nothing is silently lost.

**Adding a card is a data change, not a code change**: add the row, re-run
`npm run import-data`, and it appears in the app.

Only cards marked `Fully Researched`, active and open for applications take part
in recommendations. The app says how many cards it is analyzing and never claims
full market coverage.

---

## Data model

* **`cards`** — one row per product: identity, fees, waiver condition, forex,
  lounge text, raw earn/redemption text, benefits, eligibility, confidence,
  verification date.
* **`card_rules`** — one row per meaningful rule: base earn, accelerated earn,
  cap, exclusion, redemption, lounge, fee waiver, milestone, forex. Each carries
  `raw` (the verbatim source text), machine-usable fields (`value`, `unit`,
  `per_amount`, `categories`, `cap`), a condition and a `source_id`.
* **`sources`** — issuer URL, title, fields covered, access date, reliability tier.
* **`import_runs`** — audit trail, so a change in recommendations can be traced to
  a change in data.

Spend is normalized to nine categories — online, dining, flights, hotels,
groceries, fuel, utilities, international, other — and merchant names in the
workbook are mapped onto them by the keyword table in `lib/data/parse.ts`.

---

## Comparison and issuer links

The results page has a **Compare all 3** toggle that switches the matches into a
side-by-side table. Rows where every card says the same thing are dimmed, and a
marker calls out the highest or lowest figure in rows where better is objectively
defined (more value, lower cost) — never an overall winner.

Every card carries a link to the **issuer's own product page** — the same URL its
data was verified against — on the result card, in the comparison table and at the
top of the card detail page. These are plain outbound links, not affiliate or
application links, and they open in a new tab.

## Testing and evals

* `tests/` — unit tests for the parsers, the calculation engine (annualisation,
  rule selection, caps, shared caps, exclusions, fee waivers, forex,
  non-monetizable rewards, determinism), the recommendation engine (fee ceiling,
  eligibility, preference tie-breaking, stability) and the SQL path, which runs
  the real migrations and inserts against an embedded Postgres.
* `evals/calculation-cases.ts` — cases against the real imported cards, each with
  the arithmetic written out, so a failure prints how the number *should* have
  been derived.
* `evals/recommendation-cases.ts` — 24 representative profiles. They assert
  properties implied by the documented methodology (fee band respected, ordering
  justified by value or preference fit, excluded categories earn nothing, net
  value equals rewards − fee − forex, results reproducible) rather than pinning
  "card X must win". Two cases do name a card, and each states the calculation
  rule that makes that outcome objective.

### Checking accuracy yourself

```bash
npm run eval:verbose
```

prints, for every calculation case, the arithmetic the expectation was derived
from — annual spend, the rate applied, the cap, the fee and the waiver — next to
a pass or fail. For every profile it prints the cards returned with their net
value, the fee after waiver, the preference fit and the value rank, so a ranking
can be checked against the methodology by reading. `npm run eval:json` emits the
same as JSON for diffing between runs.

The cases themselves are plain TypeScript and meant to be read and edited:
`evals/calculation-cases.ts` carries a `workings` string per case spelling out
the derivation, and `evals/recommendation-cases.ts` holds the profiles.

If card data changes and an eval fails, re-derive the expectation from the new
raw facts — do not relax the check to match the engine.

---

## Deployment (Vercel)

1. Push the repository to GitHub.
2. Import it in Vercel. The framework preset is Next.js; no build overrides.
3. Set `DATABASE_URL` in the Vercel project (Supabase's **transaction pooler**
   connection string works — the client sets `prepare: false` for pgbouncer).
4. Run the migration and import once against that database from your machine:
   ```bash
   DATABASE_URL="<production url>" npm run migrate
   DATABASE_URL="<production url>" npm run import-data
   ```
5. Deploy. Card detail pages are statically generated from the database at build
   time; the recommendation API runs server-side.

Committing `db/snapshot.json` is optional but convenient: it lets a deployment
build without database credentials, and the app falls back to it when
`DATABASE_URL` is unset.

---

## Architectural decisions

**Next.js only, no separate backend.** The recommendation API is one route
handler over a pure function. A second service would add deployment surface for
no benefit.

**Deterministic engine, no LLM at runtime.** Recommendations are financial
calculations. Identical inputs must produce identical outputs, and every figure
must be traceable to published terms — an LLM satisfies neither. There is no LLM
dependency in the runtime architecture at all.

**Free text parsed at import, not at request time.** The workbook's cells are
prose. Parsing them once during import means failures surface in a validation
report rather than in a user's recommendation, and the request path only handles
structured rules.

**Unresolved data is kept and flagged, not dropped or guessed.** A rule that
cannot be parsed is stored verbatim with a note, warned about at import, and
surfaced in the UI as "not valued". This keeps the product honest while the
dataset is still growing.

**Caps are applied per rule, not per category.** A cap like "75,000 RP/month
total accelerated" is shared by every category earning under that rule, so the
engine groups categories by rule before clamping and then splits the capped value
back in proportion to spend.

**Unlimited lounge access is stored as `-1`.** `Infinity` does not survive JSON or
`numeric`, and this was caught by the eval suite rather than by a user.

**JSON snapshot fallback.** PostgreSQL is the primary store, but the snapshot
means `npm install && npm run import-data && npm run dev` works with no database.
Both paths go through the same transform, so the data is identical.

---

## Project structure

```
app/                      routes: landing, /recommend, /cards, /cards/[issuer]/[slug], /api
components/               questionnaire, recommendations, cards, ui primitives
lib/calculations/         card valuation engine (pure, UI-independent)
lib/recommendations/      ranking + explanations, with README.md methodology
lib/data/                 types, parsers, transform, repository, SQL writer
lib/validation/           workbook and request validation
db/migrations/            SQL schema
db/snapshot.json          generated by the import (database-free fallback)
scripts/                  import-workbook.ts, migrate.ts
evals/                    calculation and recommendation eval suites
tests/                    unit tests
```

## Not in this MVP

Two-card portfolios, existing-card input, comparison, alerts, affiliate links,
user accounts, transaction analysis, statement upload and bank integrations are
deliberately out of scope. The data model and engine leave room for them.

## Disclaimer

CardFit does not rank "the best credit card in India". It shows the strongest
matches for the inputs given, from the cards currently in its database. Card
terms change frequently — always confirm on the issuer's website before applying.
