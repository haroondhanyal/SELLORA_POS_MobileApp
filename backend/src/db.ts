import pg, { type PoolClient } from 'pg';
import { config } from './config.js';

const { Pool } = pg;

/** A small shared pool keeps API and Better Auth database usage bounded. */
export const db = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
});

/** Runs an application query with RLS bound to a validated Better Auth user. */
export async function withActorTransaction<T>(
  userId: string,
  action: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('sellora.user_id', $1, true)", [userId]);
    const result = await action(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

db.on('error', (error) => {
  // Do not log credentials or query parameters from the database URL.
  console.error('Unexpected PostgreSQL pool error:', error.message);
});
