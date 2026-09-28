# Sellora API and PostgreSQL

This service owns the replacement email/password auth, Sellora account profiles,
and the PostgreSQL schema for branch, catalog, inventory, POS, purchases, returns,
approvals, reporting, and offline sale acceptance. New accounts receive a pending
cashier profile; an approved administrator must assign business access.

## Local setup

1. Install PostgreSQL locally (Docker is not required) and create a `sellora`
   database plus a restricted API login role.
2. Copy `.env.example` to `.env`. Set `DATABASE_URL`, a random
   `BETTER_AUTH_SECRET` of at least 32 characters, and `BETTER_AUTH_URL`.
3. From `backend/`, run `npm install`.
4. Run `npm run auth:migrate` to create Better Auth's user, session, account, and
   verification tables.
5. Run `npm run build && npm run db:migrate` to apply Sellora's profile, business,
  offline-sync, compatibility, and row-level-security migrations.
6. Run `node scripts/prepare-postgrest.mjs` once to create restricted REST roles and
   local signing secrets; then start `npm run rest:dev` and `npm start` in separate
   terminals. `GET /health` reports API and database availability.
7. Create the first account using **Administrator portal → Request administrator access**, then run `npm run admin:bootstrap -- owner@example.com`
   once from this folder, replacing the address with that account's email. On local
   PostgreSQL it uses the host's admin socket. The first admin then signs in through
   **Administrator portal → Administrator sign in**; later account and administrator
   requests are reviewed in the in-app administrator panel. The public signup never
   grants administrator access by itself.

For a physical phone, set `BETTER_AUTH_URL` here to the development computer's
LAN IP, for example `http://192.168.1.20:4100`. The app derives its API host from
Expo Go's dev-server address; production builds should set
`EXPO_PUBLIC_API_URL` explicitly. `localhost` on a phone points to the phone
itself. The API listens on all network interfaces for LAN development.

## Current endpoints

- `GET /api/me` creates or returns the authenticated user's pending profile and
  permission codes.
- `POST /api/sales/offline-sync` uses the idempotent PostgreSQL sale function.
  The mobile queue retries pending receipts when the original account is online
  again; final device-level sale acceptance still needs real-device verification.
- `POST /api/storage/:bucket/upload`, `/signed`, and `/delete` store private image
  files under `.local/storage` after checking the caller's role and branch access.
- `POST /api/copilot` answers supported sales, top-product, and restocking questions
  from permission-scoped PostgreSQL data.
- `GET /health` checks PostgreSQL connectivity.

Database migrations preserve the existing business schema and its transactional
rules. Each protected operation must load the Better Auth session, bind its user
ID transaction-locally, and call the authorization-checking SQL functions where
available. Never ship `DATABASE_URL` or `BETTER_AUTH_SECRET` in Expo configuration.

## Migration status

The app's email/password auth, PostgREST data requests, private image storage, and
business insights now target the local Sellora API. Realtime screens refresh by
polling. The local PostgreSQL database currently contains schema only; existing
Supabase account password hashes and business records have not been imported. The setup helper enables local `pgcrypto`, and Better Auth can verify imported bcrypt hashes while continuing to create new scrypt hashes. Importing user rows and business data still requires a source export and a reviewed mapping.
Before replacing the old service in production, export and import its existing
users and business records. This repository does not contain that export, so the
current database is a fresh business database. Imported bcrypt accounts can retain
their password when added with the matching hash; imported session cookies do not
carry over and users must sign in again.

The Expo SQLite database remains the device's encrypted offline cache and work
queue. Cached catalog data, cash/card and customer/store-credit sales, new customers,
expenses (including staged receipts), and product create/edit changes (including
photos) can queue locally. Variant add/edit writes also queue locally and check for
concurrent server edits before updating. Finance overview snapshots are encrypted
on the device for offline reading. PostgreSQL revalidates customer credit, stock and
permissions when sales arrive. Variant archiving and most other administrative and
purchasing writes remain online-only. The server revalidates queued sales when they arrive.
The local `/health` route completed a 60-second run with 1,000 virtual users:
59,784 requests, zero failures, p95 8 ms and p99 15 ms on the development host.
This only measures the API/database health path; it does not establish capacity
for 1,000 authenticated accounts or checkout traffic.

Password reset uses a local sendmail-compatible command so the server can use its
own configured mail transfer agent without a provider SDK. Install and configure a
mail transfer agent/relay, then set `MAIL_SENDMAIL_PATH` (for example
`/usr/sbin/sendmail`) and a verified `MAIL_FROM` address in the protected server env
file. The email link opens the Sellora app through its `sellora://` scheme. Until
those settings and outbound mail delivery work, forgot-password requests return a
configuration/delivery error; signup does not require email.

## API/database capacity smoke check

Run the built-in Node health-only benchmark against your local server:

```sh
BASE_URL=http://127.0.0.1:4100 VUS=1000 DURATION_MS=60000 node scripts/load-health.mjs
```

It creates no accounts or business records; each virtual user requests `/health`
once per second. This measures API/database health under concurrent requests, not
authenticated checkout throughput. Start with a small `VUS` value and watch the
server/database before increasing it. External hosts are refused unless you also
set `ALLOW_EXTERNAL_LOAD_TEST=YES`. A passing run is not a guarantee of 1,000 real
accounts or production capacity. Do not target a third-party or live customer
server without authorization.

## Self-hosted Linux server (no Docker)

Deployment templates are in `deploy/`. They run the API and PostgREST as separate
systemd services, bind both services to loopback, keep image files and generated
PostgREST configuration in `/var/lib/sellora`, and send public HTTPS traffic through
Nginx. PostgreSQL stays local to the VPS. Do not expose PostgreSQL port 5432 or
PostgREST port 4101 to the public internet.

1. Provision an Ubuntu/Debian VPS, a DNS `A` record such as `api.example.com`, and
   TLS certificates for that hostname. Install PostgreSQL, Node.js 22.13+, Nginx,
   and the PostgREST executable using their official package/repository instructions.
2. Create a restricted PostgreSQL application role and database using the SQL
   migrations and instructions above. Keep PostgreSQL listening locally. Create a
   dedicated Linux `sellora` user, deploy this repository to `/opt/sellora`, then
   run `npm ci`, `npm run auth:migrate`, `npm run build`, and `npm run db:migrate`
   from `/opt/sellora/backend`.
3. Create `/etc/sellora/sellora.env` with mode `0600`, owned by root. Start from
   `backend/.env.example`; set `DATABASE_URL` to the VPS's local database,
   `BETTER_AUTH_URL=https://api.example.com`, independent random secrets of at
   least 32 characters, `API_HOST=127.0.0.1`, `STORAGE_ROOT=/var/lib/sellora/storage`,
   `POSTGREST_CONFIG_DIR=/var/lib/sellora/postgrest`, `POSTGREST_URL` on loopback,
   and trusted app origins. Source this env file when running setup commands, for
   example `set -a; . /etc/sellora/sellora.env; set +a`. For Postgres installations
   using another Unix socket, set `DATABASE_ADMIN_SOCKET` and `DATABASE_ADMIN_USER`
   before running `SELLORA_ENV_FILE=/etc/sellora/sellora.env node scripts/prepare-postgrest.mjs`
   as a database administrator. That helper
   writes its generated PostgREST database URL and REST signing secret into the
   env file; protect it and restart services after changes. The helper creates the
   PostgREST config with restrictive permissions; give `/var/lib/sellora/postgrest`
   to the `sellora` service user after the helper finishes so systemd can read it.
4. Copy `deploy/systemd/sellora-api.service` and
   `deploy/systemd/sellora-postgrest.service` to `/etc/systemd/system/`. Install
   `deploy/nginx/conf.d/sellora-rate-limits.conf` under `/etc/nginx/conf.d/` and
   `deploy/nginx/snippets/sellora-proxy-headers.conf` under
   `/etc/nginx/snippets/`. Copy `deploy/nginx/sellora-api.conf.example` to an Nginx
   site config and replace `api.example.com` and certificate paths. The template
   enforces HTTPS, security headers, API/auth request limits, and loopback proxying.
   Run `sudo nginx -t` and fix any config errors before reloading Nginx or enabling
   the systemd services.
5. Start PostgREST and the API, then check `https://api.example.com/health` and
   `/api/auth/ok`. Set the app's `EXPO_PUBLIC_API_URL` to `https://api.example.com`,
   rebuild the Expo application, create the first user, and run the one-time admin
   bootstrap. Restrict firewall access to public 80/443 and admin SSH only.

This repository contains deployable service templates, not a provisioned live
server. A VPS, DNS domain, and TLS certificate must exist before a public URL can
work. Back up PostgreSQL and `/var/lib/sellora/storage` together and test restores
before using the server for real business records.
