-- Sellora Phase 1-3: profile, role request and administrator approval foundation.
-- Signup never chooses a trusted role: the trigger always stores the requested role as pending.
create type public.sellora_role as enum (
  'admin', 'branch_manager', 'sales_manager', 'sales_agent',
  'cashier', 'inventory_manager', 'accountant', 'viewer'
);

create type public.approval_status as enum ('pending', 'approved', 'rejected', 'suspended');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null,
  phone text,
  role public.sellora_role not null default 'cashier',
  requested_role public.sellora_role not null default 'cashier',
  approval_status public.approval_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Security-definer helper avoids a recursive profiles policy while checking admin access.
create or replace function public.sellora_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin' and p.approval_status = 'approved'
  );
$$;

revoke all on function public.sellora_is_admin() from public;
grant execute on function public.sellora_is_admin() to authenticated;

create policy "Users can read their own profile"
  on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "Approved admins can read all profiles"
  on public.profiles for select to authenticated using (public.sellora_is_admin());
create policy "Approved admins can update profile access"
  on public.profiles for update to authenticated using (public.sellora_is_admin())
  with check (public.sellora_is_admin());

-- Auth signup creates its profile on the server so clients cannot bypass pending approval.
create or replace function public.sellora_create_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  requested_role text := coalesce(new.raw_user_meta_data ->> 'requested_role', 'cashier');
begin
  if requested_role not in ('admin', 'branch_manager', 'sales_manager', 'sales_agent', 'cashier', 'inventory_manager', 'accountant', 'viewer') then
    requested_role := 'cashier';
  end if;
  insert into public.profiles (id, full_name, email, phone, role, requested_role, approval_status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    'cashier',
    requested_role::public.sellora_role,
    'pending'
  );
  return new;
end;
$$;

create trigger sellora_auth_user_created
  after insert on auth.users
  for each row execute procedure public.sellora_create_profile();
