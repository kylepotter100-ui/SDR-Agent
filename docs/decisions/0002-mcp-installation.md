# 0002 — MCP installation playbook for Phase 1

Date: 2026-05-15
Status: Accepted (provisional — revisit at Checkpoint 5 for Apollo)

## Context

Phase 1 needs two MCP servers:

- **Supabase MCP**, used from Checkpoint 2 onward for schema migrations, RLS policies, and ad-hoc queries during development.
- **Apollo MCP**, used from Checkpoint 5 for director email enrichment.

Claude Code on the web configures MCPs per-session rather than from a repo-level `.mcp.json`. Neither MCP is needed to complete Checkpoint 1 (project scaffold), so neither is wired up yet.

## Decision

Install the MCPs at the start of the checkpoint that first needs them, not earlier. Each install is a one-line entry recorded here so anyone re-creating the dev environment has a playbook.

### Supabase MCP — wire up at the start of Checkpoint 2

Server: `@supabase/mcp-server-supabase` (official).

Configuration needs:
- `SUPABASE_ACCESS_TOKEN` — personal access token from the Supabase dashboard (Profile → Access Tokens). Distinct from the service role key used by the runtime client.
- `SUPABASE_PROJECT_REF` — the project ref for the `SDR-Agent` project (region eu-west-2).

Both supplied to the MCP at session start; neither is committed to the repo.

### Apollo MCP — wire up at the start of Checkpoint 5

The implementation choice is **deferred to Checkpoint 5**. Use whichever Apollo MCP is officially recommended by Apollo at that point. If multiple options exist, prefer the one with active maintenance and an `@apollo` namespace.

Configuration needs (likely):
- `APOLLO_API_KEY` — already listed in `.env.example`.

## Consequences

The `.env.example` lists `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `APOLLO_API_KEY` — those are runtime keys, used by the agent code. The MCP-only keys (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`) live in the developer's MCP session config, not in `.env.example`, because the agent itself never reads them.

If Claude Code's project-level MCP config (`.mcp.json`) becomes the standard way to configure MCPs in this environment, this decision is superseded — add `.mcp.json` to the repo root and link it from this record.
