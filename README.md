# Sellora

<p align="center">
  <img src="assets/branding/logo.svg" alt="Sellora — Sell Smarter. Manage Anywhere." width="520" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Expo-57.0-000020?logo=expo" alt="Expo 57" />
  <img src="https://img.shields.io/badge/React_Native-0.86-61DAFB?logo=react" alt="React Native 0.86" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript" alt="TypeScript 5.9" />
  <img src="https://img.shields.io/badge/Node.js-22.13%2B-339933?logo=nodedotjs" alt="Node.js 22.13 or later" />
</p>

**A mobile point of sale and retail operations workspace for independent teams.**

Sellora brings checkout, stock, purchasing, customer accounts, staff access and business reporting into one Expo app. It supports online work through the Sellora API and queues selected work securely when a device is offline.

<p align="center">
  <a href="#what-you-can-do">Features</a> ·
  <a href="#product-details">Product details</a> ·
  <a href="#how-it-is-built">Architecture</a> ·
  <a href="#run-locally">Get started</a> ·
  <a href="#security-and-production-readiness">Security</a> ·
  <a href="#deployment-and-data-migration">Deployment</a>
</p>

<p align="center">
  <img src="docs/screenshots/sellora-splash.jpeg" alt="Sellora app splash screen" width="34%" />
  &nbsp;&nbsp;&nbsp;
  <img src="docs/screenshots/admin-dashboard.jpeg" alt="Sellora administrator dashboard showing requests, team presence and cashier sales" width="34%" />
</p>

<p align="center"><sub>Sellora on Android · App launch and administrator dashboard</sub></p>

## What you can do

| Area | Capabilities |
| --- | --- |
| **Point of sale** | Product search, barcode workflow, cart, discounts, customer selection, split payments, receipts and returns. |
| **Catalog and stock** | Products, variants, categories, brands, warehouses, inventory adjustments and branch transfers. |
| **Retail operations** | Customers and store credit, suppliers, purchase orders, expenses, shifts and commissions. |
| **People and access** | Account requests, administrator approval, team roles, permission catalog, branch assignments, profile settings and online presence. Updated profile photos appear in the shared header and drawer for every role. |
| **Business overview** | Sales reports, cashier activity, targets, finance summaries, notifications and permission-scoped Sellora Insights. |
| **Flexible access** | A read-only guest tour, device PIN unlock, optional Remember me on the sign-in screen, and an app drawer for navigation and account actions. |
| **Offline work** | Cached product and branch data plus encrypted queues for supported sales, customers, expenses and product edits; queued sales are checked by the server when they sync. |

## Product details

**Checkout to receipt.** Find products, scan barcodes, review quantities and discounts, select a customer and sales agent, then record one or more payment methods. The server validates prices, stock and customer credit and commits each online sale atomically. Receipts, refunds and returns remain linked to the original sale.

**Stock to replenishment.** Organize products by categories, brands and variants; attach private product photos; set reorder thresholds; and track quantities by branch and warehouse. Teams can record adjustments, receive purchase orders and move stock between assigned branches.

**People to permissions.** Staff request access and wait for an administrator to review the account, role and branch assignment. The administrator workspace shows pending requests, team presence and synced cashier sales. Permission checks govern navigation and are enforced again by the API and database.

**Daily operations and visibility.** Record customer/store-credit activity, expenses with receipts, shifts and cash movements. Review targets, commissions, audit history and sales reports from role- and branch-scoped views. Profile photos appear in the shared header and drawer for every role.

**Online and offline.** Previously signed-in staff can unlock with their device PIN when disconnected. Supported catalog, customer, expense and sale work is stored in an encrypted local queue. Once connectivity returns, Sellora syncs queued work under the original user and rechecks server-side rules; unsupported administration and stock receiving require a live connection.

## How it is built

- **Mobile app:** Expo Router, React Native, TypeScript and SQLite for encrypted offline data and queued work.
- **API and authentication:** Self-hosted Express API with Better Auth for email/password accounts, sessions and password-reset integration.
- **Business data:** PostgreSQL with PostgREST and row-level security. The API binds requests to the signed-in user before database access.
- **Private media:** The API stores and authorizes product, customer, expense and avatar files.
- **Deployment:** Local development or Linux systemd/Nginx templates under [`deploy/`](deploy/). Docker is not required.

Supabase is not required at runtime. The historical schema and policy migrations remain under `supabase/migrations/`; active self-hosted database migrations are under [`backend/migrations/`](backend/migrations/).

### System architecture

```mermaid
flowchart LR
    app[Sellora mobile app] -->|Auth and business API| api[Express API]
    api --> auth[Better Auth]
    auth --> db[(PostgreSQL)]
    api -->|REST proxy| rest[PostgREST]
    rest --> db
    api --> files[(Private media storage)]
    app --> local[(Encrypted device SQLite)]
    local -. queued work after reconnect .-> api
```

The mobile app uses the API for sign-in, profiles and authorized business requests. PostgREST and PostgreSQL enforce row-level access, while files stay behind authenticated storage routes. SQLite supports the offline queue and previously cached data.

## Run locally

### Requirements

- Node.js 22.13 or later (`.nvmrc` targets Node 24)
- PostgreSQL
- Expo Go for a phone preview, or an Android/iOS development environment for a native build

### 1. Install dependencies

From the repository root:

```sh
nvm use                 # optional when nvm is installed
npm install
cd backend && npm install && cd ..
```

### 2. Configure PostgreSQL and the API

Create a PostgreSQL database and a restricted application role. Copy `backend/.env.example` to `backend/.env`, then configure the database URL, a random `BETTER_AUTH_SECRET` of at least 32 characters, and the API URL. For a phone on the same Wi-Fi, use the development computer's LAN address, for example `http://192.168.1.20:4100`.

From `backend/`, initialize the auth schema, build and apply the Sellora migrations, then prepare the local PostgREST roles/configuration:

```sh
npm run auth:migrate
npm run build
npm run db:migrate
node scripts/prepare-postgrest.mjs
```

Keep `backend/.env` private. Never put `DATABASE_URL`, `BETTER_AUTH_SECRET`, or the PostgREST signing secret in the Expo app configuration.

### 3. Configure and start the app

In the repository root, copy `.env.example` to `.env` if you want to set the API address explicitly:

```dotenv
EXPO_PUBLIC_API_URL=http://192.168.1.20:4100
```

For a phone preview, set this to the computer's LAN IP, not `localhost`. Open three terminals:

```sh
# backend/ — API
npm start
```

```sh
# backend/ — PostgREST
npm run rest:dev
```

```sh
# repository root — Expo
npx expo start --lan
```

Scan the Metro QR code with Expo Go on the same Wi-Fi. Keep the computer, API, PostgreSQL and PostgREST running during local use. The API health endpoint is `http://<computer-ip>:4100/health`.

## First administrator and team access

Create the first account from **Administrator portal → Request administrator access**. From `backend/`, the database owner then bootstraps that account once:

```sh
npm run admin:bootstrap -- owner@example.com
```

Replace the example address with the account's email. The bootstrap refuses to promote another account after an approved administrator exists. The first administrator signs in from **Administrator portal → Administrator sign in**; normal team signup cannot grant administrator access. Administrators review requests, assign roles and branches, and manage team status from the in-app administrator panel.

After setup, create a branch, warehouse, catalog and opening stock. Account registration does not depend on email delivery; password recovery requires a configured local sendmail-compatible mail service. See [`backend/README.md`](backend/README.md) for mail and database setup.

## End-to-end app flow

```mermaid
flowchart TD
    A[Welcome] --> B{Choose access}
    B -->|Guest preview| C[Read-only sample workspace]
    B -->|Create account| D[Request team access]
    D --> E[Pending approval]
    E --> F{Administrator review}
    F -->|Reject| G[Request rejected]
    F -->|Approve role and branch| H[Sign in]
    H --> I[Role and permission based workspace]
    I --> J{Connection state}
    J -->|Online| K[Read and save through Sellora API]
    J -->|Offline| L[PIN unlock and encrypted local queue]
    L -->|Connection restored| M[Sync and validate queued work]
    M --> K
```

The first administrator is provisioned once with the bootstrap command above. After that, administrators review new requests and maintain team access in the app. During offline work, queued transactions stay attached to their original user and are revalidated by the server when synchronized.

## Online and offline behavior

The phone must be able to reach the Sellora API for online features. Previously signed-in users can unlock with their device PIN while disconnected. The app keeps supported cached catalog, branch and warehouse data available locally. Cash/card and customer/store-credit sales, customer creation, expenses (including staged receipt images), and product or variant edits can be queued on device. The local queue is encrypted, and the server rechecks permissions, stock, prices and customer credit when work syncs. Some administrator, purchasing and stock-receiving actions require a live API connection. See the API guide for the current migration and offline boundaries.

Guest access is a read-only tour. Sample checkout and approval actions remain in the preview and do not create production accounts or business records.

## Checks

Run these from the repository root:

```sh
npm run typecheck
npm run api:build
npx expo export --platform android
npm audit
npm --prefix backend audit
git diff --check
```

The mobile and backend dependency audits currently report zero known advisories; rerun them before releases because advisories change over time. `GET /health` checks API/database connectivity. The optional health-only load script is documented in [`backend/README.md`](backend/README.md); it does not measure authenticated signup or checkout capacity.

## Deployment and data migration

Linux service and Nginx templates are in [`deploy/`](deploy/). A public installation still needs a provisioned server, DNS, HTTPS and protected production environment variables. Do not expose PostgreSQL or PostgREST directly to the internet. Back up the PostgreSQL database and private file storage together.

The local database setup creates the Sellora schema; it does not automatically import accounts or business data from an older hosted database. Review and verify any export/import before retiring the previous service. Sessions must be re-established after an account migration. Deployment, mail delivery and real-device offline sync need verification in the target environment.

## Security and production readiness

The app sends business requests through the Sellora API, which binds database operations to the authenticated user and relies on PostgreSQL row-level policies and server-side permission checks. Account approval controls access; the public signup flow cannot grant administrator approval. Private media uses authenticated access checks and short-lived signed links. Local queued business data is encrypted, device PIN verification is stored in SecureStore, and Remember me is opt-in and uses secure device storage. Production startup now refuses insecure HTTP/wildcard origins, public API binding and non-loopback PostgREST; the Nginx template adds TLS, security headers and request limits.

Before exposing a deployment to the public internet, provision a real domain and TLS certificate, set unique server secrets and exact production `TRUSTED_ORIGINS`, keep PostgreSQL and PostgREST private, configure mail delivery, and test backups/restores. The current local database and all six private files were restored into a disposable PostgreSQL cluster and hash-verified; this does not replace a scheduled production backup/restore drill. Both dependency trees report zero known advisories. No production server/domain is configured here and this repository has not had an independent penetration test, so live TLS verification and external infrastructure assessment remain launch requirements.

## Project map

```text
app/                    Expo screens and navigation
components/             Shared interface components
providers/              Auth, connectivity, currency and offline sync
services/               API, local data, POS and business operations
backend/src/            Express API and Better Auth configuration
backend/migrations/     PostgreSQL schema and policy migrations
backend/scripts/        Database, PostgREST and load-check helpers
deploy/                 systemd and Nginx templates
docs/screenshots/       README product screenshots
```

For backend setup, endpoints, local capacity checks and Linux deployment steps, see [`backend/README.md`](backend/README.md).
