# Phase 2 — Web Application Dashboard

**Goal:** Kyle can log into a web app at `app.kpsolutions.io`, see the full historical pipeline of prospects surfaced by the agent, track each one through a sales pipeline (new → contacted → replied → qualified → closed → dead), add notes, mark prospects as ignored, and search/filter across everything. The Monday digest becomes a summary of new entries; the dashboard becomes the source of truth.

**Estimated effort:** 1 week of focused work.

**Prerequisites:** Phase 1 is in production. At least two weeks of digest history exists. Kyle has used the digest workflow and can articulate which views he actually needs (not the views he thinks he needs).

## Success criteria

1. Kyle can log in at `app.kpsolutions.io` from desktop or mobile.
2. The home view shows the current pipeline: counts by status, this week's new prospects, this week's responses, and a focus list of "next actions."
3. Clicking any prospect opens a detail view with the full record, the email draft, status controls, and notes.
4. Status changes persist immediately and are reflected in the home view.
5. The agent ingests Kyle's status changes as preference signal — prospects marked "qualified" or "ignored" influence next week's ranking.
6. Mobile-first: every view works cleanly on iPhone-width without horizontal scroll or zoom.

## What this phase adds

- Supabase Auth (single-user, email magic link)
- `/dashboard` route group, protected
- Home view with pipeline overview
- List view with filters and search
- Detail view per prospect
- Status pipeline UI (Kanban-light or list-with-status — see design notes)
- Notes per prospect (free-text, multiple entries, timestamped)
- Manual prospect creation (so Kyle can add leads he finds elsewhere)
- "Ignore this one" / "Star this one" lightweight feedback that feeds the ranker

## What this phase explicitly doesn't build

- No Gmail send-from-app (Phase 3)
- No reply auto-detection or classification (Phase 3)
- No team/multi-user features
- No advanced reporting/charts beyond a simple pipeline counter strip
- No CRM-style deal value / forecast tracking

## Auth

Supabase Auth, email magic link only. Single allowed email at launch: `kyle@kpsolutions.io`. Hardcoded allowlist in middleware — no signup form, no password reset, no recovery flow. Phase 4+ may add team members; design the schema to support it but don't build it.

## Dashboard structure

```
app.kpsolutions.io/
├── /                          (public landing — minimal, just a "log in" button)
├── /auth/callback             (magic link handler)
└── /dashboard                 (protected)
    ├── /                      (home: pipeline overview)
    ├── /prospects             (full list with filters)
    ├── /prospects/[id]        (single prospect detail)
    ├── /digests               (digest history archive)
    └── /settings              (postcode config, SIC weights, sending hours)
```

## Views

**Home (`/dashboard`).** A scannable pipeline strip across the top showing counts per status (New 23 / Contacted 8 / Replied 2 / Qualified 1). Below: a "focus" list — three sections:
1. *New this week* — prospects surfaced in the most recent digest, not yet actioned. Tappable to detail view.
2. *Awaiting reply* — contacted more than 4 days ago, no status change since. These are follow-up prompts.
3. *Recently changed* — anything Kyle (or the system) updated in the last 48 hours, so context is fresh.

Each list row: business name, status pill, signal line, last action timestamp. Tappable.

**Prospect list (`/dashboard/prospects`).** Table view (mobile: card stack). Columns: name, location, SIC tier, status, ranking score, last action. Sticky filter bar at top: status (multi-select), SIC tier (multi-select), postcode prefix, text search. Default sort: ranking score descending, then surfaced-at descending.

**Prospect detail (`/dashboard/prospects/[id]`).** Single column on mobile, two columns on desktop. Left/top: the prospect facts (name, address, director, signal, ranking, ranking reasoning, Companies House link, Maps link, Facebook link). Right/bottom: status controls, the personalised email draft in a copyable code block, notes thread (add new, see history), "star" and "ignore" buttons.

**Digest history (`/dashboard/digests`).** Reverse-chrono list of every weekly digest. Each opens to show which 15 prospects were in it, with current statuses overlaid so Kyle can see "of the 15 sent on March 4th, 3 are now in qualified."

**Settings (`/dashboard/settings`).** Two things initially: postcode prefix list (add/remove from the agent's catchment) and SIC tier weights (sliders). Changes take effect the next time the agent runs.

## Design system

**To be confirmed before Phase 2 implementation begins.** A new design language will be defined for KP Solutions and applied here — do not import colours, typography, or visual conventions from any previous KP Solutions projects. This brief intentionally leaves the visual layer open; what matters at the structural level is:

- **Mobile-first** — every view designed for ~390px width first, enhanced for desktop
- **Scannable** — Kyle reviews this on phone, on the move; visual hierarchy serves fast skim
- **Quiet, not flashy** — this is a craft tool, not a marketing surface; restraint reads as confidence
- **Status pills, type scale, spacing tokens, and core component patterns** will be agreed before any UI is built

When Phase 2 begins, the first sub-task is finalising the design tokens and producing a minimal component sketch (header, list row, prospect card, status pill, button states) before any dashboard pages are coded.

## Data model additions

Extend the Phase 1 schema:

```sql
-- New table for notes
prospect_notes (
  id uuid primary key,
  prospect_id uuid not null references prospects on delete cascade,
  body text not null,
  created_at timestamptz default now()
)

-- New columns on prospects
alter table prospects add column starred boolean default false;
alter table prospects add column ignored boolean default false;
alter table prospects add column last_action_at timestamptz;
alter table prospects add column last_action_by text;  -- 'system' or 'kyle'

-- Status transitions log (audit + ranker feedback)
prospect_status_transitions (
  id uuid primary key,
  prospect_id uuid not null references prospects on delete cascade,
  from_status text,
  to_status text not null,
  changed_at timestamptz default now(),
  changed_by text not null
)
```

The transitions table is what feeds Phase 2's ranker improvement: next week's Opus ranking call gets a summary of "Kyle qualified 2 from last week's digest and ignored 5; here's what they had in common." That's preference learning by example, no fine-tuning needed.

## Implementation notes

**Route grouping.** Use Next.js route groups: `app/(public)/` for the landing, `app/(dashboard)/` for the protected app, both within the single `app.kpsolutions.io` Next.js project.

**Middleware auth.** Single `middleware.ts` checks Supabase session and email allowlist. Redirects unauthenticated requests to `/` with a `?from=` param so post-login lands on the requested page.

**RLS.** Even single-user, set up row-level security on all tables now — it's near-free and Phase 4+ will need it. Single policy: authenticated users can read/write everything (will tighten when multi-user).

**Realtime.** Use Supabase Realtime subscriptions on the home view so status changes from one tab show in another. Don't over-engineer — one channel per table is fine.

**Mobile-first.** Every view is designed for 390px-wide first, then enhanced for desktop. If a view is hard to build for mobile, the design is wrong, not the implementation.

**Don't build a Kanban board.** Tempting, but a list-with-status-filter is faster for Kyle on mobile than a horizontal-scrolling Kanban. Save Kanban for v3 if it earns its place.

## Where Phase 3 picks up

Phase 3 adds the *send* button. That means Microsoft OAuth, sender subdomain setup, deliverability hardening, and reply detection via Microsoft Graph. The prospect detail page in Phase 2 already shows the email draft in a copyable block — Phase 3 adds a "Send via Outlook" action next to it that handles the OAuth flow.

The status pipeline already has "contacted" — Phase 3 just makes the transition automatic when the send button is pressed, and adds the "replied" auto-transition when a reply is detected.
