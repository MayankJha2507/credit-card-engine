# Recommendation methodology

This engine is deterministic. It contains no model, no learned weights and no
"AI score". The same inputs always produce the same output unless the underlying
card data changes. Every number shown to a user is reproducible from the raw
facts in the database plus the steps below.

## Inputs

* **Spend profile** — approximate monthly rupee spend in nine categories
  (online, dining, flights, hotels, groceries, fuel, utilities, international, other).
* **Priorities** — a multi-select of what the user cares about.
* **Annual fee preference** — a ceiling band.
* **International travel** — yes / no.
* **Lounge importance** — not important / nice to have / important.

## Step 1 — Eligibility

A card participates only if it is active, open for applications and marked
**Fully Researched** in the workbook. Everything else is excluded and reported in
the result's `excluded` list, never silently dropped.

## Step 2 — Fee ceiling (hard filter)

A card is removed when its annual fee exceeds the user's stated band **and** the
fee is not waived at the user's estimated annual spend. A card over the ceiling
whose waiver condition the user actually meets is kept, because the fee they
would pay is ₹0 — and the result says so explicitly.

## Step 3 — Valuation (`/lib/calculations`)

Per category, in order:

1. Annualise the monthly spend (`monthly × 12`).
2. Drop the category if a card exclusion rule covers it (e.g. fuel).
3. Pick the applicable rule: the highest-rate accelerated rule whose categories
   include this one, otherwise the base rule.
4. Convert the rule to an effective rate:
   * cashback → `percent / 100`
   * points → `(points × rupee value per point) / spend increment`
5. Apply the rule's cap, converted to a monthly equivalent. Spend-basis caps earn
   the accelerated rate up to the cap and the base rate beyond it; point- and
   value-basis caps clamp the earned value.
6. Sum to an annual reward value.

Then:

* **Annual fee** — the stated fee. The waiver is *evaluated*, never stored:
  `feeWaived = estimatedAnnualSpend >= waiverThreshold`.
* **Forex** — international spend × markup. This is a **cost**, subtracted; it is
  never treated as a reward.
* **Net annual value** = `rewards − annual fee after waiver − forex cost`.

The joining fee is reported separately as a year-one cost rather than folded into
the annual figure.

### What the engine deliberately does not do

* **No rupee value for lounge access**, milestones, insurance, concierge, golf or
  any other lifestyle benefit. These are shown qualitatively. Assigning them a
  number would be fabricated precision that changes the ranking.
* **No guessed point valuations.** If the workbook does not state a rupee value
  per point (for example "1 EDGE Mile = 2 Partner Miles"), those rewards are
  reported as *non-monetizable*: the card keeps its place in the pool, the user
  is told the value could not be derived, and nothing is invented. The same
  applies to earn rates expressed only as a multiplier with no absolute base
  (for example "3X Reward Points on offline spends").
* **No extrapolation across categories.** A category with no applicable rule
  earns ₹0 and is labelled as such.

## Step 4 — Ranking

1. Sort by **net annual value**, descending. Ties break on the lower fee after
   waiver, then on card ID, so ordering is stable.
2. Take the top 8 as the value shortlist.
3. Compute a **value window**: `best − max(15% of best, ₹1,500)`. Cards inside
   the window are financially close enough that preference fit is the more useful
   tie-breaker.
4. Re-order the in-window cards by **preference fit**, then by value.
5. Cards outside the window follow, in value order.
6. Return the top 3.

Preference fit is `met weight / total weight` over only the priorities the user
actually selected, so an unselected priority can never move a card. Each priority
is a single transparent check against a raw fact:

| Priority | Met when |
|---|---|
| Cashback | the card has a cashback-percent earn rule |
| Reward points | the card has point rules *and* a stated rupee redemption ratio |
| Travel rewards | an accelerated rule covers flights/hotels, or travel benefits are recorded |
| Lounge access | domestic or international complimentary visits > 0 |
| Low forex | forex markup ≤ 2.00% |
| Dining | an accelerated rule covers dining, or dining benefits are recorded |
| Movies / entertainment | benefits or earn rules name a cinema/streaming partner |
| Low annual fee | annual fee is ₹0 |
| Premium benefits | the card's tier is Premium or Super Premium |

Two contextual weights are added on top: lounge importance (×2 when "important",
×0.5 when "nice to have") and international travel (×1.5, met when forex markup
≤ 2.00%).

## Step 5 — Explanation

"Why it fits" is generated from the calculation output — the largest earning
categories, the waiver outcome, and the matched priorities with the raw text they
matched against. When a card is placed above a higher-value card because of
preference fit, the result carries the value rank so the UI can say so plainly.

## Stability

`/evals` re-runs fixed calculation cases and ~24 representative profiles and
asserts properties that follow from this document (ordering is by net value
except inside the documented window, a fee-band violation never appears, an
excluded category never earns, and so on) rather than pinning "card X must win".
