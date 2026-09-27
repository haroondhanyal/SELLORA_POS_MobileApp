# Sellora Mobile

<p align="center">
  <img src="./assets/branding/logo.svg" width="720" alt="SELLORA — Sell Smarter. Manage Anywhere." />
</p>

<p align="center"><strong>Sell Smarter. Manage Anywhere.</strong><br/>Mobile retail, point of sale and inventory management for Android and iOS.</p>

Sellora is a modern mobile-first Point of Sale and retail operations platform built with React Native, Expo, and TypeScript for Android and iOS. Designed for growing retail businesses, Sellora combines sales, inventory, workforce, customer, branch, purchasing, reporting, and offline operations in one secure application.

The platform provides role-based access for administrators, managers, sales agents, cashiers, inventory teams, accountants, and other authorized users. New users can register, request roles, manage profiles, use password or PIN-based access, and receive approval before gaining access to protected business features. Administrators can control users, branches, permissions, roles, and operational access.

Sellora includes product and inventory management, categories, brands, variants, barcode support, product images, stock adjustments, warehouses, suppliers, purchase orders, goods-received notes, and inter-branch stock transfers. Its POS flow includes product selection, cart management, customer and sales-agent assignment, multiple payments, receipt generation, returns, refunds, credit handling, loyalty points, expenses, shifts, targets, commissions, approvals, notifications, reports, and audit tracking.

The application supports PKR and USD display currencies while preserving original transaction values. Supabase powers authentication, PostgreSQL data, secure storage, realtime-ready services, and backend functions, while SQLite supports cached products, offline sales, queued transactions, and synchronization.

Sellora also includes an AI retail copilot for business insights, backup export, branch-level reporting, sales-agent performance tracking, and secure row-level access controls. With separate screens for every major module, reusable native components, structured services, and a scalable database architecture, Sellora is designed to evolve from a mobile POS into a complete retail management ecosystem for supermarkets, electronics stores, fashion outlets, general retailers, and multi-branch businesses. Its architecture emphasizes transaction integrity, authentication, atomic stock updates, offline resilience, configurable currency handling, and maintainable code. The modular design also prepares the product for future enhancements such as analytics, realtime collaboration, reconciliation, integrations, and enterprise deployment.

This Expo + React Native + TypeScript application uses separate Expo Router screens for each major feature. Shared UI, app state, Supabase services, theme tokens, and SQLite live in separate folders.

## Current scope

Phases 1–12 include Sellora launch branding; authentication and user access; catalog/inventory; POS/customers; currency; branches/purchasing; returns/credit/loyalty/expenses; shifts/targets/commissions; approvals/notifications/reports/audit; offline POS sync; AI copilot and backup export.

Phase 11 stores offline customers and sales, caches branch stock for read-only inventory, and retries online synchronization. Manual conflict resolution and offline inventory edits remain limited.

## Run locally

1. Install Node.js 22.13+ and an Android/iOS simulator or Expo Go.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and set the Supabase project URL and public anon/publishable key.
4. Apply every SQL migration in timestamp order using Supabase SQL Editor or Supabase CLI:

   - `202609270001_foundation_auth_profiles.sql`
   - `202609270002_profiles_roles_connection.sql`
   - `202609270003_catalog_inventory.sql`
   - `202609270004_pos_sales.sql`
   - `202609270005_currency.sql`
   - `202609270006_advanced_inventory.sql`
   - `202609270007_returns_credit_expenses.sql`
   - `202609270008_workforce_shifts_targets.sql`
   - `202609270009_approvals_notifications_reports_audit.sql`
   - `202609270010_offline_sync.sql`
   - `202609270011_backup_export.sql`
   - `202609270012_phase_completion.sql`
   - `202609270013_copilot_rate_limit.sql`

5. Enable email authentication in Supabase. Add `sellora://auth/pending-approval` and `sellora://auth/reset-password` to the allowed redirect URLs.
6. Run `npx expo start`; press `a` for Android or `i` for iOS.
7. Run `npm run typecheck` to check TypeScript errors.

## First administrator and store setup

Self-signup always creates a pending cashier profile; a requested role is stored separately for review. Create the first account through signup, then promote it to `admin` and `approved` in Supabase as project owner. Never ship a service-role key in the mobile app.

After the first admin signs in:

1. Create a branch from **Branches**.
2. Create a warehouse from **Warehouses** and mark it primary.
3. Open **Manage users & approvals** and assign the admin account and other users their primary and allowed branches.
4. Choose the PKR or USD business base currency before creating products. The database locks this setting after products or sales exist to protect stored amounts.
5. Create categories, brands, products and opening stock. After that, staff with permissions can use POS, receive purchases and transfer stock.

## Phases 4–7

- **Phase 4 — Products & inventory:** separate catalogue, category, brand, variant, barcode, stock and adjustment screens. Product photos use private Supabase Storage. Stock adjustments update inventory and create a reason record in one database transaction.
- **Phase 5 — POS:** separate product selection, cart, payment and receipt screens. Branch customers and approved sales agents are selectable. A single database function prices the sale, validates stock/credit, deducts inventory and writes the receipt, line items, payments and stock movements atomically.
- **Phase 6 — Currency:** the business has one base currency; each device can display PKR or USD. Current daily exchange rates and admin manual rates are cached in SQLite for offline viewing. Changing display currency never rewrites product amounts or historical receipts.
- **Phase 7 — Advanced inventory:** admin branch and warehouse setup, user branch access, supplier records, stock-transfer states and purchase orders. Receiving a delivery creates a goods-received note and adds stock atomically.

## Phase 8 — Returns, credit, loyalty and expenses

- Returns are looked up by receipt. The database validates available return quantities, restores inventory and records the refund in one transaction. Full return marks the original sale refunded.
- Cashiers can receive customer credit payments. Each payment is checked against outstanding balance and updates the balance atomically.
- Completed customer sales award one loyalty point per 100 base-currency units. Points are stored in a ledger and displayed on the customer record.
- Branch expenses include receipt images in a private 25 MB limited bucket. Loyalty points can be redeemed in multiples of 100 for base-currency store credit.

## Phase 9 — Workforce, targets and commissions

- Employees open and close their own shifts. Cash reconciliation compares opening cash plus recorded cash payments against the close count.
- Managers can assign daily, weekly or monthly sales targets to approved agents.
- A branch percentage commission rule applies to future sales and writes an immutable commission snapshot.
- Target screens compare completed sales with the assigned daily, weekly or monthly target. Shifts include documented cash-in and cash-out movements in closeout reconciliation.

## Phase 10 — Approvals, notifications, reports and audit

- Staff can submit an approval request. Authorized reviewers can approve/reject it with an optional note; requesters receive an in-app notification.
- New signup and account approval changes generate notification records.
- Separate summary and detailed reports calculate revenue, discounts, line margin, expenses, refunds, commissions, product/category, customer, agent and cashier breakdowns. Reports obey sales row-level security.
- Notifications update live through Supabase Realtime. Sale, refund, expense, cash movement, credit payment, transfer and approval decisions create audit events.

## Phase 11 — Offline POS and queued sale sync

- POS catalogue, warehouse selection, branch customers, sales agents and inventory snapshots are cached in SQLite after online use. In Offline Mode, product/customer search and inventory viewing are available.
- Offline customer records and receipts are committed locally; new customers synchronize before dependent sales. Stock decrements update the local snapshot. Customer/store credit and receipt-photo uploads are blocked while offline.
- When connected and in Online Mode, sales upload through an idempotent database function. Failed uploads remain visible with their last error; retrying cannot duplicate a sale.
- Local customer updates, inventory adjustments, manual conflict resolution and offline shifts are not supported. The server revalidates price and stock on sync; staff should review failed queue items.

## Phase 12 — Copilot, backup and release setup

- Sellora Copilot is a Supabase Edge Function. It checks the caller's JWT, approval and role permission, reads through the caller's RLS-limited session, and allows up to 20 questions per user per hour. It sends no customer names or profile data to the AI provider. Configure `OPENAI_API_KEY` and optionally `SELLORA_AI_MODEL` as Edge Function secrets, then deploy `sellora-ai-copilot`.
- Approved admins can export a JSON snapshot through a database function and the native share sheet. Exports include sensitive employee/customer records; storage images are not part of the snapshot. Keep routine Supabase backups enabled as well.
- Production release still requires real Supabase credentials, applying and reviewing all migrations, Edge Function deployment/secrets, an app icon and native splash image, and device QA. Automated tests and full offline reconciliation are not included.
- Appearance supports the Sellora, Ocean, Emerald, Purple, Midnight, Sunset and Monochrome palettes, each in system, light and dark modes.

## Structure

```text
app/                 Expo Router screens, one primary feature screen per file
app/auth/            Login, signup, recovery, PIN and approval screens
app/products/        Catalogue, categories, brands, variants and barcode
app/inventory/       Stock, adjustments and adjustment history
app/pos/             Product selection, cart, payments and receipt
app/customers/       Branch customer search and entry
app/returns/         Receipt lookup, return quantities and refund history
app/expenses/        Branch expense entry and history
app/branches/        Branch setup and assignment entry point
app/warehouses/      Warehouse and manager setup
app/transfers/       Inter-branch stock transfer workflow
app/purchases/       Purchase orders and goods-received notes
app/suppliers/       Branch supplier records
app/settings/        Currency settings and rates
app/settings/        Appearance, backup and offline sync settings
app/ai/              Authenticated retail copilot
app/approvals/       Approval requests and review
app/notifications/   Personal notifications
app/reports/         Branch sales report and audit history
app/reports/details.tsx Financial and operational breakdowns
app/shifts/          Employee shift and cash drawer
app/targets/         Sales-agent targets and commission rules
components/          Reused native UI fields, cards and buttons
providers/           Shared authentication, connection, currency and cart state
services/            Supabase, local database and business logic
supabase/migrations/ Rebuildable PostgreSQL schema and row-level security
theme/               Shared palette, typography, spacing and radius
assets/branding/     Editable Sellora SVG wordmark
types/               Shared TypeScript types
```

## Screen ownership for parallel development

Each group can be assigned to a different developer. Agree before editing a shared component or migration.

- **Auth:** `app/auth/`, `app/splash.tsx`, `app/welcome.tsx`
- **Account:** `app/profile/` and shared profile inputs in `components/`
- **Admin users and roles:** `app/users/`, `app/roles/`, `components/RolePicker.tsx`
- **Products and inventory:** `app/products/`, `app/inventory/`, `services/catalog.ts`, `services/inventory.ts`
- **POS and customers:** `app/pos/`, `app/customers/`, `services/pos.ts`, `services/customers.ts`
- **Currency and operations:** `app/settings/`, `app/branches/`, `app/warehouses/`, `app/transfers/`, `app/purchases/`, `app/suppliers/`
- **Platform:** `providers/`, `services/`, `supabase/migrations/`

Keep feature-specific screen logic inside its route. Put reused UI in `components/`, database work in `services/`, and cross-screen state in `providers/`. Brief comments above screens and key helpers explain their responsibility.

## Security and remaining work

- Supabase Auth owns passwords; sessions and PIN verifiers use Expo SecureStore.
- Profile, branch, inventory and sales access use PostgreSQL row-level security. Screen permission checks control visibility but are not the security boundary.
- A configured device PIN is required again after Sellora leaves the foreground. It unlocks the saved session on that device; it is not an account password or a second server-side factor.
- SQLite payloads for customer, sales-agent, product, warehouse, and offline sale caches use AES-256-GCM. The random encryption key stays in Expo SecureStore, and older plaintext cache rows are encrypted on app startup. If the key is lost, unsynced local records cannot be recovered; sync them before device migration or reinstall.
- Copilot verifies the Supabase JWT, account approval, and role permission on the server. Its Edge Function still needs deployment and the `OPENAI_API_KEY` must only be configured as a Supabase secret; never add a service-role or OpenAI key to the mobile `.env`.
- Backup export is restricted to approved administrators and contains customer and employee data. Share exports only through a trusted channel and keep routine Supabase project backups enabled.
- A production app icon and branded native launch image are still needed before store submission. Apply and review migrations, deploy Edge Functions and secrets, and run device QA against the target Supabase project before release.
- Apply migrations to a new project, or review their assumptions and existing policies before applying to a project with existing tables or types. This repository does not include a live-project security audit or automated database policy tests.
