-- Completion work: customer loyalty redemption, private expense receipts and drawer entries.
alter table public.expenses add column if not exists receipt_storage_path text;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('expenses','expenses',false,26214400,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=26214400,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
create policy "Assigned staff read expense receipts" on storage.objects for select to authenticated
 using(bucket_id='expenses' and public.sellora_can('expenses.view') and public.sellora_can_access_branch(((storage.foldername(name))[1])::uuid));
create policy "Expense managers upload receipts" on storage.objects for insert to authenticated
 with check(bucket_id='expenses' and public.sellora_can('expenses.manage') and public.sellora_can_access_branch(((storage.foldername(name))[1])::uuid));
create policy "Expense managers remove receipts" on storage.objects for delete to authenticated
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
grant execute on function public.sellora_redeem_loyalty(uuid,integer) to authenticated;

create table public.cash_drawer_entries(
 id uuid primary key default gen_random_uuid(),shift_id uuid not null references public.employee_shifts(id),entry_type text not null check(entry_type in ('cash_in','cash_out')),
 amount numeric(14,2) not null check(amount>0),reason text not null,created_by uuid not null references public.profiles(id),created_at timestamptz not null default now()
);
alter table public.cash_drawer_entries enable row level security;
grant select on public.cash_drawer_entries to authenticated;
create policy "Staff view their drawer entries" on public.cash_drawer_entries for select to authenticated using(exists(select 1 from public.employee_shifts s where s.id=shift_id and (s.user_id=(select auth.uid()) or (public.sellora_can('reports.view') and public.sellora_can_access_branch(s.branch_id)))));
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
grant execute on function public.sellora_record_cash_drawer_entry(uuid,text,numeric,text) to authenticated;

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
grant execute on function public.sellora_close_shift(uuid,numeric,text) to authenticated;

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
 from public.profiles p
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

-- Enable push-style notification updates for subscribed clients in the Supabase Realtime publication.
do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='approvals') then
    alter publication supabase_realtime add table public.approvals;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='inventory') then
    alter publication supabase_realtime add table public.inventory;
  end if;
end $$;
