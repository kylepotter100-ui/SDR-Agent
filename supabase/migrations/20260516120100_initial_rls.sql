-- Phase 1, Checkpoint 2: row-level security for the initial schema.
--
-- This is a deliberately permissive Phase 1 placeholder. Authenticated
-- users get full read/write on all three tables; anon gets nothing.
-- The agent itself runs server-side with the service role key, which
-- bypasses RLS — these policies exist so that any future client-side
-- query (Phase 2 dashboard) starts from a safe default rather than an
-- open table.
--
-- To be tightened in Phase 2 once the dashboard auth model is decided.

alter table public.companies_house_raw enable row level security;
alter table public.prospects           enable row level security;
alter table public.digests             enable row level security;

create policy "authenticated full access"
  on public.companies_house_raw
  for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated full access"
  on public.prospects
  for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated full access"
  on public.digests
  for all
  to authenticated
  using (true)
  with check (true);
