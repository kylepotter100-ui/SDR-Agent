# Getting Started — KP Solutions SDR Agent

This is the document you work through before any code is written. Roughly an afternoon's work, structured into five steps. Don't skip ahead — each step assumes the previous one is done.

When you finish, you'll be ready to open Claude Code in the repo and start Checkpoint 1 of Phase 1.

**How to use this guide:** Read each step in full before doing it. Where it says "you'll need to grab this", copy the value into a temporary note (1Password, Apple Notes, anywhere safe but accessible). You'll consolidate these into a proper secrets file at the end of Step 4.

---

## Before you start

Have these ready:

- Access to your GoDaddy account (for DNS and Microsoft 365 admin if needed)
- Access to your Microsoft 365 admin (for the kyle.potter@kpsolutions.io mailbox)
- A credit/debit card for the paid services (Google Cloud and Apollo specifically — both have free tiers or trials, but they require a card on file)
- Roughly 2-3 hours of uninterrupted time
- The `SDR-Agent` GitHub repo created (which you've already done)

You do NOT need to install Node.js, npm, or anything else locally yet. Claude Code will handle the local environment setup in the first coding session.

---

## Step 1 — Account setup

Work through these in order. For each, sign up, find the key/ID listed in the "grab" instruction, and stash it temporarily.

### 1.1 — Companies House

1. Go to **https://developer.company-information.service.gov.uk**
2. Sign up for a developer account (UK Gov OneLogin or email)
3. Once logged in, navigate to **Your applications → Register an application**
4. Application name: `KP Solutions SDR Agent`. Description: `Internal prospect discovery for KP Solutions.` Environment: `Live`
5. Once created, click into the application, then **Add new key**. Key type: `REST API`. Name it `SDR Agent — Live`
6. **Grab:** the API key string

### 1.2 — Supabase

1. Go to **https://supabase.com** and sign up (GitHub login works fine)
2. Create a new project. Name: `kp-sdr-agent`. Database password: generate a strong one and save it. Region: `London (eu-west-2)`
3. Wait ~2 minutes for the project to provision
4. Once provisioned, go to **Project Settings → API** and find two values:
5. **Grab:** the Project URL (the `https://*.supabase.co` one)
6. **Grab:** the `service_role` key (the longer secret key under "Project API keys" — NOT the `anon` key)

### 1.3 — Resend

1. Go to **https://resend.com** and sign up
2. You can start with Resend's default sending domain (`onboarding@resend.dev`) for Phase 1 — no DNS work needed since the digest goes only to your own inbox
3. (Optional, can defer) Add `kpsolutions.io` as a verified domain under **Domains → Add Domain** if you want digest emails to come from a kp address. Resend will give you DNS records to add to GoDaddy. Phase 1 works fine without this.
4. Create an API key under **API Keys → Create**. Name it `SDR Agent`. Permissions: `Full access`
5. **Grab:** the API key

### 1.4 — Google Cloud (for Places API)

1. Go to **https://console.cloud.google.com** and sign in with a Google account
2. Create a new project. Name: `kp-sdr-agent`
3. Enable billing on the project (required even for free-tier usage — Google won't let you call Places API without a card on file). The free monthly credit comfortably covers our volumes.
4. Navigate to **APIs & Services → Library** and search for "Places API". Enable it.
5. Navigate to **APIs & Services → Credentials → Create Credentials → API Key**
6. Once created, click the key to configure restrictions. Under "API restrictions", select "Restrict key" and tick only "Places API". Save.
7. **Grab:** the API key

### 1.5 — Apollo.io

1. Go to **https://www.apollo.io** and sign up (free trial gives you 50 credits — enough to validate)
2. Once in, navigate to **Settings → Integrations → API**
3. Create a new API key. Name: `SDR Agent`
4. **Grab:** the API key

### 1.6 — Anthropic (Claude API)

You likely already have this from Claude Code usage. If not:

1. Go to **https://console.anthropic.com**
2. Sign up, add billing
3. Navigate to **API Keys → Create Key**. Name: `KP SDR Agent`
4. **Grab:** the API key

### 1.7 — Vercel

1. Go to **https://vercel.com** and sign up using your GitHub account (this auto-connects your GitHub)
2. You'll connect the `SDR-Agent` repo to Vercel later, during Checkpoint 9. Nothing to grab now — just confirm you have an account.

---

## Step 2 — DNS records in GoDaddy

For Phase 1, **you do not need to change DNS at all** if you're using Resend's default `resend.dev` sending domain for the digest. The digest is internal mail to yourself; deliverability matters less than for cold outreach.

The DNS work happens properly in Phase 3, when we set up the cold-outreach sending subdomain. For now, just confirm you can log into GoDaddy's DNS management for `kpsolutions.io` — you'll need it later.

If you do want to verify `kpsolutions.io` with Resend now (so the digest comes from a kp address), Resend's verification flow will give you 3 records to add — usually 1 TXT (SPF) and 2 CNAME (DKIM). Add them in GoDaddy's DNS management. Verification takes 5-30 minutes to propagate. Optional for Phase 1, more useful in Phase 3.

---

## Step 3 — Claude Code and MCP setup

### 3.1 — Install Claude Code

1. Go to **https://claude.com/claude-code** and follow the installation instructions for your operating system
2. Authenticate when prompted (uses your existing Claude account)
3. Verify it works: open a terminal in any directory and run `claude --version`. If it returns a version number, you're set.

### 3.2 — Clone the repo locally

You have two options:

**Option A — GitHub Desktop (recommended if you're not comfortable with terminal commands):**
1. Install GitHub Desktop from **https://desktop.github.com**
2. Sign in with your GitHub account
3. **File → Clone Repository → SDR-Agent**. Choose a local folder.

**Option B — Terminal:**
```bash
cd ~/Projects  # or wherever you keep code
git clone https://github.com/<your-username>/SDR-Agent.git
cd SDR-Agent
```

### 3.3 — Drop in the project documents

Move the four documents you have into the repo:

```
SDR-Agent/
├── CLAUDE.md                          ← at repo root
├── briefs/
│   ├── phase-1-backend-digest.md
│   ├── phase-2-web-app.md
│   └── phase-3-send-from-app.md
└── docs/
    └── getting-started.md             ← this file
```

Commit and push (via GitHub Desktop or `git add . && git commit -m "Add CLAUDE.md and phase briefs" && git push`).

### 3.4 — Open Claude Code in the repo

```bash
cd SDR-Agent
claude
```

Claude Code starts, reads `CLAUDE.md` automatically, and waits for your first prompt.

### 3.5 — Install the MCPs

In your Claude Code session, ask:

> Please install the Supabase MCP server and connect it to my Supabase project. The project URL is [your Supabase URL from Step 1.2]. I'll provide the service role key when you ask. Also install the Apollo MCP for contact enrichment. Confirm both are connected before moving on.

Claude Code will walk you through the installation, ask for credentials at the right points, and confirm when each MCP is live. Do **not** paste your service role key into chat unprompted — only when Claude Code's tool flow specifically asks for it (it'll be entered into a secure prompt, not a chat message).

The Microsoft 365 MCP can wait until Phase 3 — no need to install it yet.

---

## Step 4 — Secrets management

Now consolidate everything you grabbed into the right places.

### 4.1 — Create `.env.local`

In Claude Code, ask:

> Create a `.env.local` file at the repo root using the variables documented in `phase-1-backend-digest.md`. Use placeholder values like `<YOUR_KEY_HERE>` so I can fill them in. Also add `.env.local` to `.gitignore` to make sure it's never committed. Then show me the file structure so I can paste in my real keys.

Once Claude Code creates the scaffold, paste your real keys into `.env.local`:

```
ANTHROPIC_API_KEY=<from Step 1.6>
COMPANIES_HOUSE_API_KEY=<from Step 1.1>
GOOGLE_PLACES_API_KEY=<from Step 1.4>
APOLLO_API_KEY=<from Step 1.5>
RESEND_API_KEY=<from Step 1.3>
SUPABASE_URL=<from Step 1.2>
SUPABASE_SERVICE_ROLE_KEY=<from Step 1.2>
CRON_SECRET=<a random string — ask Claude Code to generate one>
DIGEST_RECIPIENT_EMAIL=kyle.potter@kpsolutions.io
```

### 4.2 — Verify `.gitignore` includes `.env.local`

Open `.gitignore` and confirm `.env.local` is in the list. If not, add it. This is the single most important file in the repo — leaking your service role key publicly is a Bad Day.

### 4.3 — Vercel environment variables (later, during Checkpoint 9)

When Phase 1 reaches Checkpoint 9 (Vercel deployment), the same variables need to be added to Vercel's project settings. Claude Code can do this via the Vercel MCP or you can do it manually via Vercel's dashboard — either is fine. Don't worry about it until Checkpoint 9.

### 4.4 — Where each secret eventually lives

| Secret | `.env.local` | Vercel env | Notes |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | ✅ | Same value both places |
| `COMPANIES_HOUSE_API_KEY` | ✅ | ✅ | |
| `GOOGLE_PLACES_API_KEY` | ✅ | ✅ | Restrict to Places API in Google Console |
| `APOLLO_API_KEY` | ✅ | ✅ | Or handled by Apollo MCP |
| `RESEND_API_KEY` | ✅ | ✅ | |
| `SUPABASE_URL` | ✅ | ✅ | Public, but treat as config |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | ✅ | Highly sensitive. Server-only. Never in client code. |
| `CRON_SECRET` | ✅ | ✅ | Random string; protects the cron endpoint |
| OAuth refresh tokens (Phase 3) | ❌ | ❌ | Stored in Supabase, encrypted via Vault |

---

## Step 5 — First Claude Code session

Once Steps 1-4 are complete, you're ready for the first real session. Here's the exact prompt sequence — copy them in order.

### Opening prompt

> Read `CLAUDE.md` and `briefs/phase-1-backend-digest.md` in full. Then, before writing any code, propose an implementation plan for Phase 1 Checkpoint 1 (project scaffold) only. Cover: what you'll initialise, what folders you'll create, what dependencies you'll install, and where you see risk or ambiguity. Wait for my approval before executing anything.

Claude Code should respond with a plan in chat. Read it carefully. If anything's unclear or wrong, push back — that's the moment to do it. Examples of good pushback:

- "Why are we adding library X — is it actually needed for Checkpoint 1?"
- "I'd prefer the folder structure to use Y instead of Z"
- "Skip the Tailwind setup for now since Phase 1 has no UI"

### Approval prompt (when the plan is good)

> Plan approved. Proceed with Checkpoint 1. Create a TodoWrite list before starting, mark each todo in_progress and completed as you go, and pause at the end of Checkpoint 1 so I can review the PR.

### After Checkpoint 1 lands

When Claude Code reports Checkpoint 1 is done:

1. Open the PR on GitHub
2. Review the changed files
3. Pull the branch locally (or check out via GitHub Desktop) and run `pnpm dev`
4. If everything works, merge the PR
5. Tell Claude Code: "Checkpoint 1 reviewed and merged. Proceed to Checkpoint 2: Supabase schema."

Repeat that pattern through all ten checkpoints.

---

## Troubleshooting

**Claude Code seems to skip the planning step and just starts writing code.**
Stop it. Say: "Halt. Per CLAUDE.md section 'Working method', you must propose a plan before executing. Roll back any uncommitted changes and propose a plan."

**An MCP isn't responding or credentials seem wrong.**
Ask Claude Code to re-test the connection: "Test the Supabase MCP by querying for a list of tables. Report what comes back."

**Costs are climbing unexpectedly.**
Ask: "Report total Anthropic, Google Places, and Apollo API spend for the current month. If any is over £5, pause and explain what's been consumed."

**Something feels off but you can't articulate what.**
That's a valid pushback. Say: "Pause. Something doesn't feel right but I can't articulate it yet. Summarise what you've built in the last hour and what's next, in plain English." Often the summary itself surfaces the problem.

---

## Reporting back

As you work through each step, report progress back in the chat session where we've been planning this. Useful update format:

- "Done with Step 1 (account setup). Hit a snag on Apollo — sorted. Moving to Step 2."
- "Step 3 complete. Supabase MCP working, Apollo MCP working. Ready for Step 4."
- "Checkpoint 3 (Companies House discovery) is in PR. Found 47 qualifying companies in the LE/NG/DE/NN postcodes from last week — sanity-checked three and they're real. Sample is in the PR description."

That rhythm keeps the planning conversation in sync with the actual build, so when something needs adjusting at the strategy level (different SIC codes, different ranking weights, etc.) we can catch it early.

Good luck with the build.
