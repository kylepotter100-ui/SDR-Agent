-- Phase 1, Checkpoint 9: pipeline observability.
--
-- One row per cron invocation (prepare, digest, or manual). The
-- summary jsonb captures per-stage counts and costs; errors jsonb is
-- non-null when any stage degraded or aborted. duration_ms is total
-- wall-clock for the function.
--
-- The digest cron reads the most recent prepare row within the last
-- 60 minutes to compose the pipeline-summary block at the bottom of
-- the digest email. Phase 2 may query this table for the dashboard's
-- pipeline-health view.

create table public.cron_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null,
  finished_at timestamptz,
  kind text not null check (kind in ('prepare', 'digest', 'manual')),
  status text not null check (status in ('ok', 'partial', 'failed')),
  summary jsonb not null,
  errors jsonb,
  duration_ms int
);

alter table public.cron_runs enable row level security;

create policy "authenticated full access"
  on public.cron_runs
  for all
  to authenticated
  using (true)
  with check (true);
