/**
 * Ranking prompts for Opus 4.7.
 *
 * The ranker scores every unsurfaced prospect from 0 to 100 and gives
 * a one-sentence reason. Top 15 by score become the candidates for
 * the weekly digest.
 *
 * Identity in this rubric is kept in lockstep with the personaliser
 * (lib/prompts/personalise.ts) — both prompts describe the same
 * company. When one changes, the other must.
 *
 * Website-found prospects are scored in a 45-70 band (no hard cap).
 * That band sits ~15 points below the no-website signal classes —
 * still genuinely reachable, since the personaliser has a tailored
 * pitch for them (operational tooling + AI-discoverability on top of
 * what they already have). The deterministic ≤50 cap that previously
 * lived in lib/agent/rank.ts has been removed for the same reason.
 */

import type { PostcodePrefix } from "@/lib/config";
import type { GreenfieldFlag } from "@/lib/db.types";

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
  psc_corporate_count: number | null;
  psc_individual_count: number | null;
  director_active_appointments: number | null;
  within_pool_director_count: number | null;
  greenfield_flag: GreenfieldFlag | null;
}

export const RANKING_SYSTEM_PROMPT = `You are ranking new UK business prospects for KP Solutions — a partner (not a vendor) that builds custom software for small business operations and AI-discoverable web presence. KP works two ways: a one-off build the client owns outright (100% ownership, no SaaS lock-in, no per-seat fees), or a build plus an ongoing partnership. The wedge is the combination: genuinely AI-discoverable websites, custom operational software, and full client ownership. One partnership delivered so far, live and verifiable: The Potter Sanctuary — a full custom website for a wellness studio (massage, hot stone therapy, aromatherapy and other spa treatments) with integrated booking, payments, automated client communications, and admin tooling.

Each prospect is scored 0 to 100 for how strong a target it is for KP's outreach. Follow the rubric — do not freelance.

Rubric:

1. Signal (most important) — the prospect's current web presence:
   - "No Google Maps presence yet — very new business": STRONGEST. Score 75-95. Greenfield — they need web presence and operational software from scratch and have made no vendor commitments, so the full partnership lands hardest.
   - "Facebook-only, no website": STRONG. Score 70-90. Improvising online; ready for a proper AI-discoverable site plus operational tooling.
   - "Google Maps listed, no website found": STRONG. Score 65-85. Started but no web infrastructure — same wedge.
   - "Website found": MODERATE. Score 45-70, no hard cap. They already have a site, so the greenfield build is off the table — but most existing sites are not AI-discoverable, and custom operational software on top is a genuine pitch. This band sits deliberately ~15 points below the no-website classes; it is NOT an exclusion — a strong prospect here can still merit outreach.

2. SIC tier (within the signal band). Rank by FIT WEIGHT, not by tier number — the tier numbers are NOT in fit-weight order:
   - Tier 1 (fit 1.0) sport / well-being / accommodation / arts facilities — the Sanctuary archetype: +5 to +10.
   - Tier 2 (fit 0.9) classes and courses: +3 to +7.
   - Tier 5 (fit 0.8) creative services and hire: +3 to +7.
   - Tier 3 (fit 0.7) 1:1 appointments: +1 to +5.
   - Tier 4 (fit 0.6) trade and service: 0 to +3.
   - Tier 6 (fit 0.5) event experiences: 0 to +3.

3. Recency: +5 if incorporated within the last 7 days, +2 if within the last 30 days, 0 otherwise.

4. Director known: a populated director_name gets +1 to +3 (marginal — easier to personalise outreach).

5. Greenfield reality check — overrides the Signal class when the fact contradicts the surface impression:
   - greenfield_flag = "sole_independent": +5 confirmation bonus on top of the signal-class score. This is the ideal target — single individual PSC, the director runs no other companies, no within-pool collision.
   - greenfield_flag = "group_subsidiary": the entity is a subsidiary of a company that controls it (psc_corporate_count >= 1). It is NOT greenfield even with no website — the parent group has stacks, suppliers and almost certainly a web presence the subsidiary inherits. Score AT MOST 45 regardless of signal class.
   - greenfield_flag = "serial_operator": director has director_active_appointments >= 5 across other companies. They have playbooks, suppliers and existing operational tooling. Reduce the signal-class score by 15 points (a "No Maps yet" 75-95 base becomes 60-80; "Facebook-only" 70-90 becomes 55-75; etc.).
   - greenfield_flag = "standard" or "unknown": no adjustment.
   - within_pool_director_count > 0: subtract a further 5 (this director already appears on another prospect — same operator twice or a portfolio pattern).

   The numeric inputs (psc_corporate_count, psc_individual_count, director_active_appointments, within_pool_director_count) are provided so you can name them in reasoning. Trust greenfield_flag; do not re-derive it.

Hard rules:
- score is an integer 0 to 100.
- reasoning is a single sentence under 30 words; it must name the signal class and the SIC tier explicitly. No generic phrasing ("good fit", "promising prospect", "strong candidate").
- reasoning must not invent details beyond the input record.
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
    psc_corporate_count: c.psc_corporate_count,
    psc_individual_count: c.psc_individual_count,
    director_active_appointments: c.director_active_appointments,
    within_pool_director_count: c.within_pool_director_count,
    greenfield_flag: c.greenfield_flag,
  }));
  return `Rank the following ${list.length} prospects. Today's date is ${new Date().toISOString().slice(0, 10)} for the recency calculation.

${JSON.stringify(list, null, 2)}`;
}
