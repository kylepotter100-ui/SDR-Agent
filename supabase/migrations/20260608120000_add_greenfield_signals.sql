-- Phase 1 follow-up: signal-quality enrichment columns on prospects.
--
-- A new pipeline stage (signals) populates these from Companies House
-- PSC and officer-appointments after apollo. greenfield_flag is the
-- deterministic summary used by the ranker's down-rank rules and by
-- the deterministic post-clamp cap on group_subsidiary in rank.ts.
--
-- All columns nullable so historical prospects stay valid; the signals
-- stage backfills them across the next couple of prepare-cron runs.

alter table public.prospects
  add column director_officer_id text,
  add column psc_corporate_count integer,
  add column psc_individual_count integer,
  add column psc_total_count integer,
  add column psc_status text
    check (psc_status is null or psc_status in
      ('present', 'none_filed', 'unknown')),
  add column director_active_appointments integer,
  add column within_pool_director_count integer,
  add column signals_attempted_at timestamptz,
  add column greenfield_flag text
    check (greenfield_flag is null or greenfield_flag in
      ('sole_independent', 'standard', 'serial_operator',
       'group_subsidiary', 'unknown'));

create index prospects_greenfield_flag_idx
  on public.prospects (greenfield_flag) where greenfield_flag is not null;
