# Phase 3 — Send from App and Reply Detection

**Goal:** Kyle clicks "Send" on a prospect detail page and the personalised email goes out from his nominated KP Solutions address directly to the prospect, via Outlook (Microsoft 365). When the prospect replies, the system detects the reply, classifies its intent, links it back to the prospect, and surfaces it in the dashboard. The dashboard becomes a closed-loop pipeline tool, not just a tracker.

**Estimated effort:** 1 week of focused work, plus a 2-week ongoing deliverability warmup that runs in parallel.

**Prerequisites:** Phase 2 is in production. Kyle has manually sent at least 30 emails by copy-paste from the dashboard, has 3+ replies, and can describe what categories his replies fall into (interested / not-now / wrong-person / unsubscribe / other).

## Success criteria

1. Kyle authorises Outlook access through OAuth, just once.
2. From the prospect detail page, clicking "Send via Outlook" sends the email from his nominated KP Solutions address and transitions the prospect to "contacted" status automatically.
3. The sent email appears in Kyle's actual Outlook Sent folder — not a mirror, the real one.
4. When the prospect replies, the system detects it within 15 minutes, classifies the intent, links the reply to the prospect, and transitions status appropriately.
5. Misclassifications can be corrected by Kyle in one click, and the correction feeds the classifier prompt as a recent-example signal.
6. Cold email deliverability stays above 90% inbox rate (not spam) measured via test sends to a tracked monitoring inbox.

## What this phase adds

- Microsoft OAuth flow via Azure AD app registration, with refresh-token storage in Supabase
- Send action in the dashboard, including an inline edit step before send
- Sender subdomain (`outbound.kpsolutions.io`) with SPF/DKIM/DMARC properly configured for Microsoft 365
- Domain warming schedule (gradual volume ramp over 2 weeks)
- Microsoft Graph subscription on Kyle's inbox for change notifications (replies pushed in real time)
- Reply classification using Opus 4.7 with explicit categories
- Reply-to-prospect linking using `Message-ID` and `In-Reply-To` headers
- Status auto-transitions on reply
- Suppression list (anyone who unsubscribes or bounces never gets contacted again, globally)

## What this phase explicitly doesn't build

- No multi-step sequences (follow-ups, second touches). That's a Phase 4 conversation about whether to do automated cadences at all — Kyle's voice may not survive automation past first-touch.
- No CRM-style activity tracking (calls logged, meetings booked) beyond emails.
- No A/B testing of email variants. Premature; we don't have enough volume to learn from.

## Outlook OAuth setup

Two viable paths — pick one and document the decision in `docs/decisions/`.

**Path A (recommended): Microsoft Graph API direct.** Full control over send and read, no MCP dependency, well-documented. The flow:

1. Register an app in Azure AD at `entra.microsoft.com` → App registrations → New registration. Single-tenant (your kpsolutions.io tenant) is fine.
2. Configure redirect URI: `https://app.kpsolutions.io/api/auth/microsoft/callback` (plus a localhost variant for dev).
3. Add API permissions under "Microsoft Graph": `Mail.Send`, `Mail.Read`, `Mail.ReadWrite`, `offline_access` (delegated permissions, not application).
4. Grant admin consent for your tenant.
5. Generate a client secret, store securely.
6. OAuth callback at `app.kpsolutions.io/api/auth/microsoft/callback` exchanges the auth code for access + refresh tokens.
7. Store refresh token in Supabase, encrypted at rest using Supabase Vault.
8. On send, exchange refresh token for access token (cache for ~50 minutes), call `POST /me/sendMail` on Microsoft Graph.

**Path B: Microsoft 365 MCP for reads, Graph for sends.** The official Microsoft 365 MCP exposes `outlook_email_search` and `outlook_calendar_search` tools — convenient for the reply-detection layer because you offload inbox querying to the MCP rather than hand-rolling Graph queries. Sending still goes through Graph directly (the MCP doesn't expose a send tool at time of writing). Hybrid approach: MCP for inbound, Graph for outbound.

The OAuth flow happens **once**, ever. After that the refresh token lasts up to 90 days of inactivity (longer if used regularly) — the app refreshes it on every send so this is effectively indefinite.

## Sender subdomain and deliverability

This is the part that most teams underestimate. The work is not glamorous but it's the ceiling on everything else.

**Subdomain setup.** Configure `outbound.kpsolutions.io` as a sending subdomain. Cold outreach goes via this subdomain; any deliverability hit (spam complaints, blocklists) stays isolated from the main `kpsolutions.io` domain that hosts the marketing site and Kyle's day-to-day email.

In practice this means: emails are *sent* via the outbound subdomain (configured in Microsoft 365 Exchange Online as an accepted domain), but the *From* header still reads as your nominated KP Solutions address so replies land in the main inbox. SPF for `outbound.kpsolutions.io` authorises Microsoft's sending infrastructure; DKIM signs with the subdomain key (configured via the Microsoft 365 admin centre under Mail Flow → DKIM); DMARC on the root domain is set to `quarantine` (not `reject` yet — too aggressive at this scale).

**DNS records required:**

```
outbound.kpsolutions.io  TXT  "v=spf1 include:spf.protection.outlook.com -all"
selector1._domainkey.outbound.kpsolutions.io  CNAME  selector1-outbound-kpsolutions-io._domainkey.{tenant}.onmicrosoft.com
selector2._domainkey.outbound.kpsolutions.io  CNAME  selector2-outbound-kpsolutions-io._domainkey.{tenant}.onmicrosoft.com
_dmarc.kpsolutions.io  TXT  "v=DMARC1; p=quarantine; rua=mailto:dmarc@kpsolutions.io; pct=100"
```

The DKIM CNAME selectors are auto-generated by Microsoft 365 — copy them from the admin centre after adding the subdomain. The setup guide will walk through this step by step.

**Domain warming.** Don't go zero-to-15-emails-a-week on a fresh domain. Schedule:

- Week 1: 3 emails total, spread across days
- Week 2: 6 emails total
- Week 3: 10 emails total
- Week 4: 15 emails total, weekly cadence locked in

The app should enforce this — a "daily send cap" in Settings, defaulting to the warming schedule and adjustable by Kyle.

**Test inbox monitoring.** Set up a `glockapps.com` or `mail-tester.com` style monitoring address. Every Monday digest, the agent also sends a copy to the monitor inbox and records the resulting spam/inbox/missing breakdown. Surface this in the dashboard as a deliverability health indicator.

## Reply detection

**Microsoft Graph subscription.** Set up a Microsoft Graph change notification subscription on Kyle's inbox (resource: `/me/mailFolders('Inbox')/messages`, changeType: `created`). Microsoft pushes a notification to the app webhook within seconds of any inbound email. Subscriptions expire every 3 days max for inbox resources — the agent must auto-renew before expiry.

**Matching.** Use `In-Reply-To` and `References` headers to match a reply to a sent email. Store every outbound message's `Message-ID` against the prospect. On inbound, look up the prospect by header match.

**Fallback matching.** If headers don't match (e.g. the prospect replied from a different address than the one originally contacted), fall back to fuzzy match on the email subject minus the `Re:` prefix and sender domain. Surface low-confidence matches as "is this from {{prospect}}?" prompts in the dashboard, never auto-link.

## Reply classification

Single Opus 4.7 call per inbound reply with a structured prompt:

```
You're classifying a reply to a cold outreach email about KP Solutions' 
website + booking system build service.

The original outbound email was:
{{original_email}}

The reply received is:
{{reply_body}}

Classify the reply as one of:
- interested      → prospect wants to learn more, schedule a call, or has a positive engaged question
- maybe_later     → prospect is curious but not now ("circle back in Q3", "send info I'll review")
- not_now         → prospect declines this time but doesn't shut the door
- wrong_person    → please contact someone else, or this isn't my decision
- unsubscribe     → explicit request to stop contacting, or angry/hostile
- auto_reply      → out of office, holiday autoresponder, etc.
- other           → none of the above clearly applies

Output JSON: { category, confidence (0-1), reasoning (one sentence) }
```

Status transitions on classification:
- `interested` → status becomes `replied` with a high-priority flag
- `maybe_later` → status becomes `replied`, surface in 90 days
- `not_now` → status becomes `dead`, with reason
- `wrong_person` → status becomes `dead`, with reason; ranker learns to demote similar profiles
- `unsubscribe` → status becomes `dead`, added to global suppression list, NEVER contacted again
- `auto_reply` → no transition, ignore
- `other` → flagged for Kyle to manually classify

## Suppression list

Critical for legal and reputational reasons. A single global table:

```sql
suppression_list (
  email text primary key,
  reason text not null,  -- unsubscribe, bounce, manual_block
  added_at timestamptz default now(),
  notes text
)
```

The agent **must** check this list before generating any outbound. Any prospect whose email matches a row here is filtered out before the personalisation step (saves cost) and the prospect record is marked `ignored` with reason.

## Human-in-the-loop safeguards

For the first month of Phase 3:

1. **All "unsubscribe" classifications are reviewed by Kyle** within 24 hours via a dashboard prompt. False positives are catastrophic for relationships.
2. **All "interested" classifications are reviewed before any automated next step.** Kyle is the one replying, the system just surfaces.
3. **A daily "classifications today" report** lands in Kyle's inbox listing every classification with one-click correction links. Corrections feed the classifier prompt as recent examples.

After the first month, if accuracy is above 95% on `unsubscribe` and above 85% on the others, relax the daily report to weekly. Never relax the unsubscribe check.

## Implementation notes

**Send happens on a queue.** Don't send synchronously from a button click — queue the job (Supabase function or a Vercel cron-triggered worker), update the UI optimistically, mark the prospect as "contacted" on successful send. Failures retry with backoff and surface to Kyle.

**Edit-before-send is the default.** The "Send via Outlook" action opens an inline editor with the personalised draft pre-filled. Kyle reviews, makes any adjustments, *then* sends. No one-click send in Phase 3 — that's a confidence-earned feature, not a launch feature.

**Rate limiting.** Hard limit of 15 outbound per day enforced server-side, regardless of UI. Soft limit configurable per the warming schedule.

**Audit log.** Every send, every status transition, every classification is logged with timestamp, actor (kyle / system), and reasoning. The audit log is read-only and queryable from the dashboard.

## Where Phase 4+ might go

Open questions for after Phase 3 stabilises:

- Automated follow-up cadences (and whether they degrade reply rates by feeling robotic)
- Preference learning — feeding Kyle's accept/ignore patterns back into next week's ranking weights automatically
- Multi-vertical templating — running parallel pipelines with different SIC code sets and case studies (one for pottery, one for padel, one for glamping)
- Calendar booking integration — when a prospect says "yes, let's chat", the agent offers them times directly
- Productising the engine itself as a paid SaaS for other agencies (the meta-play)

None of those are Phase 3. Note them, defer them.
