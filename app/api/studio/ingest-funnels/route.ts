import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ingestChunks } from "@/lib/rag";
import { listStudioClients } from "@/lib/studio";
import { db } from "@/lib/db";

// ONE-SHOT: ingest the 20 best-performing MoMo funnels into the client brain, so the Producer, brief coach,
// Strategist and Journalist all draw on the real funnel patterns via RAG. Runs on prod because Voyage
// embeddings only decrypt here. Super-admin only (it spends + writes the brain). Idempotent: clears the prior
// funnel ingest first, so re-running just refreshes.
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

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "super_admin") return NextResponse.json({ error: "super-admin only" }, { status: 401 });

  const clients = await listStudioClients().catch(() => []);
  const client = clients.find((c) => /momo/i.test(c.name)) || clients[0];
  if (!client) return NextResponse.json({ error: "no client" }, { status: 400 });

  await db().query("delete from knowledge_chunks where client_id=$1 and metadata->>'kind'='funnel'", [client.id]);
  const out: Record<string, unknown>[] = [];
  let total = 0;
  for (const [name, url] of FUNNELS) {
    try {
      const html = await (await fetch(url, { signal: AbortSignal.timeout(25000) })).text();
      const text = toText(html);
      if (text.length < 200) { out.push({ name, chunks: 0, note: "thin" }); continue; }
      const chunks = chunk(text).map((c) => ({ content: c, metadata: { kind: "funnel", campaign: name, url } }));
      const n = await ingestChunks(client.id, null, chunks);
      total += n; out.push({ name, chunks: n });
    } catch (e) { out.push({ name, error: String((e as Error)?.message || e).slice(0, 100) }); }
  }
  return NextResponse.json({ ok: true, brain: client.name, totalChunks: total, funnels: out });
}
