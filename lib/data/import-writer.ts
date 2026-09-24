/**
 * The single SQL write path for the import, kept separate from the CLI so it can
 * be exercised in tests against an embedded Postgres.
 *
 * `sql` is anything shaped like a postgres.js client: a tagged template that
 * runs a parameterised query, plus `begin` for a transaction.
 */
import path from 'node:path';
import type { CardWithRules } from './types';

export interface SqlLike {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
  begin: <T>(fn: (tx: SqlLike) => Promise<T>) => Promise<T>;
}

const finite = (n: number | null) => (n === null || !Number.isFinite(n) ? null : n);

export async function writeCards(
  sql: SqlLike,
  entries: CardWithRules[],
  workbook: string,
  checksum: string,
  warningCount: number,
): Promise<void> {
  await sql.begin(async (tx) => {
  for (const { card: c, rules, sources } of entries) {
    await tx`
      insert into cards (
        id, slug, issuer, issuer_slug, name, network, variant, card_type, active_status,
        application_available, joining_fee, annual_fee, annual_fee_waiver_threshold,
        annual_fee_waiver_condition, forex_markup, dcc_markup, domestic_lounge,
        international_lounge, lounge_program, domestic_lounge_visits, international_lounge_visits,
        lounge_spend_condition, base_reward_rate_raw, accelerated_rate_raw, reward_caps_raw,
        reward_exclusions_raw, redemption_ratio_raw, redemption_options, cashback_rate_raw,
        welcome_benefit, milestone_benefits, travel_benefits, dining_benefits, other_benefits,
        eligibility, minimum_income, age_limit, relationship_requirement, credit_score_requirement,
        data_confidence, research_status, last_verified_at, notes, updated_at
      ) values (
        ${c.id}, ${c.slug}, ${c.issuer}, ${c.issuerSlug}, ${c.name}, ${c.network}, ${c.variant},
        ${c.cardType}, ${c.activeStatus}, ${c.applicationAvailable}, ${c.joiningFee}, ${c.annualFee},
        ${c.annualFeeWaiverThreshold}, ${c.annualFeeWaiverCondition}, ${c.forexMarkup}, ${c.dccMarkup},
        ${c.domesticLounge}, ${c.internationalLounge}, ${c.loungeProgram},
        ${finite(c.domesticLoungeVisits)}, ${finite(c.internationalLoungeVisits)},
        ${c.loungeSpendCondition}, ${c.baseRewardRateRaw}, ${c.acceleratedRateRaw}, ${c.rewardCapsRaw},
        ${c.rewardExclusionsRaw}, ${c.redemptionRatioRaw}, ${c.redemptionOptions}, ${c.cashbackRateRaw},
        ${c.welcomeBenefit}, ${c.milestoneBenefits}, ${c.travelBenefits}, ${c.diningBenefits},
        ${c.otherBenefits}, ${c.eligibility}, ${c.minimumIncome}, ${c.ageLimit},
        ${c.relationshipRequirement}, ${c.creditScoreRequirement}, ${c.dataConfidence},
        ${c.researchStatus}, ${c.lastVerifiedAt}, ${c.notes}, now()
      )
      on conflict (id) do update set
        slug = excluded.slug, issuer = excluded.issuer, issuer_slug = excluded.issuer_slug,
        name = excluded.name, network = excluded.network, variant = excluded.variant,
        card_type = excluded.card_type, active_status = excluded.active_status,
        application_available = excluded.application_available, joining_fee = excluded.joining_fee,
        annual_fee = excluded.annual_fee, annual_fee_waiver_threshold = excluded.annual_fee_waiver_threshold,
        annual_fee_waiver_condition = excluded.annual_fee_waiver_condition, forex_markup = excluded.forex_markup,
        dcc_markup = excluded.dcc_markup, domestic_lounge = excluded.domestic_lounge,
        international_lounge = excluded.international_lounge, lounge_program = excluded.lounge_program,
        domestic_lounge_visits = excluded.domestic_lounge_visits,
        international_lounge_visits = excluded.international_lounge_visits,
        lounge_spend_condition = excluded.lounge_spend_condition,
        base_reward_rate_raw = excluded.base_reward_rate_raw, accelerated_rate_raw = excluded.accelerated_rate_raw,
        reward_caps_raw = excluded.reward_caps_raw, reward_exclusions_raw = excluded.reward_exclusions_raw,
        redemption_ratio_raw = excluded.redemption_ratio_raw, redemption_options = excluded.redemption_options,
        cashback_rate_raw = excluded.cashback_rate_raw, welcome_benefit = excluded.welcome_benefit,
        milestone_benefits = excluded.milestone_benefits, travel_benefits = excluded.travel_benefits,
        dining_benefits = excluded.dining_benefits, other_benefits = excluded.other_benefits,
        eligibility = excluded.eligibility, minimum_income = excluded.minimum_income,
        age_limit = excluded.age_limit, relationship_requirement = excluded.relationship_requirement,
        credit_score_requirement = excluded.credit_score_requirement, data_confidence = excluded.data_confidence,
        research_status = excluded.research_status, last_verified_at = excluded.last_verified_at,
        notes = excluded.notes, updated_at = now()
    `;

    // Rules and sources are fully derived from the workbook row: replace them.
    await tx`delete from card_rules where card_id = ${c.id}`;
    await tx`delete from sources where card_id = ${c.id}`;
    for (const s of sources) {
      await tx`
        insert into sources (id, card_id, source_type, source_url, source_title, fields_covered, accessed_at, reliability_tier)
        values (${s.id}, ${s.cardId}, ${s.sourceType}, ${s.sourceUrl}, ${s.sourceTitle}, ${s.fieldsCovered}, ${s.accessedAt}, ${s.reliabilityTier})
      `;
    }
    for (const r of rules) {
      await tx`
        insert into card_rules (id, card_id, rule_type, categories, value, unit, per_amount, condition, cap, notes, source_id, raw)
        values (${r.id}, ${r.cardId}, ${r.ruleType}, ${r.categories}, ${r.value}, ${r.unit}, ${r.perAmount},
                ${r.condition}, ${r.cap ? JSON.stringify(r.cap) : null}, ${r.notes}, ${r.sourceId}, ${r.raw})
      `;
    }
  }
  const ruleCount = entries.reduce((n, e) => n + e.rules.length, 0);
  await tx`
    insert into import_runs (workbook, card_count, rule_count, warnings, checksum)
    values (${path.basename(workbook)}, ${entries.length}, ${ruleCount}, ${warningCount}, ${checksum})
  `;
  });
}
