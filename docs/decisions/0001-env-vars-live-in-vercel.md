# 0001 — Environment variables live in Vercel, not in the repo

Date: 2026-05-15
Status: Accepted

## Context

The agent needs API keys for Anthropic, Companies House, Google Places, Apollo, Resend, and the Supabase service role. None of these can be checked into the repo. The agent runs in two places: locally during development, and on Vercel in production (cron).

## Decision

- `.env.example` is committed and lists every variable the agent reads, with blank values and a one-line comment per variable. It is the contract.
- `.env.local` is the local-dev file. It is git-ignored and **never** committed. Developers populate it from a password manager when working locally.
- Production values live exclusively in Vercel Project Settings → Environment Variables. They are not mirrored anywhere in the repo.
- `.gitignore` ignores all `.env*` files with an explicit `!.env.example` exception so the contract stays checked in.

## Consequences

A new contributor knows what to ask for: every variable they need is in `.env.example`. There is exactly one source of truth for production secrets (Vercel) and one source of truth for the variable list (this repo). Rotating a key is a Vercel-only operation; no commit is involved.

If a new variable is introduced, the PR that introduces it must add the entry to `.env.example` in the same commit. CI will eventually enforce this; for now it is a review-time check.
