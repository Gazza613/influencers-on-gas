import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { isSafePublicUrl } from "@/lib/safe-url";

// THE CLIENT'S GROUND-TRUTH WEBSITE(S) (Gary). The team offers up the client's real websites, and the Researcher
// anchors every run to them, so it can never research a same-named but different business. Some clients run more
// than one official site, so this now holds a LIST: the primary (clients.website) plus extras (clients.websites).
// GET reads them; POST sets them (super-admin - it changes what the desks treat as the client).
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const clientId = new URL(req.url).searchParams.get("clientId") || "";
  if (!clientId) return NextResponse.json({ website: null, websites: [] });
  const rows = (await db().query(`select website, websites, socials from clients where id = $1`, [clientId])) as { website: string | null; websites: string[] | null; socials: string[] | null }[];
  const primary = rows[0]?.website ?? null;
  const extra = Array.isArray(rows[0]?.websites) ? rows[0]!.websites! : [];
  const all = [...(primary ? [primary] : []), ...extra].filter(Boolean);
  const socials = Array.isArray(rows[0]?.socials) ? rows[0]!.socials!.filter(Boolean) : [];
  return NextResponse.json({ website: primary, websites: all, socials });
}

export async function POST(req: Request) {
  const session = await auth();
  if (session?.user?.role !== "super_admin") return NextResponse.json({ error: "super-admin only" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { clientId?: string; website?: string; websites?: string[]; socials?: string[] };
  const clientId = String(b.clientId || "").trim();
  if (!clientId) return NextResponse.json({ error: "Pick the client first." }, { status: 400 });
  const norm = (list: unknown): string[] => [...new Set((Array.isArray(list) ? list : []).map((u) => {
    let s = String(u || "").trim();
    if (!s) return "";
    if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
    return s;
  }).filter(Boolean))];

  // SOCIALS ONLY: a socials-only save (the ground-truth websites are unchanged) does not touch website/websites.
  if (Array.isArray(b.socials) && b.website === undefined && b.websites === undefined) {
    const socials = norm(b.socials);
    for (const u of socials) if (!isSafePublicUrl(u)) return NextResponse.json({ error: `That does not look like a valid social link: ${u}` }, { status: 400 });
    await db().query(`update clients set socials = $2 where id = $1`, [clientId, JSON.stringify(socials)]);
    return NextResponse.json({ ok: true, socials });
  }

  // Websites (and optionally socials in the same call). Accept a list (websites) or a single (website).
  const websites = norm(Array.isArray(b.websites) ? b.websites : (b.website ? [b.website] : []));
  for (const u of websites) if (!isSafePublicUrl(u)) return NextResponse.json({ error: `That does not look like a valid public website: ${u}` }, { status: 400 });
  const primary = websites[0] || null;
  const extras = websites.slice(1);
  if (Array.isArray(b.socials)) {
    const socials = norm(b.socials);
    for (const u of socials) if (!isSafePublicUrl(u)) return NextResponse.json({ error: `That does not look like a valid social link: ${u}` }, { status: 400 });
    await db().query(`update clients set website = $2, websites = $3, socials = $4 where id = $1`, [clientId, primary, JSON.stringify(extras), JSON.stringify(socials)]);
    return NextResponse.json({ ok: true, website: primary, websites, socials });
  }
  await db().query(`update clients set website = $2, websites = $3 where id = $1`, [clientId, primary, JSON.stringify(extras)]);
  return NextResponse.json({ ok: true, website: primary, websites });
}
