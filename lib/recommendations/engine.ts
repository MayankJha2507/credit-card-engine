/**
 * Recommendation engine. Deterministic, explainable, no LLM.
 * Methodology is documented in ./README.md — keep the two in sync.
 */
import { inr, valuateCard } from '@/lib/calculations/engine';
import type { CardValuation, UserProfile } from '@/lib/calculations/types';
import { FEE_BAND_MAX, PRIORITY_LABELS } from '@/lib/calculations/types';
import { hasLoungeAccess, isRecommendable, type CardWithRules } from '@/lib/data/types';

export interface PreferenceMatch {
  priority: string;
  label: string;
  matched: boolean;
  weight: number;
  evidence: string;
}

export interface ScoredCard {
  card: CardWithRules['card'];
  valuation: CardValuation;
  preferenceMatches: PreferenceMatch[];
  preferenceScore: number;   // 0..1, share of the user's weighted priorities that are met
  valueRank: number;         // 1-based rank on net annual value
  inValueWindow: boolean;    // close enough to the best value to be re-ordered on fit
  reasons: string[];         // "why it fits", generated from the calculations
  cautions: string[];
}

export interface RecommendationResult {
  matches: ScoredCard[];
  considered: number;
  poolSize: number;
  excluded: Array<{ cardId: string; name: string; reason: string }>;
}

/** Cards within this band of the best net value are re-ordered by preference fit. */
const VALUE_WINDOW_FRACTION = 0.15;
const VALUE_WINDOW_FLOOR = 1500;
const SHORTLIST = 8;
const RESULTS = 3;

function hasCashback(e: CardWithRules) {
  return e.rules.some((r) => r.unit === 'cashback_percent' && r.value !== null);
}
function hasMonetizedPoints(e: CardWithRules) {
  return e.rules.some((r) => r.unit === 'points' && r.value !== null) &&
    e.rules.some((r) => r.ruleType === 'redemption' && r.value !== null);
}
function coversCategory(e: CardWithRules, cats: string[]) {
  return e.rules.some((r) => r.ruleType === 'accelerated_reward' && r.categories.some((c) => cats.includes(c)));
}
function loungeVisits(e: CardWithRules) {
  const d = e.card.domesticLoungeVisits;
  const i = e.card.internationalLoungeVisits;
  return { d, i, any: hasLoungeAccess(d) || hasLoungeAccess(i) };
}
function mentions(e: CardWithRules, re: RegExp) {
  return [e.card.otherBenefits, e.card.travelBenefits, e.card.diningBenefits, e.card.welcomeBenefit, e.card.acceleratedRateRaw, e.card.cardType]
    .some((t) => t && re.test(t));
}

function preferenceMatches(entry: CardWithRules, profile: UserProfile): PreferenceMatch[] {
  const { card } = entry;
  const lounge = loungeVisits(entry);
  const selected = new Set<string>(profile.priorities);
  const out: PreferenceMatch[] = [];

  const add = (priority: string, matched: boolean, evidence: string, weight = 1) => {
    if (!selected.has(priority)) return;
    out.push({ priority, label: PRIORITY_LABELS[priority as keyof typeof PRIORITY_LABELS] ?? priority, matched, weight, evidence });
  };

  add('cashback', hasCashback(entry), card.cashbackRateRaw ?? card.baseRewardRateRaw ?? 'No cashback rate recorded');
  add('reward_points', hasMonetizedPoints(entry), card.redemptionRatioRaw ?? 'No rupee-denominated redemption ratio recorded');
  add('travel_rewards', coversCategory(entry, ['flights', 'hotels']) || Boolean(card.travelBenefits), card.travelBenefits ?? card.acceleratedRateRaw ?? '—');
  add('lounge_access', lounge.any, card.domesticLounge ?? card.internationalLounge ?? 'No lounge access recorded');
  add('low_forex', card.forexMarkup !== null && card.forexMarkup <= 2, card.forexMarkup === null ? 'Forex markup not recorded' : `${card.forexMarkup.toFixed(2)}% forex markup`);
  add('dining', coversCategory(entry, ['dining']) || Boolean(card.diningBenefits), card.diningBenefits ?? '—');
  add('entertainment', mentions(entry, /movie|bookmyshow|pvr|inox|sonyliv|entertainment/i), card.otherBenefits ?? card.acceleratedRateRaw ?? '—');
  add('low_annual_fee', (card.annualFee ?? 0) === 0, card.annualFee === 0 ? 'No annual fee' : `Annual fee ${inr(card.annualFee ?? 0)}`);
  add('premium_benefits', /premium/i.test(card.variant ?? '') || /super-?premium/i.test(card.cardType ?? ''), card.variant ?? card.cardType ?? '—');

  // Stated travel/lounge context carries extra weight when the user flagged it.
  if (profile.loungeImportance === 'important') {
    out.push({ priority: 'lounge_importance', label: 'Lounge access matters to you', matched: lounge.any, weight: 2, evidence: card.domesticLounge ?? 'No lounge access recorded' });
  } else if (profile.loungeImportance === 'nice_to_have') {
    out.push({ priority: 'lounge_importance', label: 'Lounge access is nice to have', matched: lounge.any, weight: 0.5, evidence: card.domesticLounge ?? 'No lounge access recorded' });
  }
  if (profile.internationalTravel) {
    const good = card.forexMarkup !== null && card.forexMarkup <= 2;
    out.push({ priority: 'international', label: 'You spend internationally', matched: good, weight: 1.5, evidence: card.forexMarkup === null ? 'Forex markup not recorded' : `${card.forexMarkup.toFixed(2)}% forex markup` });
  }
  return out;
}

function buildReasons(entry: CardWithRules, v: CardValuation, matches: PreferenceMatch[]): string[] {
  const reasons: string[] = [];
  const earning = v.categories.filter((c) => c.rewardValue > 0).sort((a, b) => b.rewardValue - a.rewardValue);
  if (earning.length) {
    const top = earning.slice(0, 2).map((c) => c.category.replace('_', ' ')).join(' and ');
    reasons.push(`Earns most on your ${top} spending — ${inr(earning.reduce((n, c) => n + c.rewardValue, 0))} of estimated annual rewards`);
  }
  if (v.feeWaived && v.annualFee > 0) reasons.push(`Your estimated annual spend meets the fee-waiver condition, so the ${inr(v.annualFee)} annual fee is estimated at ₹0`);
  if (v.annualFee === 0) reasons.push('No annual fee');
  for (const m of matches.filter((m) => m.matched)) {
    if (m.priority === 'lounge_access' || m.priority === 'lounge_importance') reasons.push(`Lounge access you asked for: ${m.evidence}`);
    else if (m.priority === 'low_forex' || m.priority === 'international') reasons.push(`Lower forex cost on international spends (${m.evidence})`);
    else if (m.priority === 'travel_rewards') reasons.push('Travel benefits match a priority you selected');
    else if (m.priority === 'dining') reasons.push('Dining benefits match a priority you selected');
    else if (m.priority === 'cashback') reasons.push(`Cashback card, as you prefer (${m.evidence})`);
    else if (m.priority === 'premium_benefits') reasons.push(`Premium tier product (${m.evidence})`);
  }
  return [...new Set(reasons)].slice(0, 5);
}

function buildCautions(v: CardValuation): string[] {
  const c = [...v.restrictions];
  if (v.hasUnmonetizableRewards) c.unshift(...v.unmonetizableReasons.map((r) => `${r} — it is not counted in the estimate above`));
  if (!v.feeWaived && v.annualFee > 0) c.push(`Annual fee of ${inr(v.annualFee)} applies: ${v.feeWaiverReason}`);
  if (v.joiningFee > 0) c.push(`One-time joining fee of ${inr(v.joiningFee)} in year one`);
  return [...new Set(c)].slice(0, 6);
}

export function recommend(pool: CardWithRules[], profile: UserProfile): RecommendationResult {
  const excluded: RecommendationResult['excluded'] = [];

  // 1. Only cards with enough researched data participate.
  const eligible = pool.filter((e) => {
    if (!isRecommendable(e.card)) {
      excluded.push({ cardId: e.card.id, name: e.card.name, reason: 'Not active / not open for applications / not fully researched' });
      return false;
    }
    return true;
  });

  // 2. Hard filter: the user's stated annual fee ceiling.
  //    A card above the ceiling still qualifies if the fee is waived at the
  //    user's estimated spend, because the fee they would actually pay is ₹0.
  const ceiling = FEE_BAND_MAX[profile.feeBand];
  const valuations = new Map<string, CardValuation>();
  const withinBudget = eligible.filter((e) => {
    const v = valuateCard(e, profile.spend);
    valuations.set(e.card.id, v);
    const fee = e.card.annualFee ?? 0;
    if (fee <= ceiling || v.feeWaived) return true;
    excluded.push({ cardId: e.card.id, name: e.card.name, reason: `Annual fee ${inr(fee)} is above your stated preference and is not waived at your estimated spend` });
    return false;
  });

  // 3. Score.
  const scored: ScoredCard[] = withinBudget.map((e) => {
    const valuation = valuations.get(e.card.id)!;
    const matches = preferenceMatches(e, profile);
    const totalWeight = matches.reduce((n, m) => n + m.weight, 0);
    const metWeight = matches.filter((m) => m.matched).reduce((n, m) => n + m.weight, 0);
    return {
      card: e.card,
      valuation,
      preferenceMatches: matches,
      preferenceScore: totalWeight === 0 ? 0 : metWeight / totalWeight,
      valueRank: 0,
      inValueWindow: false,
      reasons: buildReasons(e, valuation, matches),
      cautions: buildCautions(valuation),
    };
  });

  // 4. Rank on estimated net annual value (ties broken by lower fee, then card ID
  //    so the ordering is stable).
  scored.sort(byValue);
  scored.forEach((s, i) => { s.valueRank = i + 1; });

  // 5. Within a documented window of the best value, prefer the better fit.
  const shortlist = scored.slice(0, SHORTLIST);
  const best = shortlist[0]?.valuation.netAnnualValue ?? 0;
  const window = Math.max(Math.abs(best) * VALUE_WINDOW_FRACTION, VALUE_WINDOW_FLOOR);
  for (const s of shortlist) s.inValueWindow = s.valuation.netAnnualValue >= best - window;

  const inWindow = shortlist.filter((s) => s.inValueWindow).sort((a, b) => {
    const fit = b.preferenceScore - a.preferenceScore;
    if (Math.abs(fit) > 1e-9) return fit;
    return byValue(a, b);
  });
  const outWindow = shortlist.filter((s) => !s.inValueWindow);

  return {
    matches: [...inWindow, ...outWindow].slice(0, RESULTS),
    considered: withinBudget.length,
    poolSize: eligible.length,
    excluded,
  };
}

function byValue(a: ScoredCard, b: ScoredCard): number {
  const d = b.valuation.netAnnualValue - a.valuation.netAnnualValue;
  if (Math.abs(d) > 1e-9) return d;
  const f = a.valuation.annualFeeAfterWaiver - b.valuation.annualFeeAfterWaiver;
  if (f !== 0) return f;
  return a.card.id.localeCompare(b.card.id);
}
