import { createHmac } from 'node:crypto';
import { timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import express from 'express';
import cors from 'cors';
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node';
import { auth } from './auth.js';
import { db, withActorTransaction } from './db.js';
import { config } from './config.js';

const app = express();
app.set('trust proxy', 'loopback');
const allowedRoles = [
  'admin', 'branch_manager', 'sales_manager', 'sales_agent',
  'cashier', 'inventory_manager', 'accountant', 'viewer',
] as const;

app.disable('x-powered-by');
app.use((_request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  next();
});
app.use(cors({ origin: config.trustedOrigins, credentials: true }));

// Better Auth must receive the raw request body before JSON middleware consumes it.
app.all('/api/auth/*splat', toNodeHandler(auth));

/** Exchanges a Better Auth session for a short-lived, RLS-bound PostgREST token. */
app.get('/api/db-token', async (request, response) => {
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) {
      response.status(401).json({ error: 'Sign in to access Sellora business data.' });
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const token = signRestToken({ sub: session.user.id, role: 'sellora_rest', iat: now, exp: now + 300 });
    response.setHeader('Cache-Control', 'no-store');
    response.json({ access_token: token, token_type: 'Bearer', expires_in: 300 });
  } catch (error) {
    console.error('Could not create a database access token:', error instanceof Error ? error.message : 'unknown error');
    response.status(500).json({ error: 'Could not authorize database access.' });
  }
});

// Keep the existing PostgREST query contract while sending all database queries
// to the local PostgreSQL API.
app.all('/rest/v1/*splat', async (request, response) => {
  try {
    // The mobile client speaks the Supabase-compatible /rest/v1 prefix, while
    // standalone PostgREST serves routes directly from /. Strip only that
    // public compatibility prefix before proxying the original query string.
    const restPath = request.originalUrl.replace(/^\/rest\/v1(?=\/|\?|$)/, '') || '/';
    const target = `${config.postgrestUrl.replace(/\/$/, '')}${restPath}`;
    const headers = new Headers();
    for (const name of [
      'accept', 'authorization', 'apikey', 'content-type', 'content-profile',
      'accept-profile', 'prefer', 'range', 'range-unit', 'if-match', 'if-none-match',
    ]) {
      const value = request.header(name);
      if (value) headers.set(name, value);
    }

    const methodHasBody = !['GET', 'HEAD'].includes(request.method);
    const body = methodHasBody ? await readRequestBody(request, 10 * 1024 * 1024) : undefined;
    const upstream = await fetch(target, { method: request.method, headers, body });
    response.status(upstream.status);
    for (const name of [
      'content-type', 'content-range', 'content-location', 'location', 'etag',
      'last-modified', 'preference-applied', 'cache-control', 'www-authenticate',
    ]) {
      const value = upstream.headers.get(name);
      if (value) response.setHeader(name, value);
    }
    if (!upstream.body) {
      response.end();
      return;
    }
    const stream = await import('node:stream');
    // Node's Web Stream and DOM lib definitions differ across supported Node versions.
    stream.Readable.fromWeb(upstream.body as never).pipe(response);
  } catch (error) {
    console.error('PostgREST request failed:', error instanceof Error ? error.message : 'unknown error');
    response.status(502).json({ error: 'The local PostgreSQL REST service is unavailable.' });
  }
});

app.use(express.json({ limit: '36mb' }));

const storageRoot = config.storageRoot;
const storageBuckets = new Set(['avatars', 'products', 'customers', 'expenses']);
const imageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maxFileBytes = 25 * 1024 * 1024;

app.post('/api/storage/:bucket/upload', async (request, response) => {
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) return response.status(401).json({ error: 'Sign in to upload files.' });
    const { bucket } = request.params;
    const { path, base64, contentType } = request.body as { path?: unknown; base64?: unknown; contentType?: unknown };
    if (!isStorageBucket(bucket) || typeof path !== 'string' || typeof base64 !== 'string'
      || typeof contentType !== 'string' || !imageMimeTypes.has(contentType)) {
      return response.status(400).json({ error: 'The file upload is invalid.' });
    }
    const bytes = Buffer.from(base64, 'base64');
    if (!bytes.length || bytes.length > maxFileBytes || bytes.toString('base64') !== base64) {
      return response.status(400).json({ error: 'The image is empty, too large, or invalid.' });
    }
    const fullPath = storagePath(bucket, path);
    const result = await withActorTransaction(session.user.id, async (client) => {
      await assertStoragePermission(client, session.user.id, bucket, path, 'write');
      await mkdir(resolve(fullPath, '..'), { recursive: true, mode: 0o700 });
      await writeFile(fullPath, bytes, { flag: 'wx', mode: 0o600 });
    });
    void result;
    response.status(201).json({ path });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'EEXIST') {
      // A timed-out client may retry an upload that the server already saved.
      // Treat the same path and same bytes as an idempotent success so offline
      // expense sync can continue; never silently replace a different file.
      try {
        const existing = await readFile(storagePath(request.params.bucket, String((request.body as { path?: unknown } | null)?.path ?? '')));
        const incoming = Buffer.from(String((request.body as { base64?: unknown } | null)?.base64 ?? ''), 'base64');
        if (existing.length === incoming.length && timingSafeEqual(existing, incoming)) {
          return response.status(200).json({ path: (request.body as { path: string }).path, reused: true });
        }
      } catch {
        // Keep the original conflict response if the existing object cannot be read.
      }
      return response.status(409).json({ error: 'A different file already exists at this path.' });
    }
    const message = error instanceof Error ? error.message : 'Could not save the file.';
    response.status(message.startsWith('Storage access denied') ? 403 : 400).json({ error: message });
  }
});

app.post('/api/storage/:bucket/delete', async (request, response) => {
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) return response.status(401).json({ error: 'Sign in to remove files.' });
    const { bucket } = request.params;
    const { paths } = request.body as { paths?: unknown };
    if (!isStorageBucket(bucket) || !Array.isArray(paths) || paths.length > 50 || paths.some((path) => typeof path !== 'string')) {
      return response.status(400).json({ error: 'The file paths are invalid.' });
    }
    await withActorTransaction(session.user.id, async (client) => {
      for (const path of paths as string[]) {
        await assertStoragePermission(client, session.user.id, bucket, path, 'delete');
        await rm(storagePath(bucket, path), { force: true });
      }
    });
    response.json({ removed: paths.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not remove the files.';
    response.status(message.startsWith('Storage access denied') ? 403 : 400).json({ error: message });
  }
});

app.post('/api/storage/:bucket/signed', async (request, response) => {
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) return response.status(401).json({ error: 'Sign in to view private files.' });
    const { bucket } = request.params;
    const { path, expiresIn } = request.body as { path?: unknown; expiresIn?: unknown };
    if (!isStorageBucket(bucket) || typeof path !== 'string') return response.status(400).json({ error: 'The file path is invalid.' });
    const ttl = typeof expiresIn === 'number' ? Math.max(30, Math.min(expiresIn, 3600)) : 3600;
    await withActorTransaction(session.user.id, (client) => assertStoragePermission(client, session.user.id, bucket, path, 'read'));
    const expires = Math.floor(Date.now() / 1000) + ttl;
    const signature = signFileToken(bucket, path, expires);
    const base = config.authUrl.replace(/\/$/, '');
    response.json({ signedUrl: `${base}/api/storage-file/${bucket}/${encodeURIComponent(path).replaceAll('%2F', '/') }?expires=${expires}&signature=${signature}`, expiresAt: new Date(expires * 1000).toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not authorize this file.';
    response.status(message.startsWith('Storage access denied') ? 403 : 400).json({ error: message });
  }
});

app.get('/api/storage-file/:bucket/*path', async (request, response) => {
  const bucket = request.params.bucket;
  const path = Array.isArray(request.params.path) ? request.params.path.join('/') : String(request.params.path ?? '');
  const expires = Number(request.query.expires);
  const signature = String(request.query.signature ?? '');
  if (!isStorageBucket(bucket) || !Number.isInteger(expires) || expires < Math.floor(Date.now() / 1000)
    || !verifyFileToken(bucket, path, expires, signature)) return response.status(403).json({ error: 'This file link has expired or is invalid.' });
  try {
    const file = storagePath(bucket, path);
    const bytes = await readFile(file);
    response.setHeader('Cache-Control', 'private, max-age=300');
    response.setHeader('Content-Type', imageMimeFromPath(path));
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.send(bytes);
  } catch {
    response.status(404).json({ error: 'File not found.' });
  }
});

app.get('/health', async (_request, response) => {
  try {
    await db.query('select 1');
    response.json({ status: 'ok', database: 'connected' });
  } catch {
    response.status(503).json({ status: 'unavailable', database: 'disconnected' });
  }
});

/**
 * Returns/creates the application profile only for the authenticated account.
 * The assigned role is always cashier and approval is always pending; the client
 * cannot promote itself by sending a role or approval field.
 */
app.get('/api/me', async (request, response) => {
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) {
      response.status(401).json({ error: 'Sign in to continue.' });
      return;
    }

    const user = session.user as typeof session.user & {
      phone?: string;
      dateOfBirth?: string;
      requestedRole?: string;
    };
    const requestedRole = allowedRole(user.requestedRole) ? user.requestedRole : 'cashier';
    const account = await withActorTransaction(user.id, async (client) => {
      await client.query(
        `insert into profiles
           (id, full_name, email, phone, date_of_birth, role, requested_role, approval_status)
         values ($1, $2, $3, $4, $5, 'cashier', $6, 'pending')
         on conflict (id) do nothing`,
        [user.id, user.name.trim(), user.email.toLowerCase(), user.phone ?? null, user.dateOfBirth ?? null, requestedRole],
      );

      const result = await client.query(
        `select id, full_name, email, phone, role, requested_role, approval_status,
                date_of_birth, avatar_storage_path, primary_branch_id
           from profiles where id = $1`,
        [user.id],
      );
      const profile = result.rows[0];
      if (!profile) return null;

      const permissionResult = profile.approval_status === 'approved'
        ? await client.query<{ permission_code: string }>(
            'select permission_code from role_permissions where role = $1 order by permission_code',
            [profile.role],
          )
        : { rows: [] };

      return { profile, permissionCodes: permissionResult.rows.map((row) => row.permission_code) };
    });
    if (!account) {
      response.status(500).json({ error: 'Could not load your account profile.' });
      return;
    }

    response.json(account);
  } catch (error) {
    console.error('Could not load authenticated profile:', error instanceof Error ? error.message : 'unknown error');
    response.status(500).json({ error: 'Could not load your account. Please retry.' });
  }
});

/** A lightweight, authenticated heartbeat for this signed-in device only. */
app.post('/api/presence/heartbeat', async (request, response) => {
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) return response.status(401).json({ error: 'Sign in to update your status.' });
    const deviceId = (request.body as { deviceId?: unknown } | null)?.deviceId;
    if (!isUuid(deviceId)) return response.status(400).json({ error: 'A valid device ID is required.' });
    await withActorTransaction(session.user.id, async (client) => {
      const result = await client.query<{ approved: boolean }>(
        `select exists(select 1 from public.app_profiles where id=$1 and approval_status='approved') as approved`,
        [session.user.id],
      );
      if (!result.rows[0]?.approved) throw new Error('Your account must be approved to appear online.');
      await client.query(
        `insert into public.user_presence(user_id, device_id, last_seen_at)
         values ($1, $2, now())
         on conflict (user_id, device_id) do update set last_seen_at=excluded.last_seen_at`,
        [session.user.id, deviceId],
      );
    });
    response.setHeader('Cache-Control', 'no-store');
    return response.json({ ok: true, lastSeenAt: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not update your online status.';
    return response.status(message.includes('must be approved') ? 403 : 500).json({ error: message });
  }
});

/** Admin-only team presence and cashier sales summary for the last 24 hours. */
app.get('/api/admin/overview', async (request, response) => {
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) return response.status(401).json({ error: 'Sign in to view the administrator overview.' });
    const overview = await withActorTransaction(session.user.id, async (client) => {
      const access = await client.query<{ allowed: boolean }>(`select public.sellora_can('users.manage') as allowed`);
      if (!access.rows[0]?.allowed) throw new Error('You need administrator access to view team activity.');
      const [team, sales] = await Promise.all([
        client.query(
          `select p.id, p.full_name, p.email, p.role,
                  max(up.last_seen_at) as last_seen_at,
                  count(up.device_id) filter (where up.last_seen_at >= now()-interval '90 seconds')::int as online_devices
             from public.app_profiles p
             left join public.user_presence up on up.user_id=p.id
            where p.approval_status='approved'
            group by p.id, p.full_name, p.email, p.role
            order by p.full_name`,
        ),
        client.query(
          `select s.cashier_id as user_id, p.full_name, s.currency_code,
                  count(*)::int as sale_count, sum(s.total)::text as total
             from public.sales s
             join public.app_profiles p on p.id=s.cashier_id
            where s.status='completed'
              and s.created_at >= now()-interval '24 hours'
              and public.sellora_can_access_branch(s.branch_id)
            group by s.cashier_id, p.full_name, s.currency_code
            order by sum(s.total) desc`,
        ),
      ]);
      return {
        generatedAt: new Date().toISOString(),
        team: team.rows.map((row) => ({ ...row, online: Number(row.online_devices) > 0 })),
        sales: sales.rows,
      };
    });
    response.setHeader('Cache-Control', 'no-store');
    return response.json(overview);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load the administrator overview.';
    return response.status(message.includes('administrator access') ? 403 : 500).json({ error: message });
  }
});

/** Accepts an offline receipt exactly once; the database revalidates role, stock and prices. */
app.post('/api/sales/offline-sync', async (request, response) => {
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) {
      response.status(401).json({ error: 'Sign in to synchronize sales.' });
      return;
    }

    const input = request.body as Record<string, unknown> | null;
    if (!input || !isUuid(input.clientSaleId) || !isUuid(input.branchId) || !isUuid(input.warehouseId)
      || !isUuid(input.salesAgentId) || (input.customerId !== null && !isUuid(input.customerId))
      || typeof input.deviceId !== 'string' || input.deviceId.length > 200
      || !Array.isArray(input.items) || input.items.length === 0 || input.items.length > 200
      || !Array.isArray(input.payments) || input.payments.length === 0 || input.payments.length > 20) {
      response.status(400).json({ error: 'The offline sale payload is incomplete or invalid.' });
      return;
    }

    const items = input.items.map((rawItem) => {
      const item = rawItem as Record<string, unknown>;
      if (!isUuid(item.productId) || (item.variantId != null && !isUuid(item.variantId))
        || !isPositiveNumber(item.quantity) || !isNonNegativeNumber(item.discountAmount ?? 0)) {
        throw new Error('The offline sale has an invalid product or quantity.');
      }
      return {
        product_id: item.productId,
        variant_id: item.variantId ?? null,
        quantity: item.quantity,
        discount_amount: item.discountAmount ?? 0,
      };
    });
    const payments = input.payments.map((rawPayment) => {
      const payment = rawPayment as Record<string, unknown>;
      if (typeof payment.method !== 'string' || !isPositiveNumber(payment.amount)
        || (payment.reference != null && typeof payment.reference !== 'string')) {
        throw new Error('The offline sale has an invalid payment.');
      }
      return { method: payment.method, amount: payment.amount, reference: payment.reference ?? null };
    });

    const deviceId = input.deviceId;
    const saleId = await withActorTransaction(session.user.id, async (client) => {
      const result = await client.query<{ sale_id: string }>(
        `select sellora_sync_offline_sale($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb) as sale_id`,
        [input.clientSaleId, input.branchId, input.warehouseId, input.customerId, input.salesAgentId, deviceId, JSON.stringify(items), JSON.stringify(payments)],
      );
      return result.rows[0].sale_id;
    });
    response.json({ saleId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not synchronize this sale.';
    response.status(400).json({ error: message });
  }
});

/** Local deterministic business insights; no external AI or Supabase function. */
app.post('/api/copilot', async (request, response) => {
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) return response.status(401).json({ error: 'Sign in to use Sellora insights.' });
    const question = (request.body as { question?: unknown } | null)?.question;
    if (typeof question !== 'string' || question.trim().length < 3 || question.length > 500) {
      return response.status(400).json({ error: 'Enter a business question between 3 and 500 characters.' });
    }
    const normalized = question.toLowerCase();
    const answer = await withActorTransaction(session.user.id, async (client) => {
      const access = await client.query<{ allowed: boolean }>(
        `select public.sellora_can('reports.view') or public.sellora_can('sales.view_own') as allowed`,
      );
      if (!access.rows[0]?.allowed) throw new Error('You need sales or reporting access to use Sellora insights.');
      if (/restock|low stock|inventory|reorder/.test(normalized)) {
        const rows = await client.query<{ product_name: string; sku: string; stock: string; reorder_at: string }>(
          `select p.name as product_name, p.sku, sum(i.quantity)::text as stock,
                  max(greatest(p.minimum_stock, p.reorder_level))::text as reorder_at
             from inventory i join products p on p.id=i.product_id
             join warehouses w on w.id=i.warehouse_id
            where p.is_active and w.is_active
            group by p.id, p.name, p.sku, p.minimum_stock, p.reorder_level
           having sum(i.quantity) <= greatest(p.minimum_stock, p.reorder_level)
            order by sum(i.quantity) asc, p.name limit 10`,
        );
        return rows.rows.length
          ? `These ${rows.rows.length} items are at or below their reorder level: ${rows.rows.map((row) => `${row.product_name} (${row.sku}): ${row.stock} on hand, reorder at ${row.reorder_at}`).join('; ')}.`
          : 'No active products are currently at or below their reorder level in the branches you can access.';
      }
      if (/top|most|best|popular|product/.test(normalized)) {
        const rows = await client.query<{ product_name: string; quantity: string; revenue: string }>(
          `select si.product_name, sum(si.quantity)::text as quantity, sum(si.line_total)::text as revenue
             from sale_items si join sales s on s.id=si.sale_id
            where s.status='completed' and s.created_at >= now()-interval '30 days'
            group by si.product_name order by sum(si.quantity) desc limit 5`,
        );
        return rows.rows.length
          ? `Top products by units sold in the last 30 days: ${rows.rows.map((row, index) => `${index + 1}. ${row.product_name}: ${row.quantity} units, ${row.revenue} in sales`).join('; ')}.`
          : 'There are no completed sales in the last 30 days in the branches you can access.';
      }
      if (/sell|sales|revenue|amount|how much|last 30/.test(normalized)) {
        const rows = await client.query<{ currency_code: string; sales_count: string; total: string }>(
          `select currency_code, count(*)::text as sales_count, coalesce(sum(total),0)::text as total
             from sales where status='completed' and created_at >= now()-interval '30 days'
            group by currency_code order by currency_code`,
        );
        return rows.rows.length
          ? `In the last 30 days, ${rows.rows.map((row) => `${row.sales_count} completed sales totaled ${row.total} ${row.currency_code}`).join('; ')} across the branches you can access.`
          : 'There are no completed sales in the last 30 days in the branches you can access.';
      }
      return 'I can summarize sales for the last 30 days, list top-selling products, or show items that need restocking.';
    });
    response.json({ answer });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not answer that question.';
    response.status(message.startsWith('You need') ? 403 : 400).json({ error: message });
  }
});

app.get('/api/auth/ok', (_request, response) => response.json({ status: 'ok' }));

const server = app.listen(config.port, config.host, () => {
  console.log(`Sellora API listening on port ${config.port}`);
});

async function shutdown() {
  server.close();
  await db.end();
}

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());

function allowedRole(value: unknown): value is (typeof allowedRoles)[number] {
  return typeof value === 'string' && (allowedRoles as readonly string[]).includes(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function signRestToken(claims: Record<string, string | number>) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}`;
  const signature = createHmac('sha256', config.restJwtSecret).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

function isStorageBucket(value: string): value is 'avatars' | 'products' | 'customers' | 'expenses' {
  return storageBuckets.has(value);
}

function storagePath(bucket: string, path: string) {
  if (!isStorageBucket(bucket) || path.length > 512 || path.startsWith('/') || path.includes('\\')) {
    throw new Error('Invalid storage path.');
  }
  const parts = path.split('/');
  if (parts.length > 5 || parts.some((part) => !part || part === '.' || part === '..' || !/^[a-zA-Z0-9_.-]+$/.test(part))) {
    throw new Error('Invalid storage path.');
  }
  const root = resolve(storageRoot, bucket);
  const fullPath = resolve(root, ...parts);
  if (!fullPath.startsWith(root + sep)) throw new Error('Invalid storage path.');
  return fullPath;
}

async function assertStoragePermission(
  client: import('pg').PoolClient,
  userId: string,
  bucket: string,
  path: string,
  action: 'read' | 'write' | 'delete',
) {
  storagePath(bucket, path);
  const permission = action === 'read'
    ? ({ products: 'products.view', customers: null, expenses: 'expenses.view' } as const)[bucket as 'products' | 'customers' | 'expenses']
    : ({ products: 'products.manage', customers: 'customers.manage', expenses: 'expenses.manage' } as const)[bucket as 'products' | 'customers' | 'expenses'];

  if (bucket === 'avatars') {
    if (path.split('/')[0] !== userId) throw new Error('Storage access denied: avatars are private to their owner.');
    return;
  }
  const branchId = bucket === 'customers' || bucket === 'expenses' ? path.split('/')[0] : null;
  if (branchId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(branchId)) {
    throw new Error('Invalid storage branch path.');
  }
  const result = await client.query<{ permitted: boolean }>(
    `select coalesce($1::text is null or public.sellora_can($1), false)
       and coalesce($2::uuid is null or public.sellora_can_access_branch($2), false) as permitted`,
    [permission, branchId],
  );
  if (!result.rows[0]?.permitted) throw new Error('Storage access denied: your role or branch does not allow this file action.');
}

function signFileToken(bucket: string, path: string, expires: number) {
  return createHmac('sha256', config.restJwtSecret).update(`${bucket}\n${path}\n${expires}`).digest('base64url');
}

function verifyFileToken(bucket: string, path: string, expires: number, signature: string) {
  const expected = Buffer.from(signFileToken(bucket, path, expires));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function imageMimeFromPath(path: string) {
  const extension = path.split('.').pop()?.toLowerCase();
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return 'image/jpeg';
}

async function readRequestBody(request: express.Request, maxBytes: number) {
  const chunks: Buffer[] = [];
  let byteCount = 0;
  for await (const chunk of request) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    byteCount += data.length;
    if (byteCount > maxBytes) throw new Error('Request body is too large.');
    chunks.push(data);
  }
  return Buffer.concat(chunks);
}
