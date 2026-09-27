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

alter table public.profiles add column primary_branch_id uuid references public.branches(id) on delete set null;

create table public.user_branches (
  user_id uuid not null references public.profiles(id) on delete cascade,
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
  manager_id uuid references public.profiles(id) on delete set null,
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
  created_by uuid references public.profiles(id) on delete set null,
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
    from public.profiles p
    left join public.user_branches ub on ub.user_id = p.id and ub.branch_id = target_branch
    where p.id = (select auth.uid())
      and p.approval_status = 'approved'
      and (p.primary_branch_id = target_branch or ub.branch_id is not null)
  );
$$;
revoke all on function public.sellora_can_access_branch(uuid) from public;
grant execute on function public.sellora_can_access_branch(uuid) to authenticated;

create table public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id),
  product_id uuid not null references public.products(id),
  variant_id uuid references public.product_variants(id),
  quantity_delta numeric(14, 3) not null check (quantity_delta <> 0),
  reason text not null check (length(trim(reason)) >= 3),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

-- Branch assignment is protected like role assignment, never by a client-only check.
grant update (primary_branch_id) on public.profiles to authenticated;
grant insert, update, delete on public.user_branches to authenticated;
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
select role_name::public.sellora_role, permission_code
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
  public.brands, public.products, public.product_variants, public.inventory, public.stock_adjustments to authenticated;
grant insert, update, delete on public.branches, public.warehouses, public.categories, public.brands,
  public.products, public.product_variants to authenticated;

create policy "Approved users can read branches" on public.branches for select to authenticated
  using (public.sellora_can_access_branch(id));
create policy "Admins manage branches" on public.branches for all to authenticated
  using (public.sellora_is_admin()) with check (public.sellora_is_admin());
create policy "Users can read their branch assignments" on public.user_branches for select to authenticated
  using (user_id = (select auth.uid()) or public.sellora_is_admin());
create policy "Admins manage user branch assignments" on public.user_branches for all to authenticated
  using (public.sellora_is_admin()) with check (public.sellora_is_admin());
create policy "Approved users can read warehouses" on public.warehouses for select to authenticated
  using (public.sellora_can_access_branch(branch_id));
create policy "Admins manage warehouses" on public.warehouses for all to authenticated
  using (public.sellora_is_admin()) with check (public.sellora_is_admin());

create policy "Approved users can read categories" on public.categories for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.approval_status = 'approved'));
create policy "Product managers manage categories" on public.categories for all to authenticated
  using (public.sellora_can('products.manage')) with check (public.sellora_can('products.manage'));
create policy "Approved users can read brands" on public.brands for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.approval_status = 'approved'));
create policy "Product managers manage brands" on public.brands for all to authenticated
  using (public.sellora_can('products.manage')) with check (public.sellora_can('products.manage'));
create policy "Authorized users can read products" on public.products for select to authenticated
  using (public.sellora_can('products.view') or public.sellora_can('products.manage') or public.sellora_can('sales.create'));
create policy "Product managers manage products" on public.products for all to authenticated
  using (public.sellora_can('products.manage')) with check (public.sellora_can('products.manage'));
create policy "Authorized users can read product variants" on public.product_variants for select to authenticated
  using (public.sellora_can('products.view') or public.sellora_can('products.manage') or public.sellora_can('sales.create'));
create policy "Product managers manage product variants" on public.product_variants for all to authenticated
  using (public.sellora_can('products.manage')) with check (public.sellora_can('products.manage'));
create policy "Authorized users can read inventory" on public.inventory for select to authenticated
  using ((public.sellora_can('inventory.view') or public.sellora_can('inventory.manage') or public.sellora_can('sales.create'))
    and exists (select 1 from public.warehouses w where w.id = warehouse_id and public.sellora_can_access_branch(w.branch_id)));
create policy "Inventory managers update inventory" on public.inventory for update to authenticated
  using (public.sellora_can('inventory.manage')) with check (public.sellora_can('inventory.manage'));
create policy "Inventory managers create inventory" on public.inventory for insert to authenticated
  with check (public.sellora_can('inventory.manage'));
create policy "Users can read their stock adjustments" on public.stock_adjustments for select to authenticated
  using (created_by = (select auth.uid()) or public.sellora_can('inventory.manage'));
create policy "Inventory managers create stock adjustments" on public.stock_adjustments for insert to authenticated
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
grant execute on function public.sellora_adjust_stock(uuid, uuid, uuid, numeric, text) to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('products', 'products', false, 26214400, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 26214400,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
create policy "Approved users can read product images" on storage.objects for select to authenticated
  using (bucket_id = 'products' and public.sellora_can('products.view'));
create policy "Product managers upload product images" on storage.objects for insert to authenticated
  with check (bucket_id = 'products' and public.sellora_can('products.manage'));
create policy "Product managers update product images" on storage.objects for update to authenticated
  using (bucket_id = 'products' and public.sellora_can('products.manage'))
  with check (bucket_id = 'products' and public.sellora_can('products.manage'));
create policy "Product managers delete product images" on storage.objects for delete to authenticated
  using (bucket_id = 'products' and public.sellora_can('products.manage'));
