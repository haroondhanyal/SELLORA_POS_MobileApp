-- Ported Sellora business schema; source migrations remain in ../../supabase/migrations.

-- From 202609270002_profiles_roles_connection.sql
-- Sellora Phase 1-3 completion: profile fields, permission catalog and private avatars.
-- Include the signup date of birth in the profile created by the auth trigger.
create or replace function public.sellora_create_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  requested_role text := coalesce(new.raw_user_meta_data ->> 'requested_role', 'cashier');
  birthday_text text := new.raw_user_meta_data ->> 'date_of_birth';
  birthday_value date;
begin
  if requested_role not in ('admin', 'branch_manager', 'sales_manager', 'sales_agent', 'cashier', 'inventory_manager', 'accountant', 'viewer') then
    requested_role := 'cashier';
  end if;
  if birthday_text ~ '^\d{4}-\d{2}-\d{2}$' then
    begin
      birthday_value := birthday_text::date;
    exception when others then
      birthday_value := null;
    end;
  end if;
  insert into public.app_profiles (id, full_name, email, phone, role, requested_role, approval_status, date_of_birth)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    'cashier',
    requested_role::public.sellora_role,
    'pending',
    birthday_value
  );
  return new;
end;
$$;

-- Keep owner profile edits limited to harmless profile details. Role and approval
-- changes are separate columns and only an approved admin receives that privilege.
revoke all on public.app_profiles from public;
grant select on public.app_profiles to public;
revoke insert, delete on public.app_profiles from public;
revoke update on public.app_profiles from public;
grant update (full_name, phone, date_of_birth, avatar_storage_path) on public.app_profiles to public;
grant update (role, approval_status) on public.app_profiles to public;

create policy "Users can update their own profile details"
  on public.app_profiles for update to public
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Column grants plus this trigger stop self-service profile edits from changing access.
create or replace function public.sellora_guard_profile_access()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.role is distinct from old.role or new.approval_status is distinct from old.approval_status)
     and not public.sellora_is_admin() then
    raise exception 'Only an approved administrator can change account access';
  end if;
  if (new.role is distinct from old.role or new.approval_status is distinct from old.approval_status) then
    if (old.role = 'admin' or new.role = 'admin') and not public.sellora_is_admin() then
      raise exception 'Only an approved administrator can grant or remove administrator access';
    end if;
  end if;
  return new;
end;
$$;

create trigger sellora_profile_access_guard
  before update on public.app_profiles
  for each row execute procedure public.sellora_guard_profile_access();

create table public.permissions (
  code text primary key,
  label text not null,
  description text not null default ''
);

create table public.role_permissions (
  role text not null,
  permission_code text not null references public.permissions(code) on delete cascade,
  primary key (role, permission_code)
);

alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
grant select on public.permissions, public.role_permissions to public;
grant insert, update, delete on public.role_permissions to public;

insert into public.permissions (code, label, description) values
  ('dashboard.view', 'View dashboard', 'Open the Sellora home screen.'),
  ('sales.create', 'Create sales', 'Create a point-of-sale transaction.'),
  ('sales.view_own', 'View own sales', 'View sales created by the signed-in user.'),
  ('sales.view_branch', 'View branch sales', 'View sales for the assigned branch.'),
  ('products.manage', 'Manage products', 'Add and edit products.'),
  ('inventory.manage', 'Manage inventory', 'Adjust stock and view inventory.'),
  ('reports.view', 'View reports', 'Open sales and inventory reports.'),
  ('users.manage', 'Manage users', 'Approve accounts and assign roles.'),
  ('roles.manage', 'Manage role permissions', 'Choose access rights for roles.')
on conflict (code) do nothing;

insert into public.role_permissions (role, permission_code)
select role_name::text, permission_code
from (values
  ('admin', 'dashboard.view'), ('admin', 'sales.create'), ('admin', 'sales.view_branch'), ('admin', 'products.manage'), ('admin', 'inventory.manage'), ('admin', 'reports.view'), ('admin', 'users.manage'), ('admin', 'roles.manage'),
  ('branch_manager', 'dashboard.view'), ('branch_manager', 'sales.create'), ('branch_manager', 'sales.view_branch'), ('branch_manager', 'products.manage'), ('branch_manager', 'inventory.manage'), ('branch_manager', 'reports.view'),
  ('sales_manager', 'dashboard.view'), ('sales_manager', 'sales.view_branch'), ('sales_manager', 'reports.view'),
  ('sales_agent', 'dashboard.view'), ('sales_agent', 'sales.create'), ('sales_agent', 'sales.view_own'),
  ('cashier', 'dashboard.view'), ('cashier', 'sales.create'), ('cashier', 'sales.view_own'),
  ('inventory_manager', 'dashboard.view'), ('inventory_manager', 'products.manage'), ('inventory_manager', 'inventory.manage'),
  ('accountant', 'dashboard.view'), ('accountant', 'sales.view_branch'), ('accountant', 'reports.view'),
  ('viewer', 'dashboard.view')
) as defaults(role_name, permission_code)
on conflict do nothing;

create or replace function public.sellora_can(permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.app_profiles p
    join public.role_permissions rp on rp.role = p.role
    where p.id = (select auth.uid())
      and p.approval_status = 'approved'
      and rp.permission_code = permission
  );
$$;

revoke all on function public.sellora_can(text) from public;
grant execute on function public.sellora_can(text) to public;

-- Apply role permissions to the user and role administration APIs themselves.
drop policy "Approved admins can read all profiles" on public.app_profiles;
drop policy "Approved admins can update profile access" on public.app_profiles;
create policy "Users with permission can read all profiles"
  on public.app_profiles for select to public
  using (public.sellora_can('users.manage'));
create policy "Users with permission can update profile access"
  on public.app_profiles for update to public
  using (public.sellora_can('users.manage'))
  with check (public.sellora_can('users.manage'));

create or replace function public.sellora_guard_profile_access()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- A user can never change their own role or approval, including an admin.
  -- A null auth.uid() is the trusted project-owner SQL bootstrap path.
  if new.id = (select auth.uid())
     and (new.role is distinct from old.role or new.approval_status is distinct from old.approval_status)
     and (select auth.uid()) is not null then
    raise exception 'You cannot change your own role or approval status';
  end if;
  if (new.role is distinct from old.role or new.approval_status is distinct from old.approval_status)
     and (select auth.uid()) is not null
     and not public.sellora_can('users.manage') then
    raise exception 'Your role does not allow changing account access';
  end if;
  if (new.role is distinct from old.role or new.approval_status is distinct from old.approval_status)
     and (old.role = 'admin' or new.role = 'admin')
     and (select auth.uid()) is not null
     and not public.sellora_is_admin() then
    raise exception 'Only an approved administrator can grant or remove administrator access';
  end if;
  return new;
end;
$$;

create policy "Approved users can read the permission catalog"
  on public.permissions for select to public
  using (exists (select 1 from public.app_profiles p where p.id = (select auth.uid()) and p.approval_status = 'approved'));
create policy "Approved users can read role permissions"
  on public.role_permissions for select to public
  using (exists (select 1 from public.app_profiles p where p.id = (select auth.uid()) and p.approval_status = 'approved'));
create policy "Users with permission can manage role permissions"
  on public.role_permissions for all to public
  using (public.sellora_is_admin() and public.sellora_can('roles.manage'))
  with check (public.sellora_is_admin() and public.sellora_can('roles.manage'));

-- Profile photos are private; each user may only access their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 26214400, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 26214400,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

create policy "Users can read their own avatar files"
  on storage.objects for select to public
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users can upload their own avatar files"
  on storage.objects for insert to public
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users can delete their own avatar files"
  on storage.objects for delete to public
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- From 202609270003_catalog_inventory.sql
-- Phase 4 foundation: branch-aware product catalogue, stock and adjustments.
-- Branch and warehouse tables are introduced here so POS can always record a location.

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.user_branches (
  user_id uuid not null references public.app_profiles(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, branch_id)
);
create unique index user_branches_one_primary_per_user on public.user_branches(user_id) where is_primary;

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  name text not null,
  address text,
  manager_id uuid references public.app_profiles(id) on delete set null,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (branch_id, name)
);
create unique index warehouses_one_primary_per_branch on public.warehouses(branch_id) where is_primary;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  sku text not null unique,
  barcode text unique,
  category_id uuid references public.categories(id) on delete set null,
  brand_id uuid references public.brands(id) on delete set null,
  image_storage_path text,
  unit text not null default 'each',
  cost_price numeric(14, 2) not null default 0 check (cost_price >= 0),
  sale_price numeric(14, 2) not null check (sale_price >= 0),
  tax_rate numeric(7, 4) not null default 0 check (tax_rate between 0 and 100),
  minimum_stock numeric(14, 3) not null default 0 check (minimum_stock >= 0),
  reorder_level numeric(14, 3) not null default 0 check (reorder_level >= 0),
  expiry_enabled boolean not null default false,
  batch_enabled boolean not null default false,
  serial_enabled boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references public.app_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_name_search on public.products using gin (to_tsvector('simple', name || ' ' || sku || ' ' || coalesce(barcode, '')));
create index products_category_id on public.products(category_id);
create index products_brand_id on public.products(brand_id);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  sku text not null unique,
  barcode text unique,
  sale_price numeric(14, 2) check (sale_price is null or sale_price >= 0),
  cost_price numeric(14, 2) check (cost_price is null or cost_price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (product_id, name)
);

create table public.inventory (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete cascade,
  quantity numeric(14, 3) not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now()
);
create unique index inventory_product_location_unique
  on public.inventory(warehouse_id, product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index inventory_product_id on public.inventory(product_id);

-- A user may access only assigned branches; administrators can configure all branches.
create or replace function public.sellora_can_access_branch(target_branch uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.sellora_is_admin() or exists (
    select 1
    from public.app_profiles p
    left join public.user_branches ub on ub.user_id = p.id and ub.branch_id = target_branch
    where p.id = (select auth.uid())
      and p.approval_status = 'approved'
      and (p.primary_branch_id = target_branch or ub.branch_id is not null)
  );
$$;
revoke all on function public.sellora_can_access_branch(uuid) from public;
grant execute on function public.sellora_can_access_branch(uuid) to public;

create table public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id),
  product_id uuid not null references public.products(id),
  variant_id uuid references public.product_variants(id),
  quantity_delta numeric(14, 3) not null check (quantity_delta <> 0),
  reason text not null check (length(trim(reason)) >= 3),
  created_by uuid not null references public.app_profiles(id),
  created_at timestamptz not null default now()
);

-- Branch assignment is protected like role assignment, never by a client-only check.
grant update (primary_branch_id) on public.app_profiles to public;
grant insert, update, delete on public.user_branches to public;
create or replace function public.sellora_guard_profile_access()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  access_changed boolean := new.role is distinct from old.role or new.approval_status is distinct from old.approval_status;
  branch_changed boolean := new.primary_branch_id is distinct from old.primary_branch_id;
begin
  if new.id = (select auth.uid()) and access_changed and (select auth.uid()) is not null then
    raise exception 'You cannot change your own role or approval status';
  end if;
  if access_changed and (select auth.uid()) is not null and not public.sellora_can('users.manage') then
    raise exception 'Your role does not allow changing account access';
  end if;
  if (access_changed and (old.role = 'admin' or new.role = 'admin'))
     and (select auth.uid()) is not null and not public.sellora_is_admin() then
    raise exception 'Only an approved administrator can grant or remove administrator access';
  end if;
  if branch_changed and (select auth.uid()) is not null and not public.sellora_is_admin() then
    raise exception 'Only an approved administrator can assign a primary branch';
  end if;
  return new;
end;
$$;

-- These permissions let POS users look up products without allowing catalogue edits.
insert into public.permissions(code, label, description) values
  ('products.view', 'View products', 'Browse products and product details.'),
  ('inventory.view', 'View inventory', 'View stock for assigned branches.'),
  ('branches.manage', 'Manage branches', 'Create branches and assign users.'),
  ('warehouses.manage', 'Manage warehouses', 'Create warehouses for a branch.'),
  ('customers.view', 'View customers', 'Search customer records.'),
  ('customers.manage', 'Manage customers', 'Create and edit customer records.')
on conflict (code) do nothing;

insert into public.role_permissions(role, permission_code)
select role_name::text, permission_code
from (values
  ('admin', 'products.view'), ('admin', 'inventory.view'), ('admin', 'branches.manage'), ('admin', 'warehouses.manage'), ('admin', 'customers.view'), ('admin', 'customers.manage'),
  ('branch_manager', 'products.view'), ('branch_manager', 'inventory.view'), ('branch_manager', 'customers.view'), ('branch_manager', 'customers.manage'),
  ('sales_manager', 'products.view'), ('sales_manager', 'customers.view'),
  ('sales_agent', 'products.view'), ('sales_agent', 'customers.view'), ('sales_agent', 'customers.manage'),
  ('cashier', 'products.view'), ('cashier', 'customers.view'), ('cashier', 'customers.manage'),
  ('inventory_manager', 'products.view'), ('inventory_manager', 'inventory.view'),
  ('accountant', 'products.view'), ('accountant', 'inventory.view'), ('accountant', 'customers.view'),
  ('viewer', 'products.view'), ('viewer', 'inventory.view'), ('viewer', 'customers.view')
) as defaults(role_name, permission_code)
on conflict do nothing;

alter table public.branches enable row level security;
alter table public.user_branches enable row level security;
alter table public.warehouses enable row level security;
alter table public.categories enable row level security;
alter table public.brands enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.inventory enable row level security;
alter table public.stock_adjustments enable row level security;

grant select on public.branches, public.user_branches, public.warehouses, public.categories,
  public.brands, public.products, public.product_variants, public.inventory, public.stock_adjustments to public;
grant insert, update, delete on public.branches, public.warehouses, public.categories, public.brands,
  public.products, public.product_variants to public;

create policy "Approved users can read branches" on public.branches for select to public
  using (public.sellora_can_access_branch(id));
create policy "Admins manage branches" on public.branches for all to public
  using (public.sellora_is_admin()) with check (public.sellora_is_admin());
create policy "Users can read their branch assignments" on public.user_branches for select to public
  using (user_id = (select auth.uid()) or public.sellora_is_admin());
create policy "Admins manage user branch assignments" on public.user_branches for all to public
  using (public.sellora_is_admin()) with check (public.sellora_is_admin());
create policy "Approved users can read warehouses" on public.warehouses for select to public
  using (public.sellora_can_access_branch(branch_id));
create policy "Admins manage warehouses" on public.warehouses for all to public
  using (public.sellora_is_admin()) with check (public.sellora_is_admin());

create policy "Approved users can read categories" on public.categories for select to public
  using (exists (select 1 from public.app_profiles p where p.id = (select auth.uid()) and p.approval_status = 'approved'));
create policy "Product managers manage categories" on public.categories for all to public
  using (public.sellora_can('products.manage')) with check (public.sellora_can('products.manage'));
create policy "Approved users can read brands" on public.brands for select to public
  using (exists (select 1 from public.app_profiles p where p.id = (select auth.uid()) and p.approval_status = 'approved'));
create policy "Product managers manage brands" on public.brands for all to public
  using (public.sellora_can('products.manage')) with check (public.sellora_can('products.manage'));
create policy "Authorized users can read products" on public.products for select to public
  using (public.sellora_can('products.view') or public.sellora_can('products.manage') or public.sellora_can('sales.create'));
create policy "Product managers manage products" on public.products for all to public
  using (public.sellora_can('products.manage')) with check (public.sellora_can('products.manage'));
create policy "Authorized users can read product variants" on public.product_variants for select to public
  using (public.sellora_can('products.view') or public.sellora_can('products.manage') or public.sellora_can('sales.create'));
create policy "Product managers manage product variants" on public.product_variants for all to public
  using (public.sellora_can('products.manage')) with check (public.sellora_can('products.manage'));
create policy "Authorized users can read inventory" on public.inventory for select to public
  using ((public.sellora_can('inventory.view') or public.sellora_can('inventory.manage') or public.sellora_can('sales.create'))
    and exists (select 1 from public.warehouses w where w.id = warehouse_id and public.sellora_can_access_branch(w.branch_id)));
create policy "Inventory managers update inventory" on public.inventory for update to public
  using (public.sellora_can('inventory.manage')) with check (public.sellora_can('inventory.manage'));
create policy "Inventory managers create inventory" on public.inventory for insert to public
  with check (public.sellora_can('inventory.manage'));
create policy "Users can read their stock adjustments" on public.stock_adjustments for select to public
  using (created_by = (select auth.uid()) or public.sellora_can('inventory.manage'));
create policy "Inventory managers create stock adjustments" on public.stock_adjustments for insert to public
  with check (created_by = (select auth.uid()) and public.sellora_can('inventory.manage'));

-- The RPC records the audit row and inventory change atomically.
create or replace function public.sellora_adjust_stock(
  p_warehouse_id uuid,
  p_product_id uuid,
  p_variant_id uuid,
  p_quantity_delta numeric,
  p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  adjustment_id uuid := gen_random_uuid();
  stock_id uuid;
  current_quantity numeric;
begin
  if actor_id is null or not public.sellora_can('inventory.manage') then
    raise exception 'You do not have permission to adjust stock';
  end if;
  if p_quantity_delta = 0 or length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Enter a non-zero quantity and a reason';
  end if;
  if not exists (select 1 from public.warehouses w where w.id = p_warehouse_id and w.is_active) then
    raise exception 'Choose an active warehouse';
  end if;
  if not public.sellora_can_access_branch((select w.branch_id from public.warehouses w where w.id = p_warehouse_id)) then
    raise exception 'You do not have access to this branch';
  end if;

  select i.id, i.quantity into stock_id, current_quantity
    from public.inventory i
    where i.warehouse_id = p_warehouse_id and i.product_id = p_product_id
      and i.variant_id is not distinct from p_variant_id
    for update;

  if stock_id is null then
    if p_quantity_delta < 0 then raise exception 'Stock cannot be negative'; end if;
    insert into public.inventory(warehouse_id, product_id, variant_id, quantity)
      values (p_warehouse_id, p_product_id, p_variant_id, p_quantity_delta) returning id into stock_id;
  else
    if current_quantity + p_quantity_delta < 0 then raise exception 'Stock cannot be negative'; end if;
    update public.inventory set quantity = current_quantity + p_quantity_delta, updated_at = now() where id = stock_id;
  end if;

  insert into public.stock_adjustments(id, warehouse_id, product_id, variant_id, quantity_delta, reason, created_by)
    values (adjustment_id, p_warehouse_id, p_product_id, p_variant_id, p_quantity_delta, trim(p_reason), actor_id);
  return adjustment_id;
end;
$$;
revoke all on function public.sellora_adjust_stock(uuid, uuid, uuid, numeric, text) from public;
grant execute on function public.sellora_adjust_stock(uuid, uuid, uuid, numeric, text) to public;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('products', 'products', false, 26214400, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 26214400,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
create policy "Approved users can read product images" on storage.objects for select to public
  using (bucket_id = 'products' and public.sellora_can('products.view'));
create policy "Product managers upload product images" on storage.objects for insert to public
  with check (bucket_id = 'products' and public.sellora_can('products.manage'));
create policy "Product managers update product images" on storage.objects for update to public
  using (bucket_id = 'products' and public.sellora_can('products.manage'))
  with check (bucket_id = 'products' and public.sellora_can('products.manage'));
create policy "Product managers delete product images" on storage.objects for delete to public
  using (bucket_id = 'products' and public.sellora_can('products.manage'));

-- From 202609270004_pos_sales.sql
-- Phase 5: customer lookup and atomic, branch-owned POS transactions.
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  full_name text not null,
  phone text,
  email text,
  address text,
  date_of_birth date,
  avatar_storage_path text,
  credit_limit numeric(14, 2) not null default 0 check (credit_limit >= 0),
  credit_balance numeric(14, 2) not null default 0 check (credit_balance >= 0),
  store_credit_balance numeric(14, 2) not null default 0 check (store_credit_balance >= 0),
  loyalty_points integer not null default 0 check (loyalty_points >= 0),
  assigned_sales_agent_id uuid references public.app_profiles(id) on delete set null,
  created_by uuid not null references public.app_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customers_branch_name on public.customers(branch_id, full_name);
create index customers_phone on public.customers(phone);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  receipt_number text not null unique,
  branch_id uuid not null references public.branches(id),
  warehouse_id uuid not null references public.warehouses(id),
  customer_id uuid references public.customers(id) on delete set null,
  user_id uuid not null references public.app_profiles(id),
  sales_agent_id uuid not null references public.app_profiles(id),
  cashier_id uuid not null references public.app_profiles(id),
  device_id text not null,
  status text not null default 'completed' check (status in ('completed', 'voided', 'refunded')),
  currency_code text not null default 'PKR',
  subtotal numeric(14, 2) not null check (subtotal >= 0),
  discount_total numeric(14, 2) not null default 0 check (discount_total >= 0),
  tax_total numeric(14, 2) not null default 0 check (tax_total >= 0),
  total numeric(14, 2) not null check (total >= 0),
  created_at timestamptz not null default now()
);
create index sales_branch_created on public.sales(branch_id, created_at desc);
create index sales_agent_created on public.sales(sales_agent_id, created_at desc);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid not null references public.products(id),
  variant_id uuid references public.product_variants(id),
  product_name text not null,
  sku text not null,
  quantity numeric(14, 3) not null check (quantity > 0),
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  unit_cost numeric(14, 2) not null check (unit_cost >= 0),
  discount_amount numeric(14, 2) not null default 0 check (discount_amount >= 0),
  tax_rate numeric(7, 4) not null default 0,
  tax_amount numeric(14, 2) not null default 0,
  line_total numeric(14, 2) not null check (line_total >= 0)
);
create index sale_items_sale_id on public.sale_items(sale_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  method text not null check (method in ('cash', 'card', 'bank_transfer', 'jazzcash', 'easypaisa', 'customer_credit', 'store_credit')),
  amount numeric(14, 2) not null check (amount > 0),
  reference text,
  created_at timestamptz not null default now()
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id),
  product_id uuid not null references public.products(id),
  variant_id uuid references public.product_variants(id),
  sale_id uuid references public.sales(id) on delete set null,
  quantity_delta numeric(14, 3) not null check (quantity_delta <> 0),
  movement_type text not null check (movement_type in ('sale', 'adjustment', 'transfer_in', 'transfer_out', 'purchase')),
  created_by uuid not null references public.app_profiles(id),
  created_at timestamptz not null default now()
);

insert into public.permissions(code, label, description) values
  ('customers.view', 'View customers', 'Search customer records.'),
  ('customers.manage', 'Manage customers', 'Create and edit customer records.')
on conflict (code) do nothing;
insert into public.role_permissions(role, permission_code)
select role_name::text, permission_code
from (values
  ('admin', 'customers.view'), ('admin', 'customers.manage'),
  ('branch_manager', 'customers.view'), ('branch_manager', 'customers.manage'),
  ('sales_manager', 'customers.view'), ('sales_manager', 'customers.manage'),
  ('sales_agent', 'customers.view'), ('sales_agent', 'customers.manage'),
  ('cashier', 'customers.view'), ('cashier', 'customers.manage'),
  ('accountant', 'customers.view'), ('viewer', 'customers.view')
) as defaults(role_name, permission_code)
on conflict do nothing;

alter table public.customers enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.payments enable row level security;
alter table public.inventory_movements enable row level security;
grant select, insert, update on public.customers to public;
grant select on public.sales, public.sale_items, public.payments, public.inventory_movements to public;

create policy "Users read customers in assigned branches" on public.customers for select to public
  using (public.sellora_can('customers.view') and public.sellora_can_access_branch(branch_id));
create policy "Customer managers create branch customers" on public.customers for insert to public
  with check (public.sellora_can('customers.manage') and created_by = (select auth.uid()) and public.sellora_can_access_branch(branch_id));
create policy "Customer managers update branch customers" on public.customers for update to public
  using (public.sellora_can('customers.manage') and public.sellora_can_access_branch(branch_id))
  with check (public.sellora_can('customers.manage') and public.sellora_can_access_branch(branch_id));
create policy "Users read sales in allowed scope" on public.sales for select to public
  using ((user_id = (select auth.uid()) and public.sellora_can('sales.view_own'))
    or (public.sellora_can('sales.view_branch') and public.sellora_can_access_branch(branch_id)));
create policy "Users read sale items in allowed scope" on public.sale_items for select to public
  using (exists (select 1 from public.sales s where s.id = sale_id));
create policy "Users read payments in allowed scope" on public.payments for select to public
  using (exists (select 1 from public.sales s where s.id = sale_id));
create policy "Users read inventory movements in assigned branches" on public.inventory_movements for select to public
  using (exists (select 1 from public.warehouses w where w.id = warehouse_id and public.sellora_can_access_branch(w.branch_id)));

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('customers', 'customers', false, 26214400, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 26214400,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
create policy "Branch users read customer photos" on storage.objects for select to public
  using (bucket_id = 'customers' and public.sellora_can_access_branch(((storage.foldername(name))[1])::uuid));
create policy "Customer managers upload branch photos" on storage.objects for insert to public
  with check (bucket_id = 'customers' and public.sellora_can('customers.manage')
    and public.sellora_can_access_branch(((storage.foldername(name))[1])::uuid));
create policy "Customer managers delete branch photos" on storage.objects for delete to public
  using (bucket_id = 'customers' and public.sellora_can('customers.manage')
    and public.sellora_can_access_branch(((storage.foldername(name))[1])::uuid));

-- Lets a cashier pick an approved agent without exposing the full profile table.
create or replace function public.sellora_list_branch_sales_agents(target_branch uuid)
returns table(id uuid, full_name text) language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name from public.app_profiles p
  where p.role = 'sales_agent' and p.approval_status = 'approved'
    and public.sellora_can_access_branch(target_branch)
    and (p.primary_branch_id = target_branch or exists (
      select 1 from public.user_branches ub where ub.user_id = p.id and ub.branch_id = target_branch
    ))
  order by p.full_name;
$$;
revoke all on function public.sellora_list_branch_sales_agents(uuid) from public;
grant execute on function public.sellora_list_branch_sales_agents(uuid) to public;

-- Calculates prices and taxes from PostgreSQL, locks stock, writes payments and returns a receipt id.
create or replace function public.sellora_complete_sale(
  p_branch_id uuid,
  p_warehouse_id uuid,
  p_customer_id uuid,
  p_sales_agent_id uuid,
  p_device_id text,
  p_items jsonb,
  p_payments jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  sale_id uuid := gen_random_uuid();
  receipt text := 'SLR-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(sale_id::text, '-', ''), 1, 8));
  item jsonb;
  payment jsonb;
  product_row record;
  stock_row record;
  line_quantity numeric;
  line_discount numeric;
  line_subtotal numeric;
  line_tax numeric;
  line_total numeric;
  calculated_subtotal numeric := 0;
  calculated_discount numeric := 0;
  calculated_tax numeric := 0;
  calculated_total numeric := 0;
  payment_total numeric := 0;
  item_snapshot jsonb := '[]'::jsonb;
  payment_snapshot jsonb := '[]'::jsonb;
  customer_row public.customers%rowtype;
  credit_due numeric := 0;
  store_credit_due numeric := 0;
begin
  if actor_id is null or not public.sellora_can('sales.create') then
    raise exception 'Your account does not have permission to create sales';
  end if;
  if not public.sellora_can_access_branch(p_branch_id) then raise exception 'You do not have access to this branch'; end if;
  if not exists (select 1 from public.warehouses w where w.id = p_warehouse_id and w.branch_id = p_branch_id and w.is_active) then
    raise exception 'Choose an active warehouse in this branch';
  end if;
  if not exists (select 1 from public.app_profiles p where p.id = p_sales_agent_id and p.role = 'sales_agent' and p.approval_status = 'approved'
    and (p.primary_branch_id = p_branch_id or exists (select 1 from public.user_branches ub where ub.user_id = p.id and ub.branch_id = p_branch_id))) then
    raise exception 'Choose an approved sales agent assigned to this branch';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one product'; end if;
  if jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) = 0 then raise exception 'Add a payment'; end if;

  for item in select value from jsonb_array_elements(p_items) loop
    line_quantity := (item ->> 'quantity')::numeric;
    if line_quantity <= 0 then raise exception 'Product quantity must be greater than zero'; end if;
    select pr.id, pr.name, pr.sku, pr.cost_price, pr.sale_price, pr.tax_rate, pr.is_active,
      pv.id as variant_id,
      coalesce(pv.cost_price, pr.cost_price) as unit_cost,
      coalesce(pv.sale_price, pr.sale_price) as unit_price,
      coalesce(pv.sku, pr.sku) as item_sku,
      coalesce(pv.name, pr.name) as item_name
      into product_row
      from public.products pr
      left join public.product_variants pv on pv.id = nullif(item ->> 'variant_id', '')::uuid and pv.product_id = pr.id and pv.is_active
      where pr.id = (item ->> 'product_id')::uuid and pr.is_active;
    if not found then raise exception 'A selected product is unavailable'; end if;
    if nullif(item ->> 'variant_id', '') is not null and product_row.variant_id is null then
      raise exception 'A selected product variant is unavailable';
    end if;

    select i.id, i.quantity into stock_row from public.inventory i
      where i.warehouse_id = p_warehouse_id and i.product_id = product_row.id
        and i.variant_id is not distinct from nullif(item ->> 'variant_id', '')::uuid
      for update;
    if stock_row.id is null or stock_row.quantity < line_quantity then
      raise exception 'Not enough stock for %', product_row.item_name;
    end if;
    -- Deduct while building the cart snapshot so duplicate item rows cannot oversell stock.
    update public.inventory set quantity = quantity - line_quantity, updated_at = now() where id = stock_row.id;

    line_subtotal := round(product_row.unit_price * line_quantity, 2);
    line_discount := coalesce((item ->> 'discount_amount')::numeric, 0);
    if line_discount < 0 or line_discount > line_subtotal then raise exception 'Discount must be between zero and the item subtotal'; end if;
    line_tax := round(((line_subtotal - line_discount) * product_row.tax_rate) / 100, 2);
    line_total := line_subtotal - line_discount + line_tax;
    calculated_subtotal := calculated_subtotal + line_subtotal;
    calculated_discount := calculated_discount + line_discount;
    calculated_tax := calculated_tax + line_tax;
    calculated_total := calculated_total + line_total;
    item_snapshot := item_snapshot || jsonb_build_array(jsonb_build_object(
      'product_id', product_row.id, 'variant_id', nullif(item ->> 'variant_id', ''),
      'product_name', product_row.item_name, 'sku', product_row.item_sku,
      'quantity', line_quantity, 'unit_price', product_row.unit_price, 'unit_cost', product_row.unit_cost,
      'discount_amount', line_discount, 'tax_rate', product_row.tax_rate, 'tax_amount', line_tax, 'line_total', line_total,
      'inventory_id', stock_row.id
    ));
  end loop;

  for payment in select value from jsonb_array_elements(p_payments) loop
    if (payment ->> 'method') not in ('cash', 'card', 'bank_transfer', 'jazzcash', 'easypaisa', 'customer_credit', 'store_credit') then
      raise exception 'Choose a supported payment method';
    end if;
    if (payment ->> 'amount')::numeric <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
    payment_total := payment_total + (payment ->> 'amount')::numeric;
    payment_snapshot := payment_snapshot || jsonb_build_array(payment);
    if payment ->> 'method' = 'customer_credit' then credit_due := credit_due + (payment ->> 'amount')::numeric; end if;
    if payment ->> 'method' = 'store_credit' then store_credit_due := store_credit_due + (payment ->> 'amount')::numeric; end if;
  end loop;
  if abs(payment_total - calculated_total) > 0.01 then raise exception 'Payment amounts must equal the sale total'; end if;

  if p_customer_id is null and credit_due > 0 then raise exception 'Choose a customer before using customer credit'; end if;
  if p_customer_id is null and store_credit_due > 0 then raise exception 'Choose a customer before using store credit'; end if;
  if p_customer_id is not null then
    select * into customer_row from public.customers c where c.id = p_customer_id and c.branch_id = p_branch_id for update;
    if not found then raise exception 'Choose a customer from this branch'; end if;
    if credit_due > 0 and customer_row.credit_balance + credit_due > customer_row.credit_limit then raise exception 'Customer credit limit would be exceeded'; end if;
    if store_credit_due > customer_row.store_credit_balance then raise exception 'Customer does not have enough store credit'; end if;
  end if;

  insert into public.sales(id, receipt_number, branch_id, warehouse_id, customer_id, user_id, sales_agent_id, cashier_id,
    device_id, subtotal, discount_total, tax_total, total)
  values (sale_id, receipt, p_branch_id, p_warehouse_id, p_customer_id, actor_id, p_sales_agent_id, actor_id,
    coalesce(nullif(trim(p_device_id), ''), 'unknown-device'), calculated_subtotal, calculated_discount, calculated_tax, calculated_total);

  for item in select value from jsonb_array_elements(item_snapshot) loop
    insert into public.sale_items(sale_id, product_id, variant_id, product_name, sku, quantity, unit_price,
      unit_cost, discount_amount, tax_rate, tax_amount, line_total)
    values (sale_id, (item ->> 'product_id')::uuid, nullif(item ->> 'variant_id', '')::uuid, item ->> 'product_name',
      item ->> 'sku', (item ->> 'quantity')::numeric, (item ->> 'unit_price')::numeric, (item ->> 'unit_cost')::numeric,
      (item ->> 'discount_amount')::numeric, (item ->> 'tax_rate')::numeric, (item ->> 'tax_amount')::numeric, (item ->> 'line_total')::numeric);
    insert into public.inventory_movements(warehouse_id, product_id, variant_id, sale_id, quantity_delta, movement_type, created_by)
    values (p_warehouse_id, (item ->> 'product_id')::uuid, nullif(item ->> 'variant_id', '')::uuid,
      sale_id, -((item ->> 'quantity')::numeric), 'sale', actor_id);
  end loop;
  for payment in select value from jsonb_array_elements(payment_snapshot) loop
    insert into public.payments(sale_id, method, amount, reference)
      values (sale_id, payment ->> 'method', (payment ->> 'amount')::numeric, nullif(payment ->> 'reference', ''));
  end loop;
  if credit_due > 0 or store_credit_due > 0 then
    update public.customers set credit_balance = credit_balance + credit_due,
      store_credit_balance = store_credit_balance - store_credit_due, updated_at = now() where id = p_customer_id;
  end if;
  return sale_id;
end;
$$;
revoke all on function public.sellora_complete_sale(uuid, uuid, uuid, uuid, text, jsonb, jsonb) from public;
grant execute on function public.sellora_complete_sale(uuid, uuid, uuid, uuid, text, jsonb, jsonb) to public;

-- From 202609270005_currency.sql
-- Phase 6: one business base currency plus per-currency display and exchange-rate snapshots.
create table public.business_currency (
  id smallint primary key default 1 check (id = 1),
  base_currency text not null default 'PKR' check (base_currency ~ '^[A-Z]{3}$'),
  updated_by uuid references public.app_profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.business_currency(id, base_currency) values (1, 'PKR') on conflict (id) do nothing;

-- Product prices use the current business base. Lock it after commerce data exists so the
-- same stored number is never silently reinterpreted as a different currency.
create or replace function public.sellora_guard_base_currency_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.base_currency is distinct from old.base_currency
    and (exists (select 1 from public.products) or exists (select 1 from public.sales)) then
    raise exception 'Base currency is locked after products or transactions exist';
  end if;
  return new;
end;
$$;
create trigger sellora_base_currency_guard before update on public.business_currency
for each row execute procedure public.sellora_guard_base_currency_change();

create table public.exchange_rates (
  base_currency text not null check (base_currency ~ '^[A-Z]{3}$'),
  quote_currency text not null check (quote_currency ~ '^[A-Z]{3}$' and quote_currency <> base_currency),
  rate numeric(18, 8) not null check (rate > 0),
  source text not null check (source in ('automatic', 'manual')),
  updated_by uuid references public.app_profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (base_currency, quote_currency)
);

-- Preserve the currency used when a sale is completed; changing display preferences never rewrites sales.
alter table public.sales add column base_currency text not null default 'PKR' check (base_currency ~ '^[A-Z]{3}$');
create or replace function public.sellora_set_sale_base_currency()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select bc.base_currency into new.base_currency from public.business_currency bc where bc.id = 1;
  if new.base_currency is null then new.base_currency := 'PKR'; end if;
  new.currency_code := new.base_currency;
  return new;
end;
$$;
create trigger sellora_sales_base_currency before insert on public.sales
for each row execute procedure public.sellora_set_sale_base_currency();

alter table public.business_currency enable row level security;
alter table public.exchange_rates enable row level security;
grant select on public.business_currency, public.exchange_rates to public;
grant update on public.business_currency to public;
grant insert, update, delete on public.exchange_rates to public;
create policy "Approved users can read base currency" on public.business_currency for select to public
  using (exists (select 1 from public.app_profiles p where p.id = (select auth.uid()) and p.approval_status = 'approved'));
create policy "Admins update base currency" on public.business_currency for update to public
  using (public.sellora_is_admin()) with check (public.sellora_is_admin() and updated_by = (select auth.uid()));
create policy "Approved users can read exchange rates" on public.exchange_rates for select to public
  using (exists (select 1 from public.app_profiles p where p.id = (select auth.uid()) and p.approval_status = 'approved'));
create policy "Admins manage exchange rates" on public.exchange_rates for all to public
  using (public.sellora_is_admin()) with check (public.sellora_is_admin());

-- From 202609270006_advanced_inventory.sql
-- Phase 7: branch operations, supplier ordering, goods receipts and stock transfers.
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  name text not null,
  company_name text,
  phone text,
  email text,
  address text,
  is_active boolean not null default true,
  created_by uuid not null references public.app_profiles(id),
  created_at timestamptz not null default now(),
  unique (branch_id, name)
);
create index suppliers_branch_name on public.suppliers(branch_id, name);

create table public.stock_transfers (
  id uuid primary key default gen_random_uuid(),
  transfer_number text not null unique,
  from_branch_id uuid not null references public.branches(id),
  to_branch_id uuid not null references public.branches(id),
  from_warehouse_id uuid not null references public.warehouses(id),
  to_warehouse_id uuid not null references public.warehouses(id),
  status text not null default 'requested' check (status in ('draft', 'requested', 'approved', 'dispatched', 'in_transit', 'received', 'rejected')),
  note text not null default '',
  created_by uuid not null references public.app_profiles(id),
  approved_by uuid references public.app_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_branch_id <> to_branch_id)
);
create table public.stock_transfer_items (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.stock_transfers(id) on delete cascade,
  product_id uuid not null references public.products(id),
  variant_id uuid references public.product_variants(id),
  quantity numeric(14, 3) not null check (quantity > 0)
);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  branch_id uuid not null references public.branches(id),
  warehouse_id uuid not null references public.warehouses(id),
  supplier_id uuid not null references public.suppliers(id),
  status text not null default 'ordered' check (status in ('draft', 'ordered', 'partially_received', 'received', 'cancelled')),
  total_cost numeric(14, 2) not null default 0 check (total_cost >= 0),
  note text not null default '',
  ordered_by uuid not null references public.app_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index purchase_orders_branch_created on public.purchase_orders(branch_id, created_at desc);
create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  variant_id uuid references public.product_variants(id),
  ordered_quantity numeric(14, 3) not null check (ordered_quantity > 0),
  received_quantity numeric(14, 3) not null default 0 check (received_quantity >= 0 and received_quantity <= ordered_quantity),
  unit_cost numeric(14, 2) not null check (unit_cost >= 0)
);

create table public.goods_received_notes (
  id uuid primary key default gen_random_uuid(),
  receipt_number text not null unique,
  purchase_order_id uuid not null references public.purchase_orders(id),
  warehouse_id uuid not null references public.warehouses(id),
  note text not null default '',
  received_by uuid not null references public.app_profiles(id),
  created_at timestamptz not null default now()
);
create table public.goods_received_note_items (
  id uuid primary key default gen_random_uuid(),
  goods_received_note_id uuid not null references public.goods_received_notes(id) on delete cascade,
  purchase_order_item_id uuid not null references public.purchase_order_items(id),
  product_id uuid not null references public.products(id),
  variant_id uuid references public.product_variants(id),
  quantity numeric(14, 3) not null check (quantity > 0),
  unit_cost numeric(14, 2) not null check (unit_cost >= 0)
);

alter table public.suppliers enable row level security;
alter table public.stock_transfers enable row level security;
alter table public.stock_transfer_items enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.goods_received_notes enable row level security;
alter table public.goods_received_note_items enable row level security;
grant select, insert, update on public.suppliers to public;
grant select on public.stock_transfers, public.stock_transfer_items, public.purchase_orders,
  public.purchase_order_items, public.goods_received_notes, public.goods_received_note_items to public;

create policy "Branch users read suppliers" on public.suppliers for select to public
  using (public.sellora_can('inventory.view') and public.sellora_can_access_branch(branch_id));
create policy "Inventory managers manage suppliers" on public.suppliers for all to public
  using (public.sellora_can('inventory.manage') and public.sellora_can_access_branch(branch_id))
  with check (public.sellora_can('inventory.manage') and public.sellora_can_access_branch(branch_id)
    and created_by = (select auth.uid()));
create policy "Branch users read transfers" on public.stock_transfers for select to public
  using (public.sellora_can_access_branch(from_branch_id) or public.sellora_can_access_branch(to_branch_id));
create policy "Users read transfer lines" on public.stock_transfer_items for select to public
  using (exists (select 1 from public.stock_transfers t where t.id = transfer_id));
create policy "Branch users read purchase orders" on public.purchase_orders for select to public
  using (public.sellora_can_access_branch(branch_id));
create policy "Users read purchase order lines" on public.purchase_order_items for select to public
  using (exists (select 1 from public.purchase_orders po where po.id = purchase_order_id));
create policy "Branch users read goods receipts" on public.goods_received_notes for select to public
  using (exists (select 1 from public.purchase_orders po where po.id = purchase_order_id and public.sellora_can_access_branch(po.branch_id)));
create policy "Users read goods receipt lines" on public.goods_received_note_items for select to public
  using (exists (select 1 from public.goods_received_notes grn where grn.id = goods_received_note_id));

-- Creates a requested transfer after confirming stock in the source warehouse.
create or replace function public.sellora_create_stock_transfer(
  p_from_warehouse uuid, p_to_warehouse uuid, p_items jsonb, p_note text default ''
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  transfer_id uuid := gen_random_uuid();
  from_branch uuid;
  to_branch uuid;
  transfer_number text := 'TR-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(transfer_id::text, '-', ''), 1, 8));
  item jsonb;
  stock record;
  quantity_value numeric;
begin
  if actor_id is null or not public.sellora_can('inventory.manage') then raise exception 'You do not have permission to transfer stock'; end if;
  select w.branch_id into from_branch from public.warehouses w where w.id = p_from_warehouse and w.is_active;
  select w.branch_id into to_branch from public.warehouses w where w.id = p_to_warehouse and w.is_active;
  if from_branch is null or to_branch is null or from_branch = to_branch then raise exception 'Choose warehouses in two different active branches'; end if;
  if not public.sellora_can_access_branch(from_branch) or not public.sellora_can_access_branch(to_branch) then raise exception 'You need access to both branches'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one transfer item'; end if;

  for item in select value from jsonb_array_elements(p_items) loop
    quantity_value := (item ->> 'quantity')::numeric;
    if quantity_value <= 0 then raise exception 'Transfer quantities must be greater than zero'; end if;
    select i.id, i.quantity into stock from public.inventory i where i.warehouse_id = p_from_warehouse
      and i.product_id = (item ->> 'product_id')::uuid and i.variant_id is not distinct from nullif(item ->> 'variant_id', '')::uuid for update;
    if stock.id is null or stock.quantity < quantity_value then raise exception 'Not enough stock for a transfer item'; end if;
  end loop;

  insert into public.stock_transfers(id, transfer_number, from_branch_id, to_branch_id, from_warehouse_id, to_warehouse_id, note, created_by)
    values (transfer_id, transfer_number, from_branch, to_branch, p_from_warehouse, p_to_warehouse, coalesce(trim(p_note), ''), actor_id);
  for item in select value from jsonb_array_elements(p_items) loop
    insert into public.stock_transfer_items(transfer_id, product_id, variant_id, quantity)
      values (transfer_id, (item ->> 'product_id')::uuid, nullif(item ->> 'variant_id', '')::uuid, (item ->> 'quantity')::numeric);
  end loop;
  return transfer_id;
end;
$$;
revoke all on function public.sellora_create_stock_transfer(uuid, uuid, jsonb, text) from public;
grant execute on function public.sellora_create_stock_transfer(uuid, uuid, jsonb, text) to public;

-- Enforces the transfer state machine and moves inventory at dispatch/receipt points.
create or replace function public.sellora_update_stock_transfer(p_transfer_id uuid, p_next_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  transfer_row public.stock_transfers%rowtype;
  item record;
  stock_id uuid;
  old_quantity numeric;
begin
  if not public.sellora_can('inventory.manage') then raise exception 'You do not have permission to update transfers'; end if;
  select * into transfer_row from public.stock_transfers where id = p_transfer_id for update;
  if not found then raise exception 'Transfer was not found'; end if;
  if p_next_status = 'received' then
    if not public.sellora_can_access_branch(transfer_row.to_branch_id) then raise exception 'You need access to the receiving branch'; end if;
  elsif p_next_status = 'in_transit' then
    if not public.sellora_can_access_branch(transfer_row.from_branch_id) and not public.sellora_can_access_branch(transfer_row.to_branch_id) then raise exception 'You need access to a transfer branch'; end if;
  elsif not public.sellora_can_access_branch(transfer_row.from_branch_id) then
    raise exception 'You need access to the sending branch';
  end if;

  if not (
    (transfer_row.status = 'requested' and p_next_status in ('approved', 'rejected'))
    or (transfer_row.status = 'approved' and p_next_status = 'dispatched')
    or (transfer_row.status = 'dispatched' and p_next_status = 'in_transit')
    or (transfer_row.status = 'in_transit' and p_next_status = 'received')
  ) then
    raise exception 'This transfer cannot move from % to %', transfer_row.status, p_next_status;
  end if;

  if p_next_status = 'dispatched' then
    for item in select * from public.stock_transfer_items where transfer_id = p_transfer_id loop
      select i.id, i.quantity into stock_id, old_quantity from public.inventory i
        where i.warehouse_id = transfer_row.from_warehouse_id and i.product_id = item.product_id
          and i.variant_id is not distinct from item.variant_id for update;
      if stock_id is null or old_quantity < item.quantity then raise exception 'Source stock changed; review the transfer quantities'; end if;
      update public.inventory set quantity = quantity - item.quantity, updated_at = now() where id = stock_id;
      insert into public.inventory_movements(warehouse_id, product_id, variant_id, quantity_delta, movement_type, created_by)
        values (transfer_row.from_warehouse_id, item.product_id, item.variant_id, -item.quantity, 'transfer_out', (select auth.uid()));
    end loop;
  elsif p_next_status = 'received' then
    for item in select * from public.stock_transfer_items where transfer_id = p_transfer_id loop
      select i.id, i.quantity into stock_id, old_quantity from public.inventory i
        where i.warehouse_id = transfer_row.to_warehouse_id and i.product_id = item.product_id
          and i.variant_id is not distinct from item.variant_id for update;
      if stock_id is null then
        insert into public.inventory(warehouse_id, product_id, variant_id, quantity)
          values (transfer_row.to_warehouse_id, item.product_id, item.variant_id, item.quantity);
      else
        update public.inventory set quantity = quantity + item.quantity, updated_at = now() where id = stock_id;
      end if;
      insert into public.inventory_movements(warehouse_id, product_id, variant_id, quantity_delta, movement_type, created_by)
        values (transfer_row.to_warehouse_id, item.product_id, item.variant_id, item.quantity, 'transfer_in', (select auth.uid()));
    end loop;
  end if;

  update public.stock_transfers set status = p_next_status, updated_at = now(),
    approved_by = case when p_next_status = 'approved' then (select auth.uid()) else approved_by end
    where id = p_transfer_id;
end;
$$;
revoke all on function public.sellora_update_stock_transfer(uuid, text) from public;
grant execute on function public.sellora_update_stock_transfer(uuid, text) to public;

-- Creates an ordered purchase with immutable product and cost snapshots.
create or replace function public.sellora_create_purchase_order(
  p_branch_id uuid, p_warehouse_id uuid, p_supplier_id uuid, p_items jsonb, p_note text default ''
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  order_id uuid := gen_random_uuid();
  order_number text := 'PO-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(order_id::text, '-', ''), 1, 8));
  item jsonb;
  quantity_value numeric;
  cost_value numeric;
  total_value numeric := 0;
begin
  if actor_id is null or not public.sellora_can('inventory.manage') then raise exception 'You do not have permission to create purchase orders'; end if;
  if not public.sellora_can_access_branch(p_branch_id) then raise exception 'You do not have access to this branch'; end if;
  if not exists (select 1 from public.warehouses w where w.id = p_warehouse_id and w.branch_id = p_branch_id and w.is_active) then raise exception 'Choose a warehouse in this branch'; end if;
  if not exists (select 1 from public.suppliers s where s.id = p_supplier_id and s.branch_id = p_branch_id and s.is_active) then raise exception 'Choose a supplier in this branch'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one purchase item'; end if;

  for item in select value from jsonb_array_elements(p_items) loop
    quantity_value := (item ->> 'quantity')::numeric;
    cost_value := (item ->> 'unit_cost')::numeric;
    if quantity_value <= 0 or cost_value < 0 then raise exception 'Enter a valid quantity and unit cost'; end if;
    total_value := total_value + quantity_value * cost_value;
  end loop;
  insert into public.purchase_orders(id, order_number, branch_id, warehouse_id, supplier_id, total_cost, note, ordered_by)
    values (order_id, order_number, p_branch_id, p_warehouse_id, p_supplier_id, total_value, coalesce(trim(p_note), ''), actor_id);
  for item in select value from jsonb_array_elements(p_items) loop
    insert into public.purchase_order_items(purchase_order_id, product_id, variant_id, ordered_quantity, unit_cost)
      values (order_id, (item ->> 'product_id')::uuid, nullif(item ->> 'variant_id', '')::uuid,
        (item ->> 'quantity')::numeric, (item ->> 'unit_cost')::numeric);
  end loop;
  return order_id;
end;
$$;
revoke all on function public.sellora_create_purchase_order(uuid, uuid, uuid, jsonb, text) from public;
grant execute on function public.sellora_create_purchase_order(uuid, uuid, uuid, jsonb, text) to public;

-- Records a GRN and adds accepted quantities to stock in one atomic operation.
create or replace function public.sellora_receive_purchase(p_order_id uuid, p_items jsonb, p_note text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  order_row public.purchase_orders%rowtype;
  grn_id uuid := gen_random_uuid();
  receipt_number text := 'GRN-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(grn_id::text, '-', ''), 1, 8));
  item jsonb;
  order_item public.purchase_order_items%rowtype;
  stock_id uuid;
  old_quantity numeric;
  all_received boolean;
  receive_quantity numeric;
begin
  if actor_id is null or not public.sellora_can('inventory.manage') then raise exception 'You do not have permission to receive purchases'; end if;
  select * into order_row from public.purchase_orders where id = p_order_id for update;
  if not found or order_row.status not in ('ordered', 'partially_received') then raise exception 'This purchase order is not open for receiving'; end if;
  if not public.sellora_can_access_branch(order_row.branch_id) then raise exception 'You do not have access to this branch'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Enter at least one received quantity'; end if;
  insert into public.goods_received_notes(id, receipt_number, purchase_order_id, warehouse_id, note, received_by)
    values (grn_id, receipt_number, p_order_id, order_row.warehouse_id, coalesce(trim(p_note), ''), actor_id);

  for item in select value from jsonb_array_elements(p_items) loop
    receive_quantity := (item ->> 'quantity')::numeric;
    if receive_quantity <= 0 then raise exception 'Received quantities must be greater than zero'; end if;
    select * into order_item from public.purchase_order_items where id = (item ->> 'item_id')::uuid and purchase_order_id = p_order_id for update;
    if not found or order_item.received_quantity + receive_quantity > order_item.ordered_quantity then raise exception 'Received quantity exceeds the amount still due'; end if;
    update public.purchase_order_items set received_quantity = received_quantity + receive_quantity where id = order_item.id;
    insert into public.goods_received_note_items(goods_received_note_id, purchase_order_item_id, product_id, variant_id, quantity, unit_cost)
      values (grn_id, order_item.id, order_item.product_id, order_item.variant_id, receive_quantity, order_item.unit_cost);
    select i.id, i.quantity into stock_id, old_quantity from public.inventory i where i.warehouse_id = order_row.warehouse_id
      and i.product_id = order_item.product_id and i.variant_id is not distinct from order_item.variant_id for update;
    if stock_id is null then
      insert into public.inventory(warehouse_id, product_id, variant_id, quantity)
        values (order_row.warehouse_id, order_item.product_id, order_item.variant_id, receive_quantity);
    else
      update public.inventory set quantity = quantity + receive_quantity, updated_at = now() where id = stock_id;
    end if;
    insert into public.inventory_movements(warehouse_id, product_id, variant_id, quantity_delta, movement_type, created_by)
      values (order_row.warehouse_id, order_item.product_id, order_item.variant_id, receive_quantity, 'purchase', actor_id);
  end loop;

  select bool_and(received_quantity = ordered_quantity) into all_received from public.purchase_order_items where purchase_order_id = p_order_id;
  update public.purchase_orders set status = case when all_received then 'received' else 'partially_received' end, updated_at = now() where id = p_order_id;
  return grn_id;
end;
$$;
revoke all on function public.sellora_receive_purchase(uuid, jsonb, text) from public;
grant execute on function public.sellora_receive_purchase(uuid, jsonb, text) to public;

-- Updates a user's primary and allowed branches together for the admin user screen.
create or replace function public.sellora_assign_user_branches(
  target_user uuid, target_primary uuid, target_branches uuid[]
) returns void language plpgsql security definer set search_path = '' as $$
declare
  branch_count integer;
begin
  if not public.sellora_is_admin() then raise exception 'Only an approved administrator can assign branches'; end if;
  if not exists (select 1 from public.app_profiles where id = target_user) then raise exception 'User profile was not found'; end if;
  if target_primary is not null and not (target_primary = any(coalesce(target_branches, array[]::uuid[]))) then
    raise exception 'The primary branch must be included in the allowed branches';
  end if;
  select count(*) into branch_count from public.branches
    where id = any(coalesce(target_branches, array[]::uuid[])) and is_active;
  if branch_count <> coalesce(array_length(target_branches, 1), 0) then raise exception 'Choose active branches only'; end if;
  update public.app_profiles set primary_branch_id = target_primary where id = target_user;
  delete from public.user_branches where user_id = target_user;
  insert into public.user_branches(user_id, branch_id, is_primary)
    select target_user, branch_id, branch_id = target_primary
    from unnest(coalesce(target_branches, array[]::uuid[])) as branch_id;
end;
$$;
revoke all on function public.sellora_assign_user_branches(uuid, uuid, uuid[]) from public;
grant execute on function public.sellora_assign_user_branches(uuid, uuid, uuid[]) to public;

-- Creates a warehouse and resets the branch's primary location in the same transaction.
create or replace function public.sellora_create_warehouse(
  p_branch_id uuid, p_name text, p_address text, p_manager_id uuid, p_is_primary boolean
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  warehouse_id uuid := gen_random_uuid();
begin
  if not public.sellora_is_admin() or not public.sellora_can('warehouses.manage') then raise exception 'Only an administrator can manage warehouses'; end if;
  if not exists (select 1 from public.branches b where b.id = p_branch_id and b.is_active) then raise exception 'Choose an active branch'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Enter a warehouse name'; end if;
  if p_manager_id is not null and not exists (
    select 1 from public.app_profiles p where p.id = p_manager_id and p.approval_status = 'approved'
      and (p.primary_branch_id = p_branch_id or exists (select 1 from public.user_branches ub where ub.user_id = p.id and ub.branch_id = p_branch_id))
  ) then raise exception 'The warehouse manager must be approved and assigned to this branch'; end if;
  if p_is_primary then update public.warehouses set is_primary = false where branch_id = p_branch_id; end if;
  insert into public.warehouses(id, branch_id, name, address, manager_id, is_primary)
    values (warehouse_id, p_branch_id, trim(p_name), nullif(trim(coalesce(p_address, '')), ''), p_manager_id, p_is_primary);
  return warehouse_id;
end;
$$;
revoke all on function public.sellora_create_warehouse(uuid, text, text, uuid, boolean) from public;
grant execute on function public.sellora_create_warehouse(uuid, text, text, uuid, boolean) to public;

-- From 202609270007_returns_credit_expenses.sql
-- Phase 8: returns, refunds, customer-account payments, loyalty and expenses.
alter table public.inventory_movements drop constraint if exists inventory_movements_movement_type_check;
alter table public.inventory_movements add constraint inventory_movements_movement_type_check
  check (movement_type in ('sale', 'adjustment', 'transfer_in', 'transfer_out', 'purchase', 'return'));

create table public.sales_returns (
  id uuid primary key default gen_random_uuid(), sale_id uuid not null references public.sales(id),
  branch_id uuid not null references public.branches(id), return_number text not null unique,
  reason text not null, refund_method text not null check (refund_method in ('cash','card','bank_transfer','jazzcash','easypaisa','store_credit')),
  refund_total numeric(14,2) not null check (refund_total > 0), created_by uuid not null references public.app_profiles(id), created_at timestamptz not null default now()
);
create table public.sales_return_items (
  id uuid primary key default gen_random_uuid(), return_id uuid not null references public.sales_returns(id) on delete cascade,
  sale_item_id uuid not null references public.sale_items(id), product_id uuid not null references public.products(id), variant_id uuid references public.product_variants(id),
  quantity numeric(14,3) not null check (quantity > 0), refund_amount numeric(14,2) not null check (refund_amount >= 0)
);
create table public.customer_account_payments (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.customers(id), branch_id uuid not null references public.branches(id),
  amount numeric(14,2) not null check (amount > 0), method text not null check (method in ('cash','card','bank_transfer','jazzcash','easypaisa')),
  reference text, received_by uuid not null references public.app_profiles(id), created_at timestamptz not null default now()
);
create table public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.customers(id), sale_id uuid references public.sales(id),
  points integer not null check (points <> 0), reason text not null, created_at timestamptz not null default now()
);
create table public.expenses (
  id uuid primary key default gen_random_uuid(), branch_id uuid not null references public.branches(id), category text not null,
  description text not null, amount numeric(14,2) not null check (amount > 0), payment_method text not null check (payment_method in ('cash','card','bank_transfer','jazzcash','easypaisa')),
  receipt_storage_path text, created_by uuid not null references public.app_profiles(id), created_at timestamptz not null default now()
);
create index sales_returns_sale on public.sales_returns(sale_id, created_at desc);
create index expenses_branch_date on public.expenses(branch_id, created_at desc);

insert into public.permissions(code,label,description) values
 ('returns.manage','Process returns','Return eligible items and record refunds.'),
 ('expenses.view','View expenses','View branch expense records.'),('expenses.manage','Manage expenses','Record branch expenses.'),
 ('customers.credit.manage','Manage customer credit','Receive outstanding customer balance payments.')
on conflict (code) do nothing;
insert into public.role_permissions(role,permission_code)
select role_name::text, permission_code from (values
 ('admin','returns.manage'),('admin','expenses.view'),('admin','expenses.manage'),('admin','customers.credit.manage'),
 ('branch_manager','returns.manage'),('branch_manager','expenses.view'),('branch_manager','expenses.manage'),('branch_manager','customers.credit.manage'),
 ('accountant','returns.manage'),('accountant','expenses.view'),('accountant','expenses.manage'),('accountant','customers.credit.manage'),
 ('cashier','returns.manage'),('cashier','expenses.view'),('sales_manager','expenses.view')
) p(role_name,permission_code) on conflict do nothing;

alter table public.sales_returns enable row level security;
alter table public.sales_return_items enable row level security;
alter table public.customer_account_payments enable row level security;
alter table public.loyalty_transactions enable row level security;
alter table public.expenses enable row level security;
grant select on public.sales_returns,public.sales_return_items,public.customer_account_payments,public.loyalty_transactions,public.expenses to public;
grant insert on public.expenses to public;
create policy "Read returns in assigned branches" on public.sales_returns for select to public using (public.sellora_can_access_branch(branch_id));
create policy "Read returned items in assigned branches" on public.sales_return_items for select to public using (exists(select 1 from public.sales_returns r where r.id=return_id));
create policy "Read customer account payments in assigned branches" on public.customer_account_payments for select to public using (public.sellora_can_access_branch(branch_id));
create policy "Read loyalty transactions for visible customers" on public.loyalty_transactions for select to public using (exists(select 1 from public.customers c where c.id=customer_id and public.sellora_can_access_branch(c.branch_id)));
create policy "Read expenses with permission" on public.expenses for select to public using (public.sellora_can('expenses.view') and public.sellora_can_access_branch(branch_id));
create policy "Insert permitted branch expenses" on public.expenses for insert to public with check (public.sellora_can('expenses.manage') and created_by=(select auth.uid()) and public.sellora_can_access_branch(branch_id));

-- Each completed customer sale awards one loyalty point per 100 base-currency units.
create or replace function public.sellora_award_sale_loyalty() returns trigger language plpgsql security definer set search_path = '' as $$
declare earned integer;
begin
 if new.customer_id is not null then
   earned := floor(new.total / 100)::integer;
   if earned > 0 then
     update public.customers set loyalty_points=loyalty_points+earned, updated_at=now() where id=new.customer_id;
     insert into public.loyalty_transactions(customer_id,sale_id,points,reason) values(new.customer_id,new.id,earned,'Earned on sale');
   end if;
 end if;
 return new;
end $$;
create trigger sellora_sales_award_loyalty after insert on public.sales for each row execute procedure public.sellora_award_sale_loyalty();

-- Returns validate unreturned quantities and restore stock/refund in one transaction.
create or replace function public.sellora_process_return(p_sale_id uuid,p_items jsonb,p_reason text,p_refund_method text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid:=(select auth.uid()); sale_row public.sales%rowtype; sale_item public.sale_items%rowtype; row_item jsonb;
 return_id uuid:=gen_random_uuid(); qty numeric; available numeric; refund numeric:=0; line_refund numeric; stock_id uuid;
begin
  if not public.sellora_can('returns.manage') then raise exception 'You cannot process returns'; end if;
 select * into sale_row from public.sales where id=p_sale_id for update;
 if not found or not public.sellora_can_access_branch(sale_row.branch_id) then raise exception 'Sale not found in your assigned branches'; end if;
  if sale_row.status<>'completed' then raise exception 'This sale is not eligible for a return'; end if;
  if p_refund_method='store_credit' and sale_row.customer_id is null then raise exception 'Store-credit refunds need the original customer'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Enter a return reason'; end if;
  if p_refund_method not in ('cash','card','bank_transfer','jazzcash','easypaisa','store_credit') then raise exception 'Choose a supported refund method'; end if;
  if (select count(*) from jsonb_array_elements(p_items))<>(select count(distinct value->>'sale_item_id') from jsonb_array_elements(p_items)) then raise exception 'Select each sale line once and combine its return quantity'; end if;
 for row_item in select value from jsonb_array_elements(p_items) loop
   qty:=(row_item->>'quantity')::numeric;
   select * into sale_item from public.sale_items where id=(row_item->>'sale_item_id')::uuid and sale_id=p_sale_id;
   if not found or qty<=0 then raise exception 'A return item or quantity is invalid'; end if;
   select sale_item.quantity-coalesce(sum(ri.quantity),0) into available from public.sales_return_items ri join public.sales_returns r on r.id=ri.return_id where ri.sale_item_id=sale_item.id;
   if qty>available then raise exception 'Return quantity exceeds the amount sold'; end if;
   line_refund:=round((sale_item.line_total/sale_item.quantity)*qty,2); refund:=refund+line_refund;
 end loop;
 if refund<=0 then raise exception 'Select at least one item to return'; end if;
 insert into public.sales_returns(id,sale_id,branch_id,return_number,reason,refund_method,refund_total,created_by)
 values(return_id,p_sale_id,sale_row.branch_id,'RET-'||upper(substr(replace(return_id::text,'-',''),1,10)),trim(p_reason),p_refund_method,refund,actor);
 for row_item in select value from jsonb_array_elements(p_items) loop
   qty:=(row_item->>'quantity')::numeric;
   select * into sale_item from public.sale_items where id=(row_item->>'sale_item_id')::uuid;
   line_refund:=round((sale_item.line_total/sale_item.quantity)*qty,2);
   insert into public.sales_return_items(return_id,sale_item_id,product_id,variant_id,quantity,refund_amount) values(return_id,sale_item.id,sale_item.product_id,sale_item.variant_id,qty,line_refund);
   select id into stock_id from public.inventory where warehouse_id=sale_row.warehouse_id and product_id=sale_item.product_id and variant_id is not distinct from sale_item.variant_id for update;
   if stock_id is null then insert into public.inventory(warehouse_id,product_id,variant_id,quantity) values(sale_row.warehouse_id,sale_item.product_id,sale_item.variant_id,qty);
   else update public.inventory set quantity=quantity+qty,updated_at=now() where id=stock_id; end if;
   insert into public.inventory_movements(warehouse_id,product_id,variant_id,sale_id,quantity_delta,movement_type,created_by) values(sale_row.warehouse_id,sale_item.product_id,sale_item.variant_id,p_sale_id,qty,'return',actor);
 end loop;
 if p_refund_method='store_credit' and sale_row.customer_id is not null then
   update public.customers set store_credit_balance=store_credit_balance+refund,updated_at=now() where id=sale_row.customer_id;
 end if;
 if not exists(select 1 from public.sale_items si where si.sale_id=p_sale_id and si.quantity>coalesce((select sum(ri.quantity) from public.sales_return_items ri join public.sales_returns r on r.id=ri.return_id where ri.sale_item_id=si.id),0)) then
   update public.sales set status='refunded' where id=p_sale_id;
 end if;
 return return_id;
end $$;
revoke all on function public.sellora_process_return(uuid,jsonb,text,text) from public;
grant execute on function public.sellora_process_return(uuid,jsonb,text,text) to public;

-- Receives customer debt payments and updates the balance atomically.
create or replace function public.sellora_receive_customer_payment(p_customer_id uuid,p_amount numeric,p_method text,p_reference text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid:=(select auth.uid()); customer_row public.customers%rowtype; payment_id uuid:=gen_random_uuid();
begin
 if not public.sellora_can('customers.credit.manage') then raise exception 'You cannot receive customer credit payments'; end if;
 if p_amount<=0 or p_method not in ('cash','card','bank_transfer','jazzcash','easypaisa') then raise exception 'Enter a valid amount and payment method'; end if;
 select * into customer_row from public.customers where id=p_customer_id for update;
 if not found or not public.sellora_can_access_branch(customer_row.branch_id) then raise exception 'Customer not found in your assigned branches'; end if;
 if p_amount>customer_row.credit_balance then raise exception 'Payment cannot exceed the current outstanding balance'; end if;
 update public.customers set credit_balance=credit_balance-p_amount,updated_at=now() where id=p_customer_id;
 insert into public.customer_account_payments(id,customer_id,branch_id,amount,method,reference,received_by) values(payment_id,p_customer_id,customer_row.branch_id,p_amount,p_method,nullif(trim(p_reference),''),actor);
 return payment_id;
end $$;
revoke all on function public.sellora_receive_customer_payment(uuid,numeric,text,text) from public;
grant execute on function public.sellora_receive_customer_payment(uuid,numeric,text,text) to public;

-- From 202609270008_workforce_shifts_targets.sql
-- Phase 9: attendance shifts, cash-drawer closeouts, sales targets and commissions.
create table public.employee_shifts (
 id uuid primary key default gen_random_uuid(), branch_id uuid not null references public.branches(id), user_id uuid not null references public.app_profiles(id),
 opened_at timestamptz not null default now(), closed_at timestamptz, opening_cash numeric(14,2) not null default 0 check(opening_cash>=0),
 expected_cash numeric(14,2), actual_cash numeric(14,2), cash_difference numeric(14,2), note text
);
create unique index one_open_shift_per_user on public.employee_shifts(user_id) where closed_at is null;
create table public.sales_targets (
 id uuid primary key default gen_random_uuid(), branch_id uuid not null references public.branches(id), agent_id uuid not null references public.app_profiles(id),
 period_type text not null check(period_type in ('daily','weekly','monthly')), period_start date not null, target_amount numeric(14,2) not null check(target_amount>0),
 created_by uuid not null references public.app_profiles(id), created_at timestamptz not null default now(), unique(agent_id,period_type,period_start)
);
create table public.commission_rules (
 id uuid primary key default gen_random_uuid(), branch_id uuid not null references public.branches(id), name text not null,
 rate_percent numeric(7,4) not null check(rate_percent between 0 and 100), is_active boolean not null default true,
 created_by uuid not null references public.app_profiles(id), created_at timestamptz not null default now()
);
create table public.agent_commissions (
 id uuid primary key default gen_random_uuid(), sale_id uuid not null references public.sales(id), agent_id uuid not null references public.app_profiles(id),
 branch_id uuid not null references public.branches(id), rule_id uuid references public.commission_rules(id), sale_total numeric(14,2) not null,
 commission_amount numeric(14,2) not null, created_at timestamptz not null default now(), unique(sale_id)
);
insert into public.permissions(code,label,description) values
 ('shifts.manage','Manage shifts','Open and close own employee shifts.'),('targets.manage','Manage sales targets','Assign targets to branch sales agents.'),
 ('commissions.view','View commissions','View earned agent commissions.') on conflict(code) do nothing;
insert into public.role_permissions(role,permission_code) select role_name::text,permission_code from (values
 ('admin','shifts.manage'),('admin','targets.manage'),('admin','commissions.view'),('branch_manager','shifts.manage'),('branch_manager','targets.manage'),('branch_manager','commissions.view'),
 ('sales_manager','shifts.manage'),('sales_manager','targets.manage'),('sales_manager','commissions.view'),('sales_agent','shifts.manage'),('sales_agent','commissions.view'),('cashier','shifts.manage')
) p(role_name,permission_code) on conflict do nothing;
alter table public.employee_shifts enable row level security; alter table public.sales_targets enable row level security;
alter table public.commission_rules enable row level security; alter table public.agent_commissions enable row level security;
grant select on public.employee_shifts,public.sales_targets,public.commission_rules,public.agent_commissions to public;
create policy "Users view their branch shifts" on public.employee_shifts for select to public using (user_id=(select auth.uid()) or (public.sellora_can('reports.view') and public.sellora_can_access_branch(branch_id)));
create policy "Agents view own targets and managers view branch targets" on public.sales_targets for select to public using (
  public.sellora_can_access_branch(branch_id) and
  (agent_id=(select auth.uid()) or public.sellora_can('targets.manage') or public.sellora_can('reports.view'))
);
create policy "Managers view branch commission rules" on public.commission_rules for select to public using (public.sellora_can_access_branch(branch_id));
create policy "Agents see own commission or managers see branch" on public.agent_commissions for select to public using ((agent_id=(select auth.uid()) and public.sellora_can('commissions.view')) or (public.sellora_can('reports.view') and public.sellora_can_access_branch(branch_id)));

create or replace function public.sellora_open_shift(p_branch_id uuid,p_opening_cash numeric)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid()); new_id uuid:=gen_random_uuid();
begin
 if not public.sellora_can('shifts.manage') or not public.sellora_can_access_branch(p_branch_id) then raise exception 'You cannot open a shift in this branch'; end if;
 if p_opening_cash<0 then raise exception 'Opening cash cannot be negative'; end if;
 if exists(select 1 from public.employee_shifts where user_id=actor and closed_at is null) then raise exception 'Close your current shift before opening another'; end if;
 insert into public.employee_shifts(id,branch_id,user_id,opening_cash) values(new_id,p_branch_id,actor,p_opening_cash); return new_id;
end $$;
create or replace function public.sellora_close_shift(p_shift_id uuid,p_actual_cash numeric,p_note text default '')
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid()); shift_row public.employee_shifts%rowtype; cash_sales numeric;
begin
 select * into shift_row from public.employee_shifts where id=p_shift_id for update;
 if not found or (shift_row.user_id<>actor and not public.sellora_can('targets.manage')) then raise exception 'Shift not found or not authorized'; end if;
 if shift_row.closed_at is not null then raise exception 'This shift is already closed'; end if;
 if p_actual_cash<0 then raise exception 'Actual cash cannot be negative'; end if;
 select coalesce(sum(p.amount),0) into cash_sales from public.sales s join public.payments p on p.sale_id=s.id where s.cashier_id=shift_row.user_id and s.branch_id=shift_row.branch_id and s.created_at>=shift_row.opened_at and p.method='cash';
 update public.employee_shifts set closed_at=now(),expected_cash=shift_row.opening_cash+cash_sales,actual_cash=p_actual_cash,
 cash_difference=p_actual_cash-(shift_row.opening_cash+cash_sales),note=nullif(trim(p_note), '') where id=p_shift_id;
end $$;
revoke all on function public.sellora_open_shift(uuid,numeric) from public; grant execute on function public.sellora_open_shift(uuid,numeric) to public;
revoke all on function public.sellora_close_shift(uuid,numeric,text) from public; grant execute on function public.sellora_close_shift(uuid,numeric,text) to public;

create or replace function public.sellora_save_sales_target(p_branch_id uuid,p_agent_id uuid,p_period_type text,p_period_start date,p_target numeric)
returns uuid language plpgsql security definer set search_path='' as $$
declare target_id uuid;
begin
 if not public.sellora_can('targets.manage') or not public.sellora_can_access_branch(p_branch_id) then raise exception 'You cannot manage targets in this branch'; end if;
 if p_period_type not in ('daily','weekly','monthly') or p_target<=0 then raise exception 'Enter a valid period and target'; end if;
 if not exists(select 1 from public.app_profiles p where p.id=p_agent_id and p.role='sales_agent' and p.approval_status='approved' and (p.primary_branch_id=p_branch_id or exists(select 1 from public.user_branches ub where ub.user_id=p.id and ub.branch_id=p_branch_id))) then raise exception 'Choose an approved branch sales agent'; end if;
 insert into public.sales_targets(branch_id,agent_id,period_type,period_start,target_amount,created_by) values(p_branch_id,p_agent_id,p_period_type,p_period_start,p_target,(select auth.uid()))
 on conflict(agent_id,period_type,period_start) do update set target_amount=excluded.target_amount returning id into target_id; return target_id;
end $$;
revoke all on function public.sellora_save_sales_target(uuid,uuid,text,date,numeric) from public; grant execute on function public.sellora_save_sales_target(uuid,uuid,text,date,numeric) to public;

-- A branch can configure an active percentage rate; each sale snapshots its earned commission.
create or replace function public.sellora_record_commission() returns trigger language plpgsql security definer set search_path='' as $$
declare rule public.commission_rules%rowtype; amount numeric;
begin
 select * into rule from public.commission_rules where branch_id=new.branch_id and is_active order by created_at desc limit 1;
 if found then amount:=round(new.total*rule.rate_percent/100,2); insert into public.agent_commissions(sale_id,agent_id,branch_id,rule_id,sale_total,commission_amount) values(new.id,new.sales_agent_id,new.branch_id,rule.id,new.total,amount); end if;
 return new;
end $$;
create trigger sellora_sales_commission after insert on public.sales for each row execute procedure public.sellora_record_commission();

create or replace function public.sellora_save_commission_rule(p_branch_id uuid,p_name text,p_rate numeric)
returns uuid language plpgsql security definer set search_path='' as $$
declare rule_id uuid;
begin
 if not public.sellora_can('targets.manage') or not public.sellora_can_access_branch(p_branch_id) then raise exception 'You cannot change commission rules in this branch'; end if;
 if p_rate<0 or p_rate>100 then raise exception 'Commission percentage must be between zero and one hundred'; end if;
 update public.commission_rules set is_active=false where branch_id=p_branch_id and is_active;
 insert into public.commission_rules(branch_id,name,rate_percent,is_active,created_by) values(p_branch_id,trim(p_name),p_rate,true,(select auth.uid())) returning id into rule_id;
 return rule_id;
end $$;
revoke all on function public.sellora_save_commission_rule(uuid,text,numeric) from public; grant execute on function public.sellora_save_commission_rule(uuid,text,numeric) to public;

-- From 202609270009_approvals_notifications_reports_audit.sql
-- Phase 10: user-visible approvals, notifications, operational audit and reports.
create table public.approvals (
 id uuid primary key default gen_random_uuid(), branch_id uuid references public.branches(id), requester_id uuid not null references public.app_profiles(id),
 request_type text not null check(request_type in ('role_change','discount','refund','stock_adjustment','stock_transfer','purchase','expense','other')),
 title text not null, details text not null default '', status text not null default 'pending' check(status in ('pending','approved','rejected')),
 reviewed_by uuid references public.app_profiles(id), review_note text, created_at timestamptz not null default now(), reviewed_at timestamptz
);
create table public.notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_profiles(id) on delete cascade,
 category text not null, title text not null, body text not null default '', read_at timestamptz, created_at timestamptz not null default now()
);
create table public.audit_logs (
 id uuid primary key default gen_random_uuid(), branch_id uuid references public.branches(id), actor_id uuid references public.app_profiles(id),
 action text not null, entity text not null, entity_id uuid, summary text not null default '', created_at timestamptz not null default now()
);
create index approvals_pending_created on public.approvals(status,created_at desc);
create index notifications_user_created on public.notifications(user_id,created_at desc);
create index audit_logs_branch_created on public.audit_logs(branch_id,created_at desc);
insert into public.permissions(code,label,description) values
 ('approvals.view','View approvals','Review branch approval requests.'),('approvals.request','Request approval','Submit an operational approval request.'),('notifications.view','View notifications','Read and dismiss personal notifications.'),('audit.view','View audit log','Review authorized branch activity.') on conflict(code) do nothing;
insert into public.role_permissions(role,permission_code) select role_name::text,permission_code from (values
 ('admin','approvals.view'),('admin','approvals.request'),('admin','notifications.view'),('admin','audit.view'),
 ('branch_manager','approvals.view'),('branch_manager','approvals.request'),('branch_manager','notifications.view'),('branch_manager','audit.view'),
 ('sales_manager','approvals.view'),('sales_manager','approvals.request'),('sales_manager','notifications.view'),('sales_manager','audit.view'),
 ('sales_agent','approvals.request'),('sales_agent','notifications.view'),('cashier','approvals.request'),('cashier','notifications.view'),
 ('inventory_manager','approvals.view'),('inventory_manager','approvals.request'),('inventory_manager','notifications.view'),('accountant','approvals.view'),('accountant','approvals.request'),('accountant','notifications.view'),('accountant','audit.view')
) p(role_name,permission_code) on conflict do nothing;
alter table public.approvals enable row level security; alter table public.notifications enable row level security; alter table public.audit_logs enable row level security;
grant select on public.approvals,public.notifications,public.audit_logs to public;
grant insert on public.approvals to public;
grant update(read_at) on public.notifications to public;
create policy "Requesters and reviewers read approvals" on public.approvals for select to public using ((requester_id=(select auth.uid()) and public.sellora_can('approvals.request')) or (public.sellora_can('approvals.view') and (branch_id is null or public.sellora_can_access_branch(branch_id))));
create policy "Users create approval requests" on public.approvals for insert to public with check (requester_id=(select auth.uid()) and status='pending' and public.sellora_can('approvals.request') and (branch_id is null or public.sellora_can_access_branch(branch_id)));
create policy "Users read own notifications" on public.notifications for select to public using(user_id=(select auth.uid()) and public.sellora_can('notifications.view'));
create policy "Users dismiss own notifications" on public.notifications for update to public using(user_id=(select auth.uid()) and public.sellora_can('notifications.view')) with check(user_id=(select auth.uid()));
create policy "Authorized staff read audit events" on public.audit_logs for select to public using(public.sellora_can('audit.view') and (branch_id is null or public.sellora_can_access_branch(branch_id)));

create or replace function public.sellora_review_approval(p_id uuid,p_status text,p_note text default '') returns void language plpgsql security definer set search_path='' as $$
declare approval_row public.approvals%rowtype;
begin
 if not public.sellora_can('approvals.view') or p_status not in ('approved','rejected') then raise exception 'You cannot review this approval'; end if;
 select * into approval_row from public.approvals where id=p_id for update;
 if not found or approval_row.status<>'pending' then raise exception 'This approval is no longer pending'; end if;
 if approval_row.branch_id is not null and not public.sellora_can_access_branch(approval_row.branch_id) then raise exception 'Approval is outside your branch access'; end if;
 update public.approvals set status=p_status,reviewed_by=(select auth.uid()),review_note=nullif(trim(p_note),''),reviewed_at=now() where id=p_id;
 insert into public.notifications(user_id,category,title,body) values(approval_row.requester_id,'approvals','Approval '||p_status,approval_row.title||coalesce(': '||nullif(trim(p_note),''),''));
 insert into public.audit_logs(branch_id,actor_id,action,entity,entity_id,summary) values(approval_row.branch_id,(select auth.uid()),'approval_'||p_status,'approval',p_id,approval_row.title);
end $$;
revoke all on function public.sellora_review_approval(uuid,text,text) from public; grant execute on function public.sellora_review_approval(uuid,text,text) to public;

create or replace function public.sellora_audit_business_event() returns trigger language plpgsql security definer set search_path='' as $$
declare branch uuid; entity_key uuid; action_name text; summary_text text;
begin
 if tg_table_name='sales' then branch:=new.branch_id; entity_key:=new.id; action_name:='sale_completed'; summary_text:='Receipt '||new.receipt_number||' total '||new.total;
 elsif tg_table_name='sales_returns' then branch:=new.branch_id; entity_key:=new.id; action_name:='return_processed'; summary_text:='Return '||new.return_number||' total '||new.refund_total;
 elsif tg_table_name='expenses' then branch:=new.branch_id; entity_key:=new.id; action_name:='expense_recorded'; summary_text:=new.category||' total '||new.amount;
 else return new; end if;
 insert into public.audit_logs(branch_id,actor_id,action,entity,entity_id,summary) values(branch,auth.uid(),action_name,tg_table_name,entity_key,summary_text);
 return new;
end $$;
create trigger sellora_audit_sales after insert on public.sales for each row execute procedure public.sellora_audit_business_event();
create trigger sellora_audit_returns after insert on public.sales_returns for each row execute procedure public.sellora_audit_business_event();
create trigger sellora_audit_expenses after insert on public.expenses for each row execute procedure public.sellora_audit_business_event();

create or replace function public.sellora_notify_profile_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
   insert into public.notifications(user_id,category,title,body) select p.id,'approvals','New account awaiting approval',new.full_name||' requested access' from public.app_profiles p where p.role='admin' and p.approval_status='approved';
 elsif new.approval_status is distinct from old.approval_status then
   insert into public.notifications(user_id,category,title,body) values(new.id,'account','Account access updated','Your account is now '||new.approval_status||'.');
 end if;
 return new;
end $$;
create trigger sellora_profile_notification after insert or update on public.app_profiles for each row execute procedure public.sellora_notify_profile_change();

-- From 202609270010_offline_sync.sql
-- Phase 11: idempotent server acceptance for locally queued offline sales.
create table public.synced_offline_sales (
 user_id uuid not null references public.app_profiles(id), client_sale_id uuid not null, sale_id uuid not null references public.sales(id),
 created_at timestamptz not null default now(), primary key(user_id,client_sale_id), unique(sale_id)
);
alter table public.synced_offline_sales enable row level security;
grant select on public.synced_offline_sales to public;
create policy "Users see own synchronized offline sales" on public.synced_offline_sales for select to public using(user_id=(select auth.uid()));

-- The advisory lock and mapping ensure a retry can never create the same local sale twice.
create or replace function public.sellora_sync_offline_sale(p_client_sale_id uuid,p_branch_id uuid,p_warehouse_id uuid,p_customer_id uuid,p_agent_id uuid,p_device_id text,p_items jsonb,p_payments jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid()); prior_sale uuid; created_sale uuid;
begin
 if actor is null then raise exception 'Sign in before synchronizing sales'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||':'||p_client_sale_id::text,0));
 select sale_id into prior_sale from public.synced_offline_sales where user_id=actor and client_sale_id=p_client_sale_id;
 if prior_sale is not null then return prior_sale; end if;
 created_sale:=public.sellora_complete_sale(p_branch_id,p_warehouse_id,p_customer_id,p_agent_id,p_device_id,p_items,p_payments);
 insert into public.synced_offline_sales(user_id,client_sale_id,sale_id) values(actor,p_client_sale_id,created_sale);
 return created_sale;
end $$;
revoke all on function public.sellora_sync_offline_sale(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb) from public;
grant execute on function public.sellora_sync_offline_sale(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb) to public;

-- From 202609270011_backup_export.sql
-- Phase 12: owner-only point-in-time JSON export without exposing service credentials.
create or replace function public.sellora_export_business_backup()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=(select auth.uid());
begin
 if actor is null or not public.sellora_is_admin() then raise exception 'Only an approved administrator can export a business backup'; end if;
 return jsonb_build_object(
  'schema_version',1,'exported_at',now(),'business_currency',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.business_currency x),
  'branches',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.branches x),
  'warehouses',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.warehouses x),
  'profiles',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.app_profiles x),
  'user_branches',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.user_branches x),
  'categories',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.categories x),
  'brands',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.brands x),
  'products',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.products x),
  'product_variants',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.product_variants x),
  'inventory',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.inventory x),
  'inventory_movements',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.inventory_movements x),
  'stock_adjustments',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.stock_adjustments x),
  'customers',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.customers x),
  'sales',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.sales x),
  'sale_items',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.sale_items x),
  'payments',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.payments x),
  'returns',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.sales_returns x),
  'return_items',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.sales_return_items x),
  'customer_account_payments',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.customer_account_payments x),
  'loyalty_transactions',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.loyalty_transactions x),
  'expenses',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.expenses x),
  'suppliers',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.suppliers x),
  'purchase_orders',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.purchase_orders x),
  'purchase_order_items',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.purchase_order_items x),
  'goods_received_notes',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.goods_received_notes x),
  'goods_received_note_items',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.goods_received_note_items x),
  'stock_transfers',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.stock_transfers x),
  'stock_transfer_items',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.stock_transfer_items x),
  'employee_shifts',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.employee_shifts x),
  'sales_targets',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.sales_targets x),
  'agent_commissions',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.agent_commissions x),
  'approvals',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.approvals x),
  'audit_logs',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.audit_logs x),
  'exchange_rates',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from public.exchange_rates x)
 );
end $$;
revoke all on function public.sellora_export_business_backup() from public;
grant execute on function public.sellora_export_business_backup() to public;

-- From 202609270012_phase_completion.sql
-- Completion work: customer loyalty redemption, private expense receipts and drawer entries.
alter table public.expenses add column if not exists receipt_storage_path text;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('expenses','expenses',false,26214400,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=26214400,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
create policy "Assigned staff read expense receipts" on storage.objects for select to public
 using(bucket_id='expenses' and public.sellora_can('expenses.view') and public.sellora_can_access_branch(((storage.foldername(name))[1])::uuid));
create policy "Expense managers upload receipts" on storage.objects for insert to public
 with check(bucket_id='expenses' and public.sellora_can('expenses.manage') and public.sellora_can_access_branch(((storage.foldername(name))[1])::uuid));
create policy "Expense managers remove receipts" on storage.objects for delete to public
 using(bucket_id='expenses' and public.sellora_can('expenses.manage') and public.sellora_can_access_branch(((storage.foldername(name))[1])::uuid));

create or replace function public.sellora_redeem_loyalty(p_customer_id uuid,p_points integer)
returns numeric language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid()); customer_row public.customers%rowtype; credit numeric;
begin
 if not public.sellora_can('customers.manage') then raise exception 'You cannot redeem customer rewards'; end if;
 if p_points<100 or p_points%100<>0 then raise exception 'Redeem points in multiples of 100'; end if;
 select * into customer_row from public.customers where id=p_customer_id for update;
 if not found or not public.sellora_can_access_branch(customer_row.branch_id) then raise exception 'Customer not found in your assigned branches'; end if;
 if customer_row.loyalty_points<p_points then raise exception 'Customer does not have enough loyalty points'; end if;
 credit:=p_points/100.0;
 update public.customers set loyalty_points=loyalty_points-p_points,store_credit_balance=store_credit_balance+credit,updated_at=now() where id=p_customer_id;
 insert into public.loyalty_transactions(customer_id,points,reason) values(p_customer_id,-p_points,'Redeemed for '||credit||' store credit');
 return credit;
end $$;
revoke all on function public.sellora_redeem_loyalty(uuid,integer) from public;
grant execute on function public.sellora_redeem_loyalty(uuid,integer) to public;

create table public.cash_drawer_entries(
 id uuid primary key default gen_random_uuid(),shift_id uuid not null references public.employee_shifts(id),entry_type text not null check(entry_type in ('cash_in','cash_out')),
 amount numeric(14,2) not null check(amount>0),reason text not null,created_by uuid not null references public.app_profiles(id),created_at timestamptz not null default now()
);
alter table public.cash_drawer_entries enable row level security;
grant select on public.cash_drawer_entries to public;
create policy "Staff view their drawer entries" on public.cash_drawer_entries for select to public using(exists(select 1 from public.employee_shifts s where s.id=shift_id and (s.user_id=(select auth.uid()) or (public.sellora_can('reports.view') and public.sellora_can_access_branch(s.branch_id)))));
create or replace function public.sellora_record_cash_drawer_entry(p_shift_id uuid,p_type text,p_amount numeric,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid()); shift_row public.employee_shifts%rowtype; entry_id uuid:=gen_random_uuid();
begin
 select * into shift_row from public.employee_shifts where id=p_shift_id for update;
 if not found or shift_row.user_id<>actor or shift_row.closed_at is not null or not public.sellora_can('shifts.manage') then raise exception 'An open shift that belongs to you is required'; end if;
 if p_type not in ('cash_in','cash_out') or p_amount<=0 or length(trim(coalesce(p_reason,'')))<2 then raise exception 'Enter an amount and reason'; end if;
 insert into public.cash_drawer_entries(id,shift_id,entry_type,amount,reason,created_by) values(entry_id,p_shift_id,p_type,p_amount,trim(p_reason),actor); return entry_id;
end $$;
revoke all on function public.sellora_record_cash_drawer_entry(uuid,text,numeric,text) from public;
grant execute on function public.sellora_record_cash_drawer_entry(uuid,text,numeric,text) to public;

create or replace function public.sellora_close_shift(p_shift_id uuid,p_actual_cash numeric,p_note text default '')
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid()); shift_row public.employee_shifts%rowtype; cash_sales numeric; cash_in numeric; cash_out numeric;
begin
 select * into shift_row from public.employee_shifts where id=p_shift_id for update;
 if not found or (shift_row.user_id<>actor and not public.sellora_can('targets.manage')) then raise exception 'Shift not found or not authorized'; end if;
 if shift_row.closed_at is not null then raise exception 'This shift is already closed'; end if;
 if p_actual_cash<0 then raise exception 'Actual cash cannot be negative'; end if;
 select coalesce(sum(p.amount),0) into cash_sales from public.sales s join public.payments p on p.sale_id=s.id where s.cashier_id=shift_row.user_id and s.branch_id=shift_row.branch_id and s.created_at>=shift_row.opened_at and p.method='cash';
 select coalesce(sum(amount) filter(where entry_type='cash_in'),0),coalesce(sum(amount) filter(where entry_type='cash_out'),0) into cash_in,cash_out from public.cash_drawer_entries where shift_id=p_shift_id;
 update public.employee_shifts set closed_at=now(),expected_cash=shift_row.opening_cash+cash_sales+cash_in-cash_out,actual_cash=p_actual_cash,
 cash_difference=p_actual_cash-(shift_row.opening_cash+cash_sales+cash_in-cash_out),note=nullif(trim(p_note), '') where id=p_shift_id;
end $$;
revoke all on function public.sellora_close_shift(uuid,numeric,text) from public;
grant execute on function public.sellora_close_shift(uuid,numeric,text) to public;

-- Route supported operational status updates to in-app notifications and audit history.
create or replace function public.sellora_audit_transfer_status() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status is distinct from old.status then
   insert into public.audit_logs(branch_id,actor_id,action,entity,entity_id,summary)
    values(new.from_branch_id,auth.uid(),'transfer_'||new.status,'stock_transfer',new.id,new.transfer_number);
   if new.status in ('approved','rejected','dispatched','received') then
     insert into public.notifications(user_id,category,title,body) values(new.created_by,'inventory','Transfer '||new.status,new.transfer_number||' was '||new.status||'.');
   end if;
 end if;
 return new;
end $$;
create trigger sellora_stock_transfer_notifications after update of status on public.stock_transfers for each row execute procedure public.sellora_audit_transfer_status();

create or replace function public.sellora_audit_drawer_entry() returns trigger language plpgsql security definer set search_path='' as $$
declare branch uuid;
begin
 select branch_id into branch from public.employee_shifts where id=new.shift_id;
 insert into public.audit_logs(branch_id,actor_id,action,entity,entity_id,summary)
 values(branch,new.created_by,new.entry_type,'cash_drawer_entry',new.id,new.reason||' · '||new.amount);
 return new;
end $$;
create trigger sellora_cash_drawer_audit after insert on public.cash_drawer_entries for each row execute procedure public.sellora_audit_drawer_entry();

create or replace function public.sellora_audit_credit_payment() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.audit_logs(branch_id,actor_id,action,entity,entity_id,summary)
 values(new.branch_id,new.received_by,'customer_credit_payment','customer_account_payment',new.id,'Amount '||new.amount||' via '||new.method);
 return new;
end $$;
create trigger sellora_credit_payment_audit after insert on public.customer_account_payments for each row execute procedure public.sellora_audit_credit_payment();

-- Notify branch reviewers as soon as a staff member submits a request.
create or replace function public.sellora_notify_approval_reviewers() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.notifications(user_id,category,title,body)
 select distinct p.id,'approvals','Approval needs review',new.title||' · '||new.request_type
 from public.app_profiles p
 where p.approval_status='approved'
   and p.id<>new.requester_id
   and exists(select 1 from public.role_permissions rp where rp.role=p.role and rp.permission_code='approvals.view')
   and (new.branch_id is null or p.role='admin' or p.primary_branch_id=new.branch_id
     or exists(select 1 from public.user_branches ub where ub.user_id=p.id and ub.branch_id=new.branch_id));
 insert into public.audit_logs(branch_id,actor_id,action,entity,entity_id,summary)
 values(new.branch_id,new.requester_id,'approval_requested','approval',new.id,new.title);
 return new;
end $$;
create trigger sellora_approval_request_notifications after insert on public.approvals for each row execute procedure public.sellora_notify_approval_reviewers();

-- From 202609270013_copilot_rate_limit.sql
-- Limit public Copilot usage per account to control abuse and provider cost.
create table public.ai_copilot_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.app_profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index ai_copilot_usage_user_time on public.ai_copilot_usage(user_id, created_at desc);
alter table public.ai_copilot_usage enable row level security;

create or replace function public.sellora_claim_ai_request()
returns boolean language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid()); request_count integer;
begin
  if actor is null or not public.sellora_can('reports.view') and not public.sellora_can('sales.view_own') then
    return false;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':copilot',0));
  delete from public.ai_copilot_usage where user_id=actor and created_at<now()-interval '1 hour';
  select count(*) into request_count from public.ai_copilot_usage where user_id=actor and created_at>=now()-interval '1 hour';
  if request_count>=20 then return false; end if;
  insert into public.ai_copilot_usage(user_id) values(actor);
  return true;
end $$;
revoke all on function public.sellora_claim_ai_request() from public;
grant execute on function public.sellora_claim_ai_request() to public;
