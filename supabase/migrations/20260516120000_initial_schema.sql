-- Phase 1, Checkpoint 2: initial schema for the SDR agent.
--
-- Three tables:
--   companies_house_raw  — audit cache of raw Companies House responses
--   prospects            — enriched, scored prospect record
--   digests              — record of each weekly digest sent
--
-- Plus a reusable set_updated_at() trigger function and a BEFORE UPDATE
-- trigger on prospects to keep updated_at current automatically.
--
-- Only PK / FK / unique constraints are declared. No speculative indexes —
-- add them when a real query proves it needs one.

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table public.companies_house_raw (
  id uuid primary key default gen_random_uuid(),
  company_number text unique not null,
  fetched_at timestamptz not null default now(),
  raw_data jsonb not null
);

create table public.prospects (
  id uuid primary key default gen_random_uuid(),
  company_number text unique not null
    references public.companies_house_raw(company_number),
  company_name text not null,
  sic_code text not null,
  sic_description text,
  sic_tier int not null,
  fit_weight numeric not null,
  postcode text not null,
  registered_address text,
  incorporated_on date,
  director_name text,
  director_email text,
  has_website boolean,
  website_url text,
  facebook_url text,
  maps_place_id text,
  observable_signal text,
  personalised_email_subject text,
  personalised_email_body text,
  ranking_score numeric,
  ranking_reasoning text,
  status text not null default 'new'
    check (status in (
      'new',
      'surfaced',
      'contacted',
      'replied',
      'qualified',
      'dead',
      'ignored'
    )),
  surfaced_in_digest_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger prospects_set_updated_at
  before update on public.prospects
  for each row
  execute function public.set_updated_at();

create table public.digests (
  id uuid primary key default gen_random_uuid(),
  sent_at timestamptz not null default now(),
  prospect_ids uuid[] not null,
  candidate_count int not null,
  delivered_to text not null
);
