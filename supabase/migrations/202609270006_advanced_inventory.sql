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
  created_by uuid not null references public.profiles(id),
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
  created_by uuid not null references public.profiles(id),
  approved_by uuid references public.profiles(id),
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
  ordered_by uuid not null references public.profiles(id),
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
  received_by uuid not null references public.profiles(id),
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
grant select, insert, update on public.suppliers to authenticated;
grant select on public.stock_transfers, public.stock_transfer_items, public.purchase_orders,
  public.purchase_order_items, public.goods_received_notes, public.goods_received_note_items to authenticated;

create policy "Branch users read suppliers" on public.suppliers for select to authenticated
  using (public.sellora_can('inventory.view') and public.sellora_can_access_branch(branch_id));
create policy "Inventory managers manage suppliers" on public.suppliers for all to authenticated
  using (public.sellora_can('inventory.manage') and public.sellora_can_access_branch(branch_id))
  with check (public.sellora_can('inventory.manage') and public.sellora_can_access_branch(branch_id)
    and created_by = (select auth.uid()));
create policy "Branch users read transfers" on public.stock_transfers for select to authenticated
  using (public.sellora_can_access_branch(from_branch_id) or public.sellora_can_access_branch(to_branch_id));
create policy "Users read transfer lines" on public.stock_transfer_items for select to authenticated
  using (exists (select 1 from public.stock_transfers t where t.id = transfer_id));
create policy "Branch users read purchase orders" on public.purchase_orders for select to authenticated
  using (public.sellora_can_access_branch(branch_id));
create policy "Users read purchase order lines" on public.purchase_order_items for select to authenticated
  using (exists (select 1 from public.purchase_orders po where po.id = purchase_order_id));
create policy "Branch users read goods receipts" on public.goods_received_notes for select to authenticated
  using (exists (select 1 from public.purchase_orders po where po.id = purchase_order_id and public.sellora_can_access_branch(po.branch_id)));
create policy "Users read goods receipt lines" on public.goods_received_note_items for select to authenticated
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
grant execute on function public.sellora_create_stock_transfer(uuid, uuid, jsonb, text) to authenticated;

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
grant execute on function public.sellora_update_stock_transfer(uuid, text) to authenticated;

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
grant execute on function public.sellora_create_purchase_order(uuid, uuid, uuid, jsonb, text) to authenticated;

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
grant execute on function public.sellora_receive_purchase(uuid, jsonb, text) to authenticated;

-- Updates a user's primary and allowed branches together for the admin user screen.
create or replace function public.sellora_assign_user_branches(
  target_user uuid, target_primary uuid, target_branches uuid[]
) returns void language plpgsql security definer set search_path = '' as $$
declare
  branch_count integer;
begin
  if not public.sellora_is_admin() then raise exception 'Only an approved administrator can assign branches'; end if;
  if not exists (select 1 from public.profiles where id = target_user) then raise exception 'User profile was not found'; end if;
  if target_primary is not null and not (target_primary = any(coalesce(target_branches, array[]::uuid[]))) then
    raise exception 'The primary branch must be included in the allowed branches';
  end if;
  select count(*) into branch_count from public.branches
    where id = any(coalesce(target_branches, array[]::uuid[])) and is_active;
  if branch_count <> coalesce(array_length(target_branches, 1), 0) then raise exception 'Choose active branches only'; end if;
  update public.profiles set primary_branch_id = target_primary where id = target_user;
  delete from public.user_branches where user_id = target_user;
  insert into public.user_branches(user_id, branch_id, is_primary)
    select target_user, branch_id, branch_id = target_primary
    from unnest(coalesce(target_branches, array[]::uuid[])) as branch_id;
end;
$$;
revoke all on function public.sellora_assign_user_branches(uuid, uuid, uuid[]) from public;
grant execute on function public.sellora_assign_user_branches(uuid, uuid, uuid[]) to authenticated;

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
    select 1 from public.profiles p where p.id = p_manager_id and p.approval_status = 'approved'
      and (p.primary_branch_id = p_branch_id or exists (select 1 from public.user_branches ub where ub.user_id = p.id and ub.branch_id = p_branch_id))
  ) then raise exception 'The warehouse manager must be approved and assigned to this branch'; end if;
  if p_is_primary then update public.warehouses set is_primary = false where branch_id = p_branch_id; end if;
  insert into public.warehouses(id, branch_id, name, address, manager_id, is_primary)
    values (warehouse_id, p_branch_id, trim(p_name), nullif(trim(coalesce(p_address, '')), ''), p_manager_id, p_is_primary);
  return warehouse_id;
end;
$$;
revoke all on function public.sellora_create_warehouse(uuid, text, text, uuid, boolean) from public;
grant execute on function public.sellora_create_warehouse(uuid, text, text, uuid, boolean) to authenticated;
