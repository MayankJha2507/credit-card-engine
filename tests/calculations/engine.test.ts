import { describe, expect, it } from 'vitest';
import { capPerMonth, effectiveRate, valuateCard } from '@/lib/calculations/engine';
import { makeEntry, makeRule } from '../fixtures';

const redemption = (v: number | null) => makeRule({ id: 'r-redeem', ruleType: 'redemption', value: v, unit: v === null ? null : 'inr' });

describe('effectiveRate', () => {
  it('derives a rate from the raw fact rather than storing one', () => {
    const rule = makeRule({ id: 'r1', ruleType: 'base_reward', value: 5, unit: 'points', perAmount: 150 });
    expect(effectiveRate(rule, 1)).toBeCloseTo(0.03333, 5); // 5 RP / ₹150 at ₹1/RP
    expect(effectiveRate(rule, 0.25)).toBeCloseTo(0.008333, 6);
  });
  it('is null when no rupee value per point is known', () => {
    const rule = makeRule({ id: 'r1', ruleType: 'base_reward', value: 2, unit: 'points', perAmount: 100 });
    expect(effectiveRate(rule, null)).toBeNull();
  });
  it('converts cashback percentages', () => {
    expect(effectiveRate(makeRule({ id: 'r1', ruleType: 'base_reward', value: 5, unit: 'cashback_percent' }), null)).toBe(0.05);
  });
});

describe('capPerMonth', () => {
  it('normalises every period to a month', () => {
    expect(capPerMonth({ amount: 100, basis: 'points', period: 'day', raw: '' })).toBe(3000);
    expect(capPerMonth({ amount: 100, basis: 'points', period: 'month', raw: '' })).toBe(100);
    expect(capPerMonth({ amount: 300, basis: 'points', period: 'quarter', raw: '' })).toBe(100);
    expect(capPerMonth({ amount: 1200, basis: 'points', period: 'year', raw: '' })).toBe(100);
  });
});

describe('valuateCard', () => {
  it('annualises monthly spend', () => {
    const entry = makeEntry({}, [redemption(1), makeRule({ id: 'b', ruleType: 'base_reward', value: 1, unit: 'cashback_percent' })]);
    const v = valuateCard(entry, { online: 40000, flights: 20000, dining: 10000 });
    expect(v.totalAnnualSpend).toBe(840000);
    expect(v.categories.find((c) => c.category === 'online')!.annualSpend).toBe(480000);
    expect(v.categories.find((c) => c.category === 'flights')!.annualSpend).toBe(240000);
    expect(v.categories.find((c) => c.category === 'dining')!.annualSpend).toBe(120000);
  });

  it('prefers the accelerated rule for the categories it covers', () => {
    const entry = makeEntry({}, [
      redemption(1),
      makeRule({ id: 'b', ruleType: 'base_reward', value: 1, unit: 'cashback_percent' }),
      makeRule({ id: 'a', ruleType: 'accelerated_reward', value: 5, unit: 'cashback_percent', categories: ['online'] }),
    ]);
    const v = valuateCard(entry, { online: 10000, dining: 10000 });
    expect(v.categories.find((c) => c.category === 'online')!.rewardValue).toBe(6000);   // 120000 × 5%
    expect(v.categories.find((c) => c.category === 'dining')!.rewardValue).toBe(1200);   // 120000 × 1%
  });

  it('applies a rupee-value cap per month', () => {
    const entry = makeEntry({}, [
      redemption(1),
      makeRule({ id: 'b', ruleType: 'base_reward', value: 1, unit: 'cashback_percent' }),
      makeRule({
        id: 'a', ruleType: 'accelerated_reward', value: 5, unit: 'cashback_percent', categories: ['online'],
        cap: { amount: 1000, basis: 'inr_value', period: 'statement_month', raw: '₹1,000 per statement cycle' },
      }),
    ]);
    const v = valuateCard(entry, { online: 40000 });
    const online = v.categories.find((c) => c.category === 'online')!;
    expect(online.rewardValue).toBe(12000);             // capped at ₹1,000 × 12
    expect(online.capReductionValue).toBe(12000);       // uncapped would have been ₹24,000
  });

  it('shares one cap across every category earning under the same rule', () => {
    const entry = makeEntry({}, [
      redemption(1),
      makeRule({ id: 'b', ruleType: 'base_reward', value: 1, unit: 'cashback_percent' }),
      makeRule({
        id: 'a', ruleType: 'accelerated_reward', value: 5, unit: 'cashback_percent', categories: ['online', 'dining'],
        cap: { amount: 1000, basis: 'inr_value', period: 'month', raw: '₹1,000 per month' },
      }),
    ]);
    const v = valuateCard(entry, { online: 10000, dining: 10000 });
    const total = v.categories.reduce((n, c) => n + c.rewardValue, 0);
    expect(total).toBe(12000); // one shared ₹1,000/month cap, not ₹1,000 each
  });

  it('applies a spend-basis cap by dropping to the base rate beyond it', () => {
    const entry = makeEntry({}, [
      redemption(1),
      makeRule({ id: 'b', ruleType: 'base_reward', value: 2, unit: 'points', perAmount: 100 }),
      makeRule({
        id: 'a', ruleType: 'accelerated_reward', value: 5, unit: 'points', perAmount: 100, categories: ['flights'],
        cap: { amount: 200000, basis: 'spend', period: 'month', raw: '₹2 Lakh spend/month' },
      }),
    ]);
    const v = valuateCard(entry, { flights: 300000 });
    // 200k at 5% + 100k at 2% = 12,000 per month
    expect(v.annualRewardValue).toBe(144000);
    expect(v.categories[0].cappedSpend).toBe(2400000);
  });

  it('awards nothing for an excluded category', () => {
    const entry = makeEntry({ rewardExclusionsRaw: 'Fuel, Wallet, Rent' }, [
      redemption(1),
      makeRule({ id: 'b', ruleType: 'base_reward', value: 1, unit: 'cashback_percent' }),
      makeRule({ id: 'x', ruleType: 'exclusion', categories: ['fuel'], raw: 'Fuel, Wallet, Rent' }),
    ]);
    const v = valuateCard(entry, { fuel: 10000, online: 10000 });
    const fuel = v.categories.find((c) => c.category === 'fuel')!;
    expect(fuel.excluded).toBe(true);
    expect(fuel.rewardValue).toBe(0);
    expect(v.annualRewardValue).toBe(1200);
  });

  it('waives the fee only when the documented threshold is met', () => {
    const rules = [redemption(1), makeRule({ id: 'b', ruleType: 'base_reward', value: 1, unit: 'cashback_percent' })];
    const below = valuateCard(makeEntry({ annualFee: 1000, annualFeeWaiverThreshold: 200000 }, rules), { online: 10000 });
    expect(below.feeWaived).toBe(false);
    expect(below.annualFeeAfterWaiver).toBe(1000);

    const above = valuateCard(makeEntry({ annualFee: 1000, annualFeeWaiverThreshold: 200000 }, rules), { online: 20000 });
    expect(above.feeWaived).toBe(true);
    expect(above.annualFeeAfterWaiver).toBe(0);
  });

  it('never waives a fee documented as non-waivable', () => {
    const v = valuateCard(
      makeEntry({ annualFee: 5000, annualFeeWaiverThreshold: null, annualFeeWaiverCondition: 'Fee non-waivable; offset by milestone EDGE Miles' },
        [redemption(1), makeRule({ id: 'b', ruleType: 'base_reward', value: 1, unit: 'cashback_percent' })]),
      { online: 500000 },
    );
    expect(v.feeWaived).toBe(false);
    expect(v.annualFeeAfterWaiver).toBe(5000);
  });

  it('treats forex as a cost, never as a reward', () => {
    const entry = makeEntry({ forexMarkup: 3.5 }, [redemption(1), makeRule({ id: 'b', ruleType: 'base_reward', value: 1, unit: 'cashback_percent' })]);
    const v = valuateCard(entry, { international: 30000 });
    expect(v.forexCost).toBe(12600);            // 360000 × 3.5%
    expect(v.annualRewardValue).toBe(3600);     // still earns the base rate
    expect(v.netAnnualValue).toBe(3600 - 12600 - 1000 + 1000 * Number(v.feeWaived));
  });

  it('reports non-monetizable rewards instead of inventing a value', () => {
    const entry = makeEntry({}, [
      redemption(null),
      makeRule({ id: 'b', ruleType: 'base_reward', value: 2, unit: 'points', perAmount: 100, raw: '2 EDGE Miles per ₹100 spent' }),
    ]);
    const v = valuateCard(entry, { online: 50000 });
    expect(v.annualRewardValue).toBe(0);
    expect(v.hasUnmonetizableRewards).toBe(true);
    expect(v.categories[0].monetizable).toBe(false);
    expect(v.categories[0].ruleRaw).toBe('2 EDGE Miles per ₹100 spent');
  });

  it('assigns no rupee value to lounge access', () => {
    const entry = makeEntry({ domesticLounge: 'Unlimited domestic lounge access', domesticLoungeVisits: Infinity },
      [redemption(1), makeRule({ id: 'b', ruleType: 'base_reward', value: 1, unit: 'cashback_percent' })]);
    const v = valuateCard(entry, { online: 10000 });
    expect(v.annualRewardValue).toBe(1200);     // lounge contributes nothing monetary
    expect(v.loungeSummary.domestic).toBe('Unlimited domestic lounge access');
  });

  it('is deterministic', () => {
    const entry = makeEntry({}, [redemption(1), makeRule({ id: 'b', ruleType: 'base_reward', value: 1, unit: 'cashback_percent' })]);
    const a = valuateCard(entry, { online: 12345, dining: 6789 });
    const b = valuateCard(entry, { online: 12345, dining: 6789 });
    expect(a).toEqual(b);
  });
});
