import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// PUBLIC feed for the logged-out landing page's floating influencer cards.
// The main /api/influencers is (correctly) auth-gated, and the landing page redirects signed-in
// visitors to /studio - so the cards had NO readable source for anyone who actually sees that page,
// and all six vanished. This exposes ONLY what a marketing wall needs: hero image URLs + a status
// enum. No names, no consent, no ids, no PII. Finished builds (locked/ready) lead.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = (await db().query(
      `select status, persona, look_refs
         from influencers
        order by created_at desc
        limit 24`,
    )) as { status: string; persona: unknown; look_refs: unknown }[];

    // Strip to image-only fields. Never leak anything but pixels + a status enum.
    const influencers = rows.map((r) => {
      const p = (r.persona ?? {}) as { hero_url?: string; hero_realism_url?: string; locked?: boolean };
      const refs = (Array.isArray(r.look_refs) ? r.look_refs : []) as { url?: string; hero?: boolean }[];
      return {
        status: r.status,
        persona: { hero_url: p.hero_url, hero_realism_url: p.hero_realism_url, locked: !!p.locked },
        look_refs: refs.filter((x) => x && typeof x.url === "string").map((x) => ({ url: x.url as string, hero: !!x.hero })),
      };
    });

    return NextResponse.json({ influencers });
  } catch {
    // A showcase must never break the landing page - fail soft to empty.
    return NextResponse.json({ influencers: [] });
  }
}
