import 'dotenv/config';
import pg from 'pg';

const email = process.argv[2]?.trim().toLowerCase();
const connectionString = process.env.DATABASE_BOOTSTRAP_URL;
const applicationDatabaseUrl = process.env.DATABASE_URL;
if (!email || !email.includes('@')) {
  throw new Error('Usage: npm run admin:bootstrap -- user@example.com');
}

let poolOptions;
if (connectionString) {
  poolOptions = { connectionString, max: 1, ssl: false };
} else {
  if (!applicationDatabaseUrl) throw new Error('Set DATABASE_URL in backend/.env first.');
  const database = new URL(applicationDatabaseUrl);
  if (!['127.0.0.1', 'localhost'].includes(database.hostname)) {
    throw new Error('For a hosted database, set DATABASE_BOOTSTRAP_URL to its trusted administrator connection for this one-time operation.');
  }
  // Match the local Homebrew PostgreSQL socket used by prepare-postgrest.mjs.
  // This avoids putting the local superuser password on the command line.
  poolOptions = {
    host: process.env.DATABASE_ADMIN_SOCKET || '/tmp',
    port: Number(database.port || 5432),
    database: decodeURIComponent(database.pathname.slice(1)),
    user: process.env.DATABASE_ADMIN_USER || 'postgres',
    max: 1,
    ssl: false,
  };
}

const pool = new pg.Pool(poolOptions);
const client = await pool.connect();
try {
  const identity = await client.query(
    'select rolsuper from pg_roles where rolname = current_user',
  );
  if (!identity.rows[0]?.rolsuper) throw new Error('First-admin bootstrap requires a local PostgreSQL superuser because profiles enforce row-level security.');

  await client.query('begin');
  await client.query('lock table public.profiles in exclusive mode');
  const admins = await client.query("select 1 from public.profiles where role = 'admin' and approval_status = 'approved' limit 1");
  if (admins.rowCount) {
    const sameAdmin = await client.query(
      "select 1 from public.profiles where lower(email)=$1 and role='admin' and approval_status='approved'",
      [email],
    );
    if (!sameAdmin.rowCount) throw new Error('An approved administrator already exists; use the in-app approval workflow.');
  }
  // This bootstrap runs before any approved admin can receive the profile
  // notification. The trigger's SECURITY DEFINER owner may be subject to RLS
  // on notifications, so suppress just this notification for the transaction.
  await client.query('alter table public.profiles disable trigger sellora_profile_notification');
  if (!admins.rowCount) {
    const result = await client.query(
      `update public.profiles
          set role = 'admin', requested_role = 'admin', approval_status = 'approved'
        where lower(email) = $1`,
      [email],
    );
    if (result.rowCount !== 1) throw new Error('No matching signup profile was found. Create the account in Sellora first, then retry.');
    await client.query('alter table public.profiles enable trigger sellora_profile_notification');
  }
  // The first run also seeds the restricted lookup for existing profiles.
  // This connection uses the verified local database owner, which can read
  // rows hidden from the application's FORCE RLS connection.
  await client.query(`
    insert into public.sellora_user_access(user_id, role, approval_status)
    select id, role, approval_status from public.profiles
    on conflict (user_id) do update
      set role=excluded.role, approval_status=excluded.approval_status
  `);
  await client.query('commit');
  console.info(admins.rowCount
    ? `Administrator ${email} is approved; role access was synchronized.`
    : `Approved ${email} as the first Sellora administrator.`);
} catch (error) {
  await client.query('rollback').catch(() => {});
  console.error(error instanceof Error ? error.message : 'Could not promote the first administrator.');
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
