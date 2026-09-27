# Sellora Mobile

Expo + React Native + TypeScript application for Android and iOS. Each major feature has its own Expo Router screen. Shared UI, app state, Supabase services, theme tokens and SQLite live in separate folders.

## Current scope

Phases 1–7 include Sellora launch/welcome branding; theme and SQLite foundations; Supabase signup, login, recovery, PIN and approval; role and branch access; products, categories, brands, variants, barcode scanning and inventory adjustments; customers, POS, split payments and receipts; PKR/USD display conversion; branches, warehouses, transfers, suppliers, purchase orders and goods-received notes.

Offline transaction synchronization, returns, refunds, reporting and other later modules remain future phases.

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

## Structure

```text
app/                 Expo Router screens, one primary feature screen per file
app/auth/            Login, signup, recovery, PIN and approval screens
app/products/        Catalogue, categories, brands, variants and barcode
app/inventory/       Stock, adjustments and adjustment history
app/pos/             Product selection, cart, payments and receipt
app/customers/       Branch customer search and entry
app/branches/        Branch setup and assignment entry point
app/warehouses/      Warehouse and manager setup
app/transfers/       Inter-branch stock transfer workflow
app/purchases/       Purchase orders and goods-received notes
app/suppliers/       Branch supplier records
app/settings/        Currency settings and rates
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
- The online/offline selector and SQLite queue are initialized, but transaction caching and synchronization are later work. A production app icon and branded native launch image are also still needed before store submission.
- Apply the migrations to a new project, or review them before applying to a project with existing tables or types.
