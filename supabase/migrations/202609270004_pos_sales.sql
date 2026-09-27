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
  assigned_sales_agent_id uuid references public.profiles(id) on delete set null,
  created_by uuid not null references public.profiles(id),
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
  user_id uuid not null references public.profiles(id),
  sales_agent_id uuid not null references public.profiles(id),
  cashier_id uuid not null references public.profiles(id),
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
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

insert into public.permissions(code, label, description) values
  ('customers.view', 'View customers', 'Search customer records.'),
  ('customers.manage', 'Manage customers', 'Create and edit customer records.')
on conflict (code) do nothing;
insert into public.role_permissions(role, permission_code)
select role_name::public.sellora_role, permission_code
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
grant select, insert, update on public.customers to authenticated;
grant select on public.sales, public.sale_items, public.payments, public.inventory_movements to authenticated;

create policy "Users read customers in assigned branches" on public.customers for select to authenticated
  using (public.sellora_can('customers.view') and public.sellora_can_access_branch(branch_id));
create policy "Customer managers create branch customers" on public.customers for insert to authenticated
  with check (public.sellora_can('customers.manage') and created_by = (select auth.uid()) and public.sellora_can_access_branch(branch_id));
create policy "Customer managers update branch customers" on public.customers for update to authenticated
  using (public.sellora_can('customers.manage') and public.sellora_can_access_branch(branch_id))
  with check (public.sellora_can('customers.manage') and public.sellora_can_access_branch(branch_id));
create policy "Users read sales in allowed scope" on public.sales for select to authenticated
  using ((user_id = (select auth.uid()) and public.sellora_can('sales.view_own'))
    or (public.sellora_can('sales.view_branch') and public.sellora_can_access_branch(branch_id)));
create policy "Users read sale items in allowed scope" on public.sale_items for select to authenticated
  using (exists (select 1 from public.sales s where s.id = sale_id));
create policy "Users read payments in allowed scope" on public.payments for select to authenticated
  using (exists (select 1 from public.sales s where s.id = sale_id));
create policy "Users read inventory movements in assigned branches" on public.inventory_movements for select to authenticated
  using (exists (select 1 from public.warehouses w where w.id = warehouse_id and public.sellora_can_access_branch(w.branch_id)));

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('customers', 'customers', false, 26214400, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 26214400,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
create policy "Branch users read customer photos" on storage.objects for select to authenticated
  using (bucket_id = 'customers' and public.sellora_can_access_branch(((storage.foldername(name))[1])::uuid));
create policy "Customer managers upload branch photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'customers' and public.sellora_can('customers.manage')
    and public.sellora_can_access_branch(((storage.foldername(name))[1])::uuid));
create policy "Customer managers delete branch photos" on storage.objects for delete to authenticated
  using (bucket_id = 'customers' and public.sellora_can('customers.manage')
    and public.sellora_can_access_branch(((storage.foldername(name))[1])::uuid));

-- Lets a cashier pick an approved agent without exposing the full profile table.
create or replace function public.sellora_list_branch_sales_agents(target_branch uuid)
returns table(id uuid, full_name text) language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name from public.profiles p
  where p.role = 'sales_agent' and p.approval_status = 'approved'
    and public.sellora_can_access_branch(target_branch)
    and (p.primary_branch_id = target_branch or exists (
      select 1 from public.user_branches ub where ub.user_id = p.id and ub.branch_id = target_branch
    ))
  order by p.full_name;
$$;
revoke all on function public.sellora_list_branch_sales_agents(uuid) from public;
grant execute on function public.sellora_list_branch_sales_agents(uuid) to authenticated;

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
  if not exists (select 1 from public.profiles p where p.id = p_sales_agent_id and p.role = 'sales_agent' and p.approval_status = 'approved'
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
grant execute on function public.sellora_complete_sale(uuid, uuid, uuid, uuid, text, jsonb, jsonb) to authenticated;
