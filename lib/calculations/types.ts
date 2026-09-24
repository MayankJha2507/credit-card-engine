import type { SpendCategory } from '@/lib/data/types';

/** Approximate monthly spend, in rupees, per category. Missing = 0. */
export type SpendProfile = Partial<Record<SpendCategory, number>>;

export const PRIORITIES = [
  'cashback',
  'reward_points',
  'travel_rewards',
  'lounge_access',
  'low_forex',
  'dining',
  'entertainment',
  'low_annual_fee',
  'premium_benefits',
] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABELS: Record<Priority, string> = {
  cashback: 'Cashback',
  reward_points: 'Reward points',
  travel_rewards: 'Travel rewards',
  lounge_access: 'Airport lounge access',
  low_forex: 'Low forex charges',
  dining: 'Dining benefits',
  entertainment: 'Movies / entertainment',
  low_annual_fee: 'Low annual fee',
  premium_benefits: 'Premium benefits',
};

export const FEE_BANDS = ['zero', 'under_1k', '1k_5k', '5k_10k', '10k_plus'] as const;
export type FeeBand = (typeof FEE_BANDS)[number];

export const FEE_BAND_LABELS: Record<FeeBand, string> = {
  zero: '₹0',
  under_1k: 'Under ₹1,000',
  '1k_5k': '₹1,000–₹5,000',
  '5k_10k': '₹5,000–₹10,000',
  '10k_plus': '₹10,000+',
};

/** Inclusive upper bound of each band, in rupees. */
export const FEE_BAND_MAX: Record<FeeBand, number> = {
  zero: 0,
  under_1k: 999,
  '1k_5k': 5000,
  '5k_10k': 10000,
  '10k_plus': Number.POSITIVE_INFINITY,
};

export type LoungeImportance = 'not_important' | 'nice_to_have' | 'important';

export interface UserProfile {
  spend: SpendProfile;
  priorities: Priority[];
  feeBand: FeeBand;
  internationalTravel: boolean;
  loungeImportance: LoungeImportance;
}

/** One category's contribution, with every input the number came from. */
export interface CategoryBreakdown {
  category: SpendCategory;
  annualSpend: number;
  excluded: boolean;
  exclusionReason: string | null;
  /** Verbatim rule text used. */
  ruleRaw: string | null;
  ruleCondition: string | null;
  /** Effective rupees of reward per rupee spent, e.g. 0.0333. Null = not monetizable. */
  effectiveRate: number | null;
  /** Spend that earned at the accelerated rate after caps. */
  cappedSpend: number | null;
  capRaw: string | null;
  capReductionValue: number;
  rewardValue: number;
  monetizable: boolean;
  note: string | null;
}

export interface CardValuation {
  cardId: string;
  totalAnnualSpend: number;
  categories: CategoryBreakdown[];
  /** Sum of monetizable category reward values, after caps and exclusions. */
  annualRewardValue: number;
  /** True when at least one earn rule could not be converted to rupees. */
  hasUnmonetizableRewards: boolean;
  unmonetizableReasons: string[];
  annualFee: number;
  joiningFee: number;
  feeWaived: boolean;
  feeWaiverReason: string;
  annualFeeAfterWaiver: number;
  forexCost: number;
  forexMarkup: number | null;
  /** annualRewardValue − annualFeeAfterWaiver − forexCost */
  netAnnualValue: number;
  restrictions: string[];
  /**
   * Limits of the source data that affect how much this estimate can be trusted,
   * e.g. a cap the card states but does not quantify. Shown to the user; never
   * silently absorbed into the numbers.
   */
  dataCaveats: string[];
  /**
   * True when the card states a cap it does not quantify, so the reward figure
   * is an upper bound rather than an estimate. The UI says "up to" instead of
   * presenting it as a firm number.
   */
  isUpperBound: boolean;
  loungeSummary: { domestic: string | null; international: string | null; condition: string | null };
}
