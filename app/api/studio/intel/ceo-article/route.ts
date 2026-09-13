import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { writeCeoNewsletter } from "@/lib/ceo-newsletter";
import { sendEmail, emailConfigured } from "@/lib/email";
import { buildCeoArticleEmail } from "@/lib/ceo-email";
import { getClientEmailLogo } from "@/lib/client-logo";

// THE CEO THOUGHT-LEADERSHIP ARTICLE (Gary). From a Daily Intelligence finding: DRAFT the client CEO's LinkedIn
// piece (in their brain's voice + compliance, from the public-safe substance only, never the internal "move"),
// then SEND it to the CEO's own email(s). Manual, human-in-the-loop: the team drafts, reviews, adds the
// recipient(s) and sends. The recipient list is saved per brain (intel_briefs.ceo_recipients) so it prefills.
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

// ADMINS ONLY (Gary): drafting, editing recipients and sending a client CEO's article is admin-only, since it
// sends branded email from the agency mailbox. Members can still read the market; they cannot draft or send.
const isAdmin = (role?: string | null) => role === "super_admin" || role === "admin";

// GET the saved CEO recipients + the CEO's name/title, to prefill the send box.
export async function GET(req: Request) {
  const session = await auth();
  if (!isAdmin(session?.user?.role)) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const clientId = new URL(req.url).searchParams.get("clientId") || "";
  if (!clientId) return NextResponse.json({ recipients: [], ceoName: "", ceoTitle: "" });
  const rows = (await db().query(
    `select ceo_recipients, ceo_name, ceo_title from intel_briefs where client_id = $1`, [clientId],
  ).catch(() => [])) as { ceo_recipients: string[] | null; ceo_name: string | null; ceo_title: string | null }[];
  const r = rows[0];
  return NextResponse.json({
    recipients: Array.isArray(r?.ceo_recipients) ? r!.ceo_recipients! : [],
    ceoName: r?.ceo_name || "", ceoTitle: r?.ceo_title || "",
  });
}

const ukDate = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Johannesburg" });

export async function POST(req: Request) {
  const session = await auth();
  if (!isAdmin(session?.user?.role)) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as {
    action?: string; clientId?: string; id?: string; notes?: string;
    recipients?: unknown; post?: string; subject?: string;
  };
  const action = String(b.action || "").trim();
  const clientId = String(b.clientId || "").trim();
  const id = String(b.id || "").trim();
  if (!clientId || !id) return NextResponse.json({ error: "Missing the brain or the finding." }, { status: 400 });

  // Load the finding on THIS brain. Any role is eligible for the tick path: we pass only the PUBLIC-SAFE substance
  // (headline, why, detail, sources) to the writer, never the internal campaign_response, so a blunt Strategist
  // finding still becomes a clean, compliant CEO piece.
  const rows = (await db().query(
    `select headline, why_it_matters, detail, sources, published_at, verification from studio_intel where id = $1 and client_id = $2`,
    [id, clientId],
  )) as Record<string, unknown>[];
  const f = rows[0];
  if (!f) return NextResponse.json({ error: "That finding is not on this brain." }, { status: 404 });

  if (action === "draft") {
    // GROUNDING GATE: a CEO thought-leadership piece may only be written from a source we actually verified. An
    // unverified (bot-blocked), refuted or dead finding cannot seed a public article under a CEO's name.
    const ver = String(f.verification || "");
    if (ver && ver !== "verified" && ver !== "partial") {
      return NextResponse.json({ error: "This finding's source could not be verified, so it cannot seed a CEO article. Use a verified finding." }, { status: 400 });
    }
    const result = await writeCeoNewsletter(clientId, {
      headline: String(f.headline || ""),
      why_it_matters: String(f.why_it_matters || ""),
      detail: String(f.detail || ""),
      sources: (Array.isArray(f.sources) ? f.sources : []) as { name: string; url: string }[],
      published_at: f.published_at ? String(f.published_at) : null,
    }, { userEmail: session.user?.email ?? null, notes: b.notes || null });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    // Keep the draft on the finding so it survives a reload.
    await db().query(`update studio_intel set newsletter = $2, newsletter_art = $3 where id = $1 and client_id = $4`,
      [id, result.post, result.art?.subject || null, clientId]).catch(() => {});
    return NextResponse.json({ ok: true, post: result.post, art: result.art });
  }

  if (action === "send") {
    if (!emailConfigured()) return NextResponse.json({ error: "Email is not configured on this deploy (SMTP env vars missing)." }, { status: 400 });
    const recipients = (Array.isArray(b.recipients) ? b.recipients : []).map((x) => String(x).trim()).filter(Boolean);
    const bad = recipients.filter((r) => !isEmail(r));
    if (!recipients.length) return NextResponse.json({ error: "Add at least one recipient email." }, { status: 400 });
    if (bad.length) return NextResponse.json({ error: `Not a valid email: ${bad.join(", ")}` }, { status: 400 });
    const post = String(b.post || String(f.headline || "")).trim();
    if (!post) return NextResponse.json({ error: "There is no article to send. Draft it first." }, { status: 400 });

    const brief = (await db().query(`select b.ceo_name, c.name as client_name from intel_briefs b join clients c on c.id = b.client_id where b.client_id = $1`, [clientId]).catch(() => [])) as { ceo_name: string | null; client_name: string | null }[];
    const ceoName = brief[0]?.ceo_name || "";
    const clientName = brief[0]?.client_name || "";
    const title = post.split(/\n{2,}/)[0]?.replace(/^#{1,3}\s+/, "").trim() || "A note on the market";
    const subject = String(b.subject || "").trim() || title.slice(0, 150);
    // The client's own logo in the header (Gary), else the GAS orb. review=false: this is the piece itself, to the CEO.
    const logoUrl = await getClientEmailLogo(clientId).catch(() => null);
    const html = buildCeoArticleEmail({ client: clientName, ceoName, post, ceoRecipients: recipients, logoUrl, dateLabel: `${clientName} · ${ukDate(new Date().toISOString())}`, review: false });

    const r = await sendEmail({
      to: recipients.join(", "),
      bcc: session.user?.email || undefined,
      subject, html, fromName: "Researcher on GAS",
    }).catch((e) => ({ sent: false, error: String((e as Error)?.message || e) }));
    if (!(r as { sent?: boolean }).sent) return NextResponse.json({ error: `Could not send: ${(r as { error?: string }).error || "unknown"}`.slice(0, 200) }, { status: 400 });

    // Remember the recipients on the brain (so next time prefills) and keep the sent copy on the finding.
    await db().query(`update intel_briefs set ceo_recipients = $2::jsonb where client_id = $1`,
      [clientId, JSON.stringify(recipients)]).catch(() => {});
    await db().query(`update studio_intel set newsletter = $2 where id = $1 and client_id = $3`, [id, post, clientId]).catch(() => {});
    return NextResponse.json({ ok: true, sent: recipients.length });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
