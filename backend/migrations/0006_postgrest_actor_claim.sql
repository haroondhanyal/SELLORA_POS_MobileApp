-- PostgREST sets JWT claims transaction-locally. Keep the direct API actor setting
-- as a fallback for Express routes and use the verified subject for REST calls.
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
