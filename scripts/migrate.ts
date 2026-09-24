/** Applies db/migrations/*.sql in order. Idempotent (every statement is IF NOT EXISTS). */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
    process.exit(1);
  }
  const sql = postgres(url, { max: 1, prepare: false, ssl: /supabase|neon|render|amazonaws/.test(url) ? 'require' : undefined });
  const dir = path.join(process.cwd(), 'db', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    process.stdout.write(`applying ${f} ... `);
    await sql.unsafe(fs.readFileSync(path.join(dir, f), 'utf8'));
    console.log('ok');
  }
  await sql.end();
  console.log(`\n${files.length} migration(s) applied.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
