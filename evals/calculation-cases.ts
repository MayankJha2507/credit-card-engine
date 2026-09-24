/**
 * Deterministic calculation cases against the real imported card data.
 *
 * Every expected number below is derived by hand from the workbook's raw facts,
 * so a change in the engine OR in the card data shows up as a failure with the
 * arithmetic spelled out in `workings`.
 */
import type { SpendProfile } from '../lib/calculations/types';

export interface CalculationCase {
  name: string;
  cardId: string;
  spend: SpendProfile;
  workings: string;
  expect: {
    totalAnnualSpend?: number;
    annualSpend?: Record<string, number>;
    effectiveRate?: Record<string, number>;
    categoryReward?: Record<string, number>;
    annualRewardValue?: number;
    annualFee?: number;
    feeWaived?: boolean;
    annualFeeAfterWaiver?: number;
    forexCost?: number;
    netAnnualValue?: number;
    hasUnmonetizableRewards?: boolean;
    excludedCategories?: string[];
    /** True when a stated-but-unquantified cap makes the figure an upper bound. */
    isUpperBound?: boolean;
  };
}

export const calculationCases: CalculationCase[] = [
  {
    name: 'HDFC Infinia — 10X SmartBuy rate on online, base rate elsewhere, under its RP cap',
    cardId: 'HDFC-INFINIA-METAL',
    spend: { online: 40000, flights: 20000, dining: 10000 },
    workings: [
      'Annual spend: online 40,000×12=4,80,000 · flights 2,40,000 · dining 1,20,000 (total 8,40,000)',
      'Accelerated "Up to 10X Rewards on SmartBuy (50 RPs / ₹150)" = 50 RP/₹150 at ₹1.00/RP = 33.333%, and SmartBuy resolves to online only',
      'Cap 15,000 RPs/month = ₹15,000/month; online earns 40,000×33.333% = ₹13,333/month, so the cap does not bite',
      'Online 4,80,000 × 33.333% = 1,60,000',
      'Flights and dining fall to the base 5 RP/₹150 = 3.333% → 8,000 and 4,000',
      'Fee 12,500; the waiver threshold column says ₹1,00,00,000 — not met at 8,40,000',
    ].join('\n'),
    expect: {
      totalAnnualSpend: 840000,
      annualSpend: { online: 480000, flights: 240000, dining: 120000 },
      categoryReward: { online: 160000, flights: 8000, dining: 4000 },
      annualRewardValue: 172000,
      annualFee: 12500,
      feeWaived: false,
      annualFeeAfterWaiver: 12500,
      forexCost: 0,
      netAnnualValue: 159500,
      isUpperBound: false,
    },
  },
  {
    name: 'HDFC Regalia Gold — 5X anchored to the base rate, clamped by a 5,000 RP monthly cap',
    cardId: 'HDFC-REGALIA-GOLD',
    spend: { online: 40000, flights: 20000, dining: 10000 },
    workings: [
      'Redemption states ₹0.50 and ₹0.35 per point; the lowest stated value (₹0.35) is used',
      'Base 4 RP/₹150 × ₹0.35 = 0.9333% · accelerated 5X = 20 RP/₹150 × ₹0.35 = 4.6667% on online',
      'Uncapped online: 40,000 × 4.6667% = ₹1,866.67/month, above the 5,000 RP (₹1,750) monthly cap',
      'Online = ₹1,750 × 12 = 21,000 · dining 1,20,000 × 0.9333% = 1,120 · flights 2,40,000 × 0.9333% = 2,240',
      'Fee 2,500; waiver at ₹4,00,000 is met by 8,40,000',
    ].join('\n'),
    expect: {
      categoryReward: { online: 21000, dining: 1120, flights: 2240 },
      annualRewardValue: 24360,
      feeWaived: true,
      annualFeeAfterWaiver: 0,
      netAnnualValue: 24360,
    },
  },
  {
    name: 'SBI Card Cashback — 5% online, fee waived on spend, cap stated but not quantified',
    cardId: 'SBI-CASHBACK',
    spend: { online: 40000, flights: 20000, dining: 10000 },
    workings: [
      'Online 4,80,000 × 5% = 24,000 · flights and dining at the 1% base = 2,400 and 1,200',
      'The card states "Monthly category cap applies" with no amount, so the figure is an upper bound',
      'Fee 999; waiver at ₹2,00,000 met by 8,40,000 → ₹0',
    ].join('\n'),
    expect: {
      categoryReward: { online: 24000, flights: 2400, dining: 1200 },
      annualRewardValue: 27600,
      feeWaived: true,
      annualFeeAfterWaiver: 0,
      netAnnualValue: 27600,
      isUpperBound: true,
    },
  },
  {
    name: 'HDFC Millennia — one ₹1,000 monthly cap shared by online and dining',
    cardId: 'HDFC-MILLENNIA',
    spend: { online: 40000, dining: 10000 },
    workings: [
      'Both categories earn under the same 5% rule: 50,000/month × 5% = ₹2,500/month uncapped',
      'The ₹1,000/month cap is shared, not per category → ₹1,000/month = 12,000/year',
      'Fee 1,000; waiver at ₹1,00,000 met by 6,00,000 → ₹0',
    ].join('\n'),
    expect: { annualRewardValue: 12000, feeWaived: true, annualFeeAfterWaiver: 0, netAnnualValue: 12000, isUpperBound: false },
  },
  {
    name: 'SBI Card Cashback — fuel is excluded and earns nothing; utilities are not',
    cardId: 'SBI-CASHBACK',
    spend: { fuel: 8000, utilities: 5000, online: 10000 },
    workings: [
      'Exclusions are "Fuel, Wallet, Rent, Govt Spends" — fuel earns ₹0, utilities are not excluded',
      'Utilities 60,000 × 1% base = 600 · online 1,20,000 × 5% = 6,000',
    ].join('\n'),
    expect: { excludedCategories: ['fuel'], categoryReward: { utilities: 600, online: 6000 }, annualRewardValue: 6600 },
  },
  {
    name: 'RBL World Safari — 0% forex markup means no forex cost, and the waiver is met',
    cardId: 'RBL-WORLD-SAFARI',
    spend: { international: 30000 },
    workings: [
      'International 3,60,000; markup 0.00% → forex cost ₹0',
      'The accelerated travel rate covers flights, not international spend, so the base 2 TP/₹100 applies',
      'Points are valued at the lowest stated ₹0.20 → base rate 0.4% → 3,60,000 × 0.4% = 1,440',
      'Fee 3,000; waiver at ₹3,00,000 met by 3,60,000 → ₹0',
    ].join('\n'),
    expect: { forexCost: 0, annualRewardValue: 1440, feeWaived: true, annualFeeAfterWaiver: 0, netAnnualValue: 1440 },
  },
  {
    name: 'HDFC Infinia — 2% forex markup is charged as a cost, not netted off rewards',
    cardId: 'HDFC-INFINIA-METAL',
    spend: { international: 50000 },
    workings: [
      'International 6,00,000 × 2.00% = ₹12,000 forex cost',
      'International is not a SmartBuy category, so it earns the base 3.333% → 20,000',
      'Fee 12,500 not waived at 6,00,000 → net 20,000 − 12,500 − 12,000 = −4,500',
    ].join('\n'),
    expect: { forexCost: 12000, annualRewardValue: 20000, netAnnualValue: -4500 },
  },
  {
    name: 'IDFC FIRST Wealth — a multiplier base with no absolute rate is never guessed at',
    cardId: 'IDFC-FIRST-WEALTH',
    spend: { online: 40000, dining: 10000 },
    workings: [
      'The base rate reads "3X RPs offline" — a multiplier with no absolute rate anywhere on the card',
      'Nothing can be derived from that, so no rupee value is produced and the card is flagged instead',
    ].join('\n'),
    expect: { annualRewardValue: 0, hasUnmonetizableRewards: true },
  },
  {
    name: 'Amazon Pay ICICI — an ambiguous accelerated rate is not counted, the base rate still is',
    cardId: 'ICICI-AMAZON-PAY',
    spend: { online: 25000, dining: 5000 },
    workings: [
      '"5% Cashback for Prime / 3% Non-Prime" names no spend category we can attribute it to, so it is not applied',
      'Everything earns the 1% base → 3,60,000 × 1% = 3,600',
      'Lifetime free card → no annual fee at any spend level',
    ].join('\n'),
    expect: { annualFee: 0, feeWaived: true, annualRewardValue: 3600, netAnnualValue: 3600 },
  },
  {
    name: 'Zero spend — every card values to its fee position, never a negative reward',
    cardId: 'HDFC-REGALIA-GOLD',
    spend: {},
    workings: 'No spend → no rewards, no forex; the annual fee is not waived at ₹0 spend.',
    expect: { totalAnnualSpend: 0, annualRewardValue: 0, forexCost: 0, feeWaived: false, netAnnualValue: -2500 },
  },
];
