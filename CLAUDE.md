# KP Solutions SDR Agent

## Project mission

This is an autonomous prospecting agent for KP Solutions. It exists to solve the cold-start problem of finding the first 5-20 customers for a productised vertical SaaS strategy — UK businesses (East Midlands at launch, wider over time) that run bookable services and would benefit from a custom-built website with integrated booking management, modelled on the Potter Sanctuary build.

The agent does three things:

1. **Discover** — pulls newly incorporated UK businesses from Companies House in target SIC codes and postcode regions, cross-references each against Google Places to identify those without proper digital presence.
2. **Personalise** — uses Claude Sonnet 4.6 to generate a bespoke first-touch email per prospect, grounded in observable details about that specific business.
3. **Surface** — ranks each week's candidates using Claude Opus 4.7 and delivers a Monday digest of the top 15 directly to Kyle Potter, plus (from Phase 2) a web dashboard for tracking the full pipeline.

The agent is itself a case study. It's the second product line and the proof-of-craft demo for the Labs side of KP Solutions. Build it like a customer would see it.

---

## Working method (read this every session)

Claude Code **must** follow this workflow on every task in this repo. The user has explicitly requested this rigour — do not skip steps even when they feel redundant. The point is reviewability, not speed.

### 1. Read before doing

At the start of any session or new task, read this `CLAUDE.md` and the relevant phase brief in full. Confirm what you've understood in one short paragraph before proposing anything.

### 2. Plan before executing

Before writing or modifying any code, file, schema, or configuration, propose a plan in chat covering:

- What you'll do
- Why (in one sentence per item)
- The order of operations
- What you'll defer to a later step or phase
- Where you see risk or uncertainty

**Wait for explicit approval from the user before any execution.** Once a plan is approved, you may execute it without confirming each step — the approval covers the plan, not each line of code.

### 3. Use the todo system

For any task with more than one step:

- Create a `TodoWrite` list immediately after the plan is approved
- Each todo is a discrete, completable unit of work — "fetch Companies House list for LE postcode and log the count to console" not "build the agent"
- Mark todos as `in_progress` before starting them and `completed` immediately on finish
- The list is the user's visible progress tracker — keep it accurate at all times

### 4. Check off as you go

After each todo is completed, report briefly in chat: what was done, any decisions made, and what's next. **Don't batch ten completions into one update.** The rhythm of report-after-each is what gives the user confidence and a chance to course-correct early.

### 5. Pause at named checkpoints

The phase briefs include numbered checkpoints (e.g. "Checkpoint 3: Companies House discovery working"). When you reach one:

1. Stop work
2. Report in chat what was built since the last checkpoint
3. Surface anything the user should review themselves — a generated email, a SQL migration, a deployment URL, sample output
4. **Wait for the user to confirm** before continuing to the next section

### 6. Ask before destructive or expensive operations

NEVER run any of these without explicit, in-the-moment approval:

- Database migrations against production
- `git push --force`, `git reset --hard`, branch deletion
- Removing or overwriting environment variables
- Deploying to production
- Sending real emails to real prospects (even tests of the digest with non-Kyle recipients)
- Calling paid APIs (Apollo, Google Places, Anthropic) in any loop that could rack up cost beyond a few pounds

For each: propose the command, explain the consequence, wait. State the expected cost in pounds where relevant.

### 7. Commit small, commit often

- One concern per commit
- Commit message: imperative present-tense, explains the why (e.g. "Add Companies House client with rate-limit-aware fetch", not "updated files")
- Push to a feature branch (`phase-1/<component>`), never directly to `main`
- Open a pull request when the branch represents a complete reviewable unit; the user will merge

### 8. Document non-obvious decisions

When you make a technical choice that future-you might question — "why is the discovery module in `lib/agent/` instead of `app/api/`?" — write a short note in `docs/decisions/`, dated and named for the topic. Two to four paragraphs is fine. The audit trail matters more than the prose.

### 9. Run end-to-end before polishing

Get the loop working with mock data first. Don't add caching, retry logic, exhaustive validation, or types-everywhere until the happy path is proven and reviewed. Polish second, optimisation third.

### 10. When stuck, surface — don't spiral

If you've tried something twice and it's not working, stop. Explain in chat what you tried, what you expected, what happened, and ask. Don't spiral into a third attempt without checking in. Two attempts is the limit.

---

## Stack

- **Frontend & backend**: Next.js 15 with App Router, TypeScript, deployed to Vercel
- **Database**: Supabase (Postgres + Auth + Storage), accessed via the Supabase MCP for schema migrations and queries
- **Agent scheduling**: Vercel Cron for the weekly Monday run
- **AI**: Anthropic Claude API — Sonnet 4.6 (`claude-sonnet-4-6`) for personalisation, Opus 4.7 (`claude-opus-4-7`) for ranking and reply classification
- **Data sources**: Companies House Public Data API (free), Google Places API (paid, low volume), Apollo.io via MCP (paid, Phase 1+)
- **Email**: Resend for transactional sends to Kyle's inbox (Phase 1); Microsoft Graph API + Outlook OAuth for sending from `kyle.potter@kpsolutions.io` (Phase 3)
- **Auth**: Supabase Auth (single-user for now, multi-user-ready)
- **Styling**: Tailwind v4. Design tokens to be confirmed before Phase 2 begins — do not import any colours, fonts, or visual conventions from earlier KP Solutions projects.

---

## MCPs to use

Claude Code should install and use these MCP servers. The getting-started guide walks through installation.

- **Supabase MCP** — for all schema migrations, RLS policies, seed data, and ad-hoc queries during development. Do not write raw SQL files outside `supabase/migrations/`; use the MCP to generate them.
- **Apollo MCP** — for contact enrichment in the discovery pipeline (Phase 1 onward).
- **Microsoft 365 MCP** — for Outlook inbox search and reply detection (Phase 3 onward). Sending goes via Microsoft Graph direct, not the MCP.
- **Vercel MCP** — optional but useful for deployment status, log fetching, and environment variable management.

---

## Phased build plan

Three phases, each shipping independent value. Status tracked here — update as phases complete.

- [ ] **Phase 1** — Backend agent + weekly digest email. See `briefs/phase-1-backend-digest.md`. Target: 3-5 focused days.
- [ ] **Phase 2** — Web app dashboard for lead tracking. See `briefs/phase-2-web-app.md`. Target: 1 week. **Do not start until Phase 1 is in production and has produced at least two digests.**
- [ ] **Phase 3** — Outlook OAuth send and reply detection. See `briefs/phase-3-send-from-app.md`. Target: 1 week. **Do not start until Phase 2 has been used for at least 30 manual sends.**

Phase 1 ships first and runs in production before Phase 2 begins. Don't pre-build Phase 2 components in Phase 1.

---

## Code conventions

- TypeScript strict mode. No `any` unless interfacing with an untyped third party, in which case wrap it in a typed boundary at the soonest opportunity.
- ES modules, async/await, no callbacks
- Server-side logic in `app/api/` route handlers or `lib/agent/` modules
- Database access through a single `lib/db.ts` Supabase client wrapper, not scattered imports
- Environment variables in `.env.local`, documented in `.env.example`, never committed
- All AI prompts live in `lib/prompts/` as their own files, exported as constants. One file per prompt. Easier to iterate on copy without redeploying logic.
- UK English throughout (code, comments, copy, prompts, commit messages) — "personalisation" not "personalization", "organisation" not "organization", "behaviour" not "behavior"

---

## Voice, brand, and content

- **The KP voice**: confident, considered, plain. No marketing hype, no exclamation marks, no emojis. Short sentences when the point is sharp; longer ones when the thought has shape.
- **Cold email tone**: human, specific, light. Each email should sound like Kyle typed it after looking at the prospect's Facebook page for 90 seconds. Never templated-feeling.
- **Audience for the digest**: Kyle Potter, founder, reads on mobile Monday morning. Optimise for fast skimming. The top three prospects should be obvious within five seconds.

---

## Important context

- **Geographic scope at launch**: postcodes LE, NG, DE, NN (East Midlands). Designed to be parameter-driven so wider expansion is a config change, not a refactor.
- **Volumes**: 50-80 new candidates per week pre-filter from Companies House; agent narrows to top 15 in the digest.
- **Reply rates to target**: 5-10% is a realistic ceiling for cold to small-business owners in this space with good personalisation. Below 3% means the personalisation isn't working; above 12% probably means we got lucky on a niche.
- **What "good" looks like**: a prospect in the Monday digest where Kyle reads the personalised email and thinks "that's exactly what I'd have written, but I didn't have to write it."
- **Sending identity (Phase 3)**: From Name `"Kyle Potter"` (or `"Kyle at KP Solutions"`), From Address `kyle.potter@kpsolutions.io`. Display name and address are separate fields in Microsoft 365 — the address is the technical identity, the From Name is what recipients see in their inbox preview.

---

## Where to find what

- `briefs/` — phase-by-phase implementation briefs. Start here for any phase.
- `docs/getting-started.md` — the setup walkthrough Kyle works through before Phase 1 coding begins.
- `docs/decisions/` — short notes on non-obvious technical decisions. Write one whenever you make a call future-you might question.
- `lib/agent/` — agent pipeline modules (discovery, enrichment, personalisation, ranking).
- `lib/prompts/` — AI prompt strings, one per file.
- `app/api/` — Next.js route handlers including cron endpoints.
- `app/(dashboard)/` — the web app UI (Phase 2 onward).
- `supabase/migrations/` — DB schema changes, written via the Supabase MCP.
