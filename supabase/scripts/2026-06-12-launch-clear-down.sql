-- Launch clear-down — one-off operational script, NOT a migration.
--
-- Run manually in Supabase Studio's SQL Editor when ready for launch.
-- Wrapped in a single transaction: review the verification queries at
-- the bottom BEFORE running, and if anything looks wrong mid-review,
-- nothing has committed.
--
-- WHAT THIS CLEARS (all of it test-era data):
--   - personalised_email_subject / personalised_email_body on every
--     prospect. There is no version-marker column in the schema —
--     prompt versions live in lib/prompts/, not the DB — so nulling
--     subject + body is the complete personalisation reset.
--   - prospect_sends, prospect_replies, prospect_status_transitions:
--     all rows deleted. Every row in these tables predates launch.
--   - suppression_list: all rows deleted. No real opt-outs exist yet;
--     everything in it is a test entry.
--   - prospects.status reset to 'new' (the column default).
--   - prospects.surfaced_in_digest_at nulled, so the whole pool is
--     re-surfaceable by the next digest run.
--
-- WHAT THIS KEEPS (must survive — do not extend the UPDATE):
--   - every prospects row and all of companies_house_raw
--   - director fields: director_name, director_email,
--     director_officer_id
--   - every signals column: psc_corporate_count, psc_individual_count,
--     psc_total_count, psc_status, director_active_appointments,
--     within_pool_director_count, signals_attempted_at,
--     greenfield_flag
--   - ranking_score / ranking_reasoning: deliberately untouched. The
--     rank stage re-scores the full unsurfaced pool on every digest
--     run, so stale test scores are overwritten before they can
--     surface anything; nulling them buys nothing.
--   - digests and cron_runs: audit/observability history, deliberately
--     untouched. The digest double-fire lock only looks back one hour,
--     so old test digest rows cannot block a launch send.
--   - prospect_notes, prospects.starred, prospects.last_action_at,
--     prospects.last_action_by: deliberately untouched per the agreed
--     scope. If you want the dashboard interaction state reset too,
--     uncomment the optional section below before running.
--
-- Side effect: the prospects UPDATE fires the set_updated_at trigger,
-- so updated_at moves to now() on every row. Expected and harmless.

begin;

-- 1. Reset per-prospect pipeline state.
update public.prospects
set
  personalised_email_subject = null,
  personalised_email_body    = null,
  status                     = 'new',
  surfaced_in_digest_at      = null;

-- 2. Delete test interaction history.
delete from public.prospect_sends;
delete from public.prospect_replies;
delete from public.prospect_status_transitions;

-- 3. Clear the suppression list.
delete from public.suppression_list;

-- 4. OPTIONAL — dashboard interaction state. Not part of the agreed
--    scope; uncomment only if you want notes/stars/action markers
--    gone as well.
-- delete from public.prospect_notes;
-- update public.prospects
-- set
--   starred        = false,
--   last_action_at = null,
--   last_action_by = null;

commit;

-- ---------------------------------------------------------------------
-- Verification — run these AFTER the commit, as separate statements.
-- Expected results noted on each.
-- ---------------------------------------------------------------------

-- All four should return 0:
-- select count(*) from public.prospects
--   where personalised_email_subject is not null
--      or personalised_email_body is not null;
-- select count(*) from public.prospects
--   where status <> 'new' or surfaced_in_digest_at is not null;
-- select (select count(*) from public.prospect_sends)
--      + (select count(*) from public.prospect_replies)
--      + (select count(*) from public.prospect_status_transitions);
-- select count(*) from public.suppression_list;

-- Signals data survived — counts should match their pre-run values
-- (non-zero after the backfill):
-- select
--   count(*) filter (where greenfield_flag is not null)   as flagged,
--   count(*) filter (where signals_attempted_at is not null) as attempted,
--   count(*) filter (where director_officer_id is not null)  as with_officer_id,
--   count(*) filter (where director_name is not null)        as with_director,
--   count(*)                                                 as total_prospects
-- from public.prospects;
