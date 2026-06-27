import { sendEmail, emailConfigured } from "@/lib/email";
import { db } from "@/lib/db";

// Ops alerting: when the platform hits a real problem (a vendor out of credits, a rejected/expired API
// key, a vendor down/timing out, or a build step that failed outright), email the admin a branded,
// actionable heads-up. Best-effort: never throws, never blocks the pipeline.

const ALERT_TO = () => process.env.ALERT_EMAIL_TO || process.env.SUPER_ADMIN_EMAIL || process.env.COST_EMAIL_TO || "gary@gasmarketing.co.za";

// Turn a raw error string into a human cause + a concrete fix, so the email is actionable at a glance.
export function classifyError(raw: string): { tag: string; cause: string; fix: string } {
  const m = String(raw || "").toLowerCase();
  if (/\b(credit|insufficient|not enough|balance|billing|payment|top ?up|402)\b/.test(m))
    return { tag: "OUT OF CREDITS", cause: "A vendor account has run out of credits, or billing failed.", fix: "Top up the affected vendor account (Higgsfield / HeyGen / ElevenLabs / Anthropic), then re-run the build." };
  if (/\b(401|403|unauthor|forbidden|invalid api key|invalid key|api key|api_key|expired|revoked|authentication)\b/.test(m))
    return { tag: "API KEY", cause: "A vendor rejected the API key (wrong, expired or revoked).", fix: "Re-check and reconnect that vendor's key in Settings → Connections, then re-run." };
  if (/\b(429|rate limit|too many requests|quota)\b/.test(m))
    return { tag: "RATE LIMITED", cause: "A vendor is rate-limiting or quota-capping requests.", fix: "Wait a few minutes and re-run. If frequent, lower concurrency (CLIP_CONCURRENCY)." };
  if (/\b(timeout|timed out|econnreset|enotfound|network|fetch failed|socket|503|502|504|unavailable|gateway)\b/.test(m))
    return { tag: "VENDOR DOWN / TIMEOUT", cause: "A vendor API was non-responsive or timed out.", fix: "Usually transient — re-run shortly. If it persists, check that vendor's status page." };
  return { tag: "ERROR", cause: "An unexpected error stopped a step.", fix: "Re-run the step. If it repeats, check the build logs for this influencer." };
}

// Throttle per error-kind so a vendor outage can't trigger an email storm. Atomic + serverless-safe via
// a single upsert (self-provisions its tiny table; falls open — if the check fails we still alert).
async function throttleOk(tag: string, minutes: number): Promise<boolean> {
  try {
    const sql = db();
    await sql`CREATE TABLE IF NOT EXISTS ops_alerts (tag text primary key, last_sent timestamptz not null default now())`;
    const rows = await sql`
      INSERT INTO ops_alerts (tag, last_sent) VALUES (${tag}, now())
      ON CONFLICT (tag) DO UPDATE SET last_sent = now()
      WHERE ops_alerts.last_sent < now() - (${minutes} * interval '1 minute')
      RETURNING tag`;
    return (rows as unknown[]).length > 0;
  } catch {
    return true;
  }
}

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function brandedHtml(title: string, detail: string, c: { tag: string; cause: string; fix: string }, context: Record<string, string | number | undefined>): string {
  const rows = Object.entries(context).filter(([, v]) => v !== undefined && v !== "" && v !== null)
    .map(([k, v]) => `<tr><td style="padding:6px 12px;color:#8b8b9e;font-size:12px;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:6px 12px;color:#e8e8f0;font-size:13px">${esc(String(v))}</td></tr>`)
    .join("");
  return `<!doctype html><html><body style="margin:0;background:#0b0b12;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b12;padding:28px 0">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:92%;background:#14141f;border:1px solid #262636;border-radius:16px;overflow:hidden">
        <tr><td style="background:linear-gradient(90deg,#ec4899,#a855f7,#60a5fa);height:5px;line-height:5px;font-size:0">&nbsp;</td></tr>
        <tr><td style="padding:24px 28px 8px">
          <div style="color:#8b8b9e;font-size:11px;letter-spacing:2px;text-transform:uppercase">Influencers on GAS · Platform alert</div>
          <div style="display:inline-block;margin-top:12px;padding:4px 12px;border-radius:999px;background:rgba(236,72,153,0.15);border:1px solid rgba(236,72,153,0.4);color:#f9a8d4;font-size:12px;font-weight:700;letter-spacing:1px">⚠️ ${esc(c.tag)}</div>
          <h1 style="margin:14px 0 0;color:#ffffff;font-size:19px;line-height:1.35">${esc(title)}</h1>
        </td></tr>
        <tr><td style="padding:8px 28px">
          <p style="margin:8px 0;color:#c7c7d6;font-size:14px;line-height:1.55"><b style="color:#fff">What happened:</b> ${esc(c.cause)}</p>
          <p style="margin:8px 0;color:#c7c7d6;font-size:14px;line-height:1.55"><b style="color:#86efac">What to do:</b> ${esc(c.fix)}</p>
        </td></tr>
        ${rows ? `<tr><td style="padding:8px 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f18;border:1px solid #262636;border-radius:10px">${rows}</table></td></tr>` : ""}
        <tr><td style="padding:8px 28px 4px">
          <div style="color:#8b8b9e;font-size:11px;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px">Technical detail</div>
          <pre style="margin:0;padding:12px 14px;background:#0f0f18;border:1px solid #262636;border-radius:10px;color:#9aa0b4;font-size:12px;line-height:1.5;white-space:pre-wrap;word-break:break-word">${esc(detail).slice(0, 1200)}</pre>
        </td></tr>
        <tr><td style="padding:18px 28px 26px">
          <a href="https://influencers.gasmarketing.co.za/cost-control" style="display:inline-block;padding:10px 18px;border-radius:10px;background:linear-gradient(90deg,#a855f7,#60a5fa);color:#fff;font-size:13px;font-weight:700;text-decoration:none">Open Cost Control →</a>
          <p style="margin:16px 0 0;color:#5b5b6e;font-size:11px;line-height:1.5">You're getting this because you're the platform admin. Alerts are grouped so a single outage won't flood your inbox.</p>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

// Send a branded ops alert (best-effort). throttleMinutes groups repeats of the same kind+title.
export async function alertOps(opts: { title: string; detail: string; context?: Record<string, string | number | undefined>; throttleMinutes?: number }): Promise<{ sent: boolean }> {
  try {
    if (!emailConfigured()) return { sent: false };
    const c = classifyError(opts.detail);
    const tag = `${c.tag}:${opts.title}`.slice(0, 200);
    if (!(await throttleOk(tag, opts.throttleMinutes ?? 15))) return { sent: false };
    const html = brandedHtml(opts.title, opts.detail, c, opts.context || {});
    await sendEmail({ to: ALERT_TO(), subject: `⚠️ Influencers on GAS — [${c.tag}] ${opts.title}`.slice(0, 150), html });
    return { sent: true };
  } catch {
    return { sent: false };
  }
}

// Alert only when a (possibly swallowed) vendor error is genuinely CRITICAL — out of credits, a bad key
// or a hard outage — so silent fallbacks (e.g. DoP→Kling) still surface the real cause. No-op otherwise.
export async function alertIfCritical(provider: string, errorMessage: string, context?: Record<string, string | number | undefined>): Promise<void> {
  const { tag } = classifyError(errorMessage);
  if (tag === "OUT OF CREDITS" || tag === "API KEY" || tag === "VENDOR DOWN / TIMEOUT") {
    await alertOps({ title: `${provider} problem during a build`, detail: errorMessage, context: { Provider: provider, ...context } });
  }
}

// Inngest onFailure hook: a build step exhausted its retries. Wire onto the user-facing pipeline.
export async function onProductionFailure(ctx: { event?: { data?: { event?: { name?: string; data?: Record<string, unknown> }; function_id?: string; error?: { message?: string } } }; error?: { message?: string } }): Promise<void> {
  const failed = ctx?.event?.data;
  const orig = failed?.event;
  const fnId = String(failed?.function_id || "unknown");
  const detail = String(ctx?.error?.message || failed?.error?.message || "unknown error");
  await alertOps({
    title: `Build step failed: ${fnId}`,
    detail,
    context: { Step: fnId, Influencer: String(orig?.data?.influencerId ?? ""), Trigger: String(orig?.name ?? "") },
  });
}
