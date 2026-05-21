-- Phase 2, Checkpoint 2: evolve prospects.status into the full lifecycle.
--
-- Phase 1 set: new, surfaced, contacted, replied, qualified, dead, ignored.
-- Phase 2 set: renames `contacted` -> `sent` (clearer for email outreach)
-- and adds `opted_out` — distinct from `ignored`: opted_out = the prospect
-- asked to stop (legal/suppression); ignored = Kyle chose not to pursue.
--
-- Every existing row is 'new' (the field has been inert in Phase 1), so no
-- data migration is needed — the constraint swap violates no row, and the
-- agent never reads or writes status, so the cron pipeline is unaffected.
--
-- If the DROP errors on the constraint name, find the actual name with:
--   select conname from pg_constraint
--   where conrelid = 'public.prospects'::regclass and contype = 'c';
-- (the Phase 1 inline check auto-names to prospects_status_check).

alter table public.prospects
  drop constraint prospects_status_check;

alter table public.prospects
  add constraint prospects_status_check
  check (status in (
    'new',
    'surfaced',
    'sent',
    'replied',
    'qualified',
    'dead',
    'opted_out',
    'ignored'
  ));
