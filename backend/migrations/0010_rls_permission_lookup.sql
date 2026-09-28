-- Keep the current role/approval snapshot outside FORCE RLS so permission
-- policies can evaluate without recursively querying app_profiles or the
-- role_permissions policy that they are currently authorizing.
create table if not exists public.sellora_user_access (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role text not null,
  approval_status text not null
);
revoke all on public.sellora_user_access from public;

insert into public.sellora_user_access(user_id, role, approval_status)
select id, role, approval_status from public.profiles
on conflict (user_id) do update
  set role=excluded.role, approval_status=excluded.approval_status;

create or replace function public.sellora_sync_user_access()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' then
    delete from public.sellora_user_access where user_id=old.id;
    return old;
  end if;
  insert into public.sellora_user_access(user_id, role, approval_status)
  values(new.id, new.role, new.approval_status)
  on conflict (user_id) do update
    set role=excluded.role, approval_status=excluded.approval_status;
  return new;
end $$;

drop trigger if exists sellora_sync_user_access on public.profiles;
create trigger sellora_sync_user_access
  after insert or update or delete on public.profiles
  for each row execute procedure public.sellora_sync_user_access();

create or replace function public.sellora_is_admin()
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.sellora_user_access a
    where a.user_id=(select auth.uid())
      and a.role='admin' and a.approval_status='approved'
  );
$$;

create or replace function public.sellora_can(permission text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1
      from public.sellora_user_access a
      join public.role_permissions rp on rp.role=a.role
     where a.user_id=(select auth.uid())
       and a.approval_status='approved'
       and rp.permission_code=permission
  );
$$;

drop policy if exists "Approved users can read the permission catalog" on public.permissions;
create policy "Approved users can read the permission catalog"
  on public.permissions for select to public
  using (exists (select 1 from public.sellora_user_access a
    where a.user_id=(select auth.uid()) and a.approval_status='approved'));

drop policy if exists "Approved users can read role permissions" on public.role_permissions;
create policy "Approved users can read role permissions"
  on public.role_permissions for select to public
  using (exists (select 1 from public.sellora_user_access a
    where a.user_id=(select auth.uid()) and a.approval_status='approved'));

-- The former FOR ALL policy also applied during sellora_can()'s own SELECT,
-- causing infinite recursion under FORCE RLS. Separate the write policies.
drop policy if exists "Users with permission can manage role permissions" on public.role_permissions;
create policy "Users with permission can insert role permissions"
  on public.role_permissions for insert to public
  with check (public.sellora_is_admin() and public.sellora_can('roles.manage'));
create policy "Users with permission can update role permissions"
  on public.role_permissions for update to public
  using (public.sellora_is_admin() and public.sellora_can('roles.manage'))
  with check (public.sellora_is_admin() and public.sellora_can('roles.manage'));
create policy "Users with permission can delete role permissions"
  on public.role_permissions for delete to public
  using (public.sellora_is_admin() and public.sellora_can('roles.manage'));
