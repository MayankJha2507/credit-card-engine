import { describe, expect, it } from 'vitest';
import { recommend } from '@/lib/recommendations/engine';
import type { UserProfile } from '@/lib/calculations/types';
import { makeEntry, makeRule } from '../fixtures';

const redemption = makeRule({ id: 'r-redeem', ruleType: 'redemption', value: 1, unit: 'inr' });

function cashbackCard(id: string, percent: number, annualFee: number, over = {}) {
  return makeEntry({ id, slug: id.toLowerCase(), name: id, annualFee, annualFeeWaiverThreshold: null, annualFeeWaiverCondition: null, ...over }, [
    { ...redemption, cardId: id },
    makeRule({ id: `${id}-b`, ruleType: 'base_reward', value: percent, unit: 'cashback_percent', raw: `${percent}% cashback` }),
  ]);
}

const baseProfile: UserProfile = {
  spend: { online: 30000 },
  priorities: [],
  feeBand: '10k_plus',
  internationalTravel: false,
  loungeImportance: 'not_important',
};

describe('recommend', () => {
  it('returns at most three matches ordered by net annual value', () => {
    const pool = [cashbackCard('LOW', 1, 0), cashbackCard('MID', 2, 0), cashbackCard('HIGH', 3, 0), cashbackCard('TINY', 0.5, 0)];
    const r = recommend(pool, baseProfile);
    expect(r.matches).toHaveLength(3);
    expect(r.matches.map((m) => m.card.id)).toEqual(['HIGH', 'MID', 'LOW']);
    expect(r.matches[0].valuation.netAnnualValue).toBeGreaterThan(r.matches[1].valuation.netAnnualValue);
  });

  it('never returns a card above the fee ceiling unless the fee is waived', () => {
    const pricey = cashbackCard('PRICEY', 5, 12000);
    const cheap = cashbackCard('CHEAP', 1, 0);
    const r = recommend([pricey, cheap], { ...baseProfile, feeBand: 'zero' });
    expect(r.matches.map((m) => m.card.id)).toEqual(['CHEAP']);
    expect(r.excluded.some((e) => e.cardId === 'PRICEY')).toBe(true);
  });

  it('keeps an expensive card when the user meets its documented waiver condition', () => {
    const waivable = makeEntry(
      { id: 'WAIVED', name: 'WAIVED', annualFee: 12000, annualFeeWaiverThreshold: 300000, annualFeeWaiverCondition: '₹300,000 spend' },
      [{ ...redemption, cardId: 'WAIVED' }, makeRule({ id: 'w-b', ruleType: 'base_reward', value: 3, unit: 'cashback_percent' })],
    );
    const r = recommend([waivable, cashbackCard('CHEAP', 1, 0)], { ...baseProfile, feeBand: 'zero' });
    expect(r.matches[0].card.id).toBe('WAIVED');
    expect(r.matches[0].valuation.feeWaived).toBe(true);
  });

  it('excludes cards that are not fully researched or not open for applications', () => {
    const stale = cashbackCard('STALE', 9, 0, { researchStatus: 'Identified', name: 'STALE' });
    const closed = cashbackCard('CLOSED', 9, 0, { applicationAvailable: false, name: 'CLOSED' });
    const r = recommend([stale, closed, cashbackCard('OK', 1, 0)], baseProfile);
    expect(r.matches.map((m) => m.card.id)).toEqual(['OK']);
    expect(r.excluded).toHaveLength(2);
  });

  it('uses preference fit only to re-order cards of near-equal value', () => {
    // Two cards worth the same; only one has lounge access.
    const plain = cashbackCard('PLAIN', 2, 0);
    const lounge = cashbackCard('LOUNGE', 2, 0, { name: 'LOUNGE', domesticLounge: '8 visits/year', domesticLoungeVisits: 8 });
    const withLounge = recommend([plain, lounge], { ...baseProfile, priorities: ['lounge_access'], loungeImportance: 'important' });
    expect(withLounge.matches[0].card.id).toBe('LOUNGE');

    // A far more valuable card is not displaced by preference fit.
    const rich = cashbackCard('RICH', 10, 0);
    const richer = recommend([rich, lounge], { ...baseProfile, priorities: ['lounge_access'], loungeImportance: 'important' });
    expect(richer.matches[0].card.id).toBe('RICH');
  });

  it('ignores priorities the user did not select', () => {
    const lounge = cashbackCard('LOUNGE', 2, 0, { name: 'LOUNGE', domesticLounge: '8 visits/year', domesticLoungeVisits: 8 });
    const plain = cashbackCard('PLAIN', 2, 0);
    const r = recommend([lounge, plain], baseProfile);
    expect(r.matches.every((m) => m.preferenceMatches.length === 0)).toBe(true);
    // Falls back to the documented stable tie-break (lower fee, then card ID).
    expect(r.matches.map((m) => m.card.id)).toEqual(['LOUNGE', 'PLAIN']);
  });

  it('is deterministic and stable across runs', () => {
    const pool = [cashbackCard('A', 2, 0), cashbackCard('B', 2, 0), cashbackCard('C', 2, 0)];
    const profile = { ...baseProfile, priorities: ['cashback' as const] };
    expect(recommend(pool, profile).matches.map((m) => m.card.id))
      .toEqual(recommend([...pool].reverse(), profile).matches.map((m) => m.card.id));
  });

  it('explains every match from calculated facts', () => {
    const r = recommend([cashbackCard('A', 2, 0)], { ...baseProfile, priorities: ['cashback'] });
    expect(r.matches[0].reasons.length).toBeGreaterThan(0);
    expect(r.matches[0].reasons.join(' ')).toMatch(/₹/);
  });
});

describe('official issuer link', () => {
  it('carries the issuer source URL through to each match', () => {
    const card = cashbackCard('WITHSRC', 2, 0);
    card.sources = [{
      id: 's1', cardId: 'WITHSRC', sourceType: 'issuer_official',
      sourceUrl: 'https://issuer.example.com/card', sourceTitle: 'Official page',
      fieldsCovered: ['fees'], accessedAt: '2026-09-15', reliabilityTier: 'High',
    }];
    const r = recommend([card], baseProfile);
    expect(r.matches[0].officialUrl).toBe('https://issuer.example.com/card');
  });

  it('is null when no source is recorded, so the UI can say so', () => {
    const r = recommend([cashbackCard('NOSRC', 2, 0)], baseProfile);
    expect(r.matches[0].officialUrl).toBeNull();
  });
});

describe('estimate quality', () => {
  const upperBound = () => {
    const e = cashbackCard('VAGUE', 3, 0, { name: 'VAGUE', rewardCapsRaw: 'Monthly category cap applies' });
    return e;
  };

  it('treats a stated-but-unquantified cap as an upper bound, not an estimate', () => {
    const r = recommend([upperBound()], baseProfile);
    expect(r.matches[0].valuation.isUpperBound).toBe(true);
    expect(r.matches[0].valuation.dataCaveats.join(' ')).toMatch(/upper bound/i);
    expect(r.matches[0].cautions.join(' ')).toMatch(/upper bound/i);
  });

  it('prefers a firm estimate over an upper bound of comparable value', () => {
    const firm = cashbackCard('FIRM', 3, 0);
    const r = recommend([upperBound(), firm], { ...baseProfile, priorities: ['cashback'] });
    expect(r.matches[0].card.id).toBe('FIRM');
  });
});

describe('lounge access when the user says it is important', () => {
  const withLounge = (id: string) =>
    cashbackCard(id, 1, 0, { name: id, domesticLounge: '8 visits/year', domesticLoungeVisits: 8 });

  it('requires lounge access rather than merely preferring it', () => {
    const pool = [cashbackCard('RICH', 10, 0), withLounge('L1'), withLounge('L2'), withLounge('L3')];
    const r = recommend(pool, { ...baseProfile, loungeImportance: 'important' });
    expect(r.loungeFilterApplied).toBe(true);
    expect(r.matches.every((m) => (m.card.domesticLoungeVisits ?? 0) > 0)).toBe(true);
    expect(r.excluded.some((e) => e.cardId === 'RICH')).toBe(true);
  });

  it('drops the requirement rather than returning nothing when too few cards have lounge', () => {
    const pool = [cashbackCard('A', 2, 0), cashbackCard('B', 1, 0), withLounge('L1')];
    const r = recommend(pool, { ...baseProfile, loungeImportance: 'important' });
    expect(r.loungeFilterApplied).toBe(false);
    expect(r.matches.length).toBe(3);
  });

  it('leaves lounge as a tie-break when it is only nice to have', () => {
    const pool = [cashbackCard('RICH', 10, 0), withLounge('L1'), withLounge('L2'), withLounge('L3')];
    const r = recommend(pool, { ...baseProfile, loungeImportance: 'nice_to_have' });
    expect(r.loungeFilterApplied).toBe(false);
    expect(r.matches[0].card.id).toBe('RICH');
  });
});

describe('annual fee handling', () => {
  // A card worth more after paying its fee than a free card is worth in total.
  const pricey = makeEntry(
    { id: 'PRICEY', name: 'PRICEY', annualFee: 12500, annualFeeWaiverThreshold: null, annualFeeWaiverCondition: null },
    [{ ...redemption, cardId: 'PRICEY' }, makeRule({ id: 'p-b', ruleType: 'base_reward', value: 8, unit: 'cashback_percent' })],
  );
  const free = cashbackCard('FREE', 2, 0);

  it('does not filter on fee by default, because the fee is already subtracted', () => {
    const r = recommend([pricey, free], { ...baseProfile, feeBand: 'any' });
    expect(r.matches[0].card.id).toBe('PRICEY');
    expect(r.matches[0].valuation.annualFeeAfterWaiver).toBe(12500);
    // It wins on what is left after the fee, not despite it.
    expect(r.matches[0].valuation.netAnnualValue).toBeGreaterThan(r.matches[1].valuation.netAnnualValue);
    expect(r.excluded).toHaveLength(0);
  });

  it('still honours a ceiling when one is asked for', () => {
    const r = recommend([pricey, free], { ...baseProfile, feeBand: 'zero' });
    expect(r.matches.map((m) => m.card.id)).toEqual(['FREE']);
    expect(r.excluded.some((e) => e.cardId === 'PRICEY')).toBe(true);
  });

  it('reports year one separately so a joining fee is visible, not averaged away', () => {
    const joining = makeEntry(
      { id: 'JOIN', name: 'JOIN', annualFee: 0, joiningFee: 15000, annualFeeWaiverThreshold: null },
      [{ ...redemption, cardId: 'JOIN' }, makeRule({ id: 'j-b', ruleType: 'base_reward', value: 2, unit: 'cashback_percent' })],
    );
    const r = recommend([joining], baseProfile);
    const v = r.matches[0].valuation;
    expect(v.netAnnualValue).toBe(7200);              // 360000 × 2%
    expect(v.firstYearValue).toBe(7200 - 15000);      // year one carries the joining fee
    expect(r.matches[0].cautions.join(' ')).toMatch(/joining fee/i);
  });
});

describe('priority coverage and unvaluable cards', () => {
  const rich = cashbackCard('RICH', 10, 0);              // best value, no lounge
  const lounge = cashbackCard('LOUNGE', 1, 0, { name: 'LOUNGE', domesticLounge: '8 visits/year', domesticLoungeVisits: 8 });
  const plain = cashbackCard('PLAIN', 3, 0);
  const plain2 = cashbackCard('PLAIN2', 2, 0);

  it('gives a slot to a priority the top card does not satisfy', () => {
    const r = recommend([rich, plain, plain2, lounge], { ...baseProfile, priorities: ['lounge_access'] });
    expect(r.matches[0].card.id).toBe('RICH');
    const loungePick = r.matches.find((m) => m.card.id === 'LOUNGE');
    expect(loungePick).toBeDefined();
    expect(loungePick!.selectionReason).toBe('coverage');
    expect(loungePick!.coversPriorities).toContain('lounge_access');
  });

  it('does not displace value when the top card already covers the priority', () => {
    const richWithLounge = cashbackCard('RICHL', 10, 0, { name: 'RICHL', domesticLounge: '8 visits/year', domesticLoungeVisits: 8 });
    const r = recommend([richWithLounge, plain, plain2, lounge], { ...baseProfile, priorities: ['lounge_access'] });
    expect(r.matches.map((m) => m.card.id)).toEqual(['RICHL', 'PLAIN', 'PLAIN2']);
  });

  it('keeps cards it cannot value out of the ranking, and surfaces them separately', () => {
    // A multiplier base with no absolute rate: real cards in the database do this.
    const unvaluable = makeEntry(
      { id: 'NOVALUE', name: 'NOVALUE', annualFee: 0, forexMarkup: 0, baseRewardRateRaw: '5X RPs on base spend' },
      [makeRule({ id: 'n-b', ruleType: 'base_reward', value: null, unit: null, raw: '5X RPs on base spend' })],
    );
    const r = recommend([unvaluable, plain, plain2, rich], { ...baseProfile, priorities: ['low_forex'] });

    expect(r.matches.map((m) => m.card.id)).not.toContain('NOVALUE');
    expect(r.notableUnvalued.map((m) => m.card.id)).toEqual(['NOVALUE']);
    // It is there because it matches a priority, not because of a made-up value.
    expect(r.notableUnvalued[0].valuation.annualRewardValue).toBe(0);
    expect(r.notableUnvalued[0].preferenceMatches.some((p) => p.priority === 'low_forex' && p.matched)).toBe(true);
  });

  it('orders unvaluable cards by the priority that put them there, not by fee', () => {
    const zeroForexPricey = makeEntry(
      { id: 'ZERO', name: 'ZERO', annualFee: 10000, forexMarkup: 0, baseRewardRateRaw: '5X RPs on base spend' },
      [makeRule({ id: 'z-b', ruleType: 'base_reward', value: null, unit: null, raw: '5X RPs on base spend' })],
    );
    const someForexFree = makeEntry(
      { id: 'SOME', name: 'SOME', annualFee: 0, forexMarkup: 1.99, baseRewardRateRaw: '3X RPs on base spend' },
      [makeRule({ id: 's-b', ruleType: 'base_reward', value: null, unit: null, raw: '3X RPs on base spend' })],
    );
    const r = recommend([someForexFree, zeroForexPricey, plain], { ...baseProfile, priorities: ['low_forex'] });
    expect(r.notableUnvalued.map((m) => m.card.id)).toEqual(['ZERO', 'SOME']);
  });
});
