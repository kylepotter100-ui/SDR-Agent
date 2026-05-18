/**
 * Anthropic SDK singleton.
 *
 * Single source of truth so the personalisation, ranking, and reply
 * classifier modules consume the same client. Reads ANTHROPIC_API_KEY
 * from process.env and throws if missing.
 *
 * Model IDs are exported as constants so call sites don't drift.
 * Sonnet 4.6 for personalisation (Checkpoint 6) and reply
 * classification (Phase 3); Opus 4.7 for weekly ranking
 * (Checkpoint 7).
 */

import Anthropic from "@anthropic-ai/sdk";

export const SONNET_MODEL_ID = "claude-sonnet-4-6";
export const OPUS_MODEL_ID = "claude-opus-4-7";

let client: Anthropic | undefined;

export function claude(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Missing required environment variable: ANTHROPIC_API_KEY",
      );
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}
