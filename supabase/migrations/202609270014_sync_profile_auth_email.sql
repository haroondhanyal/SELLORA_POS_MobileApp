-- Keep the profile's display email in sync with the verified Supabase Auth email.
create or replace function public.sellora_sync_profile_auth_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set email = coalesce(new.email, ''), updated_at = now()
  where id = new.id;
  return new;
end;
$$;

revoke all on function public.sellora_sync_profile_auth_email() from public;

create trigger sellora_auth_email_updated
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.sellora_sync_profile_auth_email();
