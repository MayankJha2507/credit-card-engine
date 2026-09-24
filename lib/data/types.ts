/**
 * Domain types shared by the import pipeline, the calculation engine and the UI.
 *
 * Design rule (see README "Raw facts vs derived values"): everything in here is a
 * RAW fact taken from the workbook. Effective reward rates, annual values, fee
 * waiver outcomes etc. are never stored — they are derived by /lib/calculations.
 */

export const SPEND_CATEGORIES = [
  'online',
  'dining',
  'flights',
  'hotels',
  'groceries',
  'fuel',
  'utilities',
  'international',
  'other',
] as const;

export type SpendCategory = (typeof SPEND_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<SpendCategory, string> = {
  online: 'Online shopping',
  dining: 'Dining',
  flights: 'Flights / travel',
  hotels: 'Hotels',
  groceries: 'Groceries',
  fuel: 'Fuel',
  utilities: 'Utilities',
  international: 'International spending',
  other: 'Other',
};

export type RuleType =
  | 'base_reward'
  | 'accelerated_reward'
  | 'reward_cap'
  | 'exclusion'
  | 'redemption'
  | 'lounge'
  | 'fee_waiver'
  | 'milestone'
  | 'forex';

export type RewardUnit = 'points' | 'cashback_percent';

/** A cap on how much can be earned (or spent at an accelerated rate) in a period. */
export type CapPeriod = 'day' | 'statement_month' | 'month' | 'quarter' | 'year';
export type CapBasis = 'points' | 'inr_value' | 'spend';

export interface RuleCap {
  amount: number;
  basis: CapBasis;
  period: CapPeriod;
  /** Verbatim workbook text the cap was parsed from. */
  raw: string;
}

/**
 * One meaningful rule for one card. `value`/`unit` hold the raw earn definition,
 * e.g. { points: 5, perAmount: 150 } for "5 Reward Points per Rs.150 spent".
 */
export interface CardRule {
  id: string;
  cardId: string;
  ruleType: RuleType;
  /** Canonical categories this rule applies to. Empty = applies to everything. */
  categories: SpendCategory[];
  value: number | null;
  unit: RewardUnit | 'percent' | 'inr' | 'ratio' | null;
  /** For point rules: spend increment the points are awarded per (e.g. 150). */
  perAmount: number | null;
  condition: string | null;
  cap: RuleCap | null;
  notes: string | null;
  sourceId: string | null;
  /** Verbatim workbook text. Always preserved. */
  raw: string;
}

export interface CardSource {
  id: string;
  cardId: string;
  sourceType: string;
  sourceUrl: string;
  sourceTitle: string;
  fieldsCovered: string[];
  accessedAt: string | null;
  reliabilityTier: string;
}

export interface Card {
  id: string;
  slug: string;
  issuer: string;
  issuerSlug: string;
  name: string;
  network: string | null;
  variant: string | null;
  cardType: string | null;
  activeStatus: boolean;
  applicationAvailable: boolean;
  joiningFee: number | null;
  annualFee: number | null;
  annualFeeWaiverThreshold: number | null;
  annualFeeWaiverCondition: string | null;
  /** Percent, e.g. 3.5 means 3.50%. */
  forexMarkup: number | null;
  dccMarkup: string | null;
  domesticLounge: string | null;
  internationalLounge: string | null;
  loungeProgram: string | null;
  /** Complimentary visits per year. `-1` means unlimited; null means not recorded. */
  domesticLoungeVisits: number | null;
  internationalLoungeVisits: number | null;
  loungeSpendCondition: string | null;
  baseRewardRateRaw: string | null;
  acceleratedRateRaw: string | null;
  rewardCapsRaw: string | null;
  rewardExclusionsRaw: string | null;
  redemptionRatioRaw: string | null;
  redemptionOptions: string | null;
  cashbackRateRaw: string | null;
  welcomeBenefit: string | null;
  milestoneBenefits: string | null;
  travelBenefits: string | null;
  diningBenefits: string | null;
  otherBenefits: string | null;
  eligibility: string | null;
  minimumIncome: number | null;
  ageLimit: string | null;
  relationshipRequirement: string | null;
  creditScoreRequirement: string | null;
  dataConfidence: string | null;
  researchStatus: string | null;
  lastVerifiedAt: string | null;
  notes: string | null;
}

export interface CardWithRules {
  card: Card;
  rules: CardRule[];
  sources: CardSource[];
}

export const UNLIMITED_LOUNGE = -1;

export function hasLoungeAccess(visits: number | null | undefined): boolean {
  return visits === UNLIMITED_LOUNGE || (visits ?? 0) > 0;
}

export function loungeVisitsLabel(visits: number | null | undefined): string | null {
  if (visits === UNLIMITED_LOUNGE) return 'Unlimited';
  if (visits === null || visits === undefined) return null;
  return `${visits} per year`;
}

export function isRecommendable(card: Card): boolean {
  return (
    card.activeStatus &&
    card.applicationAvailable &&
    (card.researchStatus ?? '').toLowerCase().includes('fully researched')
  );
}
