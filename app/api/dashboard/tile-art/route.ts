import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getTileArt, artworkEnabled, setArtworkEnabled, setTileOverride, TILE_KEYS } from "@/lib/tile-art";

// Read the tile artwork; a super admin can switch it off entirely, override one tile, or reset it.
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [art, enabled] = await Promise.all([getTileArt(), artworkEnabled()]);
  return NextResponse.json({ art, enabled });
}

export async function POST(req: Request) {
  const session = await auth();
  if (session?.user?.role !== "super_admin") return NextResponse.json({ error: "Super admin only" }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as { enabled?: boolean; tile?: string; url?: string | null };

  if (typeof b.enabled === "boolean") {
    await setArtworkEnabled(b.enabled);
    return NextResponse.json({ ok: true, enabled: b.enabled });
  }

  if (b.tile) {
    if (!(TILE_KEYS as readonly string[]).includes(b.tile)) {
      return NextResponse.json({ error: "Unknown tile" }, { status: 400 });
    }
    // An override must be OUR blob, for the same reason the brain's file ingest insists on it: this URL is
    // rendered on every team member's dashboard, so accepting an arbitrary host would let one paste point at
    // anything. null clears the override and hands the tile back to the auto-pull.
    if (b.url && !/^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\//i.test(b.url)) {
      return NextResponse.json({ error: "Upload the image rather than pasting a link to it." }, { status: 400 });
    }
    await setTileOverride(b.tile, b.url ?? null);
    return NextResponse.json({ ok: true, art: await getTileArt() });
  }

  return NextResponse.json({ error: "Nothing to do" }, { status: 400 });
}
