/**
 * Resend SDK singleton.
 *
 * Same shape as lib/db.ts and lib/anthropic.ts. Reads RESEND_API_KEY
 * from process.env and throws if missing. Single source of truth for
 * the Phase 1 weekly digest send; Phase 3's Outlook flow uses
 * Microsoft Graph directly and does not import this module.
 */

import { Resend } from "resend";

let client: Resend | undefined;

export function resend(): Resend {
  if (!client) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("Missing required environment variable: RESEND_API_KEY");
    }
    client = new Resend(apiKey);
  }
  return client;
}
