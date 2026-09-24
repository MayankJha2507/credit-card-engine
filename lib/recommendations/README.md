# Recommendation methodology

This engine is deterministic. It contains no model, no learned weights and no
"AI score". The same inputs always produce the same output unless the underlying
card data changes. Every number shown to a user is reproducible from the raw
facts in the database plus the steps below.

## Inputs

* **Spend profile** — approximate monthly rupee spend in nine categories
  (online, dining, flights, hotels, groceries, fuel, utilities, international, other).
* **Priorities** — a multi-select of what the user cares about.
* **Annual fee ceiling** — optional, and **not asked up front**. See Step 2.
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
* **Joining fee** — reported separately as `firstYearValue`
  (`netAnnualValue − joiningFee`) rather than folded into the annual figure, so
  a large one-time cost is visible instead of being averaged away.
* **Forex** — international spend × markup. This is a **cost**, subtracted; it is
  never treated as a reward.
* **Net annual value** = `rewards − annual fee after waiver − forex cost`.

### What the engine deliberately does not do

* **No rupee value for lounge access**, milestones, insurance, concierge, golf or
  any other lifestyle benefit. These are shown qualitatively. Assigning them a
  number would be fabricated precision that changes the ranking.
* **No guessed point valuations.** Where a card states a *range* ("1 RP = ₹0.20
  – ₹1.00 depending on category"), the engine uses the **lowest stated value**.
  That is a published number rather than an estimate, and it keeps the figure
  conservative instead of flattering the card; the UI says which rate was used.
  If the workbook states no rupee value at all (for example "1 EDGE Mile = 2
  Partner Miles"), those rewards are reported as *non-monetizable*: the card keeps its place in the pool, the user
  is told the value could not be derived, and nothing is invented. The same
  applies to earn rates expressed only as a multiplier with no absolute base
  (for example "3X Reward Points on offline spends").
* **No extrapolation across categories.** A category with no applicable rule
  earns ₹0 and is labelled as such.

## Step 3b — Lounge access when the user calls it important

"Important" is treated as a requirement, not a preference: cards with no
complimentary lounge access are removed and listed in `excluded` with that
reason. If fewer than three cards survive, the requirement is dropped rather
than returning an empty result, and `loungeFilterApplied` reports which happened
so the UI can say so. "Nice to have" stays a weighted tie-break.

## Step 3c — Estimates versus upper bounds

Some cards state a cap without an amount ("Monthly category cap applies"). The
cap cannot be applied, so the reward figure for those cards is an **upper
bound**, not an estimate. The engine marks them `isUpperBound`, the UI writes
"up to ₹X", and the caveat names the exact cap text. Where two cards are
otherwise equal on value and fit, the one whose figure is derived from
quantified terms ranks first — a vaguer source should not win a comparison.

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

## Step 4b — Covering the priorities that were actually selected

Filling all three slots by value alone can return three cards that every one of
them misses the thing the user asked for — someone who selects "low forex"
should not be shown three cards charging 3.5%. So after the first slot, each
remaining slot goes to the **highest-value shortlisted card that satisfies a
selected priority no already-chosen card satisfies**. When no card adds new
coverage, the slot goes by value as before.

Each match records why it is there — `value`, `fit` (better fit at comparable
value) or `coverage` — and which priorities it was the first to cover, so the UI
can say "included because it is the highest-value card here that covers
Cashback, which the card above does not".

This never promotes a card that satisfies nothing, and it never reorders the
first slot.

## Step 4c — Cards that cannot be valued at all

A multiplier is **not** missing data. "5X RP on base spend" is resolved against
what the card says 1X earns, taken in order from:

1. an explicit unit-rate column in the workbook (`Base Unit Rate`, `1X Rate`,
   `Unit Reward Rate`), if it has one;
2. any clause stating a multiplier alongside an absolute rate — "Up to 10X
   Rewards on SmartBuy (50 RPs / ₹150)" fixes 1X at 5 RP per ₹150;
3. an absolute base rate, which is 1X by definition — this is how an
   accelerated "5X on Dining" has always been resolved against a "3 RP / ₹150"
   base.

A card is only incomplete when **none** of these exist: the base rate is itself
written as a multiplier and nothing on the card says what 1X earns, so there is
nothing to multiply. Such a card produces a reward figure of ₹0. That is a gap in the
source, not a fact about the card, so ranking it against cards with real numbers
would be misleading in both directions. Those cards are held out of the ranking
entirely and returned in `notableUnvalued` when they match a priority the user
selected — shown under "Also worth knowing", with the reason they cannot be
valued and the raw text quoted.

They are ordered by how strongly they satisfy the priority that surfaced them
(lowest forex markup when forex was asked for, most lounge visits when lounge
was), then by fee. Ordering them by fee alone would rank a 0% forex card below a
1.99% one, which is the opposite of what was asked.

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
