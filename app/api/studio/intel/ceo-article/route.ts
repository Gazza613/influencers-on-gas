import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { writeCeoNewsletter } from "@/lib/ceo-newsletter";
import { deliverCeoArticle } from "@/lib/ceo-send";
import { isOwnBlobUrl } from "@/lib/safe-url";

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

  if (url.searchParams.get("sent") === "1") {
    // Previously SENT newsletters on this brain, freshest first (Gary). The team can reopen one to view, edit and
    // send again. Scoped by client_id (isolation). The title is the first block of the stored piece.
    const s = (await db().query(
      `select id, headline, newsletter, to_char(newsletter_sent_at, 'DD Mon YYYY') as sent_on from studio_intel
        where client_id = $1 and newsletter is not null and newsletter_sent_at is not null
        order by newsletter_sent_at desc limit 20`,
      [clientId],
    ).catch(() => [])) as { id: string; headline: string; newsletter: string; sent_on: string }[];
    return NextResponse.json({ sent: s.map((x) => {
      const title = String(x.newsletter || "").split(/\n{2,}/)[0]?.replace(/^#{1,3}\s+/, "").trim() || x.headline;
      return { id: x.id, title, post: String(x.newsletter || ""), sentOn: x.sent_on };
    }) });
  }

  if (url.searchParams.get("scheduled") === "1") {
    // Pending scheduled (send-later) newsletters on this brain, soonest first (Gary). The UI shows them and can cancel.
    const s = (await db().query(
      `select ns.id, ns.intel_id, ns.scheduled_at, ns.recipients, si.headline
         from newsletter_sends ns left join studio_intel si on si.id = ns.intel_id
        where ns.client_id = $1 and ns.status = 'pending'
        order by ns.scheduled_at asc limit 20`,
      [clientId],
    ).catch(() => [])) as { id: string; intel_id: string; scheduled_at: string; recipients: string[] | null; headline: string | null }[];
    return NextResponse.json({ scheduled: s.map((x) => ({
      id: x.id, intelId: x.intel_id, headline: x.headline || "Scheduled newsletter",
      scheduledAt: x.scheduled_at, recipients: Array.isArray(x.recipients) ? x.recipients.length : 0,
    })) });
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
      return NextResponse.json({ error: "This finding is unverified - its sources could not be machine-confirmed, so it cannot seed a piece published under an executive's name. Draft from a finding marked ✓ Verified instead, or use the LinkedIn Article button to write on a topic grounded in the brain.", blocked: true }, { status: 400 });
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
    const recipients = (Array.isArray(b.recipients) ? b.recipients : []).map((x) => String(x).trim()).filter(Boolean);
    const post = String(b.post || String(f.headline || "")).trim();
    const r = await deliverCeoArticle({
      clientId, intelId: id, post, recipients,
      publisher: b.publisher, heroUrl: b.heroUrl,
      creativeUrls: Array.isArray(b.creativeUrls) ? b.creativeUrls.map((x) => String(x)) : [],
      subject: b.subject, bccEmail: session.user?.email ?? null,
      srcHeadline: String(f.headline || ""),
    });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, sent: r.sent });
  }

  // SEND-LATER (Gary): freeze the piece + recipients + creatives now, but email it at a chosen future time. A cron
  // (/api/cron/send-newsletters) fires the due ones through the exact same delivery path as an immediate send.
  if (action === "schedule") {
    const recipients = (Array.isArray(b.recipients) ? b.recipients : []).map((x) => String(x).trim()).filter(Boolean);
    const bad = recipients.filter((r) => !isEmail(r));
    if (!recipients.length) return NextResponse.json({ error: "Add at least one recipient email." }, { status: 400 });
    if (bad.length) return NextResponse.json({ error: `Not a valid email: ${bad.join(", ")}` }, { status: 400 });
    const post = String(b.post || "").trim();
    if (!post) return NextResponse.json({ error: "There is no article to schedule. Draft it first." }, { status: 400 });
    const whenRaw = String((b as { scheduledAt?: string }).scheduledAt || "").trim();
    const when = new Date(whenRaw);
    if (!whenRaw || Number.isNaN(when.getTime())) return NextResponse.json({ error: "Pick a valid date and time to send." }, { status: 400 });
    if (when.getTime() < Date.now() + 60_000) return NextResponse.json({ error: "Pick a time in the future." }, { status: 400 });
    const isOurBlob = (u: string) => isOwnBlobUrl(u); // canonical host-check; same blob-trust policy as the sender
    const heroRaw = String(b.heroUrl || "").trim();
    const heroUrl = heroRaw && isOurBlob(heroRaw) ? heroRaw : null;
    const creativeUrls = (Array.isArray(b.creativeUrls) ? b.creativeUrls : []).map((x) => String(x).trim()).filter(isOurBlob);
    const publisher = b.publisher === "md" || b.publisher === "ceo" ? b.publisher : null;
    // Only one pending schedule per finding: replacing supersedes an earlier one, so re-scheduling never double-sends.
    await db().query(`update newsletter_sends set status = 'cancelled' where intel_id = $1 and client_id = $2 and status = 'pending'`, [id, clientId]).catch(() => {});
    await db().query(
      `insert into newsletter_sends (client_id, intel_id, scheduled_at, publisher, subject, post, recipients, hero_url, creative_urls, created_by)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::jsonb,$10)`,
      [clientId, id, when.toISOString(), publisher, String(b.subject || "").trim() || null, post, JSON.stringify(recipients), heroUrl, JSON.stringify(creativeUrls), session.user?.email ?? null],
    );
    // Keep the frozen copy on the finding so reopening it shows what was scheduled.
    await db().query(`update studio_intel set newsletter = $2 where id = $1 and client_id = $3`, [id, post, clientId]).catch(() => {});
    return NextResponse.json({ ok: true, scheduledAt: when.toISOString() });
  }

  if (action === "cancelSchedule") {
    const r = (await db().query(`update newsletter_sends set status = 'cancelled' where intel_id = $1 and client_id = $2 and status = 'pending' returning id`, [id, clientId])) as { id: string }[];
    return NextResponse.json({ ok: true, cancelled: r.length });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
