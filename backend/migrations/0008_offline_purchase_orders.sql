-- Idempotent server-side replay for purchase orders created while offline.
-- The client UUID is the database UUID, so retrying a request cannot create a duplicate.
create or replace function public.sellora_create_purchase_order_with_id(
  p_client_order_id uuid,
  p_branch_id uuid,
  p_warehouse_id uuid,
  p_supplier_id uuid,
  p_items jsonb,
  p_note text default ''
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  order_number_value text := 'PO-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(p_client_order_id::text, '-', ''), 1, 8));
  item jsonb;
  quantity_value numeric;
  cost_value numeric;
  total_value numeric := 0;
  existing_order public.purchase_orders%rowtype;
  existing_items jsonb;
  requested_items jsonb;
  inserted_count integer;
begin
  if p_client_order_id is null then raise exception 'Purchase order ID is required'; end if;
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

  select * into existing_order from public.purchase_orders where id = p_client_order_id for update;
  if found then
    if existing_order.ordered_by <> actor_id or existing_order.branch_id <> p_branch_id
      or existing_order.warehouse_id <> p_warehouse_id or existing_order.supplier_id <> p_supplier_id then
      raise exception 'Purchase order ID was already used for a different request';
    end if;
    select coalesce(jsonb_agg(jsonb_build_array(product_id, variant_id, ordered_quantity, unit_cost)
      order by product_id, coalesce(variant_id::text, ''), ordered_quantity, unit_cost), '[]'::jsonb)
      into existing_items from public.purchase_order_items where purchase_order_id = p_client_order_id;
    select coalesce(jsonb_agg(jsonb_build_array((value ->> 'product_id')::uuid,
      nullif(value ->> 'variant_id', '')::uuid, (value ->> 'quantity')::numeric, (value ->> 'unit_cost')::numeric)
      order by (value ->> 'product_id')::uuid, coalesce(nullif(value ->> 'variant_id', ''), ''),
        (value ->> 'quantity')::numeric, (value ->> 'unit_cost')::numeric), '[]'::jsonb)
      into requested_items from jsonb_array_elements(p_items);
    if existing_items <> requested_items then raise exception 'Purchase order ID was already used with different items'; end if;
    return p_client_order_id;
  end if;

  insert into public.purchase_orders(id, order_number, branch_id, warehouse_id, supplier_id, total_cost, note, ordered_by)
    values (p_client_order_id, order_number_value, p_branch_id, p_warehouse_id, p_supplier_id,
      total_value, coalesce(trim(p_note), ''), actor_id)
    on conflict (id) do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count = 0 then
    select * into existing_order from public.purchase_orders where id = p_client_order_id for update;
    if existing_order.ordered_by <> actor_id or existing_order.branch_id <> p_branch_id
      or existing_order.warehouse_id <> p_warehouse_id or existing_order.supplier_id <> p_supplier_id then
      raise exception 'Purchase order ID was already used for a different request';
    end if;
    select coalesce(jsonb_agg(jsonb_build_array(product_id, variant_id, ordered_quantity, unit_cost)
      order by product_id, coalesce(variant_id::text, ''), ordered_quantity, unit_cost), '[]'::jsonb)
      into existing_items from public.purchase_order_items where purchase_order_id = p_client_order_id;
    select coalesce(jsonb_agg(jsonb_build_array((value ->> 'product_id')::uuid,
      nullif(value ->> 'variant_id', '')::uuid, (value ->> 'quantity')::numeric, (value ->> 'unit_cost')::numeric)
      order by (value ->> 'product_id')::uuid, coalesce(nullif(value ->> 'variant_id', ''), ''),
        (value ->> 'quantity')::numeric, (value ->> 'unit_cost')::numeric), '[]'::jsonb)
      into requested_items from jsonb_array_elements(p_items);
    if existing_items <> requested_items then raise exception 'Purchase order ID was already used with different items'; end if;
    return p_client_order_id;
  end if;

  for item in select value from jsonb_array_elements(p_items) loop
    insert into public.purchase_order_items(purchase_order_id, product_id, variant_id, ordered_quantity, unit_cost)
      values (p_client_order_id, (item ->> 'product_id')::uuid, nullif(item ->> 'variant_id', '')::uuid,
        (item ->> 'quantity')::numeric, (item ->> 'unit_cost')::numeric);
  end loop;
  return p_client_order_id;
end;
$$;
revoke all on function public.sellora_create_purchase_order_with_id(uuid, uuid, uuid, uuid, jsonb, text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'sellora_rest') then
    grant execute on function public.sellora_create_purchase_order_with_id(uuid, uuid, uuid, uuid, jsonb, text) to sellora_rest;
  end if;
end $$;
