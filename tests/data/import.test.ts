import { describe, expect, it } from 'vitest';
import { transformRow } from '@/lib/data/transform';
import { validateEntries, validateHeaders } from '@/lib/validation/validate';
import { makeEntry, makeRule } from '../fixtures';

const row = {
  'Card ID': 'TEST-ONE', Issuer: 'Test Bank', 'Card Name': 'Test One', Status: 'Yes',
  'Application Availability': 'Open for Applications', 'Joining Fee': 1000, 'Annual Fee': 1000,
  'Fee Waiver Threshold': '₹100,000 spend in previous anniversary year',
  'Fee Waiver Condition': '₹100,000 spend in previous anniversary year',
  'Forex Markup %': '3.50%', 'Base Reward Earn Rate Raw': '1% Cashback on all other retail spends',
  'Accelerated Earn Rate Raw': '5% Cashback on Amazon, Myntra',
  'Reward Caps': '5% cashback capped at ₹1,000 per statement cycle',
  'Reward Exclusions': 'Fuel, Rent, Wallet', 'Redemption Ratio Raw': '1 CashPoint = ₹1.00',
  'Primary Source URL': 'https://example.com/card', 'Last Verified': '2026-09-18',
  'Data Confidence': 'High (Tier 1 Verified)', 'Research Status': 'Fully Researched',
};

describe('transformRow', () => {
  it('keeps raw facts verbatim and derives nothing', () => {
    const { entry } = transformRow(row);
    const base = entry.rules.find((r) => r.ruleType === 'base_reward')!;
    expect(base.raw).toBe('1% Cashback on all other retail spends');
    expect(base.value).toBe(1);
    expect(base.unit).toBe('cashback_percent');
    expect(entry.card.annualFeeWaiverThreshold).toBe(100000);
    // The card row carries the raw condition, not "waived: true/false".
    expect(entry.card.annualFeeWaiverCondition).toContain('₹100,000');
  });

  it('produces one rule per meaningful fact, each traceable to a source', () => {
    const { entry } = transformRow(row);
    const types = entry.rules.map((r) => r.ruleType);
    expect(types).toContain('base_reward');
    expect(types).toContain('accelerated_reward');
    expect(types).toContain('reward_cap');
    expect(types).toContain('exclusion');
    expect(types).toContain('fee_waiver');
    expect(types).toContain('forex');
    expect(entry.rules.every((r) => r.sourceId === entry.sources[0].id)).toBe(true);
  });

  it('warns instead of guessing when a rate is unresolvable', () => {
    const { entry, warnings } = transformRow({ ...row, 'Base Reward Earn Rate Raw': '3X Reward Points on offline spends', 'Accelerated Earn Rate Raw': '6X RP on online spends' });
    expect(warnings.length).toBeGreaterThan(0);
    expect(entry.rules.find((r) => r.ruleType === 'base_reward')!.value).toBeNull();
  });
});

describe('validateHeaders', () => {
  it('fails when a required column is missing', () => {
    expect(validateHeaders(['Card ID', 'Issuer'])).not.toHaveLength(0);
    expect(validateHeaders(Object.keys(row))).toHaveLength(0);
  });
});

describe('validateEntries', () => {
  const ok = () => {
    const e = transformRow(row).entry;
    return e;
  };

  it('accepts a well-formed card', () => {
    expect(validateEntries([ok()]).filter((i) => i.level === 'error')).toHaveLength(0);
  });

  it('detects duplicate card IDs', () => {
    const issues = validateEntries([ok(), ok()]);
    expect(issues.some((i) => i.message.includes('Duplicate card ID'))).toBe(true);
  });

  it('detects duplicate rule IDs', () => {
    const e = ok();
    const dup = { ...e, rules: [...e.rules, { ...e.rules[0] }] };
    expect(validateEntries([dup]).some((i) => i.message.includes('Duplicate rule ID'))).toBe(true);
  });

  const errorsFor = (entry: ReturnType<typeof ok>) => validateEntries([entry]).filter((i) => i.level === 'error').map((i) => i.message).join(' | ');

  it('detects missing IDs, names, sources and verification dates', () => {
    const e = ok();
    expect(errorsFor({ ...e, card: { ...e.card, id: '' } })).toMatch(/Missing card ID/);
    expect(errorsFor({ ...e, card: { ...e.card, name: '' } })).toMatch(/Missing card name/);
    expect(errorsFor({ ...e, sources: [] })).toMatch(/No source recorded/);
    expect(errorsFor({ ...e, card: { ...e.card, lastVerifiedAt: null } })).toMatch(/Missing verification date/);
  });

  it('detects invalid fees, negative values and impossible rates', () => {
    const e = ok();
    expect(errorsFor({ ...e, card: { ...e.card, annualFee: -1 } })).toMatch(/Negative fee/);
    expect(errorsFor({ ...e, card: { ...e.card, joiningFee: 5_000_000 } })).toMatch(/Implausible fee/);
    expect(errorsFor({ ...e, card: { ...e.card, forexMarkup: 45 } })).toMatch(/Implausible forex markup/);
    const bad = makeEntry({ id: 'B' }, [makeRule({ id: 'b1', ruleType: 'base_reward', value: 900, unit: 'cashback_percent' })]);
    expect(validateEntries([bad]).some((i) => i.message.includes('Implausible cashback rate'))).toBe(true);
  });

  it('detects malformed source URLs', () => {
    const e = ok();
    expect(errorsFor({ ...e, sources: [{ ...e.sources[0], sourceUrl: 'notaurl' }] })).toMatch(/Malformed URL/);
  });

  it('detects an inactive card marked as open for applications', () => {
    const e = ok();
    expect(errorsFor({ ...e, card: { ...e.card, activeStatus: false } })).toMatch(/Inactive card marked as available|open for applications/);
  });
});

describe('multipliers are resolved, not treated as missing data', () => {
  const multiplierRow = {
    ...row,
    'Card ID': 'MULT-TEST',
    'Base Reward Earn Rate Raw': '5X RPs on base spend',
    'Accelerated Earn Rate Raw': '10X RPs on Dining',
    'Redemption Ratio Raw': '1 RP = ₹1.00',
    'Reward Caps': 'No cap',
  };
  const baseOf = (r: Record<string, unknown>) =>
    transformRow(r).entry.rules.find((x) => x.ruleType === 'base_reward')!;
  const accelOf = (r: Record<string, unknown>) =>
    transformRow(r).entry.rules.find((x) => x.ruleType === 'accelerated_reward')!;

  it('resolves a multiplier base against a unit rate stated in its own column', () => {
    const base = baseOf({ ...multiplierRow, 'Base Unit Rate': '1 RP / ₹150' });
    expect(base.value).toBe(5);          // 5X of 1 RP
    expect(base.perAmount).toBe(150);
    expect(base.raw).toBe('5X RPs on base spend');   // the raw fact is still the raw fact
    expect(base.condition).toMatch(/1X = 1 per ₹150/);
  });

  it('accepts the alternative column spellings a workbook might use', () => {
    expect(baseOf({ ...multiplierRow, '1X Rate': '2 RPs / ₹100' }).value).toBe(10);
    expect(baseOf({ ...multiplierRow, 'Unit Reward Rate': '2 RPs / ₹100' }).value).toBe(10);
  });

  it('derives the unit rate from a clause that states a multiplier and an absolute rate', () => {
    // "10X ... (50 RPs / ₹150)" fixes 1X at 5 RP per ₹150, so a 5X base is 25.
    const r = { ...multiplierRow, 'Accelerated Earn Rate Raw': 'Up to 10X Rewards on SmartBuy (50 RPs / ₹150)' };
    expect(baseOf(r)).toMatchObject({ value: 25, perAmount: 150, unit: 'points' });
  });

  it('resolves accelerated multipliers against the card base rate', () => {
    const accel = accelOf({ ...multiplierRow, 'Base Unit Rate': '1 RP / ₹150' });
    expect(accel.value).toBe(10);        // 10X of 1 RP, not 10X of the 5X base
    expect(accel.perAmount).toBe(150);
    expect(accel.categories).toContain('dining');
  });

  it('still resolves an accelerated multiplier against an absolute base rate', () => {
    const accel = accelOf({
      ...row, 'Base Reward Earn Rate Raw': '3 RP / ₹150', 'Accelerated Earn Rate Raw': '5X RP on Dining',
    });
    expect(accel.value).toBe(15);        // 5 × 3 RP per ₹150
    expect(accel.perAmount).toBe(150);
  });

  it('only reports incomplete when nothing on the card says what 1X earns', () => {
    const { entry, warnings } = transformRow(multiplierRow);
    const base = entry.rules.find((x) => x.ruleType === 'base_reward')!;
    expect(base.value).toBeNull();
    expect(base.notes).toMatch(/never states what 1X earns/);
    expect(warnings.some((w) => /never states what 1X earns/.test(w.message))).toBe(true);
  });

  it('flags a derived unit rate that contradicts a stated absolute base rate', () => {
    const { warnings } = transformRow({
      ...row,
      'Base Reward Earn Rate Raw': '9 RPs / ₹150',
      'Accelerated Earn Rate Raw': 'Up to 10X Rewards on SmartBuy (50 RPs / ₹150)',
    });
    expect(warnings.some((w) => /disagrees with the 1X rate/.test(w.message))).toBe(true);
  });
});
