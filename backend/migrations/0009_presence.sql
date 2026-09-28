-- Device-level activity heartbeat. A user may be active on multiple devices.
create table if not exists public.user_presence (
  -- Keep this as a UUID without a profile FK: installations may expose legacy
  -- profile compatibility views during an upgrade.
  user_id uuid not null,
  device_id uuid not null,
  last_seen_at timestamptz not null default now(),
  primary key (user_id, device_id)
);

create index if not exists user_presence_last_seen_idx
  on public.user_presence (last_seen_at desc);

alter table public.user_presence enable row level security;
grant select, insert, update on public.user_presence to public;

create policy "Users can update presence for their own devices"
  on public.user_presence for all to public
  using (user_id = (select auth.uid()) or public.sellora_can('users.manage'))
  with check (user_id = (select auth.uid()) or public.sellora_can('users.manage'));
