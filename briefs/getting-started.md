# Getting Started — KP Solutions SDR Agent

This is the document you work through before any code is written. It's structured around a fully browser-based workflow — no local installs, no terminal, no cloning.

**The working model:**

- **Claude Code (browser)** does the actual coding work, connected to the GitHub repo
- **GitHub web UI** is where you review and merge PRs
- **Vercel dashboard** is where API keys live as environment variables, and where deployments run
- **Supabase Studio** (web) is where you manage the database
- **Codespaces** — only if a one-off task genuinely needs terminal access (likely never for Phase 1)

**How to use this guide:** read each step in full before doing it. Where it says "you'll need to grab this", copy the value into your password manager — you'll paste each key into Vercel's dashboard during Step 4.

---

## Before you start

Have these ready:

- The `SDR-Agent` GitHub repo with `CLAUDE.md`, the three phase briefs, and this document already uploaded (done ✓)
- Access to your GoDaddy account (for DNS, only if you decide to verify a custom Resend domain — optional for Phase 1)
- A credit/debit card for the paid services (Google Cloud Places and Apollo — both have free tiers but require a card on file)
- Roughly 2 hours of uninterrupted time

---

## Step 1 — Account setup

Work through these in order. For each, sign up, find the listed value, and stash it in your password manager. You'll paste them into Vercel during Step 4, not into any file or chat.

### 1.1 — Companies House ✓ (done)

You've already completed this. Confirm you have the API key stored.

### 1.2 — Supabase

1. Go to **https://supabase.com** and sign up (GitHub login works fine)
2. Create a new project. Name: `kp-sdr-agent`. Database password: generate a strong one and save it. Region: `London (eu-west-2)`
3. Wait ~2 minutes for the project to provision
4. Once provisioned, go to **Project Settings → API** and find two values:
5. **Grab:** the Project URL (the `https://*.supabase.co` one)
6. **Grab:** the `service_role` key (the longer secret under "Project API keys" — NOT the `anon` key)

### 1.3 — Resend

1. Go to **https://resend.com** and sign up
2. For Phase 1, you can use Resend's default sending domain (`onboarding@resend.dev`) — no DNS work needed since the digest goes only to your own inbox. Custom domain verification can wait until Phase 3.
3. Create an API key under **API Keys → Create**. Name: `SDR Agent`. Permissions: `Full access`
4. **Grab:** the API key

### 1.4 — Google Cloud (for Places API)

1. Go to **https://console.cloud.google.com** and sign in with a Google account
2. Create a new project. Name: `kp-sdr-agent`
3. Enable billing on the project (required even for free-tier usage). The free monthly credit comfortably covers our volumes.
4. Navigate to **APIs & Services → Library**, search for "Places API", enable it
5. Navigate to **APIs & Services → Credentials → Create Credentials → API Key**
6. Once created, click the key to configure restrictions. Under "API restrictions", select "Restrict key" and tick only "Places API". Save.
7. **Grab:** the API key

### 1.5 — Apollo.io

1. Go to **https://www.apollo.io** and sign up (free trial gives you 50 credits — enough to validate)
2. Once in, navigate to **Settings → Integrations → API**
3. Create a new API key. Name: `SDR Agent`
4. **Grab:** the API key

### 1.6 — Anthropic (Claude API)

You may already have this from Claude Code usage. If not:

1. Go to **https://console.anthropic.com**
2. Sign up, add billing
3. Navigate to **API Keys → Create Key**. Name: `KP SDR Agent`
4. **Grab:** the API key

### 1.7 — Vercel

1. Go to **https://vercel.com** and sign up using your GitHub account
2. Once in, click **Add New → Project** and import the `SDR-Agent` repo. Vercel will detect Next.js automatically — accept the defaults but **do not click Deploy yet**. You'll come back to set environment variables in Step 4 before the first real deploy.
3. Nothing to grab here — Vercel is configured through its dashboard.

At the end of Step 1 you have six API keys in your password manager plus a Supabase project URL and a connected (but not yet deployed) Vercel project.

---

## Step 2 — DNS records in GoDaddy

For Phase 1, you don't need to change DNS at all if you're using Resend's default sending domain. Skip this step entirely. DNS work happens properly in Phase 3 for the cold-outreach sending subdomain.

---

## Step 3 — First Claude Code session: read the brief, propose the plan

This is where the actual build begins. Open Claude Code in your browser, connect it to the `SDR-Agent` repo, and start a new session.

**Copy this prompt verbatim as your first message:**

> Read `CLAUDE.md` and `briefs/phase-1-backend-digest.md` in full. Then, before writing any code, propose an implementation plan for Phase 1 Checkpoint 1 (project scaffold) only.
>
> The plan should cover:
> - What you'll initialise (Next.js, TypeScript, Tailwind, etc.)
> - What folders and placeholder files you'll create (mirroring the structure in the Phase 1 brief)
> - What dependencies you'll install
> - How you'll set up `.env.example` and `.gitignore` correctly — note that real secrets will live in Vercel environment variables, not in any file in this repo. `.env.local` should never exist as a committed file.
> - What MCPs (Supabase, Apollo) you'll need to install and any setup they require
> - Where you see risk, ambiguity, or decisions you'd like me to weigh in on
>
> Wait for my approval before executing anything. Do not write a single file until I confirm.

**What to look for in the response:**

Claude Code should reply with a plan in chat — not code. Read it carefully. Sensible things to push back on if you see them:

- Any mention of a `.env.local` file being committed — should be in `.gitignore` only
- Any unnecessary dependencies that aren't called for in the brief
- Any deviation from the file structure sketched in the Phase 1 brief
- Anything Claude Code is uncertain about — make sure you understand it before approving

If the plan looks sound, reply with:

> Plan approved. Proceed with Checkpoint 1. Create a `TodoWrite` list before starting, mark each todo `in_progress` and `completed` as you go, and open a PR against `main` from a `phase-1/scaffold` branch when the checkpoint is complete. Pause for me to review the PR before continuing.

Claude Code will execute the plan, commit in small chunks, and open a PR on GitHub when done.

---

## Step 4 — Set environment variables in Vercel

Once Checkpoint 1 is in the repo and you're about to merge the PR, set up your secrets in Vercel.

1. Go to your Vercel project: **https://vercel.com/dashboard** → SDR-Agent
2. Click **Settings → Environment Variables**
3. Add each of these variables one by one, with the values from your password manager. Apply each to all three environments (Production, Preview, Development):

| Variable name | Value source |
|---|---|
| `ANTHROPIC_API_KEY` | Step 1.6 |
| `COMPANIES_HOUSE_API_KEY` | Step 1.1 |
| `GOOGLE_PLACES_API_KEY` | Step 1.4 |
| `APOLLO_API_KEY` | Step 1.5 |
| `RESEND_API_KEY` | Step 1.3 |
| `SUPABASE_URL` | Step 1.2 |
| `SUPABASE_SERVICE_ROLE_KEY` | Step 1.2 |
| `CRON_SECRET` | Generate a random string (use any password generator, 32+ characters) |
| `DIGEST_RECIPIENT_EMAIL` | `kyle.potter@kpsolutions.io` |

4. Save each. Vercel will need the variables in place before the first deploy succeeds.
5. Once all variables are set, you can merge Checkpoint 1's PR. Vercel will auto-deploy and you'll get a deployment URL.

**Important security note:** these values exist in only three places — your password manager, Vercel's environment variables, and (briefly, during deployment) Vercel's build environment. They never appear in your repo, never get pasted into Claude Code chat, and never appear in any committed file. That's the security model.

---

## Step 5 — Iterate through Phase 1 checkpoints

After Checkpoint 1 is merged and deployed, the rest of Phase 1 is a repeating loop:

1. In Claude Code, ask it to proceed to the next checkpoint (e.g. *"Checkpoint 1 reviewed and merged. Proceed to Checkpoint 2: Supabase schema. Read the relevant section of the Phase 1 brief, propose your plan, and wait for approval before executing."*)
2. Review the plan in chat. Approve or push back.
3. Claude Code executes, commits to a feature branch, opens a PR.
4. You review the PR on GitHub. Merge if good, or comment with changes needed.
5. Vercel auto-deploys the merged code. Verify the deployment looks right.
6. Repeat for the next checkpoint.

The Phase 1 brief has all ten checkpoints documented in order with what's built, what you review, and what comes next. You don't need this `getting-started.md` after Checkpoint 1 — from Checkpoint 2 onward, the Phase 1 brief is your guide.

**Special note for Checkpoint 6 (personalisation):** this is the most important review of Phase 1. Plan extra time. Read the generated emails carefully. Iterate the prompt 2-3 times before approving. Email quality determines whether the whole system works.

---

## Troubleshooting

**Claude Code starts writing code before proposing a plan.**
Stop it. Reply: "Halt. Per CLAUDE.md section 'Working method', you must propose a plan before executing. Roll back any uncommitted changes and propose a plan first."

**A Vercel deploy fails after merging.**
Most likely cause: a missing environment variable. Check Vercel's build logs for "missing env var" errors and confirm Step 4 is complete.

**A Claude Code-installed MCP isn't connecting.**
Ask Claude Code to test it: *"Test the Supabase MCP connection by listing the tables in the database. Report what you see."* If the test fails, the credentials probably need re-supplying.

**Costs are climbing unexpectedly.**
Ask: "Report total Anthropic, Google Places, and Apollo spend for the current month from the most recent agent run logs. If any single run cost more than £2, pause and explain what was consumed."

**Something feels off but you can't articulate what.**
Valid pushback. Reply: "Pause. Something doesn't feel right but I can't articulate it yet. Summarise what you've built in the last hour and what's next, in plain English."

---

## Reporting back

As you complete each step, send a quick update so the planning conversation stays in sync with the actual build:

- "Step 1 done — all seven keys stashed. Moving to Step 3."
- "Checkpoint 1 PR open — Next.js scaffold looks clean, Supabase MCP installed and connected, `.env.example` documents the nine variables. Merging."
- "Checkpoint 3 (Companies House discovery) shows 47 qualifying companies from last week's incorporations across LE/NG/DE/NN. Sample of three spot-checked against the live Companies House site — accurate. Sample in the PR description."

That rhythm lets us catch strategy-level issues early — wrong SIC weights, missing signals, off prompt — before they're baked into multiple checkpoints.
