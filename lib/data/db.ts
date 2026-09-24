import postgres from 'postgres';

let client: postgres.Sql | null = null;

/** Returns a pooled client, or null when DATABASE_URL is not configured. */
export function getDb(): postgres.Sql | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!client) {
    client = postgres(url, {
      max: 5,
      idle_timeout: 20,
      prepare: false, // pgbouncer / Supabase transaction pooler compatible
      ssl: /supabase|neon|render|amazonaws/.test(url) ? 'require' : undefined,
    });
  }
  return client;
}

export function isDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}
