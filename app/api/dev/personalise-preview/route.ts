import { NextResponse } from "next/server";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { claude, SONNET_MODEL_ID } from "@/lib/anthropic";
import { ensureClosing } from "@/lib/agent/personalise";
import {
  PERSONALISATION_SYSTEM_PROMPT,
  personalisationUserPrompt,
  type PersonalisationContext,
} from "@/lib/prompts/personalise";
import { requireCronAuth } from "@/lib/cron-auth";

/**
 * Stateless review harness for prompt iterations (v6 and beyond).
 *
 * Runs the live personalisation prompt against a fixed set of SYNTHETIC
 * contexts and returns the generated emails — with the real
 * ensureClosing() applied, so what you read is what production would
 * persist. It does NOT read or write the database, so it neither
 * depends on nor mutates preview prospect rows.
 *
 * The scenarios deliberately cover:
 *   - all three website-signal branches (no presence / Maps-listed,
 *     no website / website found), so no pitch branch silently fails;
 *   - several messy director_name formats (comma-ordered, multi-given,
 *     single-token, all-caps surname, missing, and an ambiguous
 *     all-caps pair) — the greeting is the highest-risk element, and
 *     the failure mode that matters is confidently greeting with the
 *     WRONG name, not merely dropping it. The "expectGreeting" note on
 *     each scenario states what a correct result looks like.
 *
 * Cost: one Sonnet 4.6 call per scenario (~6 calls) — pennies per run,
 * well under the CLAUDE.md paid-API threshold.
 *
 * Bearer-authed against CRON_SECRET, same as the other /api/dev/* routes.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PreviewEmailSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
});

interface Scenario {
  label: string;
  expectGreeting: string;
  ctx: PersonalisationContext;
}

function ctx(partial: Partial<PersonalisationContext>): PersonalisationContext {
  return {
    company_name: "Placeholder Ltd",
    postcode: "LE1",
    postcode_prefix: null,
    sic_description: null,
    director_name: null,
    observable_signal: null,
    has_website: null,
    website_url: null,
    facebook_url: null,
    incorporated_on: "2026-05-12",
    ...partial,
  };
}

const SCENARIOS: Scenario[] = [
  {
    label: "no-presence + multi-given-name",
    expectGreeting: '"Hi Sarah," (first of multiple given names)',
    ctx: ctx({
      company_name: "Whitmore Wellbeing Ltd",
      postcode: "LE11",
      sic_description: "Other human health activities",
      director_name: "Sarah Jane Whitmore",
      observable_signal: "No Google Maps presence — very new business",
      has_website: null,
    }),
  },
  {
    label: "website-found + comma-ordered, all-caps surname",
    expectGreeting: '"Hi Jonathan," (given name follows the comma)',
    ctx: ctx({
      company_name: "Apex Court Sports Ltd",
      postcode: "NG7",
      sic_description: "Operation of sports facilities",
      director_name: "SMITH, Jonathan",
      observable_signal: "Website found",
      has_website: true,
      website_url: "https://apexcourtsports.co.uk",
    }),
  },
  {
    label: "Maps-listed, no website + title-and-comma noise (brief's example)",
    expectGreeting: '"Hi Alexey," (strip the Dr title; PETERNEV is surname)',
    ctx: ctx({
      company_name: "Peternev Physiotherapy Ltd",
      postcode: "DE1",
      sic_description: "Other human health activities",
      director_name: "Alexey, Dr PETERNEV",
      observable_signal: "Google Maps listed, no website found",
      has_website: false,
    }),
  },
  {
    label: "no-presence + single-token name",
    expectGreeting: '"Hi Mxolisi,"',
    ctx: ctx({
      company_name: "Mxolisi Mobile Grooming Ltd",
      postcode: "NN1",
      sic_description: "Hairdressing and other beauty treatment",
      director_name: "Mxolisi",
      observable_signal: "No Google Maps presence — very new business",
      has_website: null,
    }),
  },
  {
    label: "website-found + MISSING director name",
    expectGreeting: "greeting DROPPED — opens directly on the hook",
    ctx: ctx({
      company_name: "Riverside Pilates Studio Ltd",
      postcode: "LE2",
      sic_description: "Fitness facilities",
      director_name: null,
      observable_signal: "Website found",
      has_website: true,
      website_url: "https://riversidepilates.co.uk",
    }),
  },
  {
    label: "Maps-listed, no website + ambiguous all-caps pair",
    expectGreeting:
      "greeting DROPPED (both tokens all-caps — given vs surname unclear; must not guess)",
    ctx: ctx({
      company_name: "Golden Wok Express Ltd",
      postcode: "NG1",
      sic_description: "Take-away food shops and mobile food stands",
      director_name: "ZHANG WEI",
      observable_signal: "Google Maps listed, no website found",
      has_website: false,
    }),
  },
];

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export async function POST(request: Request) {
  const denied = requireCronAuth(request);
  if (denied) return denied;

  try {
    const samples = [];
    for (const scenario of SCENARIOS) {
      const response = await claude().messages.parse({
        model: SONNET_MODEL_ID,
        max_tokens: 1024,
        thinking: { type: "disabled" },
        output_config: {
          effort: "medium",
          format: zodOutputFormat(PreviewEmailSchema),
        },
        system: [
          {
            type: "text",
            text: PERSONALISATION_SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [
          { role: "user", content: personalisationUserPrompt(scenario.ctx) },
        ],
      });

      if (!response.parsed_output) {
        samples.push({
          label: scenario.label,
          error: `Structured output unavailable (stop_reason=${response.stop_reason})`,
        });
        continue;
      }

      const { subject, body: modelBody } = response.parsed_output;
      samples.push({
        label: scenario.label,
        director_name: scenario.ctx.director_name,
        observable_signal: scenario.ctx.observable_signal,
        expectGreeting: scenario.expectGreeting,
        subject,
        bodyWordCount: wordCount(modelBody),
        body: ensureClosing(modelBody),
      });
    }

    return NextResponse.json({ count: samples.length, samples });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[personalise-preview] failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
