-- Phase 2, Checkpoint 2: dashboard data model.
--
-- New tables for notes, manual sends, manual replies, suppression, and
-- the status-transition audit log; new columns on prospects. RLS enabled
-- with the same authenticated-full-access policy as Phase 1 (single user;
-- the agent's service-role client bypasses RLS regardless).
--
-- Purely additive: new tables, nullable/defaulted columns. The agent's
-- existing inserts and the cron pipeline are unaffected.

-- ---------------------------------------------------------------------
-- prospects column additions
-- ---------------------------------------------------------------------
alter table public.prospects
  add column starred boolean not null default false,
  add column last_action_at timestamptz,
  add column last_action_by text
    check (last_action_by in ('system', 'kyle'));

-- ---------------------------------------------------------------------
-- prospect_notes — timestamped, multiple per prospect
-- ---------------------------------------------------------------------
create table public.prospect_notes (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- prospect_sends — manual send records (Phase 1 has no auto-send)
-- ---------------------------------------------------------------------
create table public.prospect_sends (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  sent_at timestamptz not null default now(),
  channel text not null default 'outlook_manual',
  subject text,
  body text,
  notes text
);

-- ---------------------------------------------------------------------
-- prospect_replies — manually-logged replies (Phase 3 automates)
-- ---------------------------------------------------------------------
create table public.prospect_replies (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  received_at timestamptz not null default now(),
  body text,
  sentiment text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- suppression_list — global; the agent checks this before personalising
-- ---------------------------------------------------------------------
create table public.suppression_list (
  email text primary key,
  reason text not null,
  added_at timestamptz not null default now(),
  notes text
);

-- ---------------------------------------------------------------------
-- prospect_status_transitions — audit + future ranker-feedback source
-- ---------------------------------------------------------------------
create table public.prospect_status_transitions (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_at timestamptz not null default now(),
  changed_by text not null check (changed_by in ('system', 'kyle'))
);

-- ---------------------------------------------------------------------
-- Indexes — FK lookups + the primary dashboard filter. Cheap insurance
-- at current volume; correct-for-scale.
-- ---------------------------------------------------------------------
create index prospect_notes_prospect_id_idx
  on public.prospect_notes(prospect_id);
create index prospect_sends_prospect_id_idx
  on public.prospect_sends(prospect_id);
create index prospect_replies_prospect_id_idx
  on public.prospect_replies(prospect_id);
create index prospect_status_transitions_prospect_id_idx
  on public.prospect_status_transitions(prospect_id);
create index prospects_status_idx
  on public.prospects(status);

-- ---------------------------------------------------------------------
-- RLS — authenticated full access, matching the Phase 1 pattern
-- ---------------------------------------------------------------------
alter table public.prospect_notes enable row level security;
alter table public.prospect_sends enable row level security;
alter table public.prospect_replies enable row level security;
alter table public.suppression_list enable row level security;
alter table public.prospect_status_transitions enable row level security;

create policy "authenticated full access" on public.prospect_notes
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.prospect_sends
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.prospect_replies
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.suppression_list
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.prospect_status_transitions
  for all to authenticated using (true) with check (true);
