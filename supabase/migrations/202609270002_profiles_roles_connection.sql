-- Sellora Phase 1-3 completion: profile fields, permission catalog and private avatars.
alter table public.profiles
  add column date_of_birth date,
  add column avatar_storage_path text;

-- Include the signup date of birth in the profile created by the auth trigger.
create or replace function public.sellora_create_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  requested_role text := coalesce(new.raw_user_meta_data ->> 'requested_role', 'cashier');
  birthday_text text := new.raw_user_meta_data ->> 'date_of_birth';
  birthday_value date;
begin
  if requested_role not in ('admin', 'branch_manager', 'sales_manager', 'sales_agent', 'cashier', 'inventory_manager', 'accountant', 'viewer') then
    requested_role := 'cashier';
  end if;
  if birthday_text ~ '^\d{4}-\d{2}-\d{2}$' then
    begin
      birthday_value := birthday_text::date;
    exception when others then
      birthday_value := null;
    end;
  end if;
  insert into public.profiles (id, full_name, email, phone, role, requested_role, approval_status, date_of_birth)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    'cashier',
    requested_role::public.sellora_role,
    'pending',
    birthday_value
  );
  return new;
end;
$$;

-- Keep owner profile edits limited to harmless profile details. Role and approval
-- changes are separate columns and only an approved admin receives that privilege.
revoke all on public.profiles from anon;
grant select on public.profiles to authenticated;
revoke insert, delete on public.profiles from authenticated;
revoke update on public.profiles from authenticated;
grant update (full_name, phone, date_of_birth, avatar_storage_path) on public.profiles to authenticated;
grant update (role, approval_status) on public.profiles to authenticated;

create policy "Users can update their own profile details"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Column grants plus this trigger stop self-service profile edits from changing access.
create or replace function public.sellora_guard_profile_access()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.role is distinct from old.role or new.approval_status is distinct from old.approval_status)
     and not public.sellora_is_admin() then
    raise exception 'Only an approved administrator can change account access';
  end if;
  if (new.role is distinct from old.role or new.approval_status is distinct from old.approval_status) then
    if (old.role = 'admin' or new.role = 'admin') and not public.sellora_is_admin() then
      raise exception 'Only an approved administrator can grant or remove administrator access';
    end if;
  end if;
  return new;
end;
$$;

create trigger sellora_profile_access_guard
  before update on public.profiles
  for each row execute procedure public.sellora_guard_profile_access();

create table public.permissions (
  code text primary key,
  label text not null,
  description text not null default ''
);

create table public.role_permissions (
  role public.sellora_role not null,
  permission_code text not null references public.permissions(code) on delete cascade,
  primary key (role, permission_code)
);

alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
grant select on public.permissions, public.role_permissions to authenticated;
grant insert, update, delete on public.role_permissions to authenticated;

insert into public.permissions (code, label, description) values
  ('dashboard.view', 'View dashboard', 'Open the Sellora home screen.'),
  ('sales.create', 'Create sales', 'Create a point-of-sale transaction.'),
  ('sales.view_own', 'View own sales', 'View sales created by the signed-in user.'),
  ('sales.view_branch', 'View branch sales', 'View sales for the assigned branch.'),
  ('products.manage', 'Manage products', 'Add and edit products.'),
  ('inventory.manage', 'Manage inventory', 'Adjust stock and view inventory.'),
  ('reports.view', 'View reports', 'Open sales and inventory reports.'),
  ('users.manage', 'Manage users', 'Approve accounts and assign roles.'),
  ('roles.manage', 'Manage role permissions', 'Choose access rights for roles.')
on conflict (code) do nothing;

insert into public.role_permissions (role, permission_code)
select role_name::public.sellora_role, permission_code
from (values
  ('admin', 'dashboard.view'), ('admin', 'sales.create'), ('admin', 'sales.view_branch'), ('admin', 'products.manage'), ('admin', 'inventory.manage'), ('admin', 'reports.view'), ('admin', 'users.manage'), ('admin', 'roles.manage'),
  ('branch_manager', 'dashboard.view'), ('branch_manager', 'sales.create'), ('branch_manager', 'sales.view_branch'), ('branch_manager', 'products.manage'), ('branch_manager', 'inventory.manage'), ('branch_manager', 'reports.view'),
  ('sales_manager', 'dashboard.view'), ('sales_manager', 'sales.view_branch'), ('sales_manager', 'reports.view'),
  ('sales_agent', 'dashboard.view'), ('sales_agent', 'sales.create'), ('sales_agent', 'sales.view_own'),
  ('cashier', 'dashboard.view'), ('cashier', 'sales.create'), ('cashier', 'sales.view_own'),
  ('inventory_manager', 'dashboard.view'), ('inventory_manager', 'products.manage'), ('inventory_manager', 'inventory.manage'),
  ('accountant', 'dashboard.view'), ('accountant', 'sales.view_branch'), ('accountant', 'reports.view'),
  ('viewer', 'dashboard.view')
) as defaults(role_name, permission_code)
on conflict do nothing;

create or replace function public.sellora_can(permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    join public.role_permissions rp on rp.role = p.role
    where p.id = (select auth.uid())
      and p.approval_status = 'approved'
      and rp.permission_code = permission
  );
$$;

revoke all on function public.sellora_can(text) from public;
grant execute on function public.sellora_can(text) to authenticated;

-- Apply role permissions to the user and role administration APIs themselves.
drop policy "Approved admins can read all profiles" on public.profiles;
drop policy "Approved admins can update profile access" on public.profiles;
create policy "Users with permission can read all profiles"
  on public.profiles for select to authenticated
  using (public.sellora_can('users.manage'));
create policy "Users with permission can update profile access"
  on public.profiles for update to authenticated
  using (public.sellora_can('users.manage'))
  with check (public.sellora_can('users.manage'));

create or replace function public.sellora_guard_profile_access()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- A user can never change their own role or approval, including an admin.
  -- A null auth.uid() is the trusted project-owner SQL bootstrap path.
  if new.id = (select auth.uid())
     and (new.role is distinct from old.role or new.approval_status is distinct from old.approval_status)
     and (select auth.uid()) is not null then
    raise exception 'You cannot change your own role or approval status';
  end if;
  if (new.role is distinct from old.role or new.approval_status is distinct from old.approval_status)
     and (select auth.uid()) is not null
     and not public.sellora_can('users.manage') then
    raise exception 'Your role does not allow changing account access';
  end if;
  if (new.role is distinct from old.role or new.approval_status is distinct from old.approval_status)
     and (old.role = 'admin' or new.role = 'admin')
     and (select auth.uid()) is not null
     and not public.sellora_is_admin() then
    raise exception 'Only an approved administrator can grant or remove administrator access';
  end if;
  return new;
end;
$$;

create policy "Approved users can read the permission catalog"
  on public.permissions for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.approval_status = 'approved'));
create policy "Approved users can read role permissions"
  on public.role_permissions for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.approval_status = 'approved'));
create policy "Users with permission can manage role permissions"
  on public.role_permissions for all to authenticated
  using (public.sellora_is_admin() and public.sellora_can('roles.manage'))
  with check (public.sellora_is_admin() and public.sellora_can('roles.manage'));

-- Profile photos are private; each user may only access their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 26214400, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 26214400,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

create policy "Users can read their own avatar files"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users can upload their own avatar files"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users can delete their own avatar files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
