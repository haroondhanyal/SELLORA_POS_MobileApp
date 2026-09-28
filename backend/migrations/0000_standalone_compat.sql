-- Standalone PostgreSQL compatibility layer for the existing Sellora business
-- migrations. Only the API database role connects to this database; user identity
-- is set transaction-locally by the API after it validates a Better Auth session.
create schema if not exists auth;
create schema if not exists storage;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('sellora.user_id', true), ''),
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid;
$$;

create or replace function storage.foldername(object_name text)
returns text[]
language sql
immutable
as $$
  select case
    when array_length(string_to_array(object_name, '/'), 1) > 1
      then (string_to_array(object_name, '/'))[1:array_length(string_to_array(object_name, '/'), 1) - 1]
    else '{}'::text[]
  end;
$$;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique(bucket_id, name)
);
alter table storage.objects enable row level security;

do $$ begin
  create type public.sellora_role as enum (
    'admin', 'branch_manager', 'sales_manager', 'sales_agent',
    'cashier', 'inventory_manager', 'accountant', 'viewer'
  );
exception when duplicate_object then null;
end $$;

grant usage on schema public, auth, storage to public;
grant select, insert, update, delete on storage.buckets, storage.objects to public;
