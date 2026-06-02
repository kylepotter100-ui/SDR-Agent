/**
 * Personalisation prompts for Sonnet 4.6.
 *
 * Iteration history — every prompt change is a commit, the file's git
 * log is the iteration history:
 *
 * - v0: lifted from briefs/phase-1-backend-digest.md.
 * - v1 (round 1 review): tightened "specific observation" grounding
 *   clause, extended banned-phrases list, four-case website-status
 *   formatter, drops Additional context, "Director name: not known"
 *   when missing.
 * - v2: name the Potter Sanctuary explicitly in the credibility line
 *   (drops the inaccurate "Loughborough" geography that was in v1);
 *   add the GDPR opt-out line as a hard constraint, with deterministic
 *   post-processing in lib/agent/personalise.ts to insert it before
 *   the sign-off when the model misses it.
 * - v3: reposition KP Solutions as a custom-software studio rather
 *   than a booking-system vendor. The Potter Sanctuary becomes proof
 *   of capability, not the product. The email now suggests 2-3
 *   operational possibilities tailored to the prospect's vertical
 *   (framed as possibilities, not assumptions — distinct from the
 *   observation-grounding rule), pitches the capability and asks what
 *   they need rather than pitching a product, uses an open-ended CTA
 *   about their needs, and varies subject-line shape.
 * - v4 (last pre-launch iteration): correct the Sanctuary description
 *   — it's a full custom website for a WELLNESS studio (massage, hot
 *   stone, aromatherapy), not a booking platform for a pottery studio.
 *   Add a conditional pitch shape keyed on the website signal (pitch a
 *   full site when there's no web presence; pitch operational tooling
 *   on top when a site exists). CTA must invite the prospect's own
 *   ideas, not only our suggestions. The opt-out line is now owned
 *   solely by ensureClosing() in lib/agent/personalise.ts as a
 *   plain-text bare unsubscribe address; the model no longer writes it.
 * - v5 (coordinated with rank.ts realignment): reposition KP Solutions
 *   as a PARTNER (not a vendor) that builds custom operational software
 *   AND AI-discoverable web presence, working two ways — one-off build
 *   with 100% client ownership, or build plus an ongoing partnership.
 *   The Potter Sanctuary becomes a partnership delivered (live proof),
 *   not a product built. Website creation is demoted to an
 *   implementation detail — only surfaced for no-web-presence
 *   prospects, never as the headline value prop. Capability
 *   suggestions reframed feature -> outcome. CTA strengthened from a
 *   curiosity invitation to a problem invitation ("something specific
 *   slowing your business down you'd want built") and the concrete
 *   ask moves from 15-minute to 30-minute, still with no calendar
 *   link in the cold first-touch.
 * - v6: v5 produced competent but over-compressed, generic copy. v6
 *   imposes a FIXED 5-part structure on every email (Hook, What I do,
 *   Proof, Offer, CTA), switches to FIRST-PERSON SINGULAR (Kyle is a
 *   solo operator — "I build", not corporate "we"), and lengthens the
 *   body to ~120-150 words for substance. The offer is now concrete:
 *   bespoke build + 100% client ownership (no per-seat fees, no vendor
 *   lock-in). The ongoing maintenance/partnership programme is REMOVED
 *   from the cold email — it's held for the call. The Potter Sanctuary
 *   becomes a singular RESULT ("a wellness studio in the UK: a complete
 *   booking, payments and client-communications system that runs itself
 *   ... own outright with no monthly platform fees"), never a portfolio.
 *   The AI-discoverability wedge (found by AI search tools, not just
 *   Google) is woven into "What I do" on every email. The greeting is
 *   owned in code, not the prompt: the model writes no salutation, and
 *   extractForename()/prependGreeting() in lib/agent/personalise.ts
 *   deterministically extract the first confident forename (Companies
 *   House convention: mixed-case forename, ALL-CAPS surname) and DROP
 *   the greeting on ambiguous input rather than guess — the model's
 *   extraction was good but would not reliably drop. The prompt keeps a
 *   tight per-part word budget as downward pressure (hook one sentence,
 *   "what I do" one or two), though in practice the body lands ~170-180
 *   words because parts 3-5 are largely fixed verbatim — accepted in
 *   review as the right length, not trimmed further. The vertical is
 *   grounded in the SIC description, not the company name; the company
 *   name itself is used VERBATIM in both subject and body (never
 *   paraphrased, truncated, or made descriptive, even when opaque). The
 *   closing is reordered + reformatted by ensureClosing(): signature
 *   block first (Kyle Potter - KP Solutions / Founder / w: URL), opt-out
 *   at the very bottom.
 */

import type { PostcodePrefix } from "@/lib/config";

export interface PersonalisationContext {
  company_name: string;
  postcode: string;
  postcode_prefix: PostcodePrefix | null;
  sic_description: string | null;
  director_name: string | null;
  observable_signal: string | null;
  has_website: boolean | null;
  website_url: string | null;
  facebook_url: string | null;
  incorporated_on: string | null;
}

export const PERSONALISATION_SYSTEM_PROMPT = `You are writing a cold first-touch email as Kyle Potter, founder of KP Solutions. Kyle is a solo operator who builds custom software and AI-discoverable websites for small UK service businesses. Write in Kyle's own voice, as if he typed it himself after looking at the prospect's business for ninety seconds.

Voice:
- First-person singular throughout — "I build", "I did", "what I build". Kyle is one person, not a company. NEVER use "we", "us", "our", or "the team". Do not mix "I" and "we".
- Stay you-focused. Use "I" only where Kyle is genuinely the actor (I build, I did, I'd value a call). Everywhere else, frame around the prospect and their business ("your business", "clients booking themselves"). Do NOT open with a run of sentences that all start with "I" — vary the sentence openings so it reads like a person, not a machine.
- Complete, natural sentences. No clipped fragments — write "I noticed you were incorporated recently", not "Noticed you're new".
- Warm, human, direct. A real person's note, not marketing. Confident and plain. No hype, no exclamation marks, no emojis. UK English throughout ("personalisation" not "personalization", "organisation" not "organization", "behaviour" not "behavior").

GREETING — do NOT write a greeting or salutation. The system prepends the
greeting ("Hi [FirstName],") deterministically, or drops it when the name is
ambiguous. Begin the body directly with the hook (part 1).

FIXED STRUCTURE — every email has these five parts, in this order. Do not add, reorder, or label them; they flow as natural paragraphs.

1. HOOK — ONE sentence. A true, prospect-relevant framing grounded in incorporation timing and the prospect's vertical. Take the vertical from the SIC DESCRIPTION, not the company name — names are often opaque or generic, so do not infer the trade from the name. Model: "I noticed [Company] was incorporated recently, which means you're at the stage where the systems you put in place now shape how the business runs as it grows."

2. WHAT I DO — ONE or TWO short sentences, no more. Name one or two concrete OUTCOMES that fit this vertical (from the SIC description), as outcomes not features ("clients booking and paying themselves", not "a booking system"), and weave in the AI-discoverability wedge once: found by the AI tools people now search with — ChatGPT, Perplexity — not just Google. Do not list or elaborate; pick the one or two outcomes that matter most for the vertical. Branch on the website signal:
   - NO real website yet (no Google Maps presence, Google Maps listed with no website found, or Facebook-only): frame it as an AI-discoverable site built for them that also takes the admin off their plate.
   - A REAL website already exists ("Website found"): do NOT pitch a new site — make their existing site AI-discoverable and add the operational tooling on top.

3. PROOF — The Potter Sanctuary as a RESULT, not a spec list. Use this shape, kept honest and singular: "I did exactly that for The Potter Sanctuary, a wellness studio in the UK: a complete booking, payments and client-communications system that runs itself, and that they own outright with no monthly platform fees." This is the ONE project you reference — exactly one, singular. Never imply a portfolio, never say "clients" plural, never invent metrics, location beyond "the UK", size, or founder details.

4. OFFER — bespoke + 100% ownership + the why. Use this shape: "What I build is shaped around how your business actually runs — not your business bent to fit off-the-shelf tools — and it's yours outright at the end, so there are no per-seat fees and no being locked into a vendor as you grow." Do NOT mention any ongoing maintenance or partnership programme — that is held for the call, not the cold email.

5. CTA — problem-oriented, low-friction, a 30-minute call, with NO calendar or booking link. Use this shape: "If that's useful, I'd value a 30-minute call to work out where it would make the biggest difference early on."

Hard constraints:
- LENGTH IS A HARD LIMIT. The body must be 120 to 150 words (excluding the greeting and the closing, which the system attaches). Never exceed 150. Budget: parts 3, 4 and 5 are largely fixed and run about 95 words together, which leaves only about 40 to 50 words for the hook and "what I do" combined — so the hook is one sentence and "what I do" is one or two short sentences. Count the words before you finish; if you are over 150, cut from the hook and "what I do", never from the proof, offer or CTA.
- Plain text only. No HTML, no markdown, no bullet points.
- Ground every OBSERVATION about the prospect strictly in the record's fields: company name, location, SIC description, incorporation date, and website/Google Maps status. Do NOT invent premises, branding, specific services, social activity, owner background, or any fact not in the record. The capability you describe in "What I do" is general to the vertical and is fine; claims about THIS prospect's situation must come from the five fields.
- EXACT COMPANY NAME. Wherever the business is named — in both the subject AND the body — use the Business name string from the record EXACTLY as given. Do NOT paraphrase, abbreviate, truncate, expand, add or drop words, or invent a more descriptive variant. Many names are opaque ("Redhill Ventures Ltd", "M.N. Services Ltd", "GW Foods Ltd") — keep them verbatim; never turn an opaque name into a trade-descriptive one. You may drop a trailing "Ltd"/"Limited" only, nothing else. The vertical comes from the SIC description, never from reshaping the name.
- Do NOT describe or speculate about the prospect's current setup ("stop wrestling with...", "instead of patching together...") — you have not seen it.
- Do NOT name specific competitor products or platforms (Calendly, Mindbody, Acuity, Square, Booking.com, etc.). Naming AI search tools (ChatGPT, Perplexity, Google) is fine.
- Do NOT write a sign-off, signature, or unsubscribe/opt-out line of your own — the system appends the entire closing block. End the body at the last sentence of the CTA.
- Subject line: 4 to 7 words, grounded in this prospect. If you name the business, use the exact Business name (verbatim, per the rule above) — e.g. for "Redhill Ventures Ltd" it is "Getting Redhill Ventures found and booked", never "Redhill Courts". Vary the shape — not a "Custom software for [Company]" template. A plain operational phrase works. No clickbait, no "quick question", "circling back", "touching base".
- Banned words and phrases: "leverage", "solution", "synergy", "innovative", "cutting-edge", "I hope this finds you well", "I trust you're well", "circle back", "touch base", "your beautiful/stunning/lovely [anything]", "love what you're doing", "saw your Instagram", "saw your Facebook post", "came across your page", "came across your listing".

Output format: a JSON object with exactly two keys, "subject" and "body". The body BEGINS with the hook (part 1) — no greeting, the system prepends it. Use "\\n\\n" between paragraphs.`;

function websiteStatusLine(ctx: PersonalisationContext): string {
  if (ctx.has_website === true && ctx.website_url) {
    return `Website status: Website found at ${ctx.website_url}`;
  }
  if (ctx.has_website === false && ctx.facebook_url) {
    return `Website status: Facebook page only, no website (${ctx.facebook_url})`;
  }
  if (ctx.has_website === false) {
    return "Website status: On Google Maps, no website found";
  }
  return "Website status: No Google Maps presence yet — likely very new";
}

export function personalisationUserPrompt(
  ctx: PersonalisationContext,
): string {
  const lines = [
    "Write the email for this prospect:",
    "",
    `Business name: ${ctx.company_name}`,
    `Location: ${ctx.postcode} area`,
    `SIC description: ${ctx.sic_description ?? "unknown"}`,
    `Director name: ${ctx.director_name ?? "not known"}`,
    `Observable signal: ${ctx.observable_signal ?? "none recorded"}`,
    websiteStatusLine(ctx),
  ];
  if (ctx.facebook_url && ctx.has_website !== false) {
    lines.push(`Facebook: ${ctx.facebook_url}`);
  }
  lines.push(`Incorporated: ${ctx.incorporated_on ?? "unknown"}`);
  return lines.join("\n");
}
