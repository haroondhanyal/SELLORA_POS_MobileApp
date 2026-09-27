# Sellora Mobile

Expo + React Native + TypeScript mobile application for Android and iOS. Screens are separate files in `app/`; shared UI, services, theme tokens, local database and auth state each have their own folders.

## Current scope

This workspace started empty, so no earlier app code could be audited or reused. Phases 1-3 now include separate Expo Router screens, a Sellora branded launch/welcome flow, shared theme tokens/provider, Expo SQLite startup tables, environment-based Supabase setup, signup/login with password confirmation and role checks, secure signup/device PIN setup and reset, password recovery, role requests, phone country code, date of birth, profile photo upload, administrator approval and suspension, role permission management, profile editing, and an online/offline status sheet. Branch inventory, POS and offline transaction sync belong to later phases.

## Run locally

1. Install Node.js 22.13+ and a supported Android/iOS simulator or Expo Go.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and set the Supabase project URL and public anon/publishable key.
4. In Supabase SQL Editor or Supabase CLI, apply both migrations in timestamp order: `202609270001_foundation_auth_profiles.sql`, then `202609270002_profiles_roles_connection.sql`.
5. Enable email authentication in Supabase. Add `sellora://auth/pending-approval` and `sellora://auth/reset-password` to the allowed redirect URLs.
6. Run `npx expo install --fix` once so Expo aligns native package versions with SDK 57, then start with `npx expo start`; use `a` for Android or `i` for iOS.

## First administrator

Self-signup always creates a **pending cashier** profile, while the requested role is stored separately for the admin to review. It cannot grant admin access. Create the first user through signup, then promote that profile to `admin` and `approved` in the Supabase dashboard as project owner. The seeded role-permission rows include user and role management for admins. After that, approved admins can choose roles, process requests, suspend accounts and edit role permissions in the app. Never ship a service-role key in the mobile app.

## Structure

```text
app/                 Expo Router screens (one primary screen per file)
app/auth/            Login, signup, recovery, PIN and approval screens
app/dashboard/       Authenticated landing screen
app/users/           Admin user-request screen
app/roles/           Admin role-permission editor
app/profile/         Profile, photo and local PIN settings
components/          Small reusable UI components
providers/           Shared authenticated session/profile state
services/            Supabase auth and permission helpers
supabase/migrations/ Rebuildable PostgreSQL schema and security policies
theme/               Shared colors, type sizes, spacing and radius
assets/branding/     Editable Sellora SVG wordmark
types/               Shared TypeScript types
```

## Screen ownership for parallel development

Each screen is an independent route file. Several developers can work in parallel by assigning one group below to each person and agreeing on any shared component changes first:

- **Auth:** `app/auth/` plus `app/splash.tsx` and `app/welcome.tsx`
- **Account:** `app/profile/` and shared profile/photo inputs in `components/`
- **Admin users:** `app/users/` and `components/RolePicker.tsx`
- **Admin roles:** `app/roles/`
- **Home and app shell:** `app/dashboard/`, `app/_layout.tsx`, `components/AppHeader.tsx`
- **Platform services:** `providers/`, `services/`, `supabase/migrations/`

Keep feature-specific screen logic inside its route. Put only reused UI in `components/`, database/auth work in `services/`, and cross-screen state in `providers/`. Brief comments above screens and important helpers explain their responsibility; use small named functions when changing a screen so the flow stays easy to follow.

## Security and remaining phases

- Supabase Auth owns passwords; sessions use Expo SecureStore.
- Profile reads and admin approval are protected by PostgreSQL RLS. UI checks only control visibility and are not the security boundary.
- Device PIN is a salted verifier in SecureStore, never the PIN itself. It unlocks the Supabase session saved on that device; password sign-in is required after signing out or resetting a PIN.
- Offline/online mode and the local sync queue are initialized, but transaction caching and synchronization arrive in the offline phase. Branch assignment, POS, inventory, a production app icon and a branded native launch image are later work.
- Apply the migration to a new project or review it before applying to a project with existing tables/types.
