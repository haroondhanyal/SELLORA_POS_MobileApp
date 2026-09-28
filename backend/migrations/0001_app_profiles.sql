-- Application-owned profile state. Better Auth owns authentication/session tables.
-- No email verification is required to create a session; unapproved users remain
-- unable to access business data until a trusted administrator approves them.
create table if not exists public.app_profiles (
  id uuid primary key references public."user" (id) on delete cascade,
  full_name text not null default '',
  email text not null unique,
  phone text,
  date_of_birth date,
  role text not null default 'cashier'
    check (role in ('admin','branch_manager','sales_manager','sales_agent','cashier','inventory_manager','accountant','viewer')),
  requested_role text not null default 'cashier'
    check (requested_role in ('admin','branch_manager','sales_manager','sales_agent','cashier','inventory_manager','accountant','viewer')),
  approval_status text not null default 'pending'
    check (approval_status in ('pending','approved','rejected','suspended')),
  avatar_storage_path text,
  primary_branch_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_profiles_approval_status_idx
  on public.app_profiles (approval_status, created_at desc);
grant select, insert on public.app_profiles to public;

alter table public.app_profiles enable row level security;

create or replace function public.sellora_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.app_profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
      and p.approval_status = 'approved'
  );
$$;

drop policy if exists "Users can read their own profile" on public.app_profiles;
create policy "Users can read their own profile"
  on public.app_profiles for select to public using (id = (select auth.uid()));

drop policy if exists "Approved admins can read all profiles" on public.app_profiles;
create policy "Approved admins can read all profiles"
  on public.app_profiles for select to public using (public.sellora_is_admin());

drop policy if exists "Approved admins can update profile access" on public.app_profiles;
create policy "Approved admins can update profile access"
  on public.app_profiles for update to public
  using (public.sellora_is_admin()) with check (public.sellora_is_admin());
