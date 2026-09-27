-- Phase 10: user-visible approvals, notifications, operational audit and reports.
create table public.approvals (
 id uuid primary key default gen_random_uuid(), branch_id uuid references public.branches(id), requester_id uuid not null references public.profiles(id),
 request_type text not null check(request_type in ('role_change','discount','refund','stock_adjustment','stock_transfer','purchase','expense','other')),
 title text not null, details text not null default '', status text not null default 'pending' check(status in ('pending','approved','rejected')),
 reviewed_by uuid references public.profiles(id), review_note text, created_at timestamptz not null default now(), reviewed_at timestamptz
);
create table public.notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 category text not null, title text not null, body text not null default '', read_at timestamptz, created_at timestamptz not null default now()
);
create table public.audit_logs (
 id uuid primary key default gen_random_uuid(), branch_id uuid references public.branches(id), actor_id uuid references public.profiles(id),
 action text not null, entity text not null, entity_id uuid, summary text not null default '', created_at timestamptz not null default now()
);
create index approvals_pending_created on public.approvals(status,created_at desc);
create index notifications_user_created on public.notifications(user_id,created_at desc);
create index audit_logs_branch_created on public.audit_logs(branch_id,created_at desc);
insert into public.permissions(code,label,description) values
 ('approvals.view','View approvals','Review branch approval requests.'),('approvals.request','Request approval','Submit an operational approval request.'),('notifications.view','View notifications','Read and dismiss personal notifications.'),('audit.view','View audit log','Review authorized branch activity.') on conflict(code) do nothing;
insert into public.role_permissions(role,permission_code) select role_name::public.sellora_role,permission_code from (values
 ('admin','approvals.view'),('admin','approvals.request'),('admin','notifications.view'),('admin','audit.view'),
 ('branch_manager','approvals.view'),('branch_manager','approvals.request'),('branch_manager','notifications.view'),('branch_manager','audit.view'),
 ('sales_manager','approvals.view'),('sales_manager','approvals.request'),('sales_manager','notifications.view'),('sales_manager','audit.view'),
 ('sales_agent','approvals.request'),('sales_agent','notifications.view'),('cashier','approvals.request'),('cashier','notifications.view'),
 ('inventory_manager','approvals.view'),('inventory_manager','approvals.request'),('inventory_manager','notifications.view'),('accountant','approvals.view'),('accountant','approvals.request'),('accountant','notifications.view'),('accountant','audit.view')
) p(role_name,permission_code) on conflict do nothing;
alter table public.approvals enable row level security; alter table public.notifications enable row level security; alter table public.audit_logs enable row level security;
grant select on public.approvals,public.notifications,public.audit_logs to authenticated;
grant insert on public.approvals to authenticated;
grant update(read_at) on public.notifications to authenticated;
create policy "Requesters and reviewers read approvals" on public.approvals for select to authenticated using ((requester_id=(select auth.uid()) and public.sellora_can('approvals.request')) or (public.sellora_can('approvals.view') and (branch_id is null or public.sellora_can_access_branch(branch_id))));
create policy "Users create approval requests" on public.approvals for insert to authenticated with check (requester_id=(select auth.uid()) and status='pending' and public.sellora_can('approvals.request') and (branch_id is null or public.sellora_can_access_branch(branch_id)));
create policy "Users read own notifications" on public.notifications for select to authenticated using(user_id=(select auth.uid()) and public.sellora_can('notifications.view'));
create policy "Users dismiss own notifications" on public.notifications for update to authenticated using(user_id=(select auth.uid()) and public.sellora_can('notifications.view')) with check(user_id=(select auth.uid()));
create policy "Authorized staff read audit events" on public.audit_logs for select to authenticated using(public.sellora_can('audit.view') and (branch_id is null or public.sellora_can_access_branch(branch_id)));

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
revoke all on function public.sellora_review_approval(uuid,text,text) from public; grant execute on function public.sellora_review_approval(uuid,text,text) to authenticated;

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
   insert into public.notifications(user_id,category,title,body) select p.id,'approvals','New account awaiting approval',new.full_name||' requested access' from public.profiles p where p.role='admin' and p.approval_status='approved';
 elsif new.approval_status is distinct from old.approval_status then
   insert into public.notifications(user_id,category,title,body) values(new.id,'account','Account access updated','Your account is now '||new.approval_status||'.');
 end if;
 return new;
end $$;
create trigger sellora_profile_notification after insert or update on public.profiles for each row execute procedure public.sellora_notify_profile_change();
