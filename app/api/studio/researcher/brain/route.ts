import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { createBrain } from "@/lib/brains";

// CREATE A BRAIN from the Researcher (Gary): if a client is not in the system yet, make one here rather than
// being forced elsewhere. A "brain" is a client (client_id is the isolation key). Takes the client name and one
// or more official websites (some clients run several), and sets the primary + the extras as the ground-truth
// anchor the Researcher locks onto.
function normUrl(u: string): string {
  let s = String(u || "").trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  return s.replace(/\s+/g, "");
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { name?: string; websites?: string[] };
  const name = String(b.name || "").trim().slice(0, 160);
  if (!name) return NextResponse.json({ error: "A client name is needed." }, { status: 400 });

  const websites = [...new Set((Array.isArray(b.websites) ? b.websites : []).map(normUrl).filter(Boolean))].slice(0, 8);
  if (!websites.length) return NextResponse.json({ error: "At least one website is needed - it is the ground-truth anchor." }, { status: 400 });

  // Don't duplicate an existing client of the same name (case-insensitive).
  const dup = (await db().query(`select id from clients where lower(name) = lower($1) limit 1`, [name])) as { id: string }[];
  if (dup[0]) return NextResponse.json({ error: `A brain named "${name}" already exists.` }, { status: 409 });

  const id = await createBrain(name);
  // Primary website + the extras array.
  await db().query(`update clients set website = $1, websites = $2 where id = $3`, [websites[0], JSON.stringify(websites.slice(1)), id]);
  return NextResponse.json({ ok: true, id, name, websites });
}
