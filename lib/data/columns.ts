/**
 * Workbook column aliases.
 *
 * Different editions of the workbook name the same field differently
 * ("Base Reward Earn Rate Raw" vs "Base Rate", "Forex Markup %" vs "Forex
 * Markup"). The import resolves whatever headers a sheet carries onto these
 * canonical names, so adding a differently-labelled workbook is a one-line
 * change here rather than a rewrite of the transform.
 *
 * The first entry of each list is the canonical name used everywhere downstream.
 */
export const COLUMN_ALIASES: Record<string, string[]> = {
  'Card ID': ['Card ID', 'CardID', 'ID'],
  Issuer: ['Issuer', 'Bank'],
  'Card Name': ['Card Name', 'Name'],
  Network: ['Network'],
  'Variant / Tier': ['Variant / Tier', 'Variant', 'Segment / Tier', 'Tier'],
  'Card Type': ['Card Type', 'Type', 'Primary Benefit Category'],
  Status: ['Status', 'Active Status'],
  'Application Availability': ['Application Availability', 'App Availability', 'Availability'],
  'Joining Fee': ['Joining Fee', 'Joining Fee (Est. ₹)'],
  'Annual Fee': ['Annual Fee', 'Annual Fee (Est. ₹)'],
  'Fee Waiver Threshold': ['Fee Waiver Threshold', 'Waiver Threshold'],
  'Fee Waiver Condition': ['Fee Waiver Condition', 'Waiver Condition'],
  'Rent Fee': ['Rent Fee'],
  'Forex Markup %': ['Forex Markup %', 'Forex Markup', 'Forex'],
  'GST Applicability': ['GST Applicability', 'GST'],
  'DCC Charges': ['DCC Charges', 'DCC Policy'],
  'Domestic Lounge Access': ['Domestic Lounge Access', 'Dom Lounge'],
  'International Lounge Access': ['International Lounge Access', 'Intl Lounge'],
  'Lounge Program': ['Lounge Program', 'Lounge Programme'],
  'Lounge Spend Requirement': ['Lounge Spend Requirement', 'Lounge Spend Req'],
  'Base Reward Earn Rate Raw': ['Base Reward Earn Rate Raw', 'Base Rate', 'Base Earn Rate'],
  // Optional. Lets a workbook state what "1X" means for a card whose rates are
  // all written as multipliers, e.g. "1 RP / ₹150".
  'Base Unit Rate': ['Base Unit Rate', 'Unit Reward Rate', 'Unit Rate', '1X Rate', 'Base Multiplier Unit'],
  'Accelerated Earn Rate Raw': ['Accelerated Earn Rate Raw', 'Accel Rate', 'Accelerated Rate'],
  'Accelerated Categories': ['Accelerated Categories', 'Accel Cats'],
  'Reward Caps': ['Reward Caps', 'Caps'],
  'Reward Exclusions': ['Reward Exclusions', 'Rew Exclusions Detail'],
  'Redemption Ratio Raw': ['Redemption Ratio Raw', 'Redempt Ratio', 'Redemption Ratio'],
  'Redemption Options': ['Redemption Options', 'Redempt Options'],
  'Cashback Rate': ['Cashback Rate'],
  'Minimum Income': ['Minimum Income', 'Min Income'],
  'Income Frequency': ['Income Frequency', 'Income Freq'],
  'Age Limit': ['Age Limit'],
  'Location Restrictions': ['Location Restrictions', 'Location Restr'],
  'Employment Requirement': ['Employment Requirement', 'Emp Req'],
  'Existing Relationship Requirement': ['Existing Relationship Requirement', 'Rel Req'],
  'Credit Score Requirement': ['Credit Score Requirement', 'CIBIL Score'],
  'Welcome Benefits': ['Welcome Benefits'],
  'Milestone Benefits': ['Milestone Benefits'],
  'Travel Benefits': ['Travel Benefits'],
  'Dining Benefits': ['Dining Benefits'],
  'Other Benefits': ['Other Benefits'],
  'Primary Source URL': ['Primary Source URL', 'Source URL', 'Source'],
  'Last Verified': ['Last Verified', 'Verified On'],
  'Data Confidence': ['Data Confidence', 'Confidence'],
  Notes: ['Notes', 'Notes / Next Action'],
  'Research Status': ['Research Status'],
};

/** Columns a sheet must provide (under any alias) for the import to proceed. */
export const REQUIRED_COLUMNS = [
  'Card ID', 'Issuer', 'Card Name', 'Status', 'Application Availability',
  'Joining Fee', 'Annual Fee', 'Forex Markup %', 'Base Reward Earn Rate Raw',
  'Primary Source URL', 'Last Verified', 'Data Confidence', 'Research Status',
];

const LOOKUP = new Map<string, string>();
for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
  for (const a of aliases) LOOKUP.set(a.toLowerCase(), canonical);
}

/** Canonical name for a sheet header, or null when we do not recognise it. */
export function canonicalColumn(header: string): string | null {
  return LOOKUP.get(header.trim().toLowerCase()) ?? null;
}

/**
 * Rewrites a raw row keyed by sheet headers into one keyed by canonical names.
 * Unrecognised headers are kept as-is so nothing is lost.
 */
export function canonicalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [header, value] of Object.entries(row)) {
    const canonical = canonicalColumn(header);
    const key = canonical ?? header;
    // First non-empty value wins, so a sheet with both spellings stays sane.
    if (key in out && (value === null || value === undefined || String(value).trim() === '')) continue;
    if (key in out && out[key] !== null && out[key] !== undefined && String(out[key]).trim() !== '') continue;
    out[key] = value;
  }
  return out;
}
