-- Profile creation replaces the former Supabase auth.users insert trigger. Signup
-- can create only its own pending cashier profile; role promotion remains admin-only.
drop policy if exists "New accounts create their own pending profile" on public.app_profiles;
create policy "New accounts create their own pending profile"
  on public.app_profiles for insert to public
  with check (
    id = (select auth.uid())
    and role = 'cashier'
    and approval_status = 'pending'
  );

-- The API connects as the table owner. FORCE RLS ensures its queries are still
-- constrained by auth.uid(), which is set transaction-locally after session lookup.
do $$
declare table_name text;
begin
  for table_name in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relrowsecurity
      and c.relname <> 'sellora_migrations'
  loop
    execute format('alter table public.%I force row level security', table_name);
  end loop;
end;
$$;
