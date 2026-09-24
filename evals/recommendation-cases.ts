/**
 * Representative user profiles.
 *
 * These assert *properties that follow from the documented methodology*
 * (/lib/recommendations/README.md) rather than "card X must win", so the suite
 * stays meaningful as the card database grows. A handful of cases do name a
 * card, but only where the calculation rules make the outcome objective — and
 * those are marked `objective` with the reason.
 */
import type { UserProfile } from '../lib/calculations/types';

export interface RecommendationCase {
  name: string;
  profile: UserProfile;
  /** Property assertions evaluated against the result. */
  expect: {
    minMatches?: number;
    maxMatches?: number;
    /** No returned card may have an annual fee above the band unless waived. */
    respectsFeeBand?: boolean;
    /** Top match must have the highest net value among returned cards, or be inside the documented value window. */
    topIsValueJustified?: boolean;
    /** Every returned card must have lounge access. */
    allHaveLounge?: boolean;
    /** Every returned card must have a forex markup at or below this. */
    maxForexMarkup?: number;
    /** Every returned card must be cashback-earning. */
    allCashback?: boolean;
    /** Every returned card must cost the user ₹0 in annual fee after any waiver. */
    allFeeFree?: boolean;
    /** The top match's fee must be zero after any waiver at this spend level. */
    topFeeSettled?: boolean;
    /** Objective outcome the calculation rules force. */
    objective?: { cardId: string; within: number; reason: string };
  };
}

const p = (
  name: string,
  spend: UserProfile['spend'],
  priorities: UserProfile['priorities'],
  feeBand: UserProfile['feeBand'],
  internationalTravel: boolean,
  loungeImportance: UserProfile['loungeImportance'],
  expect: RecommendationCase['expect'],
): RecommendationCase => ({ name, profile: { spend, priorities, feeBand, internationalTravel, loungeImportance }, expect });

const BASE = { respectsFeeBand: true, topIsValueJustified: true, minMatches: 1, maxMatches: 3 };

export const recommendationCases: RecommendationCase[] = [
  p('A — Cashback focused, low fee', { online: 50000, dining: 10000, groceries: 5000 }, ['cashback', 'low_annual_fee'], 'under_1k', false, 'not_important',
    { ...BASE, allCashback: true }),

  p('B — Frequent traveller, lounge matters', { online: 20000, dining: 20000, flights: 50000, international: 30000 }, ['travel_rewards', 'lounge_access', 'low_forex'], '10k_plus', true, 'important',
    { ...BASE, allHaveLounge: true }),

  p('C — Low-fee user, zero fee only', { online: 30000, groceries: 10000, dining: 5000 }, ['low_annual_fee'], 'zero', false, 'not_important',
    { ...BASE }),

  p('D — Premium spender', { online: 100000, dining: 30000, flights: 50000, hotels: 20000, international: 40000 }, ['premium_benefits', 'travel_rewards', 'lounge_access'], '10k_plus', true, 'important',
    { ...BASE, allHaveLounge: true }),

  p('E — Online-only shopper', { online: 60000 }, ['cashback'], '1k_5k', false, 'not_important',
    { ...BASE, allCashback: true }),

  p('F — Heavy international, forex sensitive', { international: 80000, online: 20000 }, ['low_forex'], '10k_plus', true, 'nice_to_have',
    { ...BASE, maxForexMarkup: 2 }),

  p('G — Fuel-heavy commuter (fuel is excluded almost everywhere)', { fuel: 20000, online: 10000, groceries: 10000 }, ['cashback'], 'under_1k', false, 'not_important',
    { ...BASE }),

  p('H — Groceries and utilities household', { groceries: 25000, utilities: 8000, online: 10000 }, ['cashback', 'low_annual_fee'], '1k_5k', false, 'not_important',
    { ...BASE }),

  p('I — Dining-led young professional', { dining: 25000, online: 15000, entertainmentPlaceholder: 0 } as UserProfile['spend'], ['dining', 'entertainment'], 'under_1k', false, 'nice_to_have',
    { ...BASE }),

  p('J — Balanced mid spender', { online: 20000, dining: 10000, groceries: 10000, fuel: 5000, utilities: 5000 }, ['reward_points'], '1k_5k', false, 'nice_to_have',
    { ...BASE }),

  p('K — Hotel-heavy business traveller', { hotels: 60000, flights: 30000, dining: 15000 }, ['travel_rewards', 'lounge_access'], '5k_10k', true, 'important',
    { ...BASE, allHaveLounge: true }),

  p('L — Very low spender', { online: 3000, dining: 2000 }, ['low_annual_fee'], 'zero', false, 'not_important',
    { ...BASE }),

  p('M — No spend entered at all', {}, ['low_annual_fee'], 'zero', false, 'not_important',
    { ...BASE }),

  p('N — Single category, very high spend', { online: 200000 }, ['reward_points'], '10k_plus', false, 'not_important',
    { ...BASE }),

  p('O — Lounge is the only thing that matters', { online: 15000, flights: 10000 }, ['lounge_access'], '5k_10k', false, 'important',
    { ...BASE, allHaveLounge: true }),

  p('P — Cashback purist, no fee tolerance', { online: 40000, groceries: 15000 }, ['cashback'], 'zero', false, 'not_important',
    { ...BASE, allCashback: true }),

  p('Q — Points collector, mid fee', { online: 35000, dining: 15000, flights: 15000 }, ['reward_points', 'travel_rewards'], '1k_5k', false, 'nice_to_have',
    { ...BASE }),

  p('R — International student-style profile', { international: 40000, online: 10000, dining: 5000 }, ['low_forex', 'low_annual_fee'], 'under_1k', true, 'not_important',
    { ...BASE }),

  p('S — Entertainment-led', { online: 20000, dining: 10000 }, ['entertainment', 'cashback'], 'under_1k', false, 'not_important',
    { ...BASE }),

  p('T — Premium travel, fee insensitive, no international', { flights: 60000, hotels: 40000, dining: 20000, online: 30000 }, ['travel_rewards', 'premium_benefits'], '10k_plus', false, 'important',
    { ...BASE, allHaveLounge: true }),

  p('U — Utilities-led (commonly excluded)', { utilities: 20000, online: 10000 }, ['cashback'], 'under_1k', false, 'not_important',
    { ...BASE }),

  p('V — Everything at once', { online: 30000, dining: 15000, flights: 15000, hotels: 10000, groceries: 10000, fuel: 5000, utilities: 5000, international: 10000, other: 10000 },
    ['travel_rewards', 'cashback', 'lounge_access', 'low_forex'], '10k_plus', true, 'nice_to_have', { ...BASE }),

  p('W — High spender who clears the Infinia waiver threshold', { online: 400000, flights: 300000, dining: 150000 }, ['reward_points', 'premium_benefits', 'lounge_access'], '10k_plus', true, 'important',
    {
      ...BASE, allHaveLounge: true,
      // At ₹8.5 lakh a month, any card whose fee is waivable on spend must show a
      // settled fee. Pinning a specific card here would not be objective: several
      // cards state caps without amounts, so their figures are upper bounds.
      topFeeSettled: true,
    }),

  p('X — Zero-fee shopper where a lifetime-free card must qualify', { online: 30000 }, ['cashback', 'low_annual_fee'], 'zero', false, 'not_important',
    {
      ...BASE, allCashback: true,
      allFeeFree: true,
    }),
];
