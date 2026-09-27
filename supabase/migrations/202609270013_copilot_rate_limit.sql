-- Limit authenticated Copilot usage per account to control abuse and provider cost.
create table public.ai_copilot_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index ai_copilot_usage_user_time on public.ai_copilot_usage(user_id, created_at desc);
alter table public.ai_copilot_usage enable row level security;

create or replace function public.sellora_claim_ai_request()
returns boolean language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid()); request_count integer;
begin
  if actor is null or not public.sellora_can('reports.view') and not public.sellora_can('sales.view_own') then
    return false;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':copilot',0));
  delete from public.ai_copilot_usage where user_id=actor and created_at<now()-interval '1 hour';
  select count(*) into request_count from public.ai_copilot_usage where user_id=actor and created_at>=now()-interval '1 hour';
  if request_count>=20 then return false; end if;
  insert into public.ai_copilot_usage(user_id) values(actor);
  return true;
end $$;
revoke all on function public.sellora_claim_ai_request() from public;
grant execute on function public.sellora_claim_ai_request() to authenticated;
