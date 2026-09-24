import fs from 'node:fs';
import path from 'node:path';
import type { CardWithRules } from '../lib/data/types';

/** Evals run against the imported snapshot so they exercise real workbook data. */
export function loadEntries(): CardWithRules[] {
  const file = path.join(process.cwd(), 'db', 'snapshot.json');
  if (!fs.existsSync(file)) {
    throw new Error('db/snapshot.json not found — run `npm run import-data` first.');
  }
  return (JSON.parse(fs.readFileSync(file, 'utf8')) as { entries: CardWithRules[] }).entries;
}

export function entry(entries: CardWithRules[], cardId: string): CardWithRules {
  const e = entries.find((x) => x.card.id === cardId);
  if (!e) throw new Error(`Card not in database: ${cardId}`);
  return e;
}
