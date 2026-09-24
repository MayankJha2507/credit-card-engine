/**
 * Repeatable import: workbook -> validated, normalized data -> PostgreSQL (+ JSON snapshot).
 *
 *   npm run import-data              # auto-locates the workbook
 *   npm run import-data -- --dry-run # validate only, write nothing
 *
 * Card data is never hard-coded in the app: adding a row to the workbook and
 * re-running this script makes the card available.
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import postgres from 'postgres';
import { transformRow, type TransformWarning, type WorkbookRow } from '../lib/data/transform';
import { validateEntries, validateHeaders, type Issue } from '../lib/validation/validate';
import type { CardWithRules } from '../lib/data/types';
import { writeCards, type SqlLike } from '../lib/data/import-writer';

const SHEET_CANDIDATES = ['Card Master', 'Cards', 'Card_Master'];

export function locateWorkbook(root = process.cwd()): string {
  if (process.env.WORKBOOK_PATH) {
    const p = path.resolve(root, process.env.WORKBOOK_PATH);
    if (!fs.existsSync(p)) throw new Error(`WORKBOOK_PATH does not exist: ${p}`);
    return p;
  }
  const searchDirs = [root, path.join(root, 'data'), path.join(root, 'workbook')];
  const found: string[] = [];
  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (/\.xlsx?$/i.test(f) && !f.startsWith('~$')) found.push(path.join(dir, f));
    }
  }
  if (found.length === 0) throw new Error(`No .xlsx workbook found in ${searchDirs.join(', ')}`);
  // Prefer the most specific-looking name, then the newest file.
  found.sort((a, b) => {
    const score = (p: string) => (/credit.?card/i.test(path.basename(p)) ? 1 : 0);
    const s = score(b) - score(a);
    return s !== 0 ? s : fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs;
  });
  return found[0];
}

/** Header row = the row with the most non-empty cells in the first 10 rows. */
function readCardSheet(file: string): { headers: string[]; rows: WorkbookRow[] } {
  const wb = XLSX.readFile(file, { cellDates: true });
  const name = SHEET_CANDIDATES.find((n) => wb.SheetNames.includes(n)) ?? wb.SheetNames[0];
  const sheet = wb.Sheets[name];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, raw: true });

  let headerIdx = 0;
  let best = -1;
  for (let i = 0; i < Math.min(10, matrix.length); i++) {
    const filled = (matrix[i] ?? []).filter((c) => c !== null && c !== undefined && String(c).trim() !== '').length;
    if (filled > best) { best = filled; headerIdx = i; }
  }

  const rawHeaders = (matrix[headerIdx] ?? []).map((h) => String(h ?? '').trim());
  // The workbook repeats a few column names (e.g. "Reward Exclusions"); keep the first.
  const headers = rawHeaders.slice();
  const rows: WorkbookRow[] = [];
  for (const line of matrix.slice(headerIdx + 1)) {
    const row: WorkbookRow = {};
    headers.forEach((h, i) => {
      if (!h) return;
      const v = (line as unknown[])[i];
      if (h in row && (v === undefined || v === null || String(v).trim() === '')) return;
      if (h in row) return; // first occurrence wins
      row[h] = v;
    });
    if (row['Card ID'] && String(row['Card ID']).trim()) rows.push(row);
  }
  return { headers: headers.filter(Boolean), rows };
}

function report(issues: Issue[], warnings: TransformWarning[]) {
  const errors = issues.filter((i) => i.level === 'error');
  const warns = [
    ...issues.filter((i) => i.level === 'warning').map((i) => `${i.cardId} · ${i.field}: ${i.message}`),
    ...warnings.map((w) => `${w.cardId} · ${w.field}: ${w.message}`),
  ];
  if (warns.length) {
    console.log(`\n⚠  ${warns.length} warning(s):`);
    for (const w of warns) console.log(`   - ${w}`);
  }
  if (errors.length) {
    console.error(`\n✖  ${errors.length} error(s) — import aborted, nothing was written:`);
    for (const e of errors) console.error(`   - ${e.cardId} · ${e.field}: ${e.message}`);
  }
  return errors.length;
}

async function writeToPostgres(entries: CardWithRules[], workbook: string, checksum: string, warningCount: number) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log('\nℹ  DATABASE_URL not set — wrote the JSON snapshot only (the app will read that).');
    return;
  }
  const sql = postgres(url, { max: 1, prepare: false, ssl: /supabase|neon|render|amazonaws/.test(url) ? 'require' : undefined });
  try {
    await writeCards(sql as unknown as SqlLike, entries, workbook, checksum, warningCount);
    console.log('\n✓  PostgreSQL updated.');
  } finally {
    await sql.end();
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const file = locateWorkbook();
  console.log(`Workbook: ${file}`);

  const { headers, rows } = readCardSheet(file);
  console.log(`Sheet columns: ${headers.length}, data rows: ${rows.length}`);

  const headerIssues = validateHeaders(headers);
  if (headerIssues.length) {
    report(headerIssues, []);
    process.exit(1);
  }

  const entries: CardWithRules[] = [];
  const warnings: TransformWarning[] = [];
  for (const row of rows) {
    const { entry, warnings: w } = transformRow(row);
    entries.push(entry);
    warnings.push(...w);
  }

  const issues = validateEntries(entries);
  const errorCount = report(issues, warnings);
  if (errorCount > 0) process.exit(1);

  const ruleCount = entries.reduce((n, e) => n + e.rules.length, 0);
  const researched = entries.filter((e) => (e.card.researchStatus ?? '').toLowerCase().includes('fully researched'));
  console.log(`\n✓  ${entries.length} card(s), ${ruleCount} rule(s) parsed. ${researched.length} fully researched.`);

  if (dryRun) {
    console.log('\nDry run — nothing written.');
    return;
  }

  const payload = {
    importedAt: new Date().toISOString(),
    workbook: path.basename(file),
    entries,
  };
  const json = JSON.stringify(payload, null, 2);
  const checksum = crypto.createHash('sha256').update(json).digest('hex').slice(0, 16);
  fs.mkdirSync(path.join(process.cwd(), 'db'), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), 'db', 'snapshot.json'), json);
  console.log(`✓  Snapshot written to db/snapshot.json (checksum ${checksum}).`);

  await writeToPostgres(entries, file, checksum, warnings.length + issues.length);
}

main().catch((e) => {
  console.error('\n✖ Import failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
