-- Phase 9: attendance shifts, cash-drawer closeouts, sales targets and commissions.
create table public.employee_shifts (
 id uuid primary key default gen_random_uuid(), branch_id uuid not null references public.branches(id), user_id uuid not null references public.profiles(id),
 opened_at timestamptz not null default now(), closed_at timestamptz, opening_cash numeric(14,2) not null default 0 check(opening_cash>=0),
 expected_cash numeric(14,2), actual_cash numeric(14,2), cash_difference numeric(14,2), note text
);
create unique index one_open_shift_per_user on public.employee_shifts(user_id) where closed_at is null;
create table public.sales_targets (
 id uuid primary key default gen_random_uuid(), branch_id uuid not null references public.branches(id), agent_id uuid not null references public.profiles(id),
 period_type text not null check(period_type in ('daily','weekly','monthly')), period_start date not null, target_amount numeric(14,2) not null check(target_amount>0),
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), unique(agent_id,period_type,period_start)
);
create table public.commission_rules (
 id uuid primary key default gen_random_uuid(), branch_id uuid not null references public.branches(id), name text not null,
 rate_percent numeric(7,4) not null check(rate_percent between 0 and 100), is_active boolean not null default true,
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create table public.agent_commissions (
 id uuid primary key default gen_random_uuid(), sale_id uuid not null references public.sales(id), agent_id uuid not null references public.profiles(id),
 branch_id uuid not null references public.branches(id), rule_id uuid references public.commission_rules(id), sale_total numeric(14,2) not null,
 commission_amount numeric(14,2) not null, created_at timestamptz not null default now(), unique(sale_id)
);
insert into public.permissions(code,label,description) values
 ('shifts.manage','Manage shifts','Open and close own employee shifts.'),('targets.manage','Manage sales targets','Assign targets to branch sales agents.'),
 ('commissions.view','View commissions','View earned agent commissions.') on conflict(code) do nothing;
insert into public.role_permissions(role,permission_code) select role_name::public.sellora_role,permission_code from (values
 ('admin','shifts.manage'),('admin','targets.manage'),('admin','commissions.view'),('branch_manager','shifts.manage'),('branch_manager','targets.manage'),('branch_manager','commissions.view'),
 ('sales_manager','shifts.manage'),('sales_manager','targets.manage'),('sales_manager','commissions.view'),('sales_agent','shifts.manage'),('sales_agent','commissions.view'),('cashier','shifts.manage')
) p(role_name,permission_code) on conflict do nothing;
alter table public.employee_shifts enable row level security; alter table public.sales_targets enable row level security;
alter table public.commission_rules enable row level security; alter table public.agent_commissions enable row level security;
grant select on public.employee_shifts,public.sales_targets,public.commission_rules,public.agent_commissions to authenticated;
create policy "Users view their branch shifts" on public.employee_shifts for select to authenticated using (user_id=(select auth.uid()) or (public.sellora_can('reports.view') and public.sellora_can_access_branch(branch_id)));
create policy "Agents view own targets and managers view branch targets" on public.sales_targets for select to authenticated using (
  public.sellora_can_access_branch(branch_id) and
  (agent_id=(select auth.uid()) or public.sellora_can('targets.manage') or public.sellora_can('reports.view'))
);
create policy "Managers view branch commission rules" on public.commission_rules for select to authenticated using (public.sellora_can_access_branch(branch_id));
create policy "Agents see own commission or managers see branch" on public.agent_commissions for select to authenticated using ((agent_id=(select auth.uid()) and public.sellora_can('commissions.view')) or (public.sellora_can('reports.view') and public.sellora_can_access_branch(branch_id)));

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
revoke all on function public.sellora_open_shift(uuid,numeric) from public; grant execute on function public.sellora_open_shift(uuid,numeric) to authenticated;
revoke all on function public.sellora_close_shift(uuid,numeric,text) from public; grant execute on function public.sellora_close_shift(uuid,numeric,text) to authenticated;

create or replace function public.sellora_save_sales_target(p_branch_id uuid,p_agent_id uuid,p_period_type text,p_period_start date,p_target numeric)
returns uuid language plpgsql security definer set search_path='' as $$
declare target_id uuid;
begin
 if not public.sellora_can('targets.manage') or not public.sellora_can_access_branch(p_branch_id) then raise exception 'You cannot manage targets in this branch'; end if;
 if p_period_type not in ('daily','weekly','monthly') or p_target<=0 then raise exception 'Enter a valid period and target'; end if;
 if not exists(select 1 from public.profiles p where p.id=p_agent_id and p.role='sales_agent' and p.approval_status='approved' and (p.primary_branch_id=p_branch_id or exists(select 1 from public.user_branches ub where ub.user_id=p.id and ub.branch_id=p_branch_id))) then raise exception 'Choose an approved branch sales agent'; end if;
 insert into public.sales_targets(branch_id,agent_id,period_type,period_start,target_amount,created_by) values(p_branch_id,p_agent_id,p_period_type,p_period_start,p_target,(select auth.uid()))
 on conflict(agent_id,period_type,period_start) do update set target_amount=excluded.target_amount returning id into target_id; return target_id;
end $$;
revoke all on function public.sellora_save_sales_target(uuid,uuid,text,date,numeric) from public; grant execute on function public.sellora_save_sales_target(uuid,uuid,text,date,numeric) to authenticated;

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
revoke all on function public.sellora_save_commission_rule(uuid,text,numeric) from public; grant execute on function public.sellora_save_commission_rule(uuid,text,numeric) to authenticated;
