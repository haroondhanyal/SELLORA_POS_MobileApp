-- Phase 11: idempotent server acceptance for locally queued offline sales.
create table public.synced_offline_sales (
 user_id uuid not null references public.profiles(id), client_sale_id uuid not null, sale_id uuid not null references public.sales(id),
 created_at timestamptz not null default now(), primary key(user_id,client_sale_id), unique(sale_id)
);
alter table public.synced_offline_sales enable row level security;
grant select on public.synced_offline_sales to authenticated;
create policy "Users see own synchronized offline sales" on public.synced_offline_sales for select to authenticated using(user_id=(select auth.uid()));

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
grant execute on function public.sellora_sync_offline_sale(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb) to authenticated;
