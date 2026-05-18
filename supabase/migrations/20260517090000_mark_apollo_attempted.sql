-- Phase 1, Checkpoint 5 follow-up: pause Apollo retries while the
-- upgrade decision is deferred.
--
-- The free Apollo plan's credits are insufficient to enrich the
-- current backlog of ~138 prospects. Rather than burn future credits
-- on retries against the same prospects, this migration marks every
-- currently-unattempted prospect as "attempted with no email", so the
-- /api/dev/apollo endpoint (and the eventual Checkpoint 9 cron) skip
-- them on subsequent runs.
--
-- The queue mechanism is left intact: future prospects added by
-- discovery + Places enrichment will still arrive with
-- apollo_attempted_at = null, so once the Apollo plan is upgraded the
-- existing lib/agent/apollo.ts code resumes populating emails for
-- new prospects automatically — no code change needed.
--
-- If a later decision is made to retry Apollo against the prospects
-- this migration marks, run:
--   update public.prospects
--     set apollo_attempted_at = null
--     where director_email is null;

update public.prospects
  set
    apollo_attempted_at = now(),
    director_email = null
  where apollo_attempted_at is null;
