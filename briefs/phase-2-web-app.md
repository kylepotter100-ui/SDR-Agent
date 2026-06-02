# Phase 2 — Web Application Dashboard

**Goal:** Kyle logs into a dashboard, sees the full historical pipeline the agent has surfaced, tracks each prospect through a sales pipeline, records manual sends and replies, manages a suppression list, adds notes, and searches/filters across everything. The Monday digest stays as the weekly nudge; the dashboard becomes the source of truth for pipeline state.

**Estimated effort:** 1 week of focused work, structured as six checkpoints.

**Prerequisites (met):** Phase 1 is in production. The cron orchestration fires weekly. Kyle is **about to start manual outreach** by copy-pasting drafts from the digest into Outlook — so send-tracking, reply-logging, and suppression are live operational needs from day one of Phase 2, not Phase 3 niceties.

---

## What changed since the original brief

This brief was first written before Phase 1 existed. Phase 1 reality differs from the original assumptions in ways that reshape Phase 2:

1. **The `status` field exists but is inert.** Phase 1 created `prospects.status` with a seven-value CHECK (`new`, `surfaced`, `contacted`, `replied`, `qualified`, `dead`, `ignored`) but **nothing in the Phase 1 pipeline ever transitions it** — every prospect is still `new`. The digest sets `surfaced_in_digest_at` (a timestamp) but leaves `status` untouched. Phase 2 is where `status` becomes meaningful: Kyle drives the transitions. The original brief's pipeline used `closed`, which is **not** in the enum — this brief drops `closed` and works with the seven existing values (a CHECK-constraint migration is only needed if we decide we want `closed`; flagged below).

2. **`ignored` is a status, not a boolean.** The original brief proposed `ignored boolean`. Phase 1 already made `ignored` a status value. This brief keeps it as a status and drops the separate boolean. `starred` stays a boolean (orthogonal — you can star a `contacted` prospect).

3. **Director emails are mostly null.** Apollo is paused (free-tier 403s); `director_email` is null for the backlog and `apollo_attempted_at` is set on those rows. The dashboard must treat null emails as a first-class "lookup manually" state, not an error. When Kyle upgrades Apollo, emails backfill on the next cron — the dashboard should reflect whatever's there.

4. **New observability table.** Phase 1 added `cron_runs` (one row per cron invocation, with per-stage `summary` jsonb, `errors`, `status`, `duration_ms`). The dashboard gets a near-free pipeline-health view from this.

5. **Manual sending is the immediate workflow.** Phase 1 has no send capability — Kyle copies drafts into Outlook by hand. This means Phase 2 must support recording *that a send happened*, *when*, and *what came back* — a `prospect_sends` table and manual reply logging — well before Phase 3's automated send-from-app exists.

6. **Deployment is the same Vercel project.** No separate `app.kpsolutions.io` subdomain at launch. The dashboard is added as `/dashboard/...` routes inside the existing Next.js app (`sdr-agent-one.vercel.app`), alongside the cron and dev routes. A custom domain can be pointed at it later without code change.

7. **RLS is already prepared.** Phase 1 enabled RLS on all tables with an `authenticated`-full-access policy — exactly what the dashboard's session-scoped client will use. The agent keeps using the service-role client (`lib/db.ts`), which bypasses RLS. The dashboard uses a *separate, session-scoped* client so RLS actually applies.

---

## Success criteria

1. Kyle logs in via Supabase Auth magic link from desktop or mobile; only his allowlisted email is admitted.
2. Home view shows current pipeline at a glance: counts per status, this week's surfaced prospects, prospects awaiting a reply, recently-changed.
3. Any prospect opens to a detail view: full record, email draft (copyable), status controls, notes, send history, reply log.
4. Status changes, notes, sends, and replies persist immediately and are reflected across views on next navigation.
5. Kyle can record a manual send (date + which draft) and log a reply against a prospect, moving it through the pipeline.
6. Suppression list works end-to-end: Kyle marks an address/prospect suppressed, and the **agent pipeline excludes suppressed prospects** from future personalisation and digests.
7. Mobile-first: every view works cleanly at ~390px with no horizontal scroll.

---

## What this phase adds

- Supabase Auth (single-user, email magic link) + middleware allowlist
- `@supabase/ssr` request-scoped clients for the dashboard (distinct from the agent's service-role `lib/db.ts`)
- `/dashboard` protected route group in the existing Next.js app
- Home / pipeline overview
- Prospect list with filters + search
- Prospect detail with status controls, notes, send history, reply log
- **Manual send recording** (`prospect_sends`)
- **Manual reply logging** (replies captured against a prospect; status auto-suggests `replied`)
- **Suppression list** (`suppression_list`) + agent-pipeline enforcement
- Notes per prospect (timestamped, multiple)
- Star / ignore lightweight feedback
- Digest history archive (reads existing `digests`)
- Pipeline-health view (reads existing `cron_runs`)
- Status-transition audit log (`prospect_status_transitions`)
- **Filed-accounts surface** — when Companies House has filed accounts for a prospect, show turnover / profit / key financials in the detail view (sparse for new businesses, valuable when present; informs pricing + qualification)
- **Director portfolio signal** — count of the director's other appointments and whether those companies have filed accounts (proxies for "serial operator with scale"; informs pricing positioning)

## What this phase explicitly does NOT build

- No automated send-from-app / Outlook OAuth (Phase 3)
- No automated reply detection or classification (Phase 3) — replies are logged **manually** in Phase 2
- No team/multi-user features (schema stays multi-user-ready; UI is single-user)
- No charts/reporting beyond the pipeline counter strip and the cron-health list
- No CRM deal-value/forecast tracking
- No Kanban board (list-with-status-filter is faster on mobile)
- **No ranker preference-learning loop** — the status-transition log is *recorded* in Phase 2, but feeding it back into the Opus ranking prompt is deferred (it's a data-dependent prompt iteration, consistent with the Phase 1 "iterate after real data" discipline). Flagged as a stretch checkpoint, likely Phase 2.5.

---

## Auth

Supabase Auth, email magic link only. **Allowlist of one email**, hardcoded in middleware — no signup, no password flow, no recovery.

**Open question for Kyle:** which email is the allowlist entry? The original brief said `kyle@kpsolutions.io`, but the operational reality is `kylepotter100@gmail.com` (the verified Resend recipient). Likely the gmail to start, switching to `kyle.potter@kpsolutions.io` once that mailbox is live. **Confirm before CP1.**

Schema is built multi-user-ready (RLS, per-row ownership where it'd matter later) but the UI and allowlist are single-user.

---

## Deployment

Same Vercel project, same Next.js app. The dashboard is a new route group; the agent crons and dev routes are untouched. No new subdomain at launch — `sdr-agent-one.vercel.app/dashboard`. A vanity domain can be attached in Vercel later with zero code change.

`vercel.json` cron config is unaffected. Middleware will need to scope auth checks to `/dashboard/*` and explicitly **exclude** `/api/cron/*` and `/api/dev/*` (those use Bearer-token auth, not session auth) so we don't accidentally gate the agent behind a login.

---

## Routes structure

```
sdr-agent-one.vercel.app/
├── /                          (existing minimal landing — add a "log in" link)
├── /login                     (magic-link request form)
├── /auth/callback             (magic-link handler)
├── /api/cron/*                (existing — Bearer auth, NOT session-gated)
├── /api/dev/*                 (existing — Bearer auth, NOT session-gated)
└── /dashboard                 (protected — session + allowlist)
    ├── /                      (home: pipeline overview)
    ├── /prospects             (list with filters + search)
    ├── /prospects/[id]        (detail: record, draft, status, notes, sends, replies)
    ├── /digests               (digest history archive)
    ├── /suppression           (suppression list management)
    ├── /pipeline-health       (recent cron runs, costs, stage status)
    └── /settings              (postcode prefixes, SIC tier weights)
```

---

## Views

**Home (`/dashboard`).** Pipeline counter strip across the top (New / Surfaced / Contacted / Replied / Qualified / Dead / Ignored). Below, three focus lists:
1. *Surfaced, not yet sent* — in a digest, `status` still `new`/`surfaced`, no `prospect_sends` row. The "act on these" list.
2. *Awaiting reply* — sent (`prospect_sends` exists), no reply logged, sent > 4 days ago.
3. *Recently changed* — any status transition / note / send / reply in the last 48h.

Row: business name, status pill, signal line, last-action timestamp. Tappable.

**Prospect list (`/dashboard/prospects`).** Table on desktop, card stack on mobile. Columns: name, location, SIC tier, status, ranking score, last action. Sticky filter bar: status (multi-select), SIC tier, postcode prefix, has-email (yes/no — useful while Apollo is paused), text search. Default sort: ranking score desc, then `surfaced_in_digest_at` desc.

**Prospect detail (`/dashboard/prospects/[id]`).** Single column mobile, two columns desktop.
- Facts: name, address, director (+ email or "lookup manually"), signal, ranking score + reasoning, Companies House link, website/Facebook links, incorporation date.
- Email draft in a copyable `<pre>`/code block (same content the digest shows).
- Status control (dropdown over the seven values, writes a transition row).
- Send recorder: "Mark sent" → records `prospect_sends` (date, optional channel note), auto-suggests moving status to `contacted`.
- Reply log: add a reply (free text + received date), auto-suggests `replied`.
- Notes thread (add, see history).
- Star / ignore buttons. Suppress button (adds to suppression list + sets status `ignored`).

**Digest history (`/dashboard/digests`).** Reverse-chrono from the `digests` table. Each entry expands to its 15 prospect_ids with *current* status overlaid ("of the 15 sent 12 May, 2 are now qualified").

**Suppression (`/dashboard/suppression`).** List of suppressed addresses/prospects with reason and date. Add manually (paste an email or mark from a prospect). This is the table the **agent reads** before personalising or surfacing.

**Pipeline health (`/dashboard/pipeline-health`).** Reverse-chrono `cron_runs`: kind (prepare/digest/manual), status (ok/partial/failed), per-stage counts + durations, total cost, errors. Gives Kyle "did Monday's run work and what did it cost" without digging through Vercel logs.

**Settings (`/dashboard/settings`).** Postcode prefix list and SIC tier weights. These currently live as constants in `lib/config.ts` — making them DB-backed and editable is a real change to the agent (it would read config from the DB instead of the source file). **Flagged as scope:** this is more than a dashboard view; it's an agent refactor. Recommend CP-deferring or making settings read-only-display in Phase 2 and editable in a follow-up. Decide at planning.

---

## Data model additions

Reconciled against the actual Phase 1 schema (`companies_house_raw`, `prospects` incl. `apollo_attempted_at` / `surfaced_in_digest_at` / `ranking_*` / `personalised_email_*`, `digests`, `cron_runs`).

```sql
-- Notes (timestamped, multiple per prospect)
prospect_notes (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references prospects(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
)

-- Manual send records (Phase 1 has no auto-send; Kyle copy-pastes)
prospect_sends (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references prospects(id) on delete cascade,
  sent_at timestamptz not null default now(),
  channel text not null default 'outlook_manual',
  subject text,                 -- snapshot of what was sent
  body text,                    -- snapshot of what was sent
  notes text
)

-- Manually-logged replies (Phase 3 automates detection)
prospect_replies (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references prospects(id) on delete cascade,
  received_at timestamptz not null default now(),
  body text,
  sentiment text,               -- free text / coarse label, Kyle's call
  created_at timestamptz not null default now()
)

-- Global suppression list — the agent checks this before personalising/surfacing
suppression_list (
  email text primary key,
  reason text not null,         -- unsubscribe, bounce, manual_block
  added_at timestamptz not null default now(),
  notes text
)

-- Status transition audit (also the future ranker-feedback source)
prospect_status_transitions (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references prospects(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_at timestamptz not null default now(),
  changed_by text not null      -- 'kyle' | 'system'
)

-- New columns on prospects
alter table prospects add column starred boolean not null default false;
alter table prospects add column last_action_at timestamptz;
alter table prospects add column last_action_by text;   -- 'system' | 'kyle'
```

Notes:
- **`ignored`** stays a `status` value — no boolean column.
- **`last_action_at`** is distinct from the existing `updated_at` (which the trigger bumps on any write). `last_action_at` is human/meaningful-action time, for the home view's "recently changed" / "awaiting reply".
- Every new table gets RLS enabled + the `authenticated`-full-access policy, matching the Phase 1 pattern. Migrations are hand-authored SQL applied via Supabase Studio, and `lib/db.types.ts` is hand-updated (per the standing convention).
- **Suppression enforcement is an agent change**, not just a table: `discover`/`personalise` (and the digest selection) must skip prospects whose `director_email` is in `suppression_list`. That touches Phase 1 agent modules — scoped into CP5.

---

## UI library decision

**Tailwind v4 (already in the project) + shadcn/ui.** Recommendation and reasoning:

- shadcn/ui is copy-in components (not a runtime dependency lock-in) built on Radix primitives + Tailwind. We pull in only what we need — button, input, dropdown/select, dialog, table, card, badge (status pills), tabs. Accessible by default, restyle freely, no heavyweight design-system commitment.
- It suits an internal tool: quiet, functional, not over-designed — exactly the "craft tool not marketing surface" intent from the original brief.
- It's the path of least resistance on Next 16 / React 19 / Tailwind v4, which this project already runs.

**Verification flag:** shadcn/ui's Tailwind v4 + React 19 support is recent; CP1's first task is confirming the `shadcn` init works cleanly on this exact stack before building on it. If it fights the toolchain, fallback is hand-rolled Tailwind components for the ~7 primitives we need — more code, zero new dependency, equally fine for this scope.

**Design tokens:** keep it minimal and neutral — a small neutral palette, one accent, system-font or a single self-hosted sans, generous spacing, status pills colour-coded by pipeline stage. No elaborate design language needed for a single-user internal tool. Agree the palette + status-pill colours at CP1, not before.

---

## Checkpoint sequence

Six checkpoints, same discipline as Phase 1: small reviewable units, one feature branch + PR each, preview-first, pause for Kyle's review before the next.

**CP1 — Auth, shell, component baseline.** Supabase Auth wired (`@supabase/ssr` server + client helpers), `/login` + `/auth/callback`, `middleware.ts` gating `/dashboard/*` against session + single-email allowlist (and explicitly NOT gating `/api/*`). shadcn/ui initialised and verified on the stack; status-pill + base components sketched. Empty authenticated `/dashboard` shell with nav. *Review: Kyle can log in on mobile and desktop; an un-allowlisted email is refused; the agent crons/dev routes still work unauthenticated.*

**CP2 — Data-model migration.** All new tables + columns above, RLS + policies, hand-updated `lib/db.types.ts`. No UI yet — migration applied in Studio, types committed. *Review: tables visible in Studio; a dummy insert/read per table; existing agent pipeline unaffected.*

**CP3 — Prospect list + detail (read-only).** List with filters/search; detail view rendering the full record + copyable draft. No writes yet. *Review: real Phase 1 prospects render correctly on mobile; null-email prospects show the manual-lookup state; filters work.*

**CP4 — Status, notes, star/ignore (writes).** Status dropdown writing transition rows and driving `prospects.status` for real; notes thread; star/ignore; `last_action_at`/`last_action_by` maintained. *Review: changing status on mobile persists and shows in the list; transition log records correctly.*

**CP5 — Sends, replies, suppression (+ agent enforcement).** Mark-sent recorder, reply logging, suppression list management UI, **and** the agent-side change so `personalise`/digest skip suppressed addresses. *Review: record a send → status suggests contacted; log a reply → status suggests replied; add a suppression → confirm the next `personalise` run skips that prospect.*

**CP6 — Home, digest history, pipeline health.** The overview with the three focus lists; digest archive with current-status overlay; cron-health view. *Review: home reads as a useful Monday-morning operational glance; digest history shows status drift; pipeline-health surfaces the last run's cost + status.*

**CP7 — Companies House financial + portfolio signals.** Two new read-only data surfaces on the prospect detail view, both pulled live from Companies House when the page loads (no new cron stage, no storage — CH's 600-req/5-min limit is generous and these are on-demand, one-prospect-at-a-time reads):
- *Filed accounts* — `GET /company/{number}/filing-history` and `/company/{number}/accounts` for turnover / profit / key financials when present. Sparse for fresh incorporations (most of our pool), valuable when a prospect has trading history. Informs pricing + qualification.
- *Director portfolio* — `GET /officers/{officer_id}/appointments` for the count of the director's other appointments and whether those companies have filed accounts. Proxies for "serial operator with scale" and informs pricing positioning. Shown next to the director name.

The Companies House client (`lib/companies-house.ts`) gains two helpers for these endpoints. Fetching is on-demand and failure-tolerant — a CH hiccup degrades these panels to "unavailable", never blocks the detail view. Flagged: officer_id comes from the officers payload (CP5/Phase-1 officers lookup), so for prospects where we never resolved an officer_id the portfolio panel shows "director not resolved".

**CP8 (stretch / Phase 2.5) — Ranker preference feedback.** Feed status transitions into the weekly Opus ranking prompt ("Kyle qualified these, ignored those — here's the pattern"). Deferred and data-dependent; only worth doing once there's real transition history. Not committed in the Phase 2 week.

---

## Risk / scope flags

- **Settings editability is an agent refactor, not a view.** Making postcode prefixes / SIC weights DB-editable means the agent reads config from the DB instead of `lib/config.ts`. Recommend Phase 2 ships settings as read-only display (or omits the page) and editability lands as a scoped follow-up. Don't let it balloon CP6.
- **Suppression enforcement touches Phase 1 agent code.** It's the one place Phase 2 reaches back into the working pipeline. Keep the change surgical (a single suppression check in the personalise candidate query and the digest selection) and test it carefully against the live pipeline — a bug here could skip legitimate prospects.
- **Realtime is deferred.** The original brief suggested Supabase Realtime for multi-tab sync. For a single user it's over-engineering; refetch-on-navigation is enough. Add Realtime only if Kyle finds himself wanting it.
- **Service-role vs session client discipline.** The dashboard MUST use the session-scoped `@supabase/ssr` client (RLS applies), never `lib/db.ts` (service role, RLS bypassed). Mixing them up would either break under RLS or silently over-grant. Call this out in CP1 and hold the line.
- **The `status` enum may want `closed`.** The original brief used it; the Phase 1 CHECK doesn't have it. If the pipeline genuinely needs a terminal "won/closed" distinct from `qualified`, that's a one-line CHECK-constraint migration — decide during CP4 design, don't assume.
- **Auth email must be confirmed** before CP1 (gmail vs kpsolutions.io).
- **Mobile-first is load-bearing.** Kyle reviews on a phone. If a view is awkward at 390px the design is wrong, not the viewport.
- **No design language hand-off needed.** Unlike the original brief's "design tokens TBC" gate, this brief deliberately keeps the visual layer minimal-neutral so Phase 2 isn't blocked waiting on a brand system. If a fuller design language emerges later it can restyle the shadcn components without structural change.

---

## Where Phase 3 picks up

Phase 3 adds the automated **send** and **reply detection** that Phase 2 does manually. The detail page's copyable draft gains a "Send via Outlook" action (Microsoft Graph OAuth); `prospect_sends` rows start being written by the system instead of by Kyle's "mark sent"; `prospect_replies` start being populated by Graph inbox subscriptions instead of manual logging; the suppression list built in Phase 2 becomes the hard gate on automated sends. The manual scaffolding from Phase 2 is the fallback and the data model both phases share.

**Sequencing note (post strategic update):** Kyle is now building the full system before any outreach — no manual sends. Phase 2 and Phase 3 run back-to-back; Phase 3 is proposed immediately after Phase 2's CP6 lands rather than pausing for "real reply data" (the data will come from automated sending, not manual). The Phase 2 manual send/reply scaffolding (`prospect_sends`, `prospect_replies`, the "mark sent" / reply-log UI) is therefore built as the durable data model and the manual fallback, but is not expected to see heavy manual use before Phase 3 automates it.

## Deferred items log (carried from Phase 1, still open)

- **Rank batching — PRE-LAUNCH BLOCKER, not optional.** `rank()` currently issues a single Opus 4.7 call over the entire unsurfaced pool. At ~167 prospects this already risks the 300s function ceiling on `/api/dev/rank` and `/api/cron/weekly-digest` (both `maxDuration = 300`), and the pool grows ~35/week net (discovery +50, digest surfaces 15), so the Monday cron **will** time out in production and worsen over time. The `?limit=N` dev param (shipped with the positioning realignment) is a review aid only — it does not protect the production cron. Required fix before relying on the Monday cron for live sends: batch the pool into ~80-prospect chunks, one Opus call per chunk within a single invocation (system-prompt cache hits carry across chunks), merge all rankings before persistence and top-15 selection. Separate PR after the realignment merges. A short-term `effort: medium → low` re-time may buy headroom but is explicitly not the durable answer.
- **Apollo reactivation** — Kyle subscribes Apollo Basic (~$59-65/mo, tier TBC with Apollo sales to confirm `/people/match` is included) **after Phase 3 ships**, then runs `UPDATE prospects SET apollo_attempted_at = NULL WHERE director_email IS NULL;` to backfill director emails on the next cron. No code change — the existing `lib/agent/apollo.ts` resumes producing emails.
- **Post-data prompt iterations** — CTA-templating refinement, ranking-reasoning specificity, website-found pitch tuning. Now fed by automated-send reply data rather than manual sends.
- **CP8 ranker preference feedback** — see above; data-dependent.
- **Monday auto-fire validation** — passive C10 confirmation on the first unattended weekly run.
