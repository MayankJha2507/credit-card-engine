import { describe, expect, it } from 'vitest';
import {
  categoriesFromText, parseCaps, parseDate, parseEarnRate, parseLoungeVisits,
  parseMoney, parsePercent, parsePointValue, slugify, splitClauses,
} from '@/lib/data/parse';

describe('parseMoney', () => {
  it('reads rupee amounts out of sentences', () => {
    expect(parseMoney('₹10,000,000 spend in previous anniversary year')).toBe(10_000_000);
    expect(parseMoney('₹300,000 spend in previous anniversary year')).toBe(300_000);
    expect(parseMoney(12500)).toBe(12500);
  });
  it('expands lakh and crore', () => {
    expect(parseMoney('up to ₹2 Lakh/month')).toBe(200_000);
    expect(parseMoney('₹1 Crore cover')).toBe(10_000_000);
  });
  it('returns null when there is no amount', () => {
    expect(parseMoney('Lifetime Free (No annual fee)')).toBeNull();
  });
});

describe('parsePercent', () => {
  it('parses markup strings', () => {
    expect(parsePercent('2.00%')).toBe(2);
    expect(parsePercent('0.00%')).toBe(0);
    expect(parsePercent(0.035)).toBeCloseTo(3.5);
  });
});

describe('parseEarnRate', () => {
  it('parses points per rupee increments', () => {
    expect(parseEarnRate('5 Reward Points per ₹150 spent')).toEqual({ kind: 'points', points: 5, perAmount: 150 });
    expect(parseEarnRate('18 Reward Points per ₹200 spent on offline spends')).toEqual({ kind: 'points', points: 18, perAmount: 200 });
    expect(parseEarnRate('2 EDGE Miles per ₹100 spent')).toEqual({ kind: 'points', points: 2, perAmount: 100 });
  });
  it('parses cashback percentages', () => {
    expect(parseEarnRate('1% Cashback on all other retail spends')).toEqual({ kind: 'cashback', percent: 1 });
    expect(parseEarnRate('2% on Amazon Pay partner merchants (Swiggy, Uber, etc.)')).toEqual({ kind: 'cashback', percent: 2 });
  });
  it('parses multipliers', () => {
    expect(parseEarnRate('5X RP on Marks & Spencer, Myntra')).toEqual({ kind: 'multiplier', multiplier: 5 });
  });
  it('returns null for text with no rate', () => {
    expect(parseEarnRate('10,000 bonus RP on onboarding')).toBeNull();
  });
});

describe('parseCaps', () => {
  it('parses point, value and spend caps with their periods', () => {
    const caps = parseCaps('Max 15,000 RP/day on SmartBuy; 75,000 RP/month total accelerated');
    expect(caps).toHaveLength(2);
    expect(caps[0]).toMatchObject({ amount: 15000, basis: 'points', period: 'day' });
    expect(caps[1]).toMatchObject({ amount: 75000, basis: 'points', period: 'month' });

    expect(parseCaps('5% cashback capped at ₹1,000 per statement cycle')[0])
      .toMatchObject({ amount: 1000, basis: 'inr_value', period: 'statement_month' });

    expect(parseCaps('5 EDGE Miles tier capped at ₹2 Lakh spend/month')[0])
      .toMatchObject({ amount: 200000, basis: 'spend', period: 'month' });
  });
  it('ignores text with no resolvable cap', () => {
    expect(parseCaps('No upper cap on cashback earned')).toEqual([]);
  });
});

describe('parsePointValue', () => {
  it('reads a rupee conversion', () => {
    expect(parsePointValue('1 RP = ₹1.00 (SmartBuy Flights/Hotels)')).toBe(1);
    expect(parsePointValue('1 RP = ₹0.25')).toBe(0.25);
  });
  it('refuses to guess when the ratio is not in rupees', () => {
    expect(parsePointValue('1 EDGE Mile = 2 Partner Miles')).toBeNull();
  });
});

describe('parseLoungeVisits', () => {
  it('handles counts, quarters, unlimited and none', () => {
    expect(parseLoungeVisits('12 complimentary domestic visits/year')).toBe(12);
    expect(parseLoungeVisits('4 complimentary domestic visits/year (1 per quarter)')).toBe(4);
    expect(parseLoungeVisits('4 complimentary visits per quarter (16/year)')).toBe(16);
    expect(parseLoungeVisits('2 complimentary domestic lounge visits per quarter (8/year)')).toBe(8);
    expect(parseLoungeVisits('Unlimited domestic lounge access for primary & add-on')).toBe(Infinity);
    expect(parseLoungeVisits('None (Lounge benefits removed)')).toBe(0);
  });
});

describe('categoriesFromText', () => {
  it('maps merchants and category words onto spend categories', () => {
    expect(categoriesFromText('5X RP on Marks & Spencer, Myntra, Nykaa')).toContain('online');
    expect(categoriesFromText('Up to 5X RP on SmartBuy (Flights/Hotels/Vouchers)').sort())
      .toEqual(['flights', 'hotels', 'online']);
    expect(categoriesFromText('12 RP per ₹100 spent on international purchases')).toEqual(['international']);
    expect(categoriesFromText('4X RP on Departmental & Grocery stores')).toContain('groceries');
  });
});

describe('misc', () => {
  it('splits multi-clause cells', () => {
    expect(splitClauses('5% Cashback on Flipkart; 4% Cashback on partners')).toHaveLength(2);
  });
  it('normalises dates and slugs', () => {
    expect(parseDate(new Date('2026-09-15T00:00:00Z'))).toBe('2026-09-15');
    expect(parseDate('2026-09-15')).toBe('2026-09-15');
    expect(slugify('Infinia Credit Card Metal Edition')).toBe('infinia-credit-card-metal-edition');
  });
});
