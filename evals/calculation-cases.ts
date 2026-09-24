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
  };
}

export const calculationCases: CalculationCase[] = [
  {
    name: 'HDFC Infinia — accelerated SmartBuy rate on online and travel, base rate on dining',
    cardId: 'HDFC-INFINIA-METAL',
    spend: { online: 40000, flights: 20000, dining: 10000 },
    workings: [
      'Annual spend: online 40,000×12=4,80,000 · flights 20,000×12=2,40,000 · dining 10,000×12=1,20,000 (total 8,40,000)',
      'Accelerated: 5X of 5 RP/₹150 = 25 RP/₹150, at ₹1.00/RP = 16.667% on online + flights',
      'Cap 75,000 RP/month = ₹75,000/month; group spend 60,000/month earns ₹10,000/month — cap not reached',
      'Online 4,80,000×16.667% = 80,000 · Flights 2,40,000×16.667% = 40,000',
      'Dining uses the base 5 RP/₹150 = 3.333% → 1,20,000×3.333% = 4,000',
      'Fee 12,500; waiver needs ₹1,00,00,000 annual spend — not met at 8,40,000',
    ].join('\n'),
    expect: {
      totalAnnualSpend: 840000,
      annualSpend: { online: 480000, flights: 240000, dining: 120000 },
      categoryReward: { online: 80000, flights: 40000, dining: 4000 },
      annualRewardValue: 124000,
      annualFee: 12500,
      feeWaived: false,
      annualFeeAfterWaiver: 12500,
      forexCost: 0,
      netAnnualValue: 111500,
    },
  },
  {
    name: 'SBI Card Cashback — 5% online under its ₹5,000 monthly cap, fee waived on spend',
    cardId: 'SBI-CASHBACK',
    spend: { online: 40000, flights: 20000, dining: 10000 },
    workings: [
      'Online 40,000/month × 5% = ₹2,000/month, below the ₹5,000 per statement cycle cap → 24,000/year',
      'Flights and dining fall to the 1% base rate → 2,400 and 1,200',
      'Fee 999; waiver at ₹2,00,000 annual spend, met by 8,40,000 → ₹0',
    ].join('\n'),
    expect: {
      categoryReward: { online: 24000, flights: 2400, dining: 1200 },
      annualRewardValue: 27600,
      feeWaived: true,
      annualFeeAfterWaiver: 0,
      netAnnualValue: 27600,
    },
  },
  {
    name: 'HDFC Millennia — one ₹1,000 monthly cap shared by online and dining',
    cardId: 'HDFC-MILLENNIA',
    spend: { online: 40000, dining: 10000 },
    workings: [
      'Both categories earn under the same 5% rule: 50,000/month × 5% = ₹2,500/month uncapped',
      'The ₹1,000 per statement cycle cap is shared, not per category → ₹1,000/month = 12,000/year',
      'Fee 1,000; waiver at ₹1,00,000, met by 6,00,000 → ₹0',
    ].join('\n'),
    expect: { annualRewardValue: 12000, feeWaived: true, annualFeeAfterWaiver: 0, netAnnualValue: 12000 },
  },
  {
    name: 'SBI Card Cashback — fuel and utilities are excluded and earn nothing',
    cardId: 'SBI-CASHBACK',
    spend: { fuel: 8000, utilities: 5000, online: 10000 },
    workings: [
      'Exclusions: "Rent, Wallet, Fuel, Utility, Govt" → fuel and utilities earn ₹0',
      'Online 10,000/month × 5% = ₹500/month → 6,000/year',
    ].join('\n'),
    expect: { excludedCategories: ['fuel', 'utilities'], annualRewardValue: 6000 },
  },
  {
    name: 'BOB Eterna — 15X accelerated rate clamped by a 5,000 RP monthly cap',
    cardId: 'BOB-ETERNA',
    spend: { online: 40000, dining: 10000, flights: 20000 },
    workings: [
      '15 RP/₹100 at ₹0.25/RP = 3.75% across online, dining and travel',
      'Uncapped: 70,000/month × 3.75% = ₹2,625/month',
      'Cap 5,000 RP per statement cycle × ₹0.25 = ₹1,250/month → 15,000/year',
      'Fee 2,499; waiver at ₹2,50,000, met by 8,40,000 → ₹0',
    ].join('\n'),
    expect: { annualRewardValue: 15000, feeWaived: true, netAnnualValue: 15000 },
  },
  {
    name: 'RBL World Safari — 0% forex markup means no forex cost',
    cardId: 'RBL-WORLD-SAFARI',
    spend: { international: 30000 },
    workings: [
      'International 30,000×12 = 3,60,000; markup 0.00% → forex cost ₹0',
      'International spend earns the base 2 TP/₹100 at ₹0.25/TP = 0.5% → 1,800',
      'Fee 3,000; waiver needs ₹5,00,000 — not met at 3,60,000',
    ].join('\n'),
    expect: { forexCost: 0, annualRewardValue: 1800, feeWaived: false, netAnnualValue: -1200 },
  },
  {
    name: 'HDFC Infinia — 2% forex markup is charged as a cost, not netted off rewards',
    cardId: 'HDFC-INFINIA-METAL',
    spend: { international: 50000 },
    workings: [
      'International 50,000×12 = 6,00,000 × 2.00% = ₹12,000 forex cost',
      'It still earns the base 5 RP/₹150 at ₹1.00/RP = 3.333% → 20,000',
      'Fee 12,500 not waived at 6,00,000 → net 20,000 − 12,500 − 12,000 = −4,500',
    ].join('\n'),
    expect: { forexCost: 12000, annualRewardValue: 20000, netAnnualValue: -4500 },
  },
  {
    name: 'Axis Atlas — EDGE Miles have no stated rupee value, so no value is invented',
    cardId: 'AXIS-ATLAS',
    spend: { flights: 50000, online: 20000 },
    workings: [
      '"1 EDGE Mile = 2 Partner Miles" gives no rupee conversion → rewards are not monetizable',
      'The fee is documented as non-waivable, so it stands at ₹5,000',
    ].join('\n'),
    expect: { annualRewardValue: 0, hasUnmonetizableRewards: true, feeWaived: false, annualFeeAfterWaiver: 5000 },
  },
  {
    name: 'ICICI Amazon Pay — lifetime free card, no fee at any spend level',
    cardId: 'ICICI-AMAZONPAY',
    spend: { online: 25000, dining: 5000 },
    workings: [
      'Online 25,000/month × 5% (Prime rate, uncapped) = 15,000/year',
      'Dining matches the 2% partner-merchant clause → 60,000 × 2% = 1,200',
      'No annual fee → net equals rewards',
    ].join('\n'),
    expect: { annualFee: 0, feeWaived: true, annualRewardValue: 16200, netAnnualValue: 16200 },
  },
  {
    name: 'Zero spend — every card values to its fee position, never a negative reward',
    cardId: 'HDFC-REGALIA-GOLD',
    spend: {},
    workings: 'No spend → no rewards, no forex; the annual fee is not waived at ₹0 spend.',
    expect: { totalAnnualSpend: 0, annualRewardValue: 0, forexCost: 0, feeWaived: false, netAnnualValue: -2500 },
  },
];
