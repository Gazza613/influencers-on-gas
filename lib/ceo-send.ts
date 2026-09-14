import { db } from "./db";
import { sendEmail, emailConfigured } from "./email";
import { buildCeoArticleEmail } from "./ceo-email";
import { getClientEmailLogo } from "./client-logo";

// DELIVER A CEO/MD NEWSLETTER (shared, Gary). The one place a newsletter is actually sent, so the immediate "send"
// and the scheduled "send-later" cron use IDENTICAL logic and can never drift: the same signer resolution, the
// same SSRF guard on the creative host, the same recipient-memory, sent-mark and publication record. Returns the
// count sent, or an error. `bccEmail` is the person who triggered it (a copy lands in their inbox); for a scheduled
// send that is whoever scheduled it.
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
const ukDate = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Johannesburg" });
// SSRF GUARD: nodemailer fetches each attachment server-side and the mail client fetches the embedded hero, so both
// are restricted to OUR OWN Vercel Blob host - the only place a real creative can live.
const isOurBlob = (u: string) => /^https:\/\/[^/]+\.blob\.vercel-storage\.com\//i.test(u);

export type DeliverResult = { ok: true; sent: number } | { ok: false; error: string; status: number };

export async function deliverCeoArticle(opts: {
  clientId: string;
  intelId: string;
  post: string;
  recipients: string[];
  publisher?: string | null;
  heroUrl?: string | null;
  creativeUrls?: string[];
  subject?: string | null;
  bccEmail?: string | null;
  srcHeadline?: string | null;
}): Promise<DeliverResult> {
  if (!emailConfigured()) return { ok: false, error: "Email is not configured on this deploy (SMTP env vars missing).", status: 400 };
  const clientId = opts.clientId;
  const recipients = (Array.isArray(opts.recipients) ? opts.recipients : []).map((x) => String(x).trim()).filter(Boolean);
  const bad = recipients.filter((r) => !isEmail(r));
  if (!recipients.length) return { ok: false, error: "Add at least one recipient email.", status: 400 };
  if (bad.length) return { ok: false, error: `Not a valid email: ${bad.join(", ")}`, status: 400 };
  const post = String(opts.post || "").trim();
  if (!post) return { ok: false, error: "There is no article to send. Draft it first.", status: 400 };

  const brief = (await db().query(`select b.ceo_name, b.ceo_title, b.md_name, b.md_title, b.newsletter_publisher, c.name as client_name from intel_briefs b join clients c on c.id = b.client_id where b.client_id = $1`, [clientId]).catch(() => [])) as { ceo_name: string | null; ceo_title: string | null; md_name: string | null; md_title: string | null; newsletter_publisher: string | null; client_name: string | null }[];
  // WHO PUBLISHES: the per-brain default, overridable per piece (Gary). Signer name + designation follow the publisher.
  const publisher = opts.publisher === "md" || opts.publisher === "ceo" ? opts.publisher : (brief[0]?.newsletter_publisher === "md" ? "md" : "ceo");
  const signerName = (publisher === "md" ? brief[0]?.md_name : brief[0]?.ceo_name) || "";
  const signerTitle = (publisher === "md" ? brief[0]?.md_title : brief[0]?.ceo_title) || "";
  const clientName = brief[0]?.client_name || "";
  const title = post.split(/\n{2,}/)[0]?.replace(/^#{1,3}\s+/, "").trim() || "A note on the market";
  const subject = String(opts.subject || "").trim() || title.slice(0, 150);
  const logoUrl = await getClientEmailLogo(clientId).catch(() => null);
  const heroRaw = String(opts.heroUrl || "").trim();
  const heroUrl = heroRaw && isOurBlob(heroRaw) ? heroRaw : null;
  const creativeUrls = (Array.isArray(opts.creativeUrls) ? opts.creativeUrls : []).map((x) => String(x).trim()).filter(isOurBlob);
  const html = buildCeoArticleEmail({ client: clientName, ceoName: signerName, ceoTitle: signerTitle, post, ceoRecipients: recipients, logoUrl, heroUrl, dateLabel: `${clientName} · ${ukDate(new Date().toISOString())}`, review: false });
  const attachments = creativeUrls.map((url, i) => ({ filename: `${clientName || "creative"}-${i + 1}.png`.replace(/\s+/g, "-"), path: url }));

  const r = await sendEmail({
    to: recipients.join(", "),
    bcc: opts.bccEmail || undefined,
    subject, html, fromName: "Researcher on GAS",
    ...(attachments.length ? { attachments } : {}),
  }).catch((e) => ({ sent: false, error: String((e as Error)?.message || e) }));
  if (!(r as { sent?: boolean }).sent) return { ok: false, error: `Could not send: ${(r as { error?: string }).error || "unknown"}`.slice(0, 200), status: 400 };

  // Remember the recipients on the brain against the RIGHT executive, so the next piece prefills the correct list.
  const recipCol = publisher === "md" ? "md_recipients" : "ceo_recipients";
  await db().query(`update intel_briefs set ${recipCol} = $2::jsonb where client_id = $1`, [clientId, JSON.stringify(recipients)]).catch(() => {});
  // Keep the sent copy on the finding and MARK IT SENT, so it stops being offered as a resumable draft.
  await db().query(`update studio_intel set newsletter = $2, newsletter_sent_at = now() where id = $1 and client_id = $3`, [opts.intelId, post, clientId]).catch(() => {});
  // PUBLISH + MEASURE LOOP: one row per finding, a re-send never duplicates.
  await db().query(
    `insert into ceo_publications (client_id, intel_id, publisher, title, topic)
     select $1, $2, $3, $4, $5
     where not exists (select 1 from ceo_publications where client_id = $1 and intel_id = $2)`,
    [clientId, opts.intelId, publisher, title.slice(0, 300), String(opts.srcHeadline || "").slice(0, 300) || null],
  ).catch(() => {});
  return { ok: true, sent: recipients.length };
}
