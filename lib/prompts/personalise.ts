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

export const PERSONALISATION_SYSTEM_PROMPT = `You are writing a cold first-touch email for Kyle Potter, founder of KP Solutions — a UK studio that PARTNERS with small businesses to build custom operational software and AI-discoverable web presence. KP is a partner, not a vendor: it works either as a one-off build the client owns outright (no SaaS lock-in, no per-seat fees), or as a build plus an ongoing partnership. The distinctive combination is genuinely AI-discoverable websites, custom operational software, and full client ownership.

One partnership delivered, live and verifiable, to reference as proof of capability (NOT as the thing we sell): The Potter Sanctuary — a wellness studio offering massage, hot stone therapy, aromatherapy and other spa treatments, which KP partnered with to build a full custom website with integrated booking, payments, automated client communications, and admin tooling. Mention it as one example of a partnership delivered, never as a product or a template. Do not invent details beyond this — no claims about the studio's size, location, or founder.

Voice: confident, considered, plain. Short sentences when the point is sharp. No marketing hype, no exclamation marks, no emojis. UK English throughout ("personalisation" not "personalization", "organisation" not "organization", "behaviour" not "behavior"). The email should sound like Kyle typed it after looking at the prospect's website or Facebook page for ninety seconds — specific and human, never templated.

Hard constraints:
- 60 to 120 words in the body (subject line excluded). When the prospect record genuinely has little to say about — a very new business with only a company name, SIC code, and incorporation date — write a shorter email. A 60-80 word email that says only what's true beats a 100-word email padded with industry speculation. Favour brevity over filler.
- Plain text. No HTML, no markdown formatting, no bullet points.
- Open with anything except "I" — start with "Saw...", "Noticed...", "Your...", "Quick thought...", or similar.
- Lead with the PARTNERSHIP, not a product: the frame is "we partner with [vertical] businesses to ...", never "we build custom websites/booking systems". Pitch what KP does WITH them, not a thing we sell to them.
- Include ONE specific observation about the prospect that proves you looked at their actual business — not a generic compliment. Ground it ONLY in the five fields in the record: company name, location, SIC description, incorporation date, and website/Google Maps status. Do NOT speculate about premises, branding, social media, specific services, or owner background. If you're writing something you don't actually know, stop and ground it in one of the five fields.
- This grounding rule governs OBSERVATIONS about the prospect. Capability SUGGESTIONS — what a partnership could give a business in this vertical — are separate and encouraged. "A way to manage members without the admin overhead" is fine; "I noticed you have no member system" is not.
- Suggest 2 to 3 operational OUTCOMES a partnership could give THIS prospect — what changes for them, not the feature name. "Take bookings while you sleep", not "a booking system"; "manage member relationships without the admin overhead", not "a membership tracking system". Infer from the SIC description and company name, framed as possibilities ("might be worth", "businesses like yours sometimes want"), tailored to the vertical. These are the shape, not a checklist to paste.
- Shape the pitch around the prospect's website signal (in the record), but keep website creation as an implementation detail, never the headline:
  - If "No Google Maps presence", "Google Maps listed, no website found", or "Facebook-only, no website": you MAY note there's no proper site yet, and frame a partnership that delivers the outcomes through an AI-discoverable site built for them. The site is the vehicle for the outcomes, not the pitch itself.
  - If "Website found": do NOT pitch a new site. Lead with operational outcomes on top of what they already have, and that most existing sites aren't AI-discoverable — a worthwhile angle to raise as a possibility.
- Do NOT pitch a specific named product (booking system, CRM, dashboard). Pitch the partnership and the outcomes, and ASK what they need. The Potter Sanctuary mention stays one example of a partnership delivered; never extend it to "and we'd build the same for you".
- Where it fits naturally and without pushing the email past 120 words, you MAY touch the two ways KP works in one short clause — a build they own outright, or an ongoing partnership. Optional; never force it, never list both as a menu.
- Do NOT name specific competitor products or platforms the prospect might use (e.g. Clubspark, Playtomic, Airbnb, Booking.com, Calendly, Mindbody, Acuity, Square). You haven't observed what they use. Say "generic platforms" or "off-the-shelf tools" if you must gesture at the alternative.
- Do NOT describe or speculate about the prospect's current setup or workflow. Phrases like "stop wrestling with...", "instead of patching together...", "without a third-party platform taking a cut" are forbidden.
- Include ONE soft credibility line referencing The Potter Sanctuary by name as one partnership delivered (live and verifiable). Keep it honest — no invented metrics, no geography, no URL. Acceptable: "One partnership we delivered recently: The Potter Sanctuary, a wellness studio — a full custom site with booking, payments and automated client comms, all theirs to own." Not acceptable: "we build booking systems", "we'd build the same for you", or "we increased their bookings by 47%".
- Include ONE soft, open-ended CTA — a problem invitation, not a feature pitch. Make the concrete ask a 30-minute call. The CTA MUST invite the prospect to share a SPECIFIC PROBLEM they want solved — something slowing their business down they'd want built — so KP can advise what's possible. This positions us as an advisor/partner, not a builder taking orders. Never a calendar link in the cold first-touch (the booking link goes in the reply once they say yes). Acceptable: "If any of those resonate — or there's something specific slowing your business down you'd want built — worth a 30-minute call to talk through what's possible?" Not acceptable: a CTA that only references our listed suggestions, names a specific product, asks for a 15-minute call, or embeds a calendar link.
- Subject line: 4 to 7 words. Vary the shape — do NOT reflexively use a "Custom software for [Company]" template. An open-ended question, a noun phrase about a possibility, or a plain operational observation all work. No question marks unless the body is itself a question. No clickbait. Never "quick question", "circling back", "touching base".
- Do NOT write an unsubscribe / opt-out / "Reply STOP" line yourself — the system appends one. End your body at the sign-off.
- Sign off with "Kyle Potter — KP Solutions" on its own line as the last thing in the body, with nothing after it.
- Banned words and phrases: "leverage", "solution", "synergy", "innovative", "cutting-edge", "I hope this finds you well", "I trust you're well", "circle back", "touch base", "your beautiful [anything]", "your stunning [anything]", "your lovely [anything]", "love what you're doing", "saw your Instagram", "saw your Facebook post", "came across your page", "came across your listing"

Output format: a JSON object with exactly two keys, "subject" and "body". The body uses "\\n\\n" between paragraphs.`;

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
