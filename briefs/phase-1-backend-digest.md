# Phase 1 — Backend Agent and Weekly Digest

**Goal:** Every Monday at 08:00 UK time, Kyle Potter receives an email containing 15 ranked prospect businesses with personalised first-touch email drafts for each. No web UI yet. No auto-send. The loop must work end-to-end with real data before Phase 2 begins.

**Estimated effort:** 3-5 focused days, structured as ten checkpoints.

---

## Success criteria

The phase is done when all of these are true:

1. Kyle has received at least two weekly digest emails on consecutive Mondays in production, each containing 15 prospects.
2. Each prospect in the digest has: business name, location, SIC code & description, registered office, director name, an observable "signal" (e.g. "no website detected, Facebook-only presence"), a ranking score with reasoning, and a ready-to-send personalised email draft.
3. Kyle can copy any draft into Outlook and send it without rewriting more than one sentence.
4. Data persists in Supabase so Phase 2 has historical pipeline to display.
5. The agent re-runs on a Vercel Cron schedule without manual triggering.
6. The total monthly cost (Maps + Apollo + Anthropic + Resend) is under £30.

---

## What this phase builds

A pipeline that runs end-to-end every Monday:

```
Companies House  →  SIC + Postcode filter  →  Maps cross-reference
       ↓                                              ↓
   Apollo enrichment              Website-absent classification
       ↓                                              ↓
              ↘                          ↙
                   Combined prospect record
                          ↓
              Personalisation (Sonnet 4.6)
                          ↓
              Ranking & top-15 selection (Opus 4.7)
                          ↓
                Digest email to Kyle (Resend)
                          ↓
                Persist to Supabase
```

## What this phase explicitly doesn't build

- No web dashboard (Phase 2)
- No Outlook OAuth or send-from-Kyle's-address (Phase 3)
- No reply detection (Phase 3)
- No multi-user auth
- No prospect deduplication across weeks beyond a simple Companies House number check (Phase 2 will add fuzzier matching)
- No follow-up sequences

If you find yourself building any of the above in this phase, stop and ask.

---

## Target SIC codes

These are the codes the agent filters on. Each has a fit weight (1.0 = perfect, 0.5 = marginal) that feeds the ranking layer. Don't treat the list as fixed — log every prospect that *almost* matched so the user can tune over time.

### Tier 1 — Time/space/capacity booking (weight 1.0)
Closest fit to the Potter Sanctuary archetype.

- `93110` — Operation of sports facilities (padel, tennis, climbing, 5-a-side)
- `93199` — Other sports activities n.e.c. (escape rooms, axe throwing, archery)
- `93290` — Other amusement and recreation activities n.e.c. (dog fields, soft play)
- `55209` — Other holiday and short-stay accommodation (glamping, shepherd huts)
- `55300` — Camping grounds, recreational vehicle parks (glamping sites)
- `96040` — Physical well-being activities (saunas, ice baths, wellness studios)
- `90030` — Artistic creation (independent ceramicists, potters, artists)
- `90040` — Operation of arts facilities (pottery studios, makerspaces, small galleries)

### Tier 2 — Class and course shape (weight 0.9)

- `93130` — Fitness facilities (boutique gyms, pilates, CrossFit)
- `85510` — Sports and recreation education (swim schools, dance, climbing instruction)
- `85520` — Cultural education (music schools, art classes, drama, language)
- `85590` — Other education n.e.c. (tutoring, adult education, cookery schools)

### Tier 3 — 1:1 appointment shape (weight 0.7)

- `96020` — Hairdressing and beauty (filter for non-chain, independent only)
- `96090` — Other personal service activities (massage, reiki, hypnotherapy, coaching)
- `75000` — Veterinary activities (independent practices only)
- `86230` — Dental practice (independent dentists)
- `86900` — Other human health activities (physio, chiropractic, osteopath)

### Tier 4 — Trade & service (weight 0.6)
Different booking shape — quote then schedule — but the website + CRM angle still fits.

- `43210` — Electrical installation
- `43220` — Plumbing, heat, air-conditioning installation
- `43290` — Other construction installation
- `43320` — Joinery installation
- `81210` — General cleaning of buildings
- `81221` — Window cleaning
- `81300` — Landscape service activities (gardeners)
- `45200` — Maintenance and repair of motor vehicles (independent garages)

### Tier 5 — Creative services & hire (weight 0.8)

- `74201` — Portrait photographic activities
- `74202` — Other specialist photography
- `74209` — Other photographic activities
- `77210` — Renting of recreational and sports goods (paddleboard, bike, kayak hire)
- `77290` — Renting of other personal and household goods (party hire, AV hire)

### Tier 6 — Event experiences (weight 0.5)

- `56210` — Event catering (small private operators with bookable events)

## Geographic scope at launch

Postcode prefixes: **LE, NG, DE, NN** (Leicestershire, Nottinghamshire, Derbyshire, Northamptonshire — the East Midlands core).

The filter must be config-driven. Adding new postcode prefixes is a config change, never a code change. Future expansion likely to LN (Lincolnshire), CV (Coventry/Warwickshire), B (Birmingham), S (South Yorkshire).

---

## Data model (minimum for Phase 1)

Phase 2 will extend. Build only what's listed here.

```sql
-- Cache of raw Companies House responses for traceability and audit
companies_house_raw (
  id uuid primary key,
  company_number text unique not null,
  fetched_at timestamptz not null default now(),
  raw_data jsonb not null
)

-- The enriched, scored prospect record
prospects (
  id uuid primary key,
  company_number text unique not null references companies_house_raw(company_number),
  company_name text not null,
  sic_code text not null,
  sic_description text,
  sic_tier int not null,            -- 1 to 6 per the tiering above
  fit_weight numeric not null,      -- 0.5 to 1.0
  postcode text not null,
  registered_address text,
  incorporated_on date,
  director_name text,
  director_email text,              -- nullable, from Apollo when found
  has_website boolean,              -- null = unknown, false = absent, true = found
  website_url text,
  facebook_url text,
  maps_place_id text,
  observable_signal text,           -- short string for the ranker, e.g. "Facebook-only, no website"
  personalised_email_subject text,
  personalised_email_body text,
  ranking_score numeric,            -- 0 to 100, computed by Opus
  ranking_reasoning text,
  status text not null default 'new',  -- new, surfaced, contacted, replied, qualified, dead, ignored
  surfaced_in_digest_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
)

-- Record of each weekly digest sent
digests (
  id uuid primary key,
  sent_at timestamptz not null default now(),
  prospect_ids uuid[] not null,     -- the 15 in this digest
  candidate_count int not null,     -- how many were considered
  delivered_to text not null
)
```

All migrations live in `supabase/migrations/` as hand-authored SQL files, applied via Supabase Studio's SQL Editor. See `docs/decisions/0002-mcp-installation.md` for the rationale.

---

## Checkpoints

Phase 1 is divided into ten checkpoints. After each, **pause and wait for Kyle to review** before continuing. Each checkpoint should map to a feature branch and a pull request.

### Checkpoint 1 — Project scaffold

**Build:** Next.js 15 with App Router and TypeScript initialised. Tailwind v4 configured. Project pushed to the `SDR-Agent` GitHub repo on a `phase-1/scaffold` branch with a PR open. Environment variable structure set up in `.env.example`. `lib/`, `app/api/`, `supabase/migrations/`, `docs/decisions/` directories created with placeholder README files.

**Kyle reviews:** The PR diff on GitHub. The repo can be cloned and `pnpm dev` runs without errors. The `.env.example` lists every variable that will be needed across Phase 1.

### Checkpoint 2 — Supabase project linked, initial schema migrated

**Build:** The three tables from the data model above migrated via hand-authored SQL files in `supabase/migrations/`, applied through Supabase Studio's SQL Editor. RLS policies set (authenticated users full access — to be tightened in Phase 2). Supabase client wrapper at `lib/db.ts`. Connection tested by inserting and reading a dummy `companies_house_raw` row.

**Kyle reviews:** The migration file in `supabase/migrations/`. The tables visible in Supabase Studio. The dummy row reads back correctly.

### Checkpoint 3 — Companies House discovery working

**Build:** A discovery module at `lib/agent/discover.ts` that:
- Authenticates to the Companies House API
- Fetches new incorporations from the last 7 days for the target SIC codes
- Filters by postcode prefix (LE, NG, DE, NN)
- Caches raw responses in `companies_house_raw`
- Logs the count of qualifying companies to console

**Kyle reviews:** Sample console output showing 30-80 real company names from the last week, with their SIC codes and postcodes. Spot-check three of them against the live Companies House website to confirm accuracy.

### Checkpoint 4 — Google Places enrichment working

**Build:** An enrichment module at `lib/agent/enrich.ts` that, for each discovered company:
- Queries Google Places `findPlaceFromText` with company name + town
- Records `has_website`, `website_url`, `facebook_url`, `maps_place_id` on the prospect
- Handles "no Maps result at all" as a useful signal (very new business)

**Kyle reviews:** A printout of 10 enriched prospects showing the Maps data. The cost report (should be pennies for ~50 lookups). At least one prospect should have `has_website = false` and one should have no Maps presence at all — those are the gold prospects.

### Checkpoint 5 — Apollo enrichment working

**Build:** Director email lookup via the Apollo REST API, authenticated with `APOLLO_API_KEY`. For each prospect with a Companies House director name, attempt an email match. Cache the result regardless of success. Tolerate Apollo no-matches gracefully — they're common. See `docs/decisions/0002-mcp-installation.md` for why we are calling the REST API directly rather than via an Apollo MCP.

**Kyle reviews:** The match rate (realistic target: 30-50% of small-business directors will have an Apollo record). Sample emails returned. Cost tracking.

### Checkpoint 6 — Personalisation working (THE CRITICAL CHECKPOINT)

**Build:** `lib/prompts/personalise.ts` containing the v0 prompt template (see "Personalisation prompt v0" section below). A wrapper at `lib/agent/personalise.ts` that calls Sonnet 4.6 with prospect context and writes subject + body to the prospect record. Generate emails for 10 real prospects from Checkpoints 3-5.

**Kyle reviews:** The 10 generated emails, read in full. **This is the most important review of Phase 1.** Email quality determines whether the entire system works. Expect the first pass to need 2-3 prompt iterations before quality is acceptable. Plan time for this — don't rush past it.

Specifically, Kyle is looking for:
- Each email sounds like he wrote it (not "AI-flavoured")
- The specific observation about the prospect is real and accurate, not invented
- The Sanctuary reference is honest, not overstated
- The CTA is soft and human, not pushy
- Subject lines are not clickbait

**Do not proceed to Checkpoint 7 until Kyle confirms the personalisation quality is good.** Iterate the prompt until it is. The prompt lives in source control, so iterations are commits.

### Checkpoint 7 — Ranking working

**Build:** `lib/agent/rank.ts` calls Opus 4.7 once per week with all candidates as input, returns JSON ranking with score and reasoning per prospect. Top 15 selected for the digest.

**Kyle reviews:** The full ranked list of one real week's candidates with reasoning. Are the top 5 obviously the best ones? Are any rankings surprising? Is the reasoning sound or hand-wavy?

### Checkpoint 8 — Digest composition and test send

**Build:** `lib/agent/digest.ts` composes an HTML email containing the 15 ranked prospects with all relevant fields and the personalised email drafts in copyable code blocks. Mobile-optimised. Sent via Resend to Kyle's nominated inbox.

**Kyle reviews:** The actual digest email in his inbox, opened on mobile. Is it scannable in two minutes? Are the email drafts easily copyable? Are the prospect facts complete?

### Checkpoint 9 — Vercel deployment and cron scheduling

**Build:** The repo is deployed to Vercel. Vercel Cron is configured to hit `/api/cron/weekly-digest` at `0 7 * * 1` (07:00 UTC = 08:00 BST Monday). The cron endpoint is protected by a `CRON_SECRET` header check. A manual trigger endpoint is also exposed for testing.

**Kyle reviews:** The Vercel deployment URL works. A manual cron trigger produces a digest. The cron is registered in Vercel's dashboard for Monday morning.

### Checkpoint 10 — Production validation

**Build:** First real Monday digest sent automatically. Logs reviewed for errors. Cost report tallied. Any data anomalies surfaced.

**Kyle reviews:** Did the digest arrive Monday morning without manual intervention? Are the 15 prospects high-quality? What broke, and what needs hardening before week 2?

After Checkpoint 10, Phase 1 is complete. Phase 2 begins only after at least two consecutive successful Monday digests.

---

## Personalisation prompt (v0)

The prompt below is the starting template. Place it at `lib/prompts/personalise.ts`. Iterate during Checkpoint 6 until Kyle approves the output quality. Every iteration is a commit, so the version history is the iteration history.

```typescript
export const PERSONALISATION_SYSTEM_PROMPT = `
You are writing a cold first-touch email for Kyle Potter, founder of KP Solutions, a UK design and software studio that builds custom websites with integrated booking management systems for small service businesses.

Recent case study to reference when credibility is needed: The Potter Sanctuary — a pottery studio for which KP Solutions designed and built a custom booking system handling slot availability, payment collection, automated confirmation emails with arrival instructions, and admin tooling. The owner now spends time teaching pottery instead of managing a generic booking platform.

Voice: confident, considered, plain. Short sentences when the point is sharp. No marketing hype, no exclamation marks, no emojis. UK English throughout ("personalisation" not "personalization", "organisation" not "organization", "behaviour" not "behavior"). The email should sound like Kyle typed it after looking at the prospect's website or Facebook page for ninety seconds — specific and human, never templated.

Hard constraints:
- 80 to 120 words in the body (subject line excluded)
- Plain text. No HTML, no markdown formatting, no bullet points
- Open with anything except "I" — start with "Saw...", "Noticed...", "Your...", "Quick thought...", or similar
- Include ONE specific observation about the prospect that proves you looked at their actual business — not a generic compliment
- Include ONE soft credibility line referencing the Sanctuary build. Keep it honest — do not invent metrics. Acceptable: "we recently built a similar system for a Loughborough pottery studio." Not acceptable: "we increased their bookings by 47%."
- Include ONE soft CTA: either a single yes/no question OR a 15-minute chat ask. Never both. Never a calendar link in the first touch.
- Subject line: 4 to 7 words. No question marks unless the email body is itself a question. No clickbait. Never use "quick question", "circling back", "touching base", or similar.
- Sign off with "Kyle Potter — KP Solutions" on its own line. No further footer, no phone number.
- Banned words and phrases: "leverage", "solution", "synergy", "innovative", "cutting-edge", "I hope this finds you well", "I trust you're well", "circle back", "touch base"

Output format: a JSON object with exactly two keys, "subject" and "body". The body uses "\\n\\n" between paragraphs. No other keys, no preamble, no commentary.
`;

export const PERSONALISATION_USER_PROMPT = (prospect: ProspectContext) => `
Write the email for this prospect:

Business name: ${prospect.company_name}
Location: ${prospect.postcode} area
SIC description: ${prospect.sic_description}
Director name: ${prospect.director_name ?? 'unknown'}
Observable signal: ${prospect.observable_signal}
Website status: ${prospect.has_website === false ? 'No website found' : prospect.website_url ?? 'unknown'}
Facebook: ${prospect.facebook_url ?? 'unknown'}
Incorporated: ${prospect.incorporated_on}

Additional context if known: ${prospect.additional_context ?? 'none'}
`;
```

The prompt is intentionally opinionated. If Kyle wants a different tone, the prompt is what changes — not the code around it.

---

## Implementation notes and gotchas

**Companies House.** Use the free Public Data API at `https://api.company-information.service.gov.uk`. Auth is HTTP Basic with your API key as the username and empty password. Use the "advanced company search" endpoint with `incorporated_from` / `incorporated_to` for the date window and `sic_codes` for filtering. Rate limit is 600 requests per 5 minutes — generous, but cache responses in `companies_house_raw` so you never re-fetch the same company.

**Postcode filtering.** Companies House returns full postcodes on the registered address. Filter on the prefix (the letters before the first digit, e.g. "LE12 7AB" → "LE"). The advanced search's `location` filter is fuzzy — apply the postcode prefix filter ourselves in code for precision.

**Maps cross-reference.** For each company, call Google Places `findPlaceFromText` with company name + town. If a place returns and has a `website` field, mark `has_website = true`. If the place exists but no website, mark `has_website = false` and capture `facebook_url` if the place's URL is facebook.com. If no place result at all, `has_website` stays `null` — that's also a strong signal (business may be too new for Maps yet, which is gold for our pitch).

**Apollo enrichment.** Call the Apollo REST API directly using `APOLLO_API_KEY`. For each prospect, look up the company + director name; cache the result regardless of whether an email is found. If Apollo returns nothing, the digest just won't include an email and Kyle can dig manually.

**Ranking.** Pass all the week's candidates to Opus 4.7 in a single call with a structured prompt: rank by fit, output JSON with `prospect_id`, `score` (0-100), `reasoning` (one sentence). Pick top 15.

**Digest email.** Send via Resend. Plain HTML, mobile-optimised. Each prospect block: business name (bold), one-line summary, ranking score, signal, then the full personalised email draft in a `<pre>` block for easy copy. Subject line: `KP Prospect Digest — {{week_of_date}} — 15 prospects ranked`.

**Cron.** Vercel Cron at `0 7 * * 1` (07:00 UTC = 08:00 BST Monday). The cron hits `app/api/cron/weekly-digest/route.ts` which orchestrates the full pipeline. Protect the route with a `CRON_SECRET` header check. Also expose `app/api/cron/manual-trigger/route.ts` for testing — same logic, no schedule.

**Cost ceiling.** Soft cap of £30/month for Phase 1. Roughly: Maps Places ~£10, Apollo ~£15 (trial credits or entry tier), Claude API ~£5, Resend free. Track and log a warning if any single agent run exceeds £2.

---

## File structure (sketch — not prescriptive)

```
app/
  api/
    cron/
      weekly-digest/
        route.ts
      manual-trigger/
        route.ts
lib/
  agent/
    discover.ts          # Companies House pull + filter
    enrich.ts            # Maps + Apollo cross-reference
    personalise.ts       # Sonnet call wrapper
    rank.ts              # Opus call wrapper
    digest.ts            # Email composition + send
    pipeline.ts          # Orchestrator
  prompts/
    personalise.ts
    rank.ts
  db.ts                  # Supabase client wrapper
  config.ts              # SIC codes, postcodes, weights
supabase/
  migrations/
    [timestamp]_initial_schema.sql
docs/
  decisions/
  getting-started.md
.env.example
```

---

## Environment variables

Document every one of these in `.env.example`. No real values committed.

```
ANTHROPIC_API_KEY=
COMPANIES_HOUSE_API_KEY=
GOOGLE_PLACES_API_KEY=
APOLLO_API_KEY=
RESEND_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=
DIGEST_RECIPIENT_EMAIL=kyle.potter@kpsolutions.io
```

---

## Where Phase 2 picks up

Phase 2 adds the web app dashboard. The data model already supports it (`status`, `surfaced_in_digest_at`, etc.). Phase 2 will:

- Build the `/dashboard` route group with auth
- Add status transitions UI
- Add notes per prospect
- Add filter/search across the full historical pipeline
- Add Kyle-overrides ("ignore this one", "star this one")
- Feed Kyle-overrides back into the ranker as preference signal

Don't pre-build any of that here. Just make sure the data model accommodates it (it already does).
