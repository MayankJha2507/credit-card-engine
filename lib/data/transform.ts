/**
 * Workbook row -> normalized {card, rules, sources}.
 *
 * Only raw facts are produced. Where the workbook text cannot be resolved into a
 * machine-usable rule, we keep the verbatim text, mark the rule unresolved and
 * emit a warning — we never guess a number.
 */
import {
  categoriesFromText,
  isBlank,
  isGeneralScope,
  parseCaps,
  parseDate,
  parseEarnRate,
  parseExclusions,
  parseLoungeVisits,
  parseMoney,
  parsePercent,
  parsePointValue,
  slugify,
  splitClauses,
  text,
} from './parse';
import { UNLIMITED_LOUNGE } from './types';
import type { Card, CardRule, CardSource, CardWithRules, RuleCap, SpendCategory } from './types';

export type WorkbookRow = Record<string, unknown>;

/**
 * URL slug: drop the words "credit card" and a leading repeat of the issuer's
 * name, so HDFC's "Infinia Credit Card Metal Edition" becomes `infinia-metal-edition`.
 */
function issuerTokens(issuer: string): string[] {
  return issuer
    .toLowerCase()
    .replace(/\(([^)]*)\)/g, ' $1 ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(bank|card|cards|financial|limited|ltd|of)\b/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function cardSlug(issuer: string, name: string): string {
  const issuerWords = issuerTokens(issuer);
  let cleaned = name.replace(/\bcredit\s+cards?\b/gi, ' ').trim();
  const leading = new Set([...issuerWords, 'bank', 'card', 'cards']);
  let changed = true;
  while (changed) {
    changed = false;
    const first = cleaned.split(/\s+/)[0]?.toLowerCase();
    if (first && leading.has(first) && cleaned.split(/\s+/).length > 1) {
      cleaned = cleaned.split(/\s+/).slice(1).join(' ');
      changed = true;
    }
  }
  return slugify(cleaned.trim() || name);
}

/** Unlimited access is stored as UNLIMITED_LOUNGE (-1) so it survives JSON and SQL. */
function loungeVisits(raw: string | null): number | null {
  const n = parseLoungeVisits(raw);
  if (n === null) return null;
  return Number.isFinite(n) ? n : UNLIMITED_LOUNGE;
}

export interface TransformWarning {
  cardId: string;
  field: string;
  message: string;
}

export interface TransformResult {
  entry: CardWithRules;
  warnings: TransformWarning[];
}

/** Phrases that mean "this base rate only applies to a limited set of categories". */
const BASE_QUALIFIER = /\bon\b(?!\s*all\b)|special categories|select categories/i;

export function transformRow(row: WorkbookRow): TransformResult {
  const warnings: TransformWarning[] = [];
  const id = String(row['Card ID']).trim();
  const issuer = String(row['Issuer']).trim();
  const name = String(row['Card Name']).trim();

  const warn = (field: string, message: string) => warnings.push({ cardId: id, field, message });

  const card: Card = {
    id,
    slug: cardSlug(issuer, name),
    issuer,
    issuerSlug: slugify(issuerTokens(issuer).filter((w) => w !== 'mahindra').join(' ') || issuer),
    name,
    network: text(row['Network']),
    variant: text(row['Variant / Tier']),
    cardType: text(row['Card Type']),
    activeStatus: /^(yes|active)/i.test(String(row['Status'] ?? '')),
    applicationAvailable: /open/i.test(String(row['Application Availability'] ?? '')),
    joiningFee: parseMoney(row['Joining Fee']),
    annualFee: parseMoney(row['Annual Fee']),
    annualFeeWaiverThreshold: parseMoney(row['Fee Waiver Threshold']),
    annualFeeWaiverCondition: text(row['Fee Waiver Condition']),
    forexMarkup: parsePercent(row['Forex Markup %']),
    dccMarkup: text(row['DCC Charges']),
    domesticLounge: text(row['Domestic Lounge Access']),
    internationalLounge: text(row['International Lounge Access']),
    loungeProgram: text(row['Lounge Program']),
    domesticLoungeVisits: loungeVisits(text(row['Domestic Lounge Access'])),
    internationalLoungeVisits: loungeVisits(text(row['International Lounge Access'])),
    loungeSpendCondition: text(row['Lounge Spend Requirement']),
    baseRewardRateRaw: text(row['Base Reward Earn Rate Raw']),
    acceleratedRateRaw: text(row['Accelerated Earn Rate Raw']),
    rewardCapsRaw: text(row['Reward Caps']),
    rewardExclusionsRaw: text(row['Reward Exclusions']),
    redemptionRatioRaw: text(row['Redemption Ratio Raw']),
    redemptionOptions: text(row['Redemption Options']),
    cashbackRateRaw: text(row['Cashback Rate']),
    welcomeBenefit: text(row['Welcome Benefits']),
    milestoneBenefits: text(row['Milestone Benefits']),
    travelBenefits: text(row['Travel Benefits']),
    diningBenefits: text(row['Dining Benefits']),
    otherBenefits: text(row['Other Benefits']),
    eligibility: [text(row['Employment Requirement']), text(row['Location Restrictions'])].filter(Boolean).join(' · ') || null,
    minimumIncome: parseMoney(row['Minimum Income']),
    ageLimit: text(row['Age Limit']),
    relationshipRequirement: text(row['Existing Relationship Requirement']),
    creditScoreRequirement: text(row['Credit Score Requirement']),
    dataConfidence: text(row['Data Confidence']),
    researchStatus: text(row['Research Status']),
    lastVerifiedAt: parseDate(row['Last Verified']),
    notes: text(row['Notes']),
  };

  const rules: CardRule[] = [];
  let seq = 0;
  const ruleId = (kind: string) => `${id}--${kind}-${++seq}`;

  const sourceUrl = text(row['Primary Source URL']);
  const sources: CardSource[] = sourceUrl
    ? [
        {
          id: `${id}--src-1`,
          cardId: id,
          sourceType: 'issuer_official',
          sourceUrl,
          sourceTitle: `${issuer} — ${name} (official product page)`,
          fieldsCovered: ['fees', 'rewards', 'lounge', 'forex', 'eligibility', 'benefits'],
          accessedAt: card.lastVerifiedAt,
          reliabilityTier: card.dataConfidence ?? 'Unspecified',
        },
      ]
    : [];
  if (!sourceUrl) warn('Primary Source URL', 'No source URL recorded');
  const srcId = sources[0]?.id ?? null;

  /* ---------------- redemption ---------------- */
  const redemption = parsePointValue(card.redemptionRatioRaw);
  const pointValue = redemption?.value ?? null;
  if (card.redemptionRatioRaw) {
    rules.push({
      id: ruleId('redemption'),
      cardId: id,
      ruleType: 'redemption',
      categories: [],
      value: pointValue,
      unit: pointValue === null ? null : 'inr',
      perAmount: null,
      condition: redemption?.isRange
        ? `Source states ₹${redemption.low} to ₹${redemption.high} per point depending on redemption; the lowest stated value is used`
        : null,
      cap: null,
      notes: pointValue === null ? 'Rupee value per point not stated in verified sources' : null,
      sourceId: srcId,
      raw: card.redemptionRatioRaw,
    });
    if (redemption?.isRange) {
      warn('Redemption Ratio Raw', `Redemption value is a range (₹${redemption.low}–₹${redemption.high} per point); rewards are valued at the lowest stated rate`);
    }
  }

  /* ---------------- base earn ---------------- */
  const baseRaw = card.baseRewardRateRaw;
  const base = parseEarnRate(baseRaw);
  const baseQualified = !!baseRaw && BASE_QUALIFIER.test(baseRaw) && !/all\s+(other\s+)?(retail|spends)/i.test(baseRaw);
  let baseRule: CardRule | null = null;

  if (base?.kind === 'points') {
    baseRule = {
      id: ruleId('base'),
      cardId: id,
      ruleType: 'base_reward',
      // 'other' is our catch-all bucket, so a base rate qualified only as
      // "offline"/"retail"/"other" is in effect a general base rate.
      categories: baseQualified ? categoriesFromText(baseRaw).filter((c) => c !== 'other') : [],
      value: base.points,
      unit: 'points',
      perAmount: base.perAmount,
      condition: baseQualified ? 'Applies to the categories named in the source text' : null,
      cap: null,
      notes: null,
      sourceId: srcId,
      raw: baseRaw!,
    };
  } else if (base?.kind === 'cashback') {
    baseRule = {
      id: ruleId('base'),
      cardId: id,
      ruleType: 'base_reward',
      categories: [],
      value: base.percent,
      unit: 'cashback_percent',
      perAmount: null,
      condition: null,
      cap: null,
      notes: null,
      sourceId: srcId,
      raw: baseRaw!,
    };
  } else if (baseRaw) {
    // e.g. "3X Reward Points on offline spends" — no absolute anchor in the workbook.
    baseRule = {
      id: ruleId('base'),
      cardId: id,
      ruleType: 'base_reward',
      categories: [],
      value: null,
      unit: null,
      perAmount: null,
      condition: null,
      cap: null,
      notes: 'Rate expressed as a multiplier with no absolute base stated; not machine-resolvable',
      sourceId: srcId,
      raw: baseRaw,
    };
    warn('Base Reward Earn Rate Raw', `Unresolvable base earn rate: "${baseRaw}"`);
  }
  if (baseRule) rules.push(baseRule);

  /* ---------------- accelerated earn ---------------- */
  const caps = parseCaps(card.rewardCapsRaw);
  for (const clause of splitClauses(card.acceleratedRateRaw)) {
    const rate = parseEarnRate(clause);
    const cats = categoriesFromText(clause);
    const condition = extractCondition(clause);
    const cap = chooseBindingCap(caps, clause, pointValue);

    if (!rate) {
      rules.push(unresolved(ruleId('accel'), id, clause, srcId, 'Earn rate not machine-resolvable'));
      warn('Accelerated Earn Rate Raw', `Unresolvable accelerated clause: "${clause}"`);
      continue;
    }
    if (cats.length === 0) {
      const reason = isGeneralScope(clause)
        ? 'Rate is stated for spending in general, with no category we can attribute it to'
        : 'No spend category could be resolved from the source text';
      rules.push(unresolved(ruleId('accel'), id, clause, srcId, reason));
      warn('Accelerated Earn Rate Raw', `${reason}: "${clause}"`);
      continue;
    }

    if (rate.kind === 'points') {
      rules.push(mk(ruleId('accel'), id, 'accelerated_reward', cats, rate.points, 'points', rate.perAmount, condition, cap, srcId, clause));
    } else if (rate.kind === 'points_unanchored') {
      // "15 RPs on Air India Tickets" states a count but no spend increment.
      // Anchor it to the card's own base increment, the way a multiplier is
      // anchored; without an absolute base there is nothing to anchor to.
      if (baseRule && baseRule.unit === 'points' && baseRule.perAmount !== null) {
        rules.push(mk(
          ruleId('accel'), id, 'accelerated_reward', cats, rate.points, 'points', baseRule.perAmount,
          [condition, `Spend increment taken from the card's base rate (per ₹${baseRule.perAmount})`].filter(Boolean).join(' · '),
          cap, srcId, clause,
        ));
      } else {
        rules.push(unresolved(ruleId('accel'), id, clause, srcId, 'Point count stated with no spend increment, and no absolute base rate to anchor it to'));
        warn('Accelerated Earn Rate Raw', `No spend increment to anchor: "${clause}"`);
      }
    } else if (rate.kind === 'cashback') {
      rules.push(mk(ruleId('accel'), id, 'accelerated_reward', cats, rate.percent, 'cashback_percent', null, condition, cap, srcId, clause));
    } else {
      // Multiplier clause: resolve against the card's absolute base rate.
      if (baseRule && baseRule.unit === 'points' && baseRule.value !== null) {
        const sameAsBase = baseQualified && rate.multiplier === baseRule.value;
        if (sameAsBase) {
          // The accelerated cell simply names the categories of the qualified base rate.
          baseRule.categories = [...new Set([...baseRule.categories, ...cats])];
          baseRule.condition = 'Applies to the categories named in the source text';
          baseRule.cap = baseRule.cap ?? cap;
          continue;
        }
        if (baseQualified) {
          rules.push(unresolved(ruleId('accel'), id, clause, srcId, 'Multiplier cannot be anchored: the base rate itself is category-restricted'));
          warn('Accelerated Earn Rate Raw', `Multiplier not anchorable: "${clause}"`);
          continue;
        }
        rules.push(
          mk(ruleId('accel'), id, 'accelerated_reward', cats, round2(baseRule.value * rate.multiplier), 'points', baseRule.perAmount, condition, cap, srcId, clause),
        );
      } else if (baseRule && baseRule.unit === 'cashback_percent' && baseRule.value !== null) {
        rules.push(mk(ruleId('accel'), id, 'accelerated_reward', cats, round2(baseRule.value * rate.multiplier), 'cashback_percent', null, condition, cap, srcId, clause));
      } else {
        rules.push(unresolved(ruleId('accel'), id, clause, srcId, 'Multiplier with no absolute base rate to anchor against'));
        warn('Accelerated Earn Rate Raw', `Multiplier not anchorable: "${clause}"`);
      }
    }
  }

  /* ---------------- caps as standalone rules (traceability) ---------------- */
  for (const cap of caps) {
    rules.push({
      id: ruleId('cap'), cardId: id, ruleType: 'reward_cap', categories: [],
      value: cap.amount, unit: cap.basis === 'points' ? 'points' : 'inr', perAmount: null,
      condition: `per ${cap.period.replace('_', ' ')}`, cap, notes: null, sourceId: srcId, raw: cap.raw,
    });
  }
  if (card.rewardCapsRaw && caps.length === 0 && !/\bno\s+(?:upper\s+|overall\s+)?cap\b/i.test(card.rewardCapsRaw)) {
    warn('Reward Caps', `Cap text present but not machine-resolvable: "${card.rewardCapsRaw}"`);
    rules.push(unresolved(ruleId('cap'), id, card.rewardCapsRaw, srcId, 'Cap not machine-resolvable', 'reward_cap'));
  }

  /* ---------------- exclusions ---------------- */
  const excl = parseExclusions(card.rewardExclusionsRaw);
  if (card.rewardExclusionsRaw) {
    rules.push({
      id: ruleId('excl'), cardId: id, ruleType: 'exclusion', categories: excl.categories,
      value: null, unit: null, perAmount: null, condition: null, cap: null,
      notes: excl.terms.join(', '), sourceId: srcId, raw: card.rewardExclusionsRaw,
    });
  }

  /* ---------------- fee waiver / forex / lounge / milestone ---------------- */
  if (card.annualFeeWaiverCondition) {
    rules.push({
      id: ruleId('waiver'), cardId: id, ruleType: 'fee_waiver', categories: [],
      value: card.annualFeeWaiverThreshold, unit: card.annualFeeWaiverThreshold === null ? null : 'inr',
      perAmount: null, condition: card.annualFeeWaiverCondition, cap: null,
      notes: /non-waivable|lifetime free/i.test(card.annualFeeWaiverCondition) ? card.annualFeeWaiverCondition : null,
      sourceId: srcId, raw: card.annualFeeWaiverCondition,
    });
  }
  if (card.forexMarkup !== null) {
    rules.push({
      id: ruleId('forex'), cardId: id, ruleType: 'forex', categories: ['international'],
      value: card.forexMarkup, unit: 'percent', perAmount: null,
      condition: text(row['GST Applicability']), cap: null, notes: null, sourceId: srcId,
      raw: String(row['Forex Markup %']),
    });
  } else {
    warn('Forex Markup %', 'Forex markup missing');
  }
  for (const [kind, raw] of [['domestic', card.domesticLounge], ['international', card.internationalLounge]] as const) {
    if (!raw) continue;
    const visits = kind === 'domestic' ? card.domesticLoungeVisits : card.internationalLoungeVisits;
    rules.push({
      id: ruleId('lounge'), cardId: id, ruleType: 'lounge', categories: [],
      value: visits === null || visits === UNLIMITED_LOUNGE ? null : visits,
      unit: visits === null || visits === UNLIMITED_LOUNGE ? null : 'ratio', perAmount: null,
      condition: card.loungeSpendCondition, cap: null,
      notes: `${kind}${visits === UNLIMITED_LOUNGE ? ' · unlimited' : ''}`, sourceId: srcId, raw,
    });
  }
  if (card.milestoneBenefits) {
    rules.push({
      id: ruleId('milestone'), cardId: id, ruleType: 'milestone', categories: [],
      value: null, unit: null, perAmount: null, condition: null, cap: null,
      notes: 'Monetary value not derived — stated as a qualitative benefit', sourceId: srcId,
      raw: card.milestoneBenefits,
    });
  }

  /* ---------------- cross-field consistency ---------------- */
  // An accelerated category that the same card also excludes cannot both be true.
  for (const r of rules.filter((x) => x.ruleType === 'accelerated_reward' && x.value !== null)) {
    const clash = r.categories.filter((c) => excl.categories.includes(c));
    if (clash.length) {
      warn('Accelerated Earn Rate Raw', `"${r.raw}" awards rewards on ${clash.join(', ')}, which this card also lists as excluded — the exclusion is applied`);
    }
  }

  // "Waived on annual spend >= ₹10 Lakhs" alongside a ₹1,00,00,000 threshold is
  // a contradiction in the source; the numeric threshold column is used.
  const conditionAmount = parseMoney(card.annualFeeWaiverCondition);
  if (
    card.annualFeeWaiverThreshold !== null &&
    conditionAmount !== null &&
    Math.abs(conditionAmount - card.annualFeeWaiverThreshold) > 1
  ) {
    warn('Fee Waiver Threshold', `Threshold column says ₹${card.annualFeeWaiverThreshold.toLocaleString('en-IN')} but the condition text says ₹${conditionAmount.toLocaleString('en-IN')}; the threshold column is used`);
  }

  return { entry: { card, rules, sources }, warnings };
}

function mk(
  id: string, cardId: string, ruleType: CardRule['ruleType'], categories: SpendCategory[],
  value: number | null, unit: CardRule['unit'], perAmount: number | null,
  condition: string | null, cap: CardRule['cap'], sourceId: string | null, raw: string,
): CardRule {
  return { id, cardId, ruleType, categories, value, unit, perAmount, condition, cap, notes: null, sourceId, raw };
}

/** Records text we could not resolve, under the rule type it actually belongs to. */
function unresolved(
  id: string, cardId: string, raw: string, sourceId: string | null, notes: string,
  ruleType: CardRule['ruleType'] = 'accelerated_reward',
): CardRule {
  return {
    id, cardId, ruleType, categories: [], value: null, unit: null,
    perAmount: null, condition: null, cap: null, notes, sourceId, raw,
  };
}

/** "(for Prime members)", "up to ₹2 Lakh/month", "direct booking" etc. */
function extractCondition(clause: string): string | null {
  const paren = clause.match(/\(([^)]*(?:member|prime|direct|booking|tier|status)[^)]*)\)/i);
  if (paren) return paren[1];
  const upTo = clause.match(/up to ₹[\d.,]+\s*(?:lakh|lac|crore)?\s*\/?\s*\w*/i);
  if (upTo) return upTo[0];
  if (/direct booking|direct airline/i.test(clause)) return 'Direct bookings only';
  return null;
}

const STOPWORDS = ['cashback', 'points', 'point', 'reward', 'rewards', 'spent', 'spend', 'spends', 'complimentary'];

/** A cap phrased in general terms ("total accelerated", "across partners") binds every accelerated clause. */
function isGlobalCap(cap: RuleCap): boolean {
  return /\btotal\b|\boverall\b|\bacross\b|\baccelerated\b/i.test(cap.raw);
}

function capMatchesClause(cap: RuleCap, clause: string): boolean {
  const capText = cap.raw.toLowerCase();
  const rate = clause.match(/([\d.]+)\s*(%|x\b)/i);
  if (rate && capText.includes(`${rate[1]}${rate[2].toLowerCase().trim()}`)) return true;
  const tokens = clause.toLowerCase().match(/[a-z]{4,}/g) ?? [];
  return tokens.some((t) => !STOPWORDS.includes(t) && capText.includes(t));
}

/** Monthly-equivalent rupee ceiling a cap imposes, used to pick the binding one. */
function capMonthlyCeiling(cap: RuleCap, pointValue: number | null): number {
  const perMonth =
    cap.period === 'day' ? cap.amount * 30 :
    cap.period === 'quarter' ? cap.amount / 3 :
    cap.period === 'year' ? cap.amount / 12 :
    cap.amount;
  if (cap.basis === 'inr_value') return perMonth;
  if (cap.basis === 'points') return pointValue === null ? Number.POSITIVE_INFINITY : perMonth * pointValue;
  return Number.POSITIVE_INFINITY; // spend-basis caps limit spend, not value
}

/**
 * Among the caps that could apply to a clause, attach the most binding one.
 * Spend-basis caps win over value caps only when no value cap applies, because
 * they change which rate applies rather than clamping the value.
 */
function chooseBindingCap(caps: RuleCap[], clause: string, pointValue: number | null): RuleCap | null {
  const candidates = caps.filter((c) => capMatchesClause(c, clause) || isGlobalCap(c));
  const pool = candidates.length > 0 ? candidates : caps.length === 1 ? caps : [];
  if (pool.length === 0) return null;
  return pool.reduce((best, c) =>
    capMonthlyCeiling(c, pointValue) < capMonthlyCeiling(best, pointValue) ? c : best,
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
