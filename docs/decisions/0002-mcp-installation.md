# 0002 — MCP installation playbook for Phase 1

Date: 2026-05-15 (revised 2026-05-16)
Status: Accepted

## Context

Phase 1 originally planned to use three MCP servers — Supabase (from
Checkpoint 2), Apollo (from Checkpoint 5), and Microsoft 365 (from
Phase 3). The first revision of this record described a local-stdio
installation using personal access tokens.

Two things changed between sessions:

1. **Supabase shipped a hosted MCP.** It runs at `mcp.supabase.com`,
   identifies users via OAuth at `supabase.com`, and is configured
   per-repo through a committed `.claude/mcp.json`. That replaces the
   stdio + `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF` approach
   from the original record — no PAT, no MCP-only env vars.
2. **Claude Code on the web cannot complete OAuth handshakes for
   hosted MCPs in this session runtime.** The repo's `.claude/mcp.json`
   resolves to the correct server URL, but the OAuth tools the server
   exposes never surface to the agent in this environment. Confirmed
   empirically in the Checkpoint 2 session: every tool lookup
   (`supabase`, `apply_migration`, `list_tables`, `generate_typescript_types`)
   returned no result. Authorising the Supabase Connector inside the
   Claude.ai chat product did not propagate state to the Claude Code on
   the web session either — they are separate MCP runtimes.

## Decision

**Hosted MCP via `.claude/mcp.json` + OAuth is the intended pattern**
once the OAuth flow is reachable from Claude Code on the web. The repo
keeps the existing `.claude/mcp.json` pointing at the Supabase project
so a future session can pick it up unchanged.

**Until then, direct API access is the canonical mechanism for all
three integrations.** The decision applies session-by-session: do not
re-attempt MCP installation in Checkpoints 5 or in Phase 3 unless the
environment limitation has demonstrably been resolved.

### Supabase — Checkpoint 2 onward

- Schema migrations are written by hand into `supabase/migrations/` as
  timestamp-prefixed `.sql` files using the convention
  `YYYYMMDDHHMMSS_<slug>.sql`.
- Kyle applies each migration manually via Supabase Studio's SQL
  Editor against project `fiwojupangfpcsujrxyi` (region eu-west-2).
- Runtime access from the agent goes through `lib/db.ts`, which reads
  `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from `process.env`.
  Those two keys are already documented in `.env.example`. The service
  role key bypasses RLS, which is the intended posture for a
  server-only agent.
- `lib/db.types.ts` is hand-written from the migration files as the
  source of truth for Checkpoint 2 only. It is to be regenerated
  wholesale from Supabase Studio (Project Settings → API → "Generate
  TypeScript types") at the first opportunity — almost certainly as a
  follow-up commit on the Checkpoint 2 PR itself — and from the MCP
  thereafter, once one is reachable.
- The Supabase MCP-only credentials referenced in the previous version
  of this record (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`) are
  no longer needed and should not be added to any environment.

### Apollo — Checkpoint 5

- No Apollo MCP installation attempt. Use Apollo's REST API directly,
  authenticated via the existing `APOLLO_API_KEY` env var.
- The HTTP client lives alongside the other agent modules in
  `lib/agent/enrich.ts` (or a dedicated `lib/apollo.ts` if the surface
  area justifies it — decide at the start of Checkpoint 5).

### Microsoft 365 — Phase 3

- No Microsoft 365 MCP installation attempt. Inbox search, reply
  detection, and sending all go via Microsoft Graph directly, behind
  the Outlook OAuth flow Kyle authorises in Phase 3 setup.
- The MCP entry in CLAUDE.md's "MCPs to use" section is to be removed
  in the follow-up cleanup commit after the Checkpoint 2 PR merges.

## Consequences

- `.env.example` is unchanged — runtime keys only. No MCP-only env
  vars are introduced anywhere.
- Phase 1 work proceeds with the existing direct-API approach for
  every external service. No checkpoint depends on an MCP being
  available to progress.
- The `.claude/mcp.json` file stays in the repo. It is a no-op in the
  current Claude Code on the web environment but harmless, and it
  documents the intended pattern for a future session that can reach
  the OAuth flow.
- If Claude Code on the web later gains the ability to complete
  hosted-MCP OAuth, supersede this record rather than editing in
  place. The history of "what we tried and why we changed" matters
  more than a tidy final state.
