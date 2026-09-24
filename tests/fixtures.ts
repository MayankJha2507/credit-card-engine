import type { Card, CardRule, CardWithRules } from '@/lib/data/types';

export function makeCard(over: Partial<Card> = {}): Card {
  return {
    id: 'TEST-CARD', slug: 'test-card', issuer: 'Test Bank', issuerSlug: 'test', name: 'Test Card',
    network: 'Visa', variant: 'Premium', cardType: 'Rewards', activeStatus: true, applicationAvailable: true,
    joiningFee: 0, annualFee: 1000, annualFeeWaiverThreshold: 200000,
    annualFeeWaiverCondition: '₹200,000 spend in previous anniversary year', forexMarkup: 3.5,
    dccMarkup: null, domesticLounge: null, internationalLounge: null, loungeProgram: null,
    domesticLoungeVisits: null, internationalLoungeVisits: null, loungeSpendCondition: null,
    baseRewardRateRaw: null, acceleratedRateRaw: null, rewardCapsRaw: null, rewardExclusionsRaw: null,
    redemptionRatioRaw: null, redemptionOptions: null, cashbackRateRaw: null, welcomeBenefit: null,
    milestoneBenefits: null, travelBenefits: null, diningBenefits: null, otherBenefits: null,
    eligibility: null, minimumIncome: null, ageLimit: null, relationshipRequirement: null,
    creditScoreRequirement: null, dataConfidence: 'High (Tier 1 Verified)', researchStatus: 'Fully Researched',
    lastVerifiedAt: '2026-09-15', notes: null, ...over,
  };
}

export function makeRule(over: Partial<CardRule> & Pick<CardRule, 'id' | 'ruleType'>): CardRule {
  return {
    cardId: 'TEST-CARD', categories: [], value: null, unit: null, perAmount: null,
    condition: null, cap: null, notes: null, sourceId: null, raw: 'raw', ...over,
  };
}

export function makeEntry(card: Partial<Card>, rules: CardRule[]): CardWithRules {
  const c = makeCard(card);
  return { card: c, rules: rules.map((r) => ({ ...r, cardId: c.id })), sources: [] };
}
