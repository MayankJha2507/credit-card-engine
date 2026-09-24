import { effectiveRate } from '@/lib/calculations/engine';
import { hasLoungeAccess, type CardWithRules } from '@/lib/data/types';

export interface BrowseRow {
  id: string;
  issuer: string;
  issuerSlug: string;
  name: string;
  slug: string;
  network: string | null;
  variant: string | null;
  cardType: string | null;
  annualFee: number;
  joiningFee: number;
  forexMarkup: number | null;
  lounge: boolean;
  cashback: boolean;
  rewards: boolean;
  travel: boolean;
  /** Derived at request time from the raw base rule — never stored. */
  baseRate: number | null;
  lastVerifiedAt: string | null;
  dataConfidence: string | null;
}

/** Derives the display rows from raw rules so nothing derived is persisted. */
export function toBrowseRows(entries: CardWithRules[]): BrowseRow[] {
  return entries.map((e) => {
    const pointValue = e.rules.find((r) => r.ruleType === 'redemption')?.value ?? null;
    const base = e.rules.find((r) => r.ruleType === 'base_reward' && r.value !== null);
    return {
      id: e.card.id, issuer: e.card.issuer, issuerSlug: e.card.issuerSlug, name: e.card.name, slug: e.card.slug,
      network: e.card.network, variant: e.card.variant, cardType: e.card.cardType,
      annualFee: e.card.annualFee ?? 0, joiningFee: e.card.joiningFee ?? 0, forexMarkup: e.card.forexMarkup,
      lounge: hasLoungeAccess(e.card.domesticLoungeVisits) || hasLoungeAccess(e.card.internationalLoungeVisits),
      cashback: e.rules.some((r) => r.unit === 'cashback_percent' && r.value !== null),
      rewards: e.rules.some((r) => r.unit === 'points' && r.value !== null),
      travel: /travel/i.test(`${e.card.cardType} ${e.card.travelBenefits ?? ''}`),
      baseRate: base ? effectiveRate(base, pointValue) : null,
      lastVerifiedAt: e.card.lastVerifiedAt, dataConfidence: e.card.dataConfidence,
    };
  });
}

