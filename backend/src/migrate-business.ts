import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { db } from './db.js';

const migrationsDirectory = join(dirname(fileURLToPath(import.meta.url)), '../migrations');

/** Applies versioned PostgreSQL migrations as one transaction per file. */
async function migrate() {
  await db.query(`
    create table if not exists public.sellora_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const applied = await db.query<{ name: string }>('select name from public.sellora_migrations');
  const known = new Set(applied.rows.map((row) => row.name));
  const files = (await readdir(migrationsDirectory))
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort();

  for (const name of files) {
    if (known.has(name)) continue;
    const sql = await readFile(join(migrationsDirectory, name), 'utf8');
    const client = await db.connect();
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into public.sellora_migrations(name) values ($1)', [name]);
      await client.query('commit');
      console.info(`Applied database migration ${name}`);
      // PostgREST caches schema and relationship metadata. Reload it after
      // each migration so newly renamed/created tables are immediately usable.
      await db.query("notify pgrst, 'reload schema'");
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
}

migrate()
  .catch((error: unknown) => {
    console.error('Database migration failed:', error instanceof Error ? error.message : 'unknown error');
    process.exitCode = 1;
  })
  .finally(() => db.end());
