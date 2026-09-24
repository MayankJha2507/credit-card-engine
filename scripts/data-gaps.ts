/**
 * Reports every field the engine could not resolve, so the workbook can be
 * corrected at source.
 *
 *   npm run data-gaps            # summary + data-gaps.xlsx
 *   npm run data-gaps -- --csv   # also writes data-gaps.csv
 *
 * Each row says what the workbook currently holds, what is needed, and what the
 * gap costs. Fix the workbook, re-run `npm run import-data`, and re-run this.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import type { CardWithRules } from '../lib/data/types';

interface Gap {
  cardId: string;
  issuer: string;
  cardName: string;
  column: string;
  currentValue: string;
  whatIsNeeded: string;
  impact: string;
  severity: 'blocking' | 'degrades' | 'minor';
}

function loadEntries(): CardWithRules[] {
  const file = path.join(process.cwd(), 'db', 'snapshot.json');
  if (!fs.existsSync(file)) throw new Error('Run `npm run import-data` first.');
  return (JSON.parse(fs.readFileSync(file, 'utf8')) as { entries: CardWithRules[] }).entries;
}

function collect(entries: CardWithRules[]): Gap[] {
  const gaps: Gap[] = [];

  for (const { card, rules } of entries) {
    const at = (column: string, currentValue: string | null, whatIsNeeded: string, impact: string, severity: Gap['severity']) =>
      gaps.push({
        cardId: card.id, issuer: card.issuer, cardName: card.name, column,
        currentValue: currentValue ?? '(empty)', whatIsNeeded, impact, severity,
      });

    // 1. No usable base earning rate — the card cannot be scored at all.
    const base = rules.find((r) => r.ruleType === 'base_reward');
    if (!base || base.value === null) {
      const isMultiplier = /\d+\s*X\b/i.test(card.baseRewardRateRaw ?? '');
      at(
        'Base Rate',
        card.baseRewardRateRaw,
        isMultiplier
          ? 'What 1X earns, either as an absolute base rate (e.g. "1 RP / ₹150") or in a "Base Unit Rate" column'
          : 'An absolute earning rate, e.g. "2 RPs / ₹100" or "1.5% Cashback"',
        'Card cannot be valued or ranked at all; it only appears under "Also worth knowing"',
        'blocking',
      );
    }

    // 2. Accelerated rates that could not be applied.
    for (const r of rules.filter((x) => x.ruleType === 'accelerated_reward' && x.value === null)) {
      at('Accel Rate', r.raw, r.notes ?? 'A rate and the spend categories it applies to',
        'This accelerated rate is not counted, so the card is undervalued', 'degrades');
    }

    // 3. A cap that is stated but not quantified.
    const unquantifiedCap = rules.some((r) => r.ruleType === 'reward_cap' && r.value === null);
    if (unquantifiedCap) {
      at('Reward Caps', card.rewardCapsRaw,
        'The cap amount and period, e.g. "5,000 RPs per month on accelerated categories" or "₹1,000 per statement cycle"',
        'Reward figures are shown as an upper bound ("up to ₹X") rather than an estimate', 'degrades');
    }

    // 4. A redemption value given as a range.
    const redemption = rules.find((r) => r.ruleType === 'redemption');
    if (redemption?.condition && /to ₹/i.test(redemption.condition)) {
      at('Redempt Ratio', card.redemptionRatioRaw,
        'A single rupee value per point, or one per redemption route, e.g. "1 RP = ₹1.00 (flights), 1 RP = ₹0.25 (vouchers)"',
        'Rewards are valued at the lowest stated rate, so the card is shown conservatively', 'degrades');
    }
    if (card.redemptionRatioRaw && redemption?.value === null) {
      at('Redempt Ratio', card.redemptionRatioRaw, 'A rupee value per point',
        'Rewards cannot be converted to rupees at all', 'blocking');
    }

    // 5. A fee waiver threshold that disagrees with its own condition text.
    const condAmount = (card.annualFeeWaiverCondition ?? '').match(/₹\s*([\d.,]+)\s*(lakhs?|crores?)?/i);
    if (card.annualFeeWaiverThreshold !== null && condAmount) {
      const n = Number(condAmount[1].replace(/,/g, ''));
      const scaled = /lakh/i.test(condAmount[2] ?? '') ? n * 1e5 : /crore/i.test(condAmount[2] ?? '') ? n * 1e7 : n;
      if (Math.abs(scaled - card.annualFeeWaiverThreshold) > 1) {
        at('Fee Waiver Threshold / Condition',
          `${card.annualFeeWaiverThreshold} vs "${card.annualFeeWaiverCondition}"`,
          'The two to agree',
          'The threshold column is used; the condition text shown to users disagrees with it', 'minor');
      }
    }

    // 6. Missing facts users are shown directly.
    if (card.forexMarkup === null) at('Forex Markup', null, 'A percentage, e.g. "3.5"', 'Forex cost cannot be calculated', 'blocking');
    if (!card.lastVerifiedAt) at('Last Verified', null, 'A date', 'Freshness cannot be shown', 'minor');
    if (!card.domesticLounge && !card.internationalLounge) {
      at('Dom Lounge / Intl Lounge', null, 'Visit counts, or "None" if the card has no lounge access',
        'The card never matches a lounge preference, even if it has lounge access', 'degrades');
    }
  }

  const order = { blocking: 0, degrades: 1, minor: 2 };
  return gaps.sort((a, b) => order[a.severity] - order[b.severity] || a.cardId.localeCompare(b.cardId));
}

function main() {
  const entries = loadEntries();
  const gaps = collect(entries);

  const blocking = gaps.filter((g) => g.severity === 'blocking');
  const byColumn = new Map<string, number>();
  for (const g of gaps) byColumn.set(g.column, (byColumn.get(g.column) ?? 0) + 1);

  console.log(`\n${gaps.length} gap(s) across ${new Set(gaps.map((g) => g.cardId)).size} of ${entries.length} cards.\n`);
  console.log('By column:');
  for (const [col, n] of [...byColumn.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${col}`);

  console.log(`\nBlocking (${blocking.length}) — these cards cannot be valued or ranked:`);
  for (const g of blocking) {
    console.log(`  ${g.cardId.padEnd(26)} ${g.column.padEnd(14)} currently: ${g.currentValue}`);
    console.log(`  ${''.padEnd(26)} ${''.padEnd(14)} needs:     ${g.whatIsNeeded}`);
  }

  const sheet = XLSX.utils.json_to_sheet(gaps.map((g) => ({
    'Card ID': g.cardId, Issuer: g.issuer, 'Card Name': g.cardName, Severity: g.severity,
    Column: g.column, 'Current value': g.currentValue, 'What is needed': g.whatIsNeeded, 'Impact if left': g.impact,
  })));
  sheet['!cols'] = [{ wch: 26 }, { wch: 22 }, { wch: 34 }, { wch: 10 }, { wch: 18 }, { wch: 48 }, { wch: 60 }, { wch: 60 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Data gaps');
  XLSX.writeFile(wb, path.join(process.cwd(), 'data-gaps.xlsx'));
  console.log('\n✓  data-gaps.xlsx written.');

  if (process.argv.includes('--csv')) {
    fs.writeFileSync(path.join(process.cwd(), 'data-gaps.csv'), XLSX.utils.sheet_to_csv(sheet));
    console.log('✓  data-gaps.csv written.');
  }
}

main();
