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

// GET the saved recipients (CEO and MD) + names/titles to prefill the send box; with ?drafts=1, return the
// brain's UNSENT drafts so the dashboard can offer to resume one (draft persistence).
export async function GET(req: Request) {
  const session = await auth();
  if (!isAdmin(session?.user?.role)) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId") || "";
  if (!clientId) return NextResponse.json({ recipients: [], mdRecipients: [], ceoName: "", ceoTitle: "", drafts: [] });

  if (url.searchParams.get("drafts") === "1") {
    // Written-but-not-sent drafts on this brain, freshest first. These survive a reload/exit, so the team can pick
    // one up rather than lose it. Scoped by client_id (isolation).
    const d = (await db().query(
      `select id, headline, newsletter from studio_intel
        where client_id = $1 and newsletter is not null and newsletter_sent_at is null
        order by found_at desc limit 8`,
      [clientId],
    ).catch(() => [])) as { id: string; headline: string; newsletter: string }[];
    return NextResponse.json({ drafts: d.map((x) => ({ id: x.id, headline: x.headline, post: String(x.newsletter || ""), snippet: String(x.newsletter || "").replace(/^#{1,3}\s+/, "").slice(0, 90) })) });
  }

  const rows = (await db().query(
    `select ceo_recipients, md_recipients, ceo_name, ceo_title, md_name, md_title, newsletter_publisher from intel_briefs where client_id = $1`, [clientId],
  ).catch(() => [])) as { ceo_recipients: string[] | null; md_recipients: string[] | null; ceo_name: string | null; ceo_title: string | null; md_name: string | null; md_title: string | null; newsletter_publisher: string | null }[];
  const r = rows[0];
  return NextResponse.json({
    recipients: Array.isArray(r?.ceo_recipients) ? r!.ceo_recipients! : [],
    mdRecipients: Array.isArray(r?.md_recipients) ? r!.md_recipients! : [],
    ceoName: r?.ceo_name || "", ceoTitle: r?.ceo_title || "",
    mdName: r?.md_name || "", mdTitle: r?.md_title || "",
    publisher: r?.newsletter_publisher === "md" ? "md" : "ceo",
  });
}

const ukDate = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Johannesburg" });

export async function POST(req: Request) {
  const session = await auth();
  if (!isAdmin(session?.user?.role)) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as {
    action?: string; clientId?: string; id?: string; notes?: string;
    recipients?: unknown; post?: string; subject?: string;
    publisher?: string; heroUrl?: string; creativeUrls?: unknown;
  };
  const action = String(b.action || "").trim();
  const clientId = String(b.clientId || "").trim();
  const id = String(b.id || "").trim();

  // SAVE THE EXECUTIVE'S DETAILS (Gary): the CEO/MD name + designation are set right here, so the creative can be
  // attributed and the toggle is meaningful even on a brain that only has photos loaded. No finding needed - this
  // is a brain-level setting. Also stores the publisher as the brain default so next time it prefills.
  if (action === "saveExec") {
    if (!clientId) return NextResponse.json({ error: "Pick the brain first." }, { status: 400 });
    const who = b.publisher === "md" ? "md" : "ceo";
    const name = String((b as { name?: string }).name || "").trim().slice(0, 120);
    const title = String((b as { title?: string }).title || "").trim().slice(0, 160);
    if (!name || !title) return NextResponse.json({ error: "Enter both a name and a designation." }, { status: 400 });
    const col = who === "md" ? ["md_name", "md_title"] : ["ceo_name", "ceo_title"];
    const rows = (await db().query(
      `update intel_briefs set ${col[0]} = $2, ${col[1]} = $3, newsletter_publisher = $4, updated_at = now() where client_id = $1 returning client_id`,
      [clientId, name, title, who],
    )) as { client_id: string }[];
    if (!rows[0]) return NextResponse.json({ error: "This brain has no brief yet, so there is nothing to save against." }, { status: 404 });
    return NextResponse.json({ ok: true, publisher: who, name, title });
  }

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

    const brief = (await db().query(`select b.ceo_name, b.ceo_title, b.md_name, b.md_title, b.newsletter_publisher, c.name as client_name from intel_briefs b join clients c on c.id = b.client_id where b.client_id = $1`, [clientId]).catch(() => [])) as { ceo_name: string | null; ceo_title: string | null; md_name: string | null; md_title: string | null; newsletter_publisher: string | null; client_name: string | null }[];
    // WHO PUBLISHES: the per-brain default, overridable at send time (Gary). The signer's name + designation come
    // from whichever executive is publishing.
    const publisher = b.publisher === "md" || b.publisher === "ceo" ? b.publisher : (brief[0]?.newsletter_publisher === "md" ? "md" : "ceo");
    const signerName = (publisher === "md" ? brief[0]?.md_name : brief[0]?.ceo_name) || "";
    const signerTitle = (publisher === "md" ? brief[0]?.md_title : brief[0]?.ceo_title) || "";
    const clientName = brief[0]?.client_name || "";
    const title = post.split(/\n{2,}/)[0]?.replace(/^#{1,3}\s+/, "").trim() || "A note on the market";
    const subject = String(b.subject || "").trim() || title.slice(0, 150);
    // The client's own logo in the header (Gary), else the GAS orb. review=false: the WHITE editorial piece itself.
    const logoUrl = await getClientEmailLogo(clientId).catch(() => null);
    // The 16x9 creative rides at the top of the email; every chosen creative is attached so the piece is post-ready.
    // SSRF GUARD: nodemailer fetches each attachment server-side, and the email client fetches the embedded hero,
    // so both are restricted to OUR OWN Vercel Blob host - the only place a real creative can live. This blocks an
    // admin (or a replayed request) pointing them at an internal-network or arbitrary URL.
    const isOurBlob = (u: string) => /^https:\/\/[^/]+\.blob\.vercel-storage\.com\//i.test(u);
    const heroRaw = String(b.heroUrl || "").trim();
    const heroUrl = heroRaw && isOurBlob(heroRaw) ? heroRaw : null;
    const creativeUrls = (Array.isArray(b.creativeUrls) ? b.creativeUrls : []).map((x) => String(x).trim()).filter(isOurBlob);
    const html = buildCeoArticleEmail({ client: clientName, ceoName: signerName, ceoTitle: signerTitle, post, ceoRecipients: recipients, logoUrl, heroUrl, dateLabel: `${clientName} · ${ukDate(new Date().toISOString())}`, review: false });
    const attachments = creativeUrls.map((url, i) => ({ filename: `${clientName || "creative"}-${i + 1}.png`.replace(/\s+/g, "-"), path: url }));

    const r = await sendEmail({
      to: recipients.join(", "),
      bcc: session.user?.email || undefined,
      subject, html, fromName: "Researcher on GAS",
      ...(attachments.length ? { attachments } : {}),
    }).catch((e) => ({ sent: false, error: String((e as Error)?.message || e) }));
    if (!(r as { sent?: boolean }).sent) return NextResponse.json({ error: `Could not send: ${(r as { error?: string }).error || "unknown"}`.slice(0, 200) }, { status: 400 });

    // Remember the recipients on the brain against the RIGHT executive (CEO vs MD), so the next piece prefills the
    // correct list and the automated draft's team-first exclusion knows this exec's own address.
    const recipCol = publisher === "md" ? "md_recipients" : "ceo_recipients";
    await db().query(`update intel_briefs set ${recipCol} = $2::jsonb where client_id = $1`,
      [clientId, JSON.stringify(recipients)]).catch(() => {});
    // Keep the sent copy on the finding and MARK IT SENT, so it stops being offered as a resumable draft.
    await db().query(`update studio_intel set newsletter = $2, newsletter_sent_at = now() where id = $1 and client_id = $3`, [id, post, clientId]).catch(() => {});
    return NextResponse.json({ ok: true, sent: recipients.length });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
