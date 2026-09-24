/**
 * Exercises the real SQL write path (migrations + inserts) against an embedded
 * Postgres, so schema and query errors surface without a live database.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { writeCards, type SqlLike } from '@/lib/data/import-writer';
import { transformRow } from '@/lib/data/transform';
import { rowToCard } from '@/lib/data/repository';

/** Minimal postgres.js-shaped adapter over PGlite. */
function adapter(db: PGlite): SqlLike {
  const tag = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ''), '');
    const res = await db.query(text, values as unknown[]);
    return res.rows;
  }) as SqlLike;
  tag.begin = async <T,>(fn: (tx: SqlLike) => Promise<T>) => {
    await db.exec('begin');
    try {
      const out = await fn(tag);
      await db.exec('commit');
      return out;
    } catch (e) {
      await db.exec('rollback');
      throw e;
    }
  };
  return tag;
}

const row = {
  'Card ID': 'SQL-TEST', Issuer: 'Test Bank', 'Card Name': 'SQL Test Card', Status: 'Yes',
  'Application Availability': 'Open for Applications', 'Joining Fee': 1000, 'Annual Fee': 1000,
  'Fee Waiver Threshold': '₹100,000 spend in previous anniversary year',
  'Fee Waiver Condition': '₹100,000 spend in previous anniversary year',
  'Forex Markup %': '3.50%', 'Base Reward Earn Rate Raw': '1% Cashback on all other retail spends',
  'Accelerated Earn Rate Raw': '5% Cashback on Amazon, Myntra',
  'Reward Caps': '5% cashback capped at ₹1,000 per statement cycle',
  'Reward Exclusions': 'Fuel, Rent, Wallet', 'Redemption Ratio Raw': '1 CashPoint = ₹1.00',
  'Domestic Lounge Access': 'Unlimited domestic lounge access',
  'Primary Source URL': 'https://example.com/card', 'Last Verified': '2026-09-18',
  'Data Confidence': 'High (Tier 1 Verified)', 'Research Status': 'Fully Researched',
};

describe('database schema and import writes', () => {
  let db: PGlite;
  let sql: SqlLike;

  beforeAll(async () => {
    db = new PGlite();
    const dir = path.join(process.cwd(), 'db', 'migrations');
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
      await db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
    }
    sql = adapter(db);
  });

  it('applies the migrations and writes a card with its rules and sources', async () => {
    const { entry } = transformRow(row);
    await writeCards(sql, [entry], 'workbook.xlsx', 'abc123', 0);

    const cards = (await db.query<{ id: string; domestic_lounge_visits: string | null }>('select * from cards')).rows;
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe('SQL-TEST');
    // Infinity must not reach the database; unlimited is stored as -1.
    // numeric columns come back as strings, which is why the repository coerces them.
    expect(Number(cards[0].domestic_lounge_visits)).toBe(-1);

    const rules = (await db.query('select * from card_rules')).rows;
    expect(rules.length).toBe(entry.rules.length);
    const sources = (await db.query('select * from sources')).rows;
    expect(sources).toHaveLength(1);
    const runs = (await db.query<{ card_count: number }>('select * from import_runs')).rows;
    expect(runs[0].card_count).toBe(1);
  });

  it('is re-runnable: a second import updates in place instead of duplicating', async () => {
    const { entry } = transformRow({ ...row, 'Annual Fee': 1500 });
    await writeCards(sql, [entry], 'workbook.xlsx', 'def456', 0);

    const cards = (await db.query<{ annual_fee: string }>('select * from cards')).rows;
    expect(cards).toHaveLength(1);
    expect(Number(cards[0].annual_fee)).toBe(1500);
    const rules = (await db.query('select * from card_rules')).rows;
    expect(rules.length).toBe(entry.rules.length);
    const runs = (await db.query('select * from import_runs')).rows;
    expect(runs).toHaveLength(2); // the audit trail keeps both runs
  });

  it('round-trips a card through the read path the app uses', async () => {
    const dbRow = (await db.query('select * from cards limit 1')).rows[0];
    const card = rowToCard(dbRow);
    expect(card.id).toBe('SQL-TEST');
    expect(card.annualFee).toBe(1500);
    expect(card.forexMarkup).toBe(3.5);
    expect(card.activeStatus).toBe(true);
    expect(card.lastVerifiedAt).toBe('2026-09-18');
    expect(card.domesticLoungeVisits).toBe(-1);
    expect(card.baseRewardRateRaw).toBe('1% Cashback on all other retail spends');
  });

  it('stores arrays and jsonb in the shape the app reads back', async () => {
    const cats = (await db.query<{ categories: string[]; cap: unknown }>(
      "select categories, cap from card_rules where rule_type = 'accelerated_reward' limit 1")).rows[0];
    expect(Array.isArray(cats.categories)).toBe(true);
    const fields = (await db.query<{ fields_covered: string[] }>('select fields_covered from sources limit 1')).rows[0];
    expect(fields.fields_covered).toContain('fees');
  });
});
