/**
 * Import-time validation. Errors fail the import; warnings are reported but let
 * the import proceed (the card is still stored, and may be excluded from
 * recommendations by its research status / confidence).
 */
import type { CardWithRules } from '@/lib/data/types';

export interface Issue {
  level: 'error' | 'warning';
  cardId: string;
  field: string;
  message: string;
}

const REQUIRED_HEADERS = [
  'Card ID', 'Issuer', 'Card Name', 'Status', 'Application Availability',
  'Joining Fee', 'Annual Fee', 'Forex Markup %', 'Base Reward Earn Rate Raw',
  'Primary Source URL', 'Last Verified', 'Data Confidence', 'Research Status',
];

export function validateHeaders(headers: string[]): Issue[] {
  const present = new Set(headers.map((h) => h.trim()));
  return REQUIRED_HEADERS.filter((h) => !present.has(h)).map((h) => ({
    level: 'error' as const, cardId: '(sheet)', field: h, message: `Required column missing: "${h}"`,
  }));
}

function isValidUrl(u: string): boolean {
  try {
    const parsed = new URL(u);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function validateEntries(entries: CardWithRules[]): Issue[] {
  const issues: Issue[] = [];
  const seenCards = new Set<string>();
  const seenRules = new Set<string>();
  const seenSlugs = new Set<string>();

  for (const { card, rules, sources } of entries) {
    const err = (field: string, message: string) => issues.push({ level: 'error', cardId: card.id || '(unknown)', field, message });
    const warn = (field: string, message: string) => issues.push({ level: 'warning', cardId: card.id || '(unknown)', field, message });

    if (!card.id) err('id', 'Missing card ID');
    else if (seenCards.has(card.id)) err('id', `Duplicate card ID: ${card.id}`);
    else seenCards.add(card.id);

    if (!card.name) err('name', 'Missing card name');
    if (!card.issuer) err('issuer', 'Missing issuer');

    const slugKey = `${card.issuerSlug}/${card.slug}`;
    if (seenSlugs.has(slugKey)) err('slug', `Duplicate card URL slug: ${slugKey}`);
    else seenSlugs.add(slugKey);

    for (const r of rules) {
      if (!r.id) err('rule.id', 'Missing rule ID');
      else if (seenRules.has(r.id)) err('rule.id', `Duplicate rule ID: ${r.id}`);
      else seenRules.add(r.id);
      if (r.cardId !== card.id) err('rule.cardId', `Rule ${r.id} references card ${r.cardId}`);
      if (r.value !== null && r.value < 0) err('rule.value', `Negative value on rule ${r.id}`);
      if (r.unit === 'cashback_percent' && r.value !== null && (r.value <= 0 || r.value > 100)) {
        err('rule.value', `Implausible cashback rate on rule ${r.id}: ${r.value}%`);
      }
      if (r.unit === 'points' && r.perAmount !== null && r.perAmount <= 0) {
        err('rule.perAmount', `Invalid spend increment on rule ${r.id}`);
      }
      if (r.cap && r.cap.amount <= 0) err('rule.cap', `Invalid cap on rule ${r.id}`);
    }

    for (const fee of [['joiningFee', card.joiningFee], ['annualFee', card.annualFee]] as const) {
      if (fee[1] === null) warn(fee[0], 'Fee not recorded');
      else if (fee[1] < 0) err(fee[0], `Negative fee: ${fee[1]}`);
      else if (fee[1] > 1_000_000) err(fee[0], `Implausible fee: ${fee[1]}`);
    }

    if (card.forexMarkup !== null && (card.forexMarkup < 0 || card.forexMarkup > 10)) {
      err('forexMarkup', `Implausible forex markup: ${card.forexMarkup}%`);
    }

    if (!card.lastVerifiedAt) err('lastVerifiedAt', 'Missing verification date');
    if (!card.dataConfidence) warn('dataConfidence', 'Missing data confidence');

    if (sources.length === 0) err('sources', 'No source recorded');
    for (const s of sources) {
      if (!isValidUrl(s.sourceUrl)) err('sources.sourceUrl', `Malformed URL: ${s.sourceUrl}`);
    }

    if (!card.activeStatus && card.applicationAvailable) {
      err('applicationAvailable', 'Inactive card marked as open for applications');
    }

    const hasEarn = rules.some((r) => (r.ruleType === 'base_reward' || r.ruleType === 'accelerated_reward') && r.value !== null);
    if (!hasEarn) warn('rules', 'No machine-resolvable earn rule — card cannot be scored on reward value');
  }

  return issues;
}
