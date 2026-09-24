/**
 * Eval runner:  npm run eval
 *
 * Reports calculation accuracy against hand-derived expectations and checks that
 * recommendations obey the documented methodology across representative profiles.
 * Exits non-zero on any failure so it can gate a deploy.
 */
import 'dotenv/config';
import { valuateCard } from '../lib/calculations/engine';
import { recommend, type ScoredCard } from '../lib/recommendations/engine';
import { calculationCases } from './calculation-cases';
import { recommendationCases } from './recommendation-cases';
import { hasLoungeAccess } from '../lib/data/types';
import { entry, loadEntries } from './loader';

const C = { red: '\x1b[31m', green: '\x1b[32m', dim: '\x1b[2m', yellow: '\x1b[33m', reset: '\x1b[0m' };

let passed = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail = '') {
  if (cond) { passed++; return; }
  failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

function near(a: number, b: number, tol = 1) {
  return Math.abs(a - b) <= tol;
}

function runCalculationEvals() {
  console.log('\n─── Calculation evals ───────────────────────────────────────');
  const entries = loadEntries();
  for (const c of calculationCases) {
    const before = failures.length;
    const v = valuateCard(entry(entries, c.cardId), c.spend);
    const e = c.expect;
    const at = (cat: string) => v.categories.find((x) => x.category === cat);

    if (e.totalAnnualSpend !== undefined) check(c.name, near(v.totalAnnualSpend, e.totalAnnualSpend), `totalAnnualSpend ${v.totalAnnualSpend} ≠ ${e.totalAnnualSpend}`);
    for (const [cat, val] of Object.entries(e.annualSpend ?? {})) check(c.name, near(at(cat)?.annualSpend ?? -1, val), `${cat} annual spend ${at(cat)?.annualSpend} ≠ ${val}`);
    for (const [cat, val] of Object.entries(e.effectiveRate ?? {})) check(c.name, near((at(cat)?.effectiveRate ?? -1) * 100, val * 100, 0.01), `${cat} rate ${at(cat)?.effectiveRate} ≠ ${val}`);
    for (const [cat, val] of Object.entries(e.categoryReward ?? {})) check(c.name, near(at(cat)?.rewardValue ?? -1, val), `${cat} reward ${at(cat)?.rewardValue} ≠ ${val}`);
    for (const cat of e.excludedCategories ?? []) check(c.name, at(cat)?.excluded === true && at(cat)?.rewardValue === 0, `${cat} should be excluded and earn 0`);
    if (e.annualRewardValue !== undefined) check(c.name, near(v.annualRewardValue, e.annualRewardValue), `rewards ${v.annualRewardValue} ≠ ${e.annualRewardValue}`);
    if (e.annualFee !== undefined) check(c.name, near(v.annualFee, e.annualFee), `annual fee ${v.annualFee} ≠ ${e.annualFee}`);
    if (e.feeWaived !== undefined) check(c.name, v.feeWaived === e.feeWaived, `feeWaived ${v.feeWaived} ≠ ${e.feeWaived}`);
    if (e.annualFeeAfterWaiver !== undefined) check(c.name, near(v.annualFeeAfterWaiver, e.annualFeeAfterWaiver), `fee after waiver ${v.annualFeeAfterWaiver} ≠ ${e.annualFeeAfterWaiver}`);
    if (e.forexCost !== undefined) check(c.name, near(v.forexCost, e.forexCost), `forex ${v.forexCost} ≠ ${e.forexCost}`);
    if (e.netAnnualValue !== undefined) check(c.name, near(v.netAnnualValue, e.netAnnualValue), `net ${v.netAnnualValue} ≠ ${e.netAnnualValue}`);
    if (e.hasUnmonetizableRewards !== undefined) check(c.name, v.hasUnmonetizableRewards === e.hasUnmonetizableRewards, `hasUnmonetizableRewards ${v.hasUnmonetizableRewards}`);

    const ok = failures.length === before;
    console.log(`  ${ok ? C.green + '✓' : C.red + '✗'}${C.reset} ${c.name}`);
    if (!ok) console.log(`${C.dim}${c.workings.split('\n').map((l) => `      ${l}`).join('\n')}${C.reset}`);
  }
}

function hasLounge(m: ScoredCard) {
  return hasLoungeAccess(m.card.domesticLoungeVisits) || hasLoungeAccess(m.card.internationalLoungeVisits);
}

function runRecommendationEvals() {
  console.log('\n─── Recommendation evals ────────────────────────────────────');
  const entries = loadEntries();
  const FEE_MAX: Record<string, number> = { zero: 0, under_1k: 999, '1k_5k': 5000, '5k_10k': 10000, '10k_plus': Infinity };

  for (const c of recommendationCases) {
    const before = failures.length;
    const r = recommend(entries, c.profile);
    const e = c.expect;
    const ids = r.matches.map((m) => m.card.id);

    if (e.minMatches !== undefined) check(c.name, r.matches.length >= e.minMatches, `only ${r.matches.length} matches`);
    if (e.maxMatches !== undefined) check(c.name, r.matches.length <= e.maxMatches, `${r.matches.length} matches exceeds ${e.maxMatches}`);

    if (e.respectsFeeBand) {
      const ceiling = FEE_MAX[c.profile.feeBand];
      for (const m of r.matches) {
        check(c.name, (m.card.annualFee ?? 0) <= ceiling || m.valuation.feeWaived,
          `${m.card.name} fee ₹${m.card.annualFee} is above the band and not waived`);
      }
    }

    if (e.topIsValueJustified && r.matches.length > 0) {
      const top = r.matches[0];
      const best = Math.max(...r.matches.map((m) => m.valuation.netAnnualValue));
      const window = Math.max(Math.abs(best) * 0.15, 1500);
      check(c.name, top.valuation.netAnnualValue >= best - window,
        `top match ₹${top.valuation.netAnnualValue} is outside the documented value window of ₹${best}`);
      if (top.valuation.netAnnualValue < best) {
        check(c.name, top.preferenceScore >= r.matches.find((m) => m.valuation.netAnnualValue === best)!.preferenceScore,
          'a lower-value card was ranked first without a better preference fit');
      }
    }

    // Ordering must be stable and reproducible.
    check(c.name, JSON.stringify(recommend(entries, c.profile).matches.map((m) => m.card.id)) === JSON.stringify(ids), 'result is not reproducible');

    // An excluded category may never earn.
    for (const m of r.matches) {
      for (const cat of m.valuation.categories) {
        check(c.name, !cat.excluded || cat.rewardValue === 0, `${m.card.name}: excluded ${cat.category} earned ₹${cat.rewardValue}`);
      }
      check(c.name, m.valuation.netAnnualValue ===
        Math.round((m.valuation.annualRewardValue - m.valuation.annualFeeAfterWaiver - m.valuation.forexCost) * 100) / 100,
        `${m.card.name}: net value does not equal rewards − fee − forex`);
    }

    if (e.allHaveLounge) for (const m of r.matches) check(c.name, hasLounge(m), `${m.card.name} has no lounge access`);
    if (e.maxForexMarkup !== undefined) for (const m of r.matches) check(c.name, (m.card.forexMarkup ?? 99) <= e.maxForexMarkup, `${m.card.name} forex ${m.card.forexMarkup}%`);
    if (e.allCashback) for (const m of r.matches) check(c.name, /cashback/i.test(`${m.card.cashbackRateRaw} ${m.card.baseRewardRateRaw}`), `${m.card.name} is not a cashback card`);
    if (e.objective) check(c.name, ids.slice(0, e.objective.within).includes(e.objective.cardId),
      `expected ${e.objective.cardId} in the top ${e.objective.within} (${e.objective.reason}) — got ${ids.join(', ')}`);

    const ok = failures.length === before;
    console.log(`  ${ok ? C.green + '✓' : C.red + '✗'}${C.reset} ${c.name}`);
    console.log(`${C.dim}      ${r.matches.map((m) => `${m.card.name} (net ₹${Math.round(m.valuation.netAnnualValue).toLocaleString('en-IN')}, fit ${(m.preferenceScore * 100).toFixed(0)}%)`).join(' · ') || 'no matches'}${C.reset}`);
  }
}

function main() {
  const snapshot = loadEntries();
  console.log(`${C.dim}Evaluating against ${snapshot.length} cards in the database.${C.reset}`);
  runCalculationEvals();
  runRecommendationEvals();

  console.log('\n─────────────────────────────────────────────────────────────');
  if (failures.length === 0) {
    console.log(`${C.green}All checks passed${C.reset} (${passed} assertions).`);
    return;
  }
  console.log(`${C.red}${failures.length} failed check(s)${C.reset} out of ${passed + failures.length}:`);
  for (const f of failures) console.log(`  ${C.red}✗${C.reset} ${f}`);
  console.log(`\n${C.yellow}If a card's data changed, re-derive the expectation in evals/calculation-cases.ts; do not relax the check to match the engine.${C.reset}`);
  process.exit(1);
}

main();
