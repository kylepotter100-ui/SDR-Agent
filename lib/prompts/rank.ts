/**
 * Ranking prompts for Opus 4.7.
 *
 * The ranker scores every unsurfaced prospect from 0 to 100 and gives
 * a one-sentence reason. Top 15 by score become the candidates for the
 * weekly digest (Checkpoint 8 will read those).
 *
 * Rubric is opinionated and bakes in the observation that surfaced
 * during the C6 spot-check: prospects with `Website found` are a
 * weaker fit for our custom-build pitch — they've already invested
 * in some web presence. The rubric caps their score at 50; the agent
 * module enforces the same cap deterministically as belt-and-braces.
 */

import type { PostcodePrefix } from "@/lib/config";

export interface RankCandidate {
  prospect_id: string;
  company_name: string;
  postcode: string;
  postcode_prefix: PostcodePrefix | null;
  sic_code: string;
  sic_description: string | null;
  sic_tier: number;
  observable_signal: string | null;
  has_website: boolean | null;
  website_url: string | null;
  facebook_url: string | null;
  director_name: string | null;
  incorporated_on: string | null;
  personalised_email_subject: string | null;
}

export const RANKING_SYSTEM_PROMPT = `You are ranking new UK business prospects for KP Solutions, a design and software studio that builds custom websites with integrated booking management systems for small service businesses. Recent case study: a custom booking system for The Potter Sanctuary, a pottery studio in Loughborough.

Each prospect is scored 0 to 100. The score reflects how strong a target this business is for our outreach. Follow the rubric below — do not freelance.

Rubric:

1. Signal (most important). What is the prospect's current online presence?
   - "No Google Maps presence yet — very new business": STRONGEST. Score in 75-95 range. Fresh businesses have not locked into vendor commitments; our pitch lands hard.
   - "Facebook-only, no website": STRONG. Score in 70-90 range. Owner is improvising online; ready for a proper system.
   - "Google Maps listed, no website found": STRONG. Score in 65-85 range. Same logic — they have started but not committed to web infrastructure.
   - "Website found": WEAK. Score must be 50 or lower, no exceptions. They have already invested in a website; our custom-build pitch fits poorly. Use the 20-50 range.

2. SIC tier (tiebreaker within signal class). Lower tier number is better:
   - Tier 1 (sport/wellbeing/accommodation/arts facilities, fit weight 1.0): the Sanctuary archetype. +5 to +10 within signal range.
   - Tier 2 (classes and courses, fit weight 0.9): +3 to +7.
   - Tier 5 (creative services and hire, fit weight 0.8): +3 to +7.
   - Tier 3 (1:1 appointments, fit weight 0.7): +1 to +5.
   - Tier 4 (trade and service, fit weight 0.6): 0 to +3.
   - Tier 6 (event experiences, fit weight 0.5): 0 to +3.

3. Recency. Incorporations within the last 30 days get +2 to +5. They have not locked into vendor decisions yet.

4. Director known. A populated director_name field gets +1 to +3. Marginal — easier to personalise outreach.

Hard rules:
- "Website found" prospects must score ≤50. No exceptions.
- score is an integer 0 to 100.
- reasoning is a single sentence under 30 words. It must name the signal class and the SIC tier explicitly. No generic phrasing like "good fit", "promising prospect", "strong candidate".
- reasoning must not invent details about the business beyond what is in the input record.
- Every prospect in the input must appear exactly once in the output. Preserve the input order.`;

export function rankUserPrompt(candidates: RankCandidate[]): string {
  const list = candidates.map((c) => ({
    prospect_id: c.prospect_id,
    company_name: c.company_name,
    postcode: c.postcode,
    sic_code: c.sic_code,
    sic_description: c.sic_description,
    sic_tier: c.sic_tier,
    observable_signal: c.observable_signal,
    has_website: c.has_website,
    website_url: c.website_url,
    facebook_url: c.facebook_url,
    director_name: c.director_name,
    incorporated_on: c.incorporated_on,
  }));
  return `Rank the following ${list.length} prospects. Today's date is ${new Date().toISOString().slice(0, 10)} for the recency calculation.

${JSON.stringify(list, null, 2)}`;
}
