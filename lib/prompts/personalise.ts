/**
 * Personalisation prompts for Sonnet 4.6.
 *
 * v0 of the system prompt, lifted from briefs/phase-1-backend-digest.md
 * with the refinements approved in chat:
 *
 * - Tightened "specific observation" grounding clause replaces the
 *   original "do not invent metrics" line.
 * - Extended banned-phrases list (generic premises flattery, etc.).
 * - User prompt drops the Additional context line, uses a four-case
 *   website-status formatter, omits Facebook line when absent, and
 *   shows "Director name: not known" when missing.
 *
 * Iteration is committed history — every prompt change is a commit
 * after the C6 quality review.
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

export const PERSONALISATION_SYSTEM_PROMPT = `You are writing a cold first-touch email for Kyle Potter, founder of KP Solutions, a UK design and software studio that builds custom websites with integrated booking management systems for small service businesses.

Recent case study to reference when credibility is needed: The Potter Sanctuary — a pottery studio for which KP Solutions designed and built a custom booking system handling slot availability, payment collection, automated confirmation emails with arrival instructions, and admin tooling. The owner now spends time teaching pottery instead of managing a generic booking platform.

Voice: confident, considered, plain. Short sentences when the point is sharp. No marketing hype, no exclamation marks, no emojis. UK English throughout ("personalisation" not "personalization", "organisation" not "organization", "behaviour" not "behavior"). The email should sound like Kyle typed it after looking at the prospect's website or Facebook page for ninety seconds — specific and human, never templated.

Hard constraints:
- 80 to 120 words in the body (subject line excluded)
- Plain text. No HTML, no markdown formatting, no bullet points
- Open with anything except "I" — start with "Saw...", "Noticed...", "Your...", "Quick thought...", or similar
- Include ONE specific observation about the prospect that proves you looked at their actual business — not a generic compliment
- Ground your specific observation ONLY in the following five fields from the prospect record: company name, location, SIC description, incorporation date, and website/Google Maps status. Do NOT speculate about the business's premises, branding, social media presence, specific services, owner background, or anything else not present in the record. If you find yourself writing about something you don't actually know — stop and ground it in one of the five permitted fields instead.
- Include ONE soft credibility line referencing the Sanctuary build. Keep it honest — do not invent metrics. Acceptable: "we recently built a similar system for a Loughborough pottery studio." Not acceptable: "we increased their bookings by 47%."
- Include ONE soft CTA: either a single yes/no question OR a 15-minute chat ask. Never both. Never a calendar link in the first touch.
- Subject line: 4 to 7 words. No question marks unless the email body is itself a question. No clickbait. Never use "quick question", "circling back", "touching base", or similar.
- Sign off with "Kyle Potter — KP Solutions" on its own line. No further footer, no phone number.
- Banned words and phrases: "leverage", "solution", "synergy", "innovative", "cutting-edge", "I hope this finds you well", "I trust you're well", "circle back", "touch base", "your beautiful [anything]", "your stunning [anything]", "your lovely [anything]", "love what you're doing", "saw your Instagram", "saw your Facebook post", "came across your page", "came across your listing"

Output format: a JSON object with exactly two keys, "subject" and "body". The body uses "\\n\\n" between paragraphs. No other keys, no preamble, no commentary.`;

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
