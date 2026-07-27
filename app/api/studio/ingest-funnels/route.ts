import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ingestChunks } from "@/lib/rag";
import { listStudioClients } from "@/lib/studio";
import { isSafePublicUrl } from "@/lib/safe-url";
import { db } from "@/lib/db";

// Ingest a brain's own funnels/reference pages into ITS brain (RAG), so the Producer, brief coach, Strategist
// and Researcher draw on that client's real work. CLIENT-SCOPED (Gary): it writes to the clientId you pass,
// never a hardcoded brain - a fix for the old version that always wrote to MoMo regardless of selection. Pass
// your own URLs for any client; MoMo has a built-in quick-set of its 20 best funnels. Super-admin only (spends +
// writes the brain). Idempotent: clears the prior funnel ingest for that client first, so re-running refreshes.
export const maxDuration = 800;
export const dynamic = "force-dynamic";

const FUNNELS: [string, string][] = [
  ["Durban July", "https://www.mtnmomo.co.za/hollywoodbets-x-mtn-momo-durban"],
  ["WhatsApp Voice + Bundles", "https://www.mtnmomo.co.za/whatsapp-voice-bundles"],
  ["Made 4 Everyday Value", "https://www.mtnmomo.co.za/made-4-everyday-value"],
  ["Double the Scroll", "https://www.mtnmomo.co.za/double-the-scroll"],
  ["Stay Online with MoMo", "https://www.mtnmomo.co.za/stay-online-with-momo"],
  ["Winter Chats with MoMo", "https://www.mtnmomo.co.za/winter-chats-with-momo"],
  ["Mandela Day", "https://www.mtnmomo.co.za/celebrate-mandela-day-with-momo"],
  ["MoMo Moments", "https://www.mtnmomo.co.za/momo-moments"],
  ["Warm up with MoMo", "https://www.mtnmomo.co.za/warm-up-your-winter-with-momo"],
  ["Send Love Send Money", "https://www.mtnmomo.co.za/send-love-send-money-with-momo"],
  ["Quick Fix Instant Connection", "https://www.mtnmomo.co.za/quick-fix-instant-connections"],
  ["Welcome to MoMo", "https://www.mtnmomo.co.za/new-member-academy"],
  ["Keep the lights on", "https://www.mtnmomo.co.za/electricity"],
  ["Pick your Power", "https://www.mtnmomo.co.za/pick-your-power"],
  ["Handset Finance", "https://www.mtnmomo.co.za/handset-finance"],
  ["All about Betting", "https://www.mtnmomo.co.za/betting-on-momo"],
  ["Always on Data", "https://www.mtnmomo.co.za/mtn-momo-always-on-data"],
  ["Always on Voice", "https://www.mtnmomo.co.za/momo-voice-deals-daily"],
  ["Personal Loans", "https://www.mtnmomo.co.za/personal-loans-on-momo"],
  ["Halakasha", "https://www.mtnmomo.co.za/halakasha-one-game-every-nation"],
];

function toText(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"').replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
}
function chunk(t: string): string[] {
  const words = t.split(" "); const out: string[] = []; let cur: string[] = [];
  for (const w of words) { cur.push(w); if (cur.join(" ").length > 900) { out.push(cur.join(" ")); cur = []; } }
  if (cur.length) out.push(cur.join(" "));
  return out.filter((c) => c.length > 60);
}

export async function POST(req: Request) {
  const session = await auth();
  if (session?.user?.role !== "super_admin") return NextResponse.json({ error: "super-admin only" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { clientId?: string; urls?: { name?: string; url?: string }[] };
  const clientId = String(body.clientId || "").trim();
  if (!clientId) return NextResponse.json({ error: "Pick the client first." }, { status: 400 });

  const clients = await listStudioClients().catch(() => []);
  const client = clients.find((c) => c.id === clientId);
  if (!client) return NextResponse.json({ error: "That client does not exist." }, { status: 400 });

  // The funnel set: the URLs pasted for THIS client, or - only for MoMo - its built-in 20-funnel quick-set.
  // A brain never inherits another brain's funnels; a non-MoMo client with no URLs is told to paste its own.
  let set: [string, string][];
  const pasted = (body.urls || [])
    .map((u) => [String(u.name || u.url || "").slice(0, 80), String(u.url || "").trim()] as [string, string])
    .filter(([, url]) => isSafePublicUrl(url));
  if (pasted.length) set = pasted.slice(0, 40);
  else if (/mo\s*mo|mtn/i.test(client.name)) set = FUNNELS;
  else return NextResponse.json({ error: `Paste ${client.name}'s funnel or reference URLs to train its brain (one per line).` }, { status: 400 });

  await db().query("delete from knowledge_chunks where client_id=$1 and metadata->>'kind'='funnel'", [client.id]);

  // Fetch all IN PARALLEL (10s each), then chunk and embed in one pass.
  const fetched = await Promise.all(set.map(async ([name, url]) => {
    try {
      const html = await (await fetch(url, { signal: AbortSignal.timeout(10000) })).text();
      const text = toText(html);
      if (text.length < 200) return { name, url, chunks: [] as string[], note: "thin" };
      return { name, url, chunks: chunk(text).slice(0, 14) }; // cap per funnel so embedding stays quick
    } catch (e) { return { name, url, chunks: [] as string[], note: String((e as Error)?.message || e).slice(0, 80) }; }
  }));

  const items = fetched.flatMap((f) => f.chunks.map((c) => ({ content: c, metadata: { kind: "funnel", campaign: f.name, url: f.url } })));
  const total = await ingestChunks(client.id, null, items);
  const out = fetched.map((f) => ({ name: f.name, chunks: f.chunks.length, ...(f.note ? { note: f.note } : {}) }));
  return NextResponse.json({ ok: true, brain: client.name, totalChunks: total, funnels: out });
}
