# Sellora Mobile

Expo + React Native + TypeScript application for Android and iOS. Each major feature has its own Expo Router screen. Shared UI, app state, Supabase services, theme tokens and SQLite live in separate folders.

## Current scope

Phases 1–12 include Sellora launch branding; authentication and user access; catalog/inventory; POS/customers; currency; branches/purchasing; returns/credit/loyalty/expenses; shifts/targets/commissions; approvals/notifications/reports/audit; offline POS sync; AI copilot and backup export.

Phase 11 provides offline POS queueing for previously cached products and stock. Full offline customer management, inventory actions, conflict resolution and realtime synchronization remain later improvements.

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
- Branch expenses have permission-protected entry and history screens. Receipt-image attachments and store-credit redemption are not included yet.

## Phase 9 — Workforce, targets and commissions

- Employees open and close their own shifts. Cash reconciliation compares opening cash plus recorded cash payments against the close count.
- Managers can assign daily, weekly or monthly sales targets to approved agents.
- A branch percentage commission rule applies to future sales and writes an immutable commission snapshot.

## Phase 10 — Approvals, notifications, reports and audit

- Staff can submit an approval request. Authorized reviewers can approve/reject it with an optional note; requesters receive an in-app notification.
- New signup and account approval changes generate notification records.
- Sales summary reports calculate real branch revenue, discounts and sales-agent totals from recorded transactions. Reports obey sales row-level security.
- Sale, refund, expense and approval decisions create audit events. Authorized users can review branch activity.

## Phase 11 — Offline POS and queued sale sync

- POS catalogue and warehouse selection are cached in SQLite after an online load. In Offline Mode, cached product search and stock are available.
- Offline receipts and stock decrements are committed locally. Customer/store credit are blocked while offline.
- When connected and in Online Mode, sales upload through an idempotent database function. Failed uploads remain visible with their last error; retrying cannot duplicate a sale.
- Offline customer lookup/creation, standalone inventory caching, manual conflict resolution and realtime subscriptions are not implemented yet. The server revalidates price and stock on sync; staff should review any failed queue item.

## Phase 12 — Copilot, backup and release setup

- Sellora Copilot is a Supabase Edge Function. It reads aggregates using the caller's RLS-limited session and sends no customer names or profile data to the AI provider. Configure `OPENAI_API_KEY` and optionally `SELLORA_AI_MODEL` as Edge Function secrets, then deploy `sellora-ai-copilot`.
- Approved admins can export a JSON snapshot through a database function and the native share sheet. Exports include sensitive employee/customer records; storage images are not part of the snapshot. Keep routine Supabase backups enabled as well.
- Production release still requires real Supabase credentials, applying and reviewing all migrations, Edge Function deployment/secrets, an app icon and native splash image, and device QA. Automated tests and full offline reconciliation are not included.

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
app/ai/              Authenticated retail copilot
app/approvals/       Approval requests and review
app/notifications/   Personal notifications
app/reports/         Branch sales report and audit history
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
- The PIN unlocks the saved Supabase session on that device; password sign-in is required after signing out or resetting a PIN.
- SQLite keeps exchange rates, cached POS catalogue/warehouse snapshots and queued offline sales. Database retries are idempotent; failed sales remain visible for staff review.
- Copilot requires deployment of its Supabase Edge Function and server-only OpenAI secret. Backup export includes customer and employee data and must be shared securely.
- A production app icon and branded native launch image are still needed before store submission. Migrations and Edge Functions must be deployed to a Supabase project before these modules can run.
- Apply the migrations to a new project, or review them before applying to a project with existing tables or types.
