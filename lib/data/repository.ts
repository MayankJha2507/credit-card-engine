/**
 * Single read path for card data.
 *
 * Primary store is PostgreSQL. When DATABASE_URL is not configured the
 * repository falls back to db/snapshot.json, which `npm run import-data` writes
 * from the same workbook through the same transform — so the app runs with zero
 * database setup while the data still comes from the workbook, never from code.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getDb } from './db';
import type { Card, CardRule, CardSource, CardWithRules } from './types';

let snapshotCache: CardWithRules[] | null = null;

function readSnapshot(): CardWithRules[] {
  if (snapshotCache) return snapshotCache;
  const file = path.join(process.cwd(), 'db', 'snapshot.json');
  if (!fs.existsSync(file)) {
    throw new Error('No card data found. Run `npm run import-data` (and set DATABASE_URL to use PostgreSQL).');
  }
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { entries: CardWithRules[] };
  snapshotCache = parsed.entries;
  return snapshotCache;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Maps a `cards` row (numerics arrive as strings) onto the domain type. Exported for tests. */
export function rowToCard(r: any): Card {
  return {
    id: r.id, slug: r.slug, issuer: r.issuer, issuerSlug: r.issuer_slug, name: r.name,
    network: r.network, variant: r.variant, cardType: r.card_type,
    activeStatus: r.active_status, applicationAvailable: r.application_available,
    joiningFee: num(r.joining_fee), annualFee: num(r.annual_fee),
    annualFeeWaiverThreshold: num(r.annual_fee_waiver_threshold),
    annualFeeWaiverCondition: r.annual_fee_waiver_condition, forexMarkup: num(r.forex_markup),
    dccMarkup: r.dcc_markup, domesticLounge: r.domestic_lounge, internationalLounge: r.international_lounge,
    loungeProgram: r.lounge_program, domesticLoungeVisits: num(r.domestic_lounge_visits),
    internationalLoungeVisits: num(r.international_lounge_visits), loungeSpendCondition: r.lounge_spend_condition,
    baseRewardRateRaw: r.base_reward_rate_raw, acceleratedRateRaw: r.accelerated_rate_raw,
    rewardCapsRaw: r.reward_caps_raw, rewardExclusionsRaw: r.reward_exclusions_raw,
    redemptionRatioRaw: r.redemption_ratio_raw, redemptionOptions: r.redemption_options,
    cashbackRateRaw: r.cashback_rate_raw, welcomeBenefit: r.welcome_benefit,
    milestoneBenefits: r.milestone_benefits, travelBenefits: r.travel_benefits,
    diningBenefits: r.dining_benefits, otherBenefits: r.other_benefits, eligibility: r.eligibility,
    minimumIncome: num(r.minimum_income), ageLimit: r.age_limit,
    relationshipRequirement: r.relationship_requirement, creditScoreRequirement: r.credit_score_requirement,
    dataConfidence: r.data_confidence, researchStatus: r.research_status,
    lastVerifiedAt: r.last_verified_at ? new Date(r.last_verified_at).toISOString().slice(0, 10) : null,
    notes: r.notes,
  };
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export async function getAllCards(): Promise<CardWithRules[]> {
  const sql = getDb();
  if (!sql) return readSnapshot();

  const cards = await sql`select * from cards order by issuer, name`;
  if (cards.length === 0) return readSnapshot();
  const rules = await sql`select * from card_rules`;
  const sources = await sql`select * from sources`;

  return cards.map((c: any) => ({
    card: rowToCard(c),
    rules: rules.filter((r: any) => r.card_id === c.id).map((r: any): CardRule => ({
      id: r.id, cardId: r.card_id, ruleType: r.rule_type, categories: r.categories ?? [],
      value: num(r.value), unit: r.unit, perAmount: num(r.per_amount), condition: r.condition,
      cap: r.cap ?? null, notes: r.notes, sourceId: r.source_id, raw: r.raw,
    })),
    sources: sources.filter((s: any) => s.card_id === c.id).map((s: any): CardSource => ({
      id: s.id, cardId: s.card_id, sourceType: s.source_type, sourceUrl: s.source_url,
      sourceTitle: s.source_title, fieldsCovered: s.fields_covered ?? [],
      accessedAt: s.accessed_at ? new Date(s.accessed_at).toISOString().slice(0, 10) : null,
      reliabilityTier: s.reliability_tier,
    })),
  }));
}

export async function getCardBySlug(issuerSlug: string, slug: string): Promise<CardWithRules | null> {
  const all = await getAllCards();
  return all.find((e) => e.card.issuerSlug === issuerSlug && e.card.slug === slug) ?? null;
}

export async function getDataFreshness(): Promise<{ cardCount: number; researchedCount: number; latestVerified: string | null }> {
  const all = await getAllCards();
  const researched = all.filter((e) => (e.card.researchStatus ?? '').toLowerCase().includes('fully researched'));
  const dates = all.map((e) => e.card.lastVerifiedAt).filter(Boolean).sort() as string[];
  return { cardCount: all.length, researchedCount: researched.length, latestVerified: dates.at(-1) ?? null };
}
