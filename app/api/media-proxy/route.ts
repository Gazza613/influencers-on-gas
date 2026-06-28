import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSafePublicUrl } from "@/lib/safe-url";

// Same-origin proxy for a media file (e.g. an uploaded voice recording), so the browser can read its
// bytes into Web Audio for slicing — cross-origin blob fetches are otherwise CORS-blocked. SSRF-guarded.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url).searchParams.get("url") || "";
  if (!url || !isSafePublicUrl(url)) return NextResponse.json({ error: "Bad url" }, { status: 400 });
  const r = await fetch(url, { cache: "no-store" }).catch(() => null);
  if (!r || !r.ok || !r.body) return NextResponse.json({ error: "Upstream fetch failed" }, { status: 502 });
  return new Response(r.body, {
    headers: { "content-type": r.headers.get("content-type") || "application/octet-stream", "cache-control": "no-store" },
  });
}
