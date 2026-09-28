import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { Client } from 'pg';
import { parse } from 'dotenv';
import { resolve } from 'node:path';

const backendDirectory = process.cwd();
const envPath = resolve(process.env.SELLORA_ENV_FILE ?? resolve(backendDirectory, '.env'));
const envText = await readFile(envPath, 'utf8');
const env = parse(envText);
const database = new URL(env.DATABASE_URL);
const port = database.port || '5432';
const databaseName = decodeURIComponent(database.pathname.slice(1));

if (database.hostname !== '127.0.0.1' && database.hostname !== 'localhost') {
  throw new Error('This setup helper only configures the local PostgreSQL database. Configure PostgREST roles with your database administrator for hosted PostgreSQL.');
}

const authenticatorPassword = env.POSTGREST_DATABASE_URL
  ? decodeURIComponent(new URL(env.POSTGREST_DATABASE_URL).password)
  : randomBytes(32).toString('base64url');
const restJwtSecret = env.REST_JWT_SECRET || randomBytes(48).toString('base64url');

const admin = new Client({
  host: env.DATABASE_ADMIN_SOCKET || '/tmp',
  port: Number(port),
  database: databaseName,
  user: env.DATABASE_ADMIN_USER || 'postgres',
});
await admin.connect();
try {
  // Required only to verify bcrypt password hashes imported from Supabase.
  await admin.query('create extension if not exists pgcrypto with schema public');
  await admin.query(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'sellora_guest') then
        create role sellora_guest nologin noinherit nosuperuser nocreatedb nocreaterole;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'sellora_rest') then
        create role sellora_rest nologin noinherit nosuperuser nocreatedb nocreaterole;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'sellora_authenticator') then
        create role sellora_authenticator login noinherit nosuperuser nocreatedb nocreaterole;
      end if;
    end $$;
  `);
  await admin.query(
    `select format('alter role sellora_authenticator login noinherit nosuperuser nocreatedb nocreaterole password %L', $1)`,
    [authenticatorPassword],
  ).then(async (result) => admin.query(result.rows[0].format));
  const grantConnect = await admin.query(
    `select format('grant connect on database %I to sellora_authenticator', current_database()) as statement`,
  );
  await admin.query(grantConnect.rows[0].statement);
  await admin.query('grant sellora_guest, sellora_rest to sellora_authenticator');
  await admin.query('grant usage on schema public to sellora_guest, sellora_rest');
  await admin.query('grant usage on schema auth to sellora_rest');
  await admin.query('grant execute on function auth.uid() to sellora_rest');
  await admin.query('grant execute on function public.crypt(text, text) to sellora_api');

  // Keep the connection role powerless by itself. Requests switch to the
  // non-owner sellora_rest role, where forced RLS policies apply.
  await admin.query('revoke all on all tables in schema public from public');
  await admin.query('revoke all on all sequences in schema public from public');
  await admin.query('revoke all on all functions in schema public from public');
  await admin.query(`
    do $$
    declare item record;
    begin
      for item in
        select c.relname, c.relkind
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relrowsecurity
          and c.relname <> 'sellora_migrations'
          and c.relkind in ('r', 'p')
      loop
        execute format('grant select, insert, update, delete on table public.%I to sellora_rest', item.relname);
      end loop;

      for item in
        select c.relname from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'S'
      loop
        execute format('grant usage, select on sequence public.%I to sellora_rest', item.relname);
      end loop;
    end $$;
  `);
  await admin.query('grant execute on all functions in schema public to sellora_rest');
} finally {
  await admin.end();
}

const postgrestUrl = `postgresql://sellora_authenticator:${authenticatorPassword}@127.0.0.1:${port}/${databaseName}`;
const replacements = {
  POSTGREST_DATABASE_URL: postgrestUrl,
  REST_JWT_SECRET: restJwtSecret,
};
let nextEnvText = envText;
for (const [key, value] of Object.entries(replacements)) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(envText)) {
    nextEnvText = nextEnvText.replace(pattern, line);
  } else {
    nextEnvText = `${nextEnvText.trimEnd()}\n${line}\n`;
  }
}
await writeFile(envPath, nextEnvText, { mode: 0o600 });

console.info('PostgREST roles are ready; credentials and REST signing secret were saved to backend/.env.');
