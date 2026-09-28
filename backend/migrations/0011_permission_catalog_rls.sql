-- Policies that inspect a private table need a security-definer boolean helper;
-- querying sellora_user_access directly from a PostgREST policy requires grants.
create or replace function public.sellora_is_approved()
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.sellora_user_access a
    where a.user_id=(select auth.uid()) and a.approval_status='approved'
  );
$$;
revoke all on function public.sellora_is_approved() from public;
grant execute on function public.sellora_is_approved() to public;

drop policy if exists "Approved users can read the permission catalog" on public.permissions;
create policy "Approved users can read the permission catalog"
  on public.permissions for select to public
  using (public.sellora_is_approved());

drop policy if exists "Approved users can read role permissions" on public.role_permissions;
create policy "Approved users can read role permissions"
  on public.role_permissions for select to public
  using (public.sellora_is_approved());
