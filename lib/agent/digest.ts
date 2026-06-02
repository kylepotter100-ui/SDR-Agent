/**
 * Weekly digest composition and send.
 *
 * Reads the current top 15 ranked-and-personalised prospects from the
 * database, renders a mobile-optimised HTML email, sends it via Resend
 * to DIGEST_RECIPIENT_EMAIL, and on success marks those 15 as surfaced
 * and writes one audit row to the digests table.
 *
 * Idempotency: surfaced_in_digest_at is the filter on next-run
 * selection, so a successful send naturally excludes the same
 * prospects next week. Send-first-then-DB-writes: if the DB writes
 * fail after a successful send, the worst case is a duplicate next
 * week — much better than the reverse, which would silently drop
 * prospects after a partial failure.
 *
 * Dry-run mode skips Resend and the DB writes and returns the rendered
 * HTML for layout review.
 */

import { db } from "@/lib/db";
import { resend } from "@/lib/resend";
import {
  getSuppressedEmails,
  isSuppressed,
  STATUS_EXCLUDED_FILTER,
} from "@/lib/agent/suppression";

const TOP_N = 15;
const COMPANIES_HOUSE_PROFILE_URL =
  "https://find-and-update.company-information.service.gov.uk/company/";

interface ProspectForDigest {
  id: string;
  company_number: string;
  company_name: string;
  postcode: string;
  registered_address: string | null;
  sic_code: string;
  sic_description: string | null;
  sic_tier: number;
  fit_weight: number;
  observable_signal: string | null;
  has_website: boolean | null;
  website_url: string | null;
  facebook_url: string | null;
  director_name: string | null;
  director_email: string | null;
  incorporated_on: string | null;
  ranking_score: number;
  ranking_reasoning: string | null;
  personalised_email_subject: string;
  personalised_email_body: string;
}

interface DigestErrorRecord {
  stage: "select" | "send" | "mark_surfaced" | "audit_insert";
  message: string;
}

export interface DigestSummary {
  considered: number;
  sent: number;
  dryRun: boolean;
  skippedRecentSend: boolean;
  sentAt: string | null;
  digestId: string | null;
  messageId: string | null;
  surfacedProspectIds: string[];
  weekOfDate: string;
  subject: string;
  html?: string;
  errors: {
    byBucket: Record<string, number>;
    examples: DigestErrorRecord[];
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Monday of the current ISO week, formatted as "D MMM YYYY" in UK style.
 * Hand-rolled — no date library at this scale.
 */
function weekOfDate(now: Date = new Date()): string {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const dayOfWeek = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (dayOfWeek - 1));
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function emailLine(p: ProspectForDigest): string {
  if (p.director_email) {
    const namePart = p.director_name
      ? `${escapeHtml(p.director_name)} — `
      : "";
    return `<div style="color:#333;">${namePart}<a href="mailto:${escapeHtml(
      p.director_email,
    )}" style="color:#0a66c2;text-decoration:none;">${escapeHtml(
      p.director_email,
    )}</a></div>`;
  }
  const namePart = p.director_name ? `${escapeHtml(p.director_name)} — ` : "";
  return `<div style="color:#a04000;">${namePart}<em>Email: lookup manually before send</em></div>`;
}

function signalLine(p: ProspectForDigest): string {
  const parts = [
    `<strong>${p.ranking_score}/100</strong>`,
    p.observable_signal ? escapeHtml(p.observable_signal) : null,
    `SIC ${escapeHtml(p.sic_code)}${p.sic_description ? " · " + escapeHtml(p.sic_description) : ""}`,
  ].filter((x): x is string => x !== null);
  return parts.join(" · ");
}

function websiteLine(p: ProspectForDigest): string | null {
  if (p.has_website && p.website_url) {
    return `<a href="${escapeHtml(p.website_url)}" style="color:#0a66c2;text-decoration:none;">${escapeHtml(p.website_url)}</a>`;
  }
  if (p.facebook_url) {
    return `<a href="${escapeHtml(p.facebook_url)}" style="color:#0a66c2;text-decoration:none;">Facebook page</a>`;
  }
  return null;
}

function prospectBlock(p: ProspectForDigest, index: number): string {
  const chProfile = `${COMPANIES_HOUSE_PROFILE_URL}${encodeURIComponent(p.company_number)}`;
  const website = websiteLine(p);
  const incorpDate = p.incorporated_on
    ? ` · Incorporated ${escapeHtml(p.incorporated_on)}`
    : "";
  return `<div style="margin:0 0 32px 0;padding:0;border-top:${index === 0 ? "none" : "1px solid #e5e5e5"};padding-top:${index === 0 ? "0" : "24px"};">
  <div style="font-size:18px;font-weight:700;color:#111;margin-bottom:4px;">${index + 1}. ${escapeHtml(p.company_name)}</div>
  <div style="font-size:14px;color:#555;margin-bottom:8px;">${signalLine(p)}</div>
  <div style="font-size:14px;color:#555;font-style:italic;margin-bottom:12px;">${p.ranking_reasoning ? escapeHtml(p.ranking_reasoning) : ""}</div>
  <div style="font-size:14px;color:#333;margin-bottom:4px;">${escapeHtml(p.postcode)}${p.registered_address ? " · " + escapeHtml(p.registered_address) : ""}${incorpDate}</div>
  ${website ? `<div style="font-size:14px;margin-bottom:4px;">${website}</div>` : ""}
  ${emailLine(p)}
  <div style="font-size:13px;margin-top:4px;"><a href="${chProfile}" style="color:#0a66c2;text-decoration:none;">View on Companies House →</a></div>
  <div style="margin-top:16px;font-size:14px;color:#111;font-weight:600;">${escapeHtml(p.personalised_email_subject)}</div>
  <pre style="margin:8px 0 0 0;padding:12px;background:#f5f5f5;border-radius:4px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;line-height:1.5;color:#111;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:break-word;">${escapeHtml(p.personalised_email_body)}</pre>
</div>`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readNumber(value: unknown, key: string): number | null {
  if (!isRecord(value)) return null;
  const v = value[key];
  return typeof v === "number" ? v : null;
}

/**
 * Compose the small italic footer block summarising the week's
 * pipeline activity. Reads numeric counts and per-stage costs from
 * the orchestrator-provided context; missing fields are rendered as
 * em-dashes rather than zeros so absence is visible.
 */
function pipelineSummaryBlock(context: PipelineContext | undefined): string {
  if (!context) return "";
  const discoverCount = readNumber(context.prepare?.discover, "qualified");
  const enrichCount = readNumber(context.prepare?.enrich, "enriched");
  const apolloProcessed = readNumber(context.prepare?.apollo, "processed");
  const apolloConsidered = readNumber(context.prepare?.apollo, "considered");
  const personaliseCount = readNumber(
    context.prepare?.personalise,
    "processed",
  );
  const rankCount = readNumber(context.rank, "ranked");

  const parts: string[] = [];
  parts.push(
    discoverCount !== null
      ? `${discoverCount} new prospects discovered`
      : "discover —",
  );
  parts.push(
    enrichCount !== null ? `${enrichCount} enriched` : "enrich —",
  );
  if (apolloConsidered !== null && apolloConsidered === 0) {
    parts.push("0 Apollo lookups (paused)");
  } else if (apolloProcessed !== null) {
    parts.push(`${apolloProcessed} Apollo lookups`);
  } else {
    parts.push("apollo —");
  }
  parts.push(
    personaliseCount !== null
      ? `${personaliseCount} personalised`
      : "personalise —",
  );
  parts.push(rankCount !== null ? `${rankCount} ranked` : "rank —");

  const cost = context.totalCostGbp;
  parts.push(`this week's API cost £${cost.toFixed(2)}`);

  const failures = context.failedStages ?? [];
  const failureNote =
    failures.length > 0
      ? ` <span style="color:#a04000;">(${failures.join(", ")} failed — see Vercel logs)</span>`
      : "";

  return `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e5e5;font-size:13px;color:#777;font-style:italic;line-height:1.5;">Pipeline summary: ${parts.join(" · ")}.${failureNote}</div>`;
}

function renderHtml(
  prospects: ProspectForDigest[],
  week: string,
  context: PipelineContext | undefined,
): string {
  const header = `<div style="margin-bottom:24px;">
  <div style="font-size:22px;font-weight:700;color:#111;">KP Prospect Digest</div>
  <div style="font-size:14px;color:#555;margin-top:4px;">Week of ${week} · ${prospects.length} prospect${prospects.length === 1 ? "" : "s"} ranked</div>
</div>`;
  const blocks = prospects.map((p, i) => prospectBlock(p, i)).join("\n");
  const footer = pipelineSummaryBlock(context);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KP Prospect Digest</title></head><body style="margin:0;padding:0;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111;">
<div style="max-width:600px;margin:0 auto;padding:24px 16px;background:#ffffff;font-size:16px;line-height:1.5;">
${header}
${blocks}
${footer}
</div>
</body></html>`;
}

const ELIGIBLE_FETCH_LIMIT = 200;

/**
 * Fetch eligible prospects (unsurfaced, ranked, personalised), exclude
 * triaged statuses at the query level and suppressed emails in JS, then
 * derive both the considered count and the top-N selection from the
 * same filtered set. Fetches a buffer beyond TOP_N so suppression
 * filtering can't leave fewer than 15 when there are enough candidates.
 */
async function selectEligible(): Promise<{
  considered: number;
  top: ProspectForDigest[];
}> {
  const result = await db()
    .from("prospects")
    .select(
      "id, company_number, company_name, postcode, registered_address, sic_code, sic_description, sic_tier, fit_weight, observable_signal, has_website, website_url, facebook_url, director_name, director_email, incorporated_on, ranking_score, ranking_reasoning, personalised_email_subject, personalised_email_body, created_at",
    )
    .is("surfaced_in_digest_at", null)
    .not("ranking_score", "is", null)
    .not("personalised_email_subject", "is", null)
    .not("personalised_email_body", "is", null)
    .not("status", "in", STATUS_EXCLUDED_FILTER)
    .order("ranking_score", { ascending: false })
    // fit_weight, not sic_tier: tier numbers are not in fit-weight order
    // (Tier 5 = 0.8 outranks Tiers 3/4 = 0.7/0.6). nullsFirst: false is
    // belt-and-braces — the column is NOT NULL in the schema and enrich
    // populates it on insert.
    .order("fit_weight", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(ELIGIBLE_FETCH_LIMIT);
  if (result.error) throw result.error;

  const suppressed = await getSuppressedEmails();
  const eligible = ((result.data ?? []) as unknown as ProspectForDigest[]).filter(
    (p) => !isSuppressed(p.director_email, suppressed),
  );
  return { considered: eligible.length, top: eligible.slice(0, TOP_N) };
}

/**
 * Optional pipeline context supplied by the cron orchestrator so the
 * digest email can render a per-week summary footer. Each field is
 * the raw stage `summary` from lib/agent/pipeline.ts (kept as unknown
 * here because importing the StageResult type would cycle the agent
 * modules; the renderer pulls fields defensively).
 */
export interface PipelineContext {
  prepare?: {
    discover?: unknown;
    enrich?: unknown;
    apollo?: unknown;
    personalise?: unknown;
  };
  rank?: unknown;
  totalCostGbp: number;
  failedStages?: string[];
}

export interface DigestOptions {
  dryRun?: boolean;
  pipelineContext?: PipelineContext;
}

export async function digest(
  options: DigestOptions = {},
): Promise<DigestSummary> {
  const dryRun = options.dryRun ?? false;
  const pipelineContext = options.pipelineContext;
  const errorsByBucket: Record<string, number> = {};
  const errorExamples: DigestErrorRecord[] = [];
  const recordError = (record: DigestErrorRecord) => {
    errorsByBucket[record.stage] = (errorsByBucket[record.stage] ?? 0) + 1;
    if (errorExamples.length < 5) errorExamples.push(record);
  };

  const week = weekOfDate();
  let prospects: ProspectForDigest[];
  let considered: number;
  try {
    const eligible = await selectEligible();
    prospects = eligible.top;
    considered = eligible.considered;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordError({ stage: "select", message });
    return {
      considered: 0,
      sent: 0,
      dryRun,
      skippedRecentSend: false,
      sentAt: null,
      digestId: null,
      messageId: null,
      surfacedProspectIds: [],
      weekOfDate: week,
      subject: "",
      errors: { byBucket: errorsByBucket, examples: errorExamples },
    };
  }

  const subject = `KP Prospect Digest — ${week} — ${prospects.length} prospects ranked`;
  const html = renderHtml(prospects, week, pipelineContext);

  if (prospects.length === 0) {
    return {
      considered,
      sent: 0,
      dryRun,
      skippedRecentSend: false,
      sentAt: null,
      digestId: null,
      messageId: null,
      surfacedProspectIds: [],
      weekOfDate: week,
      subject,
      html: dryRun ? html : undefined,
      errors: { byBucket: errorsByBucket, examples: errorExamples },
    };
  }

  if (dryRun) {
    return {
      considered,
      sent: 0,
      dryRun: true,
      skippedRecentSend: false,
      sentAt: null,
      digestId: null,
      messageId: null,
      surfacedProspectIds: prospects.map((p) => p.id),
      weekOfDate: week,
      subject,
      html,
      errors: { byBucket: errorsByBucket, examples: errorExamples },
    };
  }

  // Double-fire lock: if a digest sent in the last hour, skip rather
  // than risk duplicate inbox delivery on a Vercel Cron retry.
  const recentSend = await db()
    .from("digests")
    .select("id, sent_at")
    .gt(
      "sent_at",
      new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    )
    .limit(1);
  if (recentSend.error) {
    console.warn(
      `[digest] recent-send lookup failed (${recentSend.error.message}); continuing`,
    );
  } else if (recentSend.data && recentSend.data.length > 0) {
    console.log(
      `[digest] skipping: a digest sent within the last hour (id=${recentSend.data[0].id})`,
    );
    return {
      considered,
      sent: 0,
      dryRun: false,
      skippedRecentSend: true,
      sentAt: null,
      digestId: null,
      messageId: null,
      surfacedProspectIds: [],
      weekOfDate: week,
      subject,
      errors: { byBucket: errorsByBucket, examples: errorExamples },
    };
  }

  const from = requireEnv("DIGEST_FROM_EMAIL");
  const to = requireEnv("DIGEST_RECIPIENT_EMAIL");

  let messageId: string | null = null;
  try {
    const sendResult = await resend().emails.send({ from, to, subject, html });
    if (sendResult.error) {
      throw new Error(
        `${sendResult.error.name ?? "send_error"}: ${sendResult.error.message}`,
      );
    }
    messageId = sendResult.data?.id ?? null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[digest] Resend send failed — ${message}`);
    recordError({ stage: "send", message });
    return {
      considered,
      sent: 0,
      dryRun: false,
      skippedRecentSend: false,
      sentAt: null,
      digestId: null,
      messageId: null,
      surfacedProspectIds: [],
      weekOfDate: week,
      subject,
      errors: { byBucket: errorsByBucket, examples: errorExamples },
    };
  }

  const sentAt = new Date().toISOString();
  const ids = prospects.map((p) => p.id);

  const markResult = await db()
    .from("prospects")
    .update({ surfaced_in_digest_at: sentAt })
    .in("id", ids);
  if (markResult.error) {
    console.error(
      `[digest] surfaced_in_digest_at update failed — ${markResult.error.message}`,
    );
    recordError({ stage: "mark_surfaced", message: markResult.error.message });
  }

  let digestId: string | null = null;
  const auditResult = await db()
    .from("digests")
    .insert({
      sent_at: sentAt,
      prospect_ids: ids,
      candidate_count: considered,
      delivered_to: to,
    })
    .select("id")
    .single();
  if (auditResult.error) {
    console.error(
      `[digest] digests audit insert failed — ${auditResult.error.message}`,
    );
    recordError({ stage: "audit_insert", message: auditResult.error.message });
  } else {
    digestId = auditResult.data?.id ?? null;
  }

  const summary: DigestSummary = {
    considered,
    sent: prospects.length,
    dryRun: false,
    skippedRecentSend: false,
    sentAt,
    digestId,
    messageId,
    surfacedProspectIds: ids,
    weekOfDate: week,
    subject,
    errors: { byBucket: errorsByBucket, examples: errorExamples },
  };

  console.log("[digest] sent", {
    sent: summary.sent,
    considered: summary.considered,
    messageId: summary.messageId,
    digestId: summary.digestId,
  });
  return summary;
}
