import { describe, expect, it } from 'vitest';
import {
  categoriesFromText, isGeneralScope, parseCaps, parseDate, parseEarnRate, parseLoungeVisits,
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
  it('parses markup strings and bare numbers as percentages', () => {
    expect(parsePercent('2.00%')).toBe(2);
    expect(parsePercent('0.00%')).toBe(0);
    expect(parsePercent(3.5)).toBe(3.5);
    expect(parsePercent('3.5')).toBe(3.5);
  });
  it('does not rescale sub-1% markups', () => {
    // 0.99 means 0.99%, not 99% — several cards really do charge under 1%.
    expect(parsePercent(0.99)).toBe(0.99);
    expect(parsePercent('0.99')).toBe(0.99);
  });
});

describe('parseEarnRate', () => {
  it('parses points per rupee increments', () => {
    expect(parseEarnRate('5 Reward Points per ₹150 spent')).toMatchObject({ kind: 'points', points: 5, perAmount: 150 });
    expect(parseEarnRate('18 Reward Points per ₹200 spent on offline spends')).toMatchObject({ kind: 'points', points: 18, perAmount: 200 });
    expect(parseEarnRate('2 EDGE Miles per ₹100 spent')).toMatchObject({ kind: 'points', points: 2, perAmount: 100 });
  });

  it('reads whatever the issuer calls its points currency', () => {
    // Issuers name these freely, so the label is read rather than enumerated.
    expect(parseEarnRate('2 RPs / ₹100')).toMatchObject({ kind: 'points', points: 2, perAmount: 100 });
    expect(parseEarnRate('10 EDGE Points / ₹200')).toMatchObject({ kind: 'points', points: 10, perAmount: 200 });
    expect(parseEarnRate('3 InterMiles / ₹150')).toMatchObject({ kind: 'points', points: 3, perAmount: 150 });
    expect(parseEarnRate('1.25 My Cash / ₹200')).toMatchObject({ kind: 'points', points: 1.25, perAmount: 200 });
    expect(parseEarnRate('20 ixigo Money / ₹200')).toMatchObject({ kind: 'points', points: 20, perAmount: 200 });
  });

  it('flags a point count with no spend increment instead of assuming one', () => {
    expect(parseEarnRate('15 RPs on Air India Tickets')).toMatchObject({ kind: 'points_unanchored', points: 15 });
    expect(parseEarnRate('5 EDGE Miles on Travel Direct')).toMatchObject({ kind: 'points_unanchored', points: 5 });
  });

  it('is not fooled by benefits that merely contain a number', () => {
    expect(parseEarnRate('1% Fuel Surcharge Waiver')).toBeNull();
    expect(parseEarnRate('1:1 Air Mile Transfer Ratio')).toBeNull();
    expect(parseEarnRate('2 Free PVR Tickets every month on ₹10k spend')).toBeNull();
    expect(parseEarnRate('White Pass Value')).toBeNull();
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
    expect(parsePointValue('1 RP = ₹1.00 (SmartBuy Flights/Hotels)')).toMatchObject({ value: 1, isRange: false });
    expect(parsePointValue('1 RP = ₹0.25')).toMatchObject({ value: 0.25, isRange: false });
  });

  it('uses the lowest stated value when the source gives a range', () => {
    expect(parsePointValue('1 RP = ₹0.20 - ₹1.00 depending on category'))
      .toMatchObject({ value: 0.2, isRange: true, low: 0.2, high: 1 });
  });

  it('uses the lowest of several stated rates', () => {
    expect(parsePointValue('1 RP = ₹0.50 (SmartBuy Flights/Hotels), 1 RP = ₹0.35 (Vouchers)'))
      .toMatchObject({ value: 0.35, isRange: true, low: 0.35, high: 0.5 });
  });

  it('refuses to guess when the ratio is not in rupees', () => {
    expect(parsePointValue('1 EDGE Mile = 2 Partner Miles')).toBeNull();
  });
});

describe('scope of a rate', () => {
  it('separates a named category from a general rate', () => {
    expect(categoriesFromText('5% Cashback on Online Shopping')).toContain('online');
    expect(isGeneralScope('5% Reward Valueback on all spends')).toBe(true);
    expect(categoriesFromText('5% Reward Valueback on all spends')).toEqual([]);
    expect(isGeneralScope('10X RPs on BigBasket, Swiggy, Oyo')).toBe(false);
  });

  it('maps merchants in the wider card set', () => {
    expect(categoriesFromText('10X RPs on BigBasket, Swiggy, Oyo').sort()).toEqual(['dining', 'groceries', 'hotels']);
    expect(categoriesFromText('10% Valueback on IRCTC Tickets')).toContain('flights');
    expect(categoriesFromText('4% Valueback in Edge Points on IndianOil')).toContain('fuel');
    // Marks & Spencer is apparel, not a grocer.
    expect(categoriesFromText('5X Rewards on Marks & Spencer, Myntra')).toEqual(['online']);
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
    expect(splitClauses('25% on Airtel Bills, 10% Swiggy/Zomato/BigBasket')).toHaveLength(2);
    // A comma inside one clause's merchant list is not a split point.
    expect(splitClauses('10X RPs on BigBasket, Swiggy, Oyo')).toHaveLength(1);
  });
  it('keeps distinct cards distinct in the URL', () => {
    expect(slugify('FIRST Power+')).toBe('first-power-plus');
    expect(slugify('FIRST Power')).toBe('first-power');
  });
  it('parses plural point units in caps', () => {
    expect(parseCaps('15,000 RPs per month on SmartBuy')[0]).toMatchObject({ amount: 15000, basis: 'points', period: 'month' });
  });
  it('normalises dates and slugs', () => {
    expect(parseDate(new Date('2026-09-15T00:00:00Z'))).toBe('2026-09-15');
    expect(parseDate('2026-09-15')).toBe('2026-09-15');
    expect(slugify('Infinia Credit Card Metal Edition')).toBe('infinia-credit-card-metal-edition');
  });
});
