-- Preserve the application's established public.profiles table name so existing
-- PostgREST relationships and profile queries keep working. The app_profiles
-- compatibility view keeps the standalone API's internal SQL routines stable.
alter table public.app_profiles rename to profiles;
create view public.app_profiles
  with (security_invoker = true)
  as select * from public.profiles;
grant select, insert, update, delete on public.app_profiles to sellora_api;
