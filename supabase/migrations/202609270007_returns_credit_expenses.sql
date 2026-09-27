-- Phase 8: returns, refunds, customer-account payments, loyalty and expenses.
alter table public.inventory_movements drop constraint if exists inventory_movements_movement_type_check;
alter table public.inventory_movements add constraint inventory_movements_movement_type_check
  check (movement_type in ('sale', 'adjustment', 'transfer_in', 'transfer_out', 'purchase', 'return'));

create table public.sales_returns (
  id uuid primary key default gen_random_uuid(), sale_id uuid not null references public.sales(id),
  branch_id uuid not null references public.branches(id), return_number text not null unique,
  reason text not null, refund_method text not null check (refund_method in ('cash','card','bank_transfer','jazzcash','easypaisa','store_credit')),
  refund_total numeric(14,2) not null check (refund_total > 0), created_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create table public.sales_return_items (
  id uuid primary key default gen_random_uuid(), return_id uuid not null references public.sales_returns(id) on delete cascade,
  sale_item_id uuid not null references public.sale_items(id), product_id uuid not null references public.products(id), variant_id uuid references public.product_variants(id),
  quantity numeric(14,3) not null check (quantity > 0), refund_amount numeric(14,2) not null check (refund_amount >= 0)
);
create table public.customer_account_payments (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.customers(id), branch_id uuid not null references public.branches(id),
  amount numeric(14,2) not null check (amount > 0), method text not null check (method in ('cash','card','bank_transfer','jazzcash','easypaisa')),
  reference text, received_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create table public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.customers(id), sale_id uuid references public.sales(id),
  points integer not null check (points <> 0), reason text not null, created_at timestamptz not null default now()
);
create table public.expenses (
  id uuid primary key default gen_random_uuid(), branch_id uuid not null references public.branches(id), category text not null,
  description text not null, amount numeric(14,2) not null check (amount > 0), payment_method text not null check (payment_method in ('cash','card','bank_transfer','jazzcash','easypaisa')),
  receipt_storage_path text, created_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create index sales_returns_sale on public.sales_returns(sale_id, created_at desc);
create index expenses_branch_date on public.expenses(branch_id, created_at desc);

insert into public.permissions(code,label,description) values
 ('returns.manage','Process returns','Return eligible items and record refunds.'),
 ('expenses.view','View expenses','View branch expense records.'),('expenses.manage','Manage expenses','Record branch expenses.'),
 ('customers.credit.manage','Manage customer credit','Receive outstanding customer balance payments.')
on conflict (code) do nothing;
insert into public.role_permissions(role,permission_code)
select role_name::public.sellora_role, permission_code from (values
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
grant select on public.sales_returns,public.sales_return_items,public.customer_account_payments,public.loyalty_transactions,public.expenses to authenticated;
grant insert on public.expenses to authenticated;
create policy "Read returns in assigned branches" on public.sales_returns for select to authenticated using (public.sellora_can_access_branch(branch_id));
create policy "Read returned items in assigned branches" on public.sales_return_items for select to authenticated using (exists(select 1 from public.sales_returns r where r.id=return_id));
create policy "Read customer account payments in assigned branches" on public.customer_account_payments for select to authenticated using (public.sellora_can_access_branch(branch_id));
create policy "Read loyalty transactions for visible customers" on public.loyalty_transactions for select to authenticated using (exists(select 1 from public.customers c where c.id=customer_id and public.sellora_can_access_branch(c.branch_id)));
create policy "Read expenses with permission" on public.expenses for select to authenticated using (public.sellora_can('expenses.view') and public.sellora_can_access_branch(branch_id));
create policy "Insert permitted branch expenses" on public.expenses for insert to authenticated with check (public.sellora_can('expenses.manage') and created_by=(select auth.uid()) and public.sellora_can_access_branch(branch_id));

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
grant execute on function public.sellora_process_return(uuid,jsonb,text,text) to authenticated;

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
grant execute on function public.sellora_receive_customer_payment(uuid,numeric,text,text) to authenticated;
