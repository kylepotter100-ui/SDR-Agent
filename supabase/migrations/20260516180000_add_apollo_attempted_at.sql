-- Phase 1, Checkpoint 5: track Apollo enrichment attempts on prospects.
--
-- Apollo's free/paid plans both charge per match attempt regardless of
-- whether an email is found. apollo_attempted_at is set every time the
-- agent has reached Apollo for a prospect (success or no-match), so a
-- prospect whose director Apollo can't find isn't re-queried every run
-- and the negative result counts as a cached result.
--
-- Failures upstream of the Apollo call (CH officers fetch, network)
-- leave the column null so they can be retried.

alter table public.prospects
  add column apollo_attempted_at timestamptz;
