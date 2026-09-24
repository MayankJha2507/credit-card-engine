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
import { canonicalColumn, canonicalizeRow } from '../lib/data/columns';
import type { CardWithRules } from '../lib/data/types';
import { writeCards, type SqlLike } from '../lib/data/import-writer';

/** Sheet whose rows are the card master, matched case-insensitively by prefix. */
const CARD_SHEET = /^card\s*master|^cards?$/i;
/** Supplementary sheet listing the whole identified universe, used to cross-check coverage. */
const UNIVERSE_SHEET = /universe|matrix|coverage/i;

export function locateWorkbooks(root = process.cwd()): string[] {
  if (process.env.WORKBOOK_PATH) {
    const p = path.resolve(root, process.env.WORKBOOK_PATH);
    if (!fs.existsSync(p)) throw new Error(`WORKBOOK_PATH does not exist: ${p}`);
    return [p];
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
  return found.sort();
}

/**
 * With several workbooks present, the one carrying the most fully-researched
 * cards is the master; the rest are older editions. This is deterministic and
 * printed, and `WORKBOOK_PATH` overrides it entirely.
 */
export function chooseWorkbook(files: string[]): { chosen: string; rejected: Array<{ file: string; cards: number }> } {
  const scored = files.map((file) => {
    try {
      const { rows } = readCardSheet(file);
      const researched = rows.filter((r) => /fully researched/i.test(String(r['Research Status'] ?? ''))).length;
      return { file, cards: rows.length, researched };
    } catch {
      return { file, cards: 0, researched: 0 };
    }
  });
  scored.sort((a, b) => b.researched - a.researched || b.cards - a.cards || fs.statSync(b.file).mtimeMs - fs.statSync(a.file).mtimeMs);
  return { chosen: scored[0].file, rejected: scored.slice(1).map(({ file, cards }) => ({ file, cards })) };
}

/** Header row = the row with the most non-empty cells in the first 10 rows. */
function readCardSheet(file: string): { headers: string[]; rows: WorkbookRow[]; sheetName: string } {
  const wb = XLSX.readFile(file, { cellDates: true });
  const name = wb.SheetNames.find((n) => CARD_SHEET.test(n)) ?? wb.SheetNames[0];
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
    const canonical = canonicalizeRow(row);
    if (canonical['Card ID'] && String(canonical['Card ID']).trim()) rows.push(canonical);
  }
  const canonicalHeaders = headers.filter(Boolean).map((h) => canonicalColumn(h) ?? h);
  return { headers: [...new Set(canonicalHeaders)], rows, sheetName: name };
}

/** Card IDs listed in the workbook's universe/coverage sheet, if it has one. */
function readUniverseSheet(file: string): { sheetName: string; ids: string[] } | null {
  const wb = XLSX.readFile(file, { cellDates: true });
  const name = wb.SheetNames.find((n) => UNIVERSE_SHEET.test(n));
  if (!name) return null;
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, blankrows: false, raw: true });
  const headerIdx = matrix.findIndex((line) => (line ?? []).some((c) => String(c ?? '').trim().toLowerCase() === 'card id'));
  if (headerIdx === -1) return null;
  const col = (matrix[headerIdx] as unknown[]).findIndex((c) => String(c ?? '').trim().toLowerCase() === 'card id');
  const ids = matrix.slice(headerIdx + 1)
    .map((line) => String((line as unknown[])[col] ?? '').trim())
    .filter(Boolean);
  return { sheetName: name, ids };
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
  const candidates = locateWorkbooks();
  const { chosen: file, rejected } = chooseWorkbook(candidates);
  console.log(`Workbook: ${file}`);
  for (const r of rejected) {
    console.log(`  (ignoring older edition: ${path.basename(r.file)} — ${r.cards} card rows. Set WORKBOOK_PATH to force a specific file.)`);
  }

  const { headers, rows, sheetName } = readCardSheet(file);
  console.log(`Sheet "${sheetName}": ${headers.length} recognised columns, ${rows.length} data rows`);

  const universe = readUniverseSheet(file);
  if (universe) {
    const masterIds = new Set(rows.map((r) => String(r['Card ID']).trim()));
    const missing = universe.ids.filter((id) => !masterIds.has(id));
    const extra = [...masterIds].filter((id) => !universe.ids.includes(id));
    console.log(`Universe sheet "${universe.sheetName}": ${universe.ids.length} identified cards`);
    if (missing.length) console.log(`  ⚠ ${missing.length} listed in the universe but absent from the card master: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}`);
    if (extra.length) console.log(`  ⚠ ${extra.length} in the card master but absent from the universe sheet: ${extra.slice(0, 5).join(', ')}${extra.length > 5 ? '…' : ''}`);
    if (!missing.length && !extra.length) console.log('  ✓ card master and universe sheet agree');
  }

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
