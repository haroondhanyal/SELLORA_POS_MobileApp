-- Phase 6: one business base currency plus per-currency display and exchange-rate snapshots.
create table public.business_currency (
  id smallint primary key default 1 check (id = 1),
  base_currency text not null default 'PKR' check (base_currency ~ '^[A-Z]{3}$'),
  updated_by uuid references public.profiles(id) on delete set null,
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
  updated_by uuid references public.profiles(id) on delete set null,
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
grant select on public.business_currency, public.exchange_rates to authenticated;
grant update on public.business_currency to authenticated;
grant insert, update, delete on public.exchange_rates to authenticated;
create policy "Approved users can read base currency" on public.business_currency for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.approval_status = 'approved'));
create policy "Admins update base currency" on public.business_currency for update to authenticated
  using (public.sellora_is_admin()) with check (public.sellora_is_admin() and updated_by = (select auth.uid()));
create policy "Approved users can read exchange rates" on public.exchange_rates for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.approval_status = 'approved'));
create policy "Admins manage exchange rates" on public.exchange_rates for all to authenticated
  using (public.sellora_is_admin()) with check (public.sellora_is_admin());
