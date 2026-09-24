/**
 * Deterministic valuation of one card against one spending profile.
 *
 * Invariants:
 *  - No randomness, no network calls, no LLM. Same inputs -> same outputs.
 *  - Rupee values are only produced where the workbook states enough to derive
 *    them. Where it does not (e.g. a points programme with no stated rupee
 *    conversion), the reward is reported as non-monetizable rather than guessed.
 *  - Lounge access and lifestyle benefits are never assigned a rupee value.
 */
import { SPEND_CATEGORIES, type CardRule, type CardWithRules, type SpendCategory } from '@/lib/data/types';
import type { CardValuation, CategoryBreakdown, SpendProfile } from './types';

const MONTHS = 12;

/** Converts a cap to its monthly-equivalent amount. */
export function capPerMonth(cap: NonNullable<CardRule['cap']>): number {
  switch (cap.period) {
    case 'day': return cap.amount * 30;
    case 'statement_month':
    case 'month': return cap.amount;
    case 'quarter': return cap.amount / 3;
    case 'year': return cap.amount / MONTHS;
  }
}

/** Rupees of reward per rupee spent. Null when the rule cannot be monetized. */
export function effectiveRate(rule: CardRule, pointValue: number | null): number | null {
  if (rule.value === null) return null;
  if (rule.unit === 'cashback_percent') return rule.value / 100;
  if (rule.unit === 'points') {
    if (pointValue === null || rule.perAmount === null || rule.perAmount <= 0) return null;
    return (rule.value * pointValue) / rule.perAmount;
  }
  return null;
}

function pointValueOf(rules: CardRule[]): number | null {
  const r = rules.find((x) => x.ruleType === 'redemption');
  return r?.value ?? null;
}

function appliesTo(rule: CardRule, category: SpendCategory): boolean {
  return rule.categories.length === 0 || rule.categories.includes(category);
}

interface RuleChoice {
  rule: CardRule;
  rate: number | null;
}

/** Highest-value rule that applies to a category; base rules are the fallback. */
function chooseRule(rules: CardRule[], category: SpendCategory, pointValue: number | null): { accelerated: RuleChoice | null; base: RuleChoice | null } {
  const rate = (r: CardRule) => effectiveRate(r, pointValue);
  const accel = rules
    .filter((r) => r.ruleType === 'accelerated_reward' && r.value !== null && r.categories.includes(category))
    .map((r) => ({ rule: r, rate: rate(r) }))
    .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1))[0] ?? null;
  const base = rules
    .filter((r) => r.ruleType === 'base_reward' && r.value !== null && appliesTo(r, category))
    .map((r) => ({ rule: r, rate: rate(r) }))
    .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1))[0] ?? null;
  return { accelerated: accel, base };
}

export function valuateCard(entry: CardWithRules, spend: SpendProfile): CardValuation {
  const { card, rules } = entry;
  const pointValue = pointValueOf(rules);
  const exclusionRules = rules.filter((r) => r.ruleType === 'exclusion');

  const categories: CategoryBreakdown[] = [];
  let annualRewardValue = 0;
  const unmonetizable = new Set<string>();

  let totalAnnualSpend = 0;
  for (const cat of SPEND_CATEGORIES) totalAnnualSpend += Math.max(0, spend[cat] ?? 0) * MONTHS;

  /**
   * Pass 1 — pick the applicable rule per category (or record why none applies).
   * Pass 2 — apply caps per *rule*, not per category, because a cap such as
   * "75,000 RP/month total accelerated" is shared across every category that
   * earns under that rule. The capped value is then split back across the
   * categories in proportion to their spend.
   */
  interface Pending {
    category: SpendCategory;
    annualSpend: number;
    monthly: number;
    rule: CardRule;
    rate: number;
    baseRate: number;
  }
  const pending: Pending[] = [];

  for (const category of SPEND_CATEGORIES) {
    const monthly = Math.max(0, spend[category] ?? 0);
    const annualSpend = monthly * MONTHS;
    if (annualSpend === 0) continue;

    const excl = exclusionRules.find((r) => r.categories.includes(category));
    if (excl) {
      categories.push({
        category, annualSpend, excluded: true,
        exclusionReason: excl.raw, ruleRaw: null, ruleCondition: null, effectiveRate: null,
        cappedSpend: null, capRaw: null, capReductionValue: 0, rewardValue: 0,
        monetizable: true, note: 'Category excluded from rewards by the card terms',
      });
      continue;
    }

    const { accelerated, base } = chooseRule(rules, category, pointValue);
    const chosen = accelerated && (accelerated.rate ?? 0) >= (base?.rate ?? 0) ? accelerated : base;

    if (!chosen) {
      categories.push({
        category, annualSpend, excluded: false, exclusionReason: null, ruleRaw: null,
        ruleCondition: null, effectiveRate: null, cappedSpend: null, capRaw: null,
        capReductionValue: 0, rewardValue: 0, monetizable: false,
        note: 'No verified earn rule covers this category',
      });
      unmonetizable.add('Some spending categories have no stated earn rate');
      continue;
    }

    if (chosen.rate === null) {
      categories.push({
        category, annualSpend, excluded: false, exclusionReason: null, ruleRaw: chosen.rule.raw,
        ruleCondition: chosen.rule.condition, effectiveRate: null, cappedSpend: null, capRaw: null,
        capReductionValue: 0, rewardValue: 0, monetizable: false,
        note: 'Rewards are earned, but the source data does not state a rupee value for them',
      });
      unmonetizable.add(`Reward value cannot be derived from "${chosen.rule.raw}"`);
      continue;
    }

    pending.push({
      category, annualSpend, monthly, rule: chosen.rule, rate: chosen.rate,
      baseRate: base?.rate ?? 0,
    });
  }

  const groups = new Map<string, Pending[]>();
  for (const p of pending) {
    const list = groups.get(p.rule.id) ?? [];
    list.push(p);
    groups.set(p.rule.id, list);
  }

  for (const [, members] of groups) {
    const rule = members[0].rule;
    const rate = members[0].rate;
    const baseRate = Math.min(...members.map((m) => m.baseRate));
    const groupMonthly = members.reduce((n, m) => n + m.monthly, 0);
    const uncappedMonthly = groupMonthly * rate;
    const cap = rule.cap;

    let cappedMonthlyValue = uncappedMonthly;
    let acceleratedMonthlySpend: number | null = null;

    if (cap && rule.ruleType === 'accelerated_reward') {
      const monthlyCap = capPerMonth(cap);
      if (cap.basis === 'spend') {
        acceleratedMonthlySpend = Math.min(groupMonthly, monthlyCap);
        cappedMonthlyValue = acceleratedMonthlySpend * rate + (groupMonthly - acceleratedMonthlySpend) * baseRate;
      } else if (cap.basis === 'inr_value') {
        cappedMonthlyValue = Math.min(uncappedMonthly, monthlyCap);
      } else {
        const valueCap = pointValue === null ? Number.POSITIVE_INFINITY : monthlyCap * pointValue;
        cappedMonthlyValue = Math.min(uncappedMonthly, valueCap);
      }
    }

    const groupValue = cappedMonthlyValue * MONTHS;
    const groupReduction = Math.max(0, uncappedMonthly * MONTHS - groupValue);

    for (const m of members) {
      const share = groupMonthly === 0 ? 0 : m.monthly / groupMonthly;
      const rewardValue = groupValue * share;
      annualRewardValue += rewardValue;
      categories.push({
        category: m.category,
        annualSpend: m.annualSpend,
        excluded: false,
        exclusionReason: null,
        ruleRaw: m.rule.raw,
        ruleCondition: m.rule.condition,
        effectiveRate: m.rate,
        cappedSpend: acceleratedMonthlySpend === null ? null : round(acceleratedMonthlySpend * share * MONTHS),
        capRaw: cap && m.rule.ruleType === 'accelerated_reward' ? cap.raw : null,
        capReductionValue: round(groupReduction * share),
        rewardValue: round(rewardValue),
        monetizable: true,
        note: members.length > 1 && groupReduction > 0 ? 'This cap is shared with other categories earning under the same rule' : null,
      });
    }
  }

  // Keep the display order stable regardless of which pass produced a row.
  categories.sort((a, b) => SPEND_CATEGORIES.indexOf(a.category) - SPEND_CATEGORIES.indexOf(b.category));

  annualRewardValue = round(annualRewardValue);

  /* ---- fees ---- */
  const annualFee = card.annualFee ?? 0;
  const joiningFee = card.joiningFee ?? 0;
  const waiverCondition = card.annualFeeWaiverCondition ?? '';
  const threshold = card.annualFeeWaiverThreshold;

  let feeWaived = false;
  let feeWaiverReason: string;
  if (annualFee === 0) {
    feeWaived = true;
    feeWaiverReason = /lifetime free/i.test(waiverCondition)
      ? 'Lifetime free — no annual fee'
      : 'No annual fee on this card';
  } else if (/non-?waivable/i.test(waiverCondition)) {
    feeWaiverReason = 'The annual fee is not waivable on spend';
  } else if (threshold !== null && threshold !== undefined) {
    feeWaived = totalAnnualSpend >= threshold;
    feeWaiverReason = feeWaived
      ? `Estimated annual spend ${inr(totalAnnualSpend)} meets the waiver condition (${waiverCondition})`
      : `Estimated annual spend ${inr(totalAnnualSpend)} is below the waiver threshold of ${inr(threshold)}`;
  } else {
    feeWaiverReason = waiverCondition || 'No fee waiver condition recorded';
  }
  const annualFeeAfterWaiver = feeWaived ? 0 : annualFee;

  /* ---- forex (a cost, never a reward) ---- */
  const internationalAnnual = Math.max(0, spend.international ?? 0) * MONTHS;
  const forexCost = card.forexMarkup === null ? 0 : round(internationalAnnual * (card.forexMarkup / 100));

  /* ---- data caveats ---- */
  // Limits of the source data, stated plainly rather than absorbed into the numbers.
  const dataCaveats: string[] = [];
  const appliedRuleIds = new Set(categories.map((c) => c.ruleRaw).filter(Boolean));
  const unresolvedCap = rules.some((r) => r.ruleType === 'reward_cap' && r.value === null);
  const capStatedButUnquantified =
    Boolean(card.rewardCapsRaw) &&
    !/\bno\s+(?:upper\s+|overall\s+)?cap\b/i.test(card.rewardCapsRaw ?? '') &&
    !rules.some((r) => r.cap !== null);
  const isUpperBound = capStatedButUnquantified || unresolvedCap;
  if (isUpperBound) {
    dataCaveats.push(`This card states a reward cap ("${card.rewardCapsRaw}") without an amount we could apply, so the reward figure is an upper bound rather than an estimate`);
  }
  const redemptionRule = rules.find((r) => r.ruleType === 'redemption');
  if (redemptionRule?.condition && /range|lowest stated|to ₹/i.test(redemptionRule.condition)) {
    dataCaveats.push(`${redemptionRule.condition}, so the reward figure above is a floor rather than a midpoint`);
  }
  const unquantifiedAccel = rules.filter(
    (r) => r.ruleType === 'accelerated_reward' && r.value === null && !/cap/i.test(r.notes ?? ''),
  );
  if (unquantifiedAccel.length > 0 && appliedRuleIds.size > 0) {
    dataCaveats.push(`${unquantifiedAccel.length} accelerated reward${unquantifiedAccel.length > 1 ? 's' : ''} on this card could not be quantified from the source and ${unquantifiedAccel.length > 1 ? 'are' : 'is'} not counted: ${unquantifiedAccel.map((r) => `"${r.raw}"`).join(', ')}`);
  }

  /* ---- restrictions ---- */
  const restrictions: string[] = [];
  if (card.forexMarkup !== null && card.forexMarkup > 0) restrictions.push(`${card.forexMarkup.toFixed(2)}% forex markup on international spends`);
  if (card.rewardExclusionsRaw) restrictions.push(`Excluded from rewards: ${card.rewardExclusionsRaw}`);
  for (const r of rules) if (r.ruleType === 'reward_cap') restrictions.push(`Reward cap: ${r.raw}`);
  if (card.relationshipRequirement && !/no mandatory/i.test(card.relationshipRequirement)) {
    restrictions.push(`Relationship requirement: ${card.relationshipRequirement}`);
  }
  if (card.loungeSpendCondition && !/^n\/a/i.test(card.loungeSpendCondition)) {
    restrictions.push(`Lounge access condition: ${card.loungeSpendCondition}`);
  }

  return {
    cardId: card.id,
    totalAnnualSpend,
    categories,
    annualRewardValue,
    hasUnmonetizableRewards: unmonetizable.size > 0,
    unmonetizableReasons: [...unmonetizable],
    annualFee,
    joiningFee,
    feeWaived,
    feeWaiverReason,
    annualFeeAfterWaiver,
    forexCost,
    forexMarkup: card.forexMarkup,
    netAnnualValue: round(annualRewardValue - annualFeeAfterWaiver - forexCost),
    restrictions,
    dataCaveats,
    isUpperBound,
    loungeSummary: {
      domestic: card.domesticLounge,
      international: card.internationalLounge,
      condition: card.loungeSpendCondition,
    },
  };
}

export function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}
