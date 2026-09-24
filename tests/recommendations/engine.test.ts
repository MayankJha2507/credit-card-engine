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
