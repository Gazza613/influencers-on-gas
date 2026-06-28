import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSafePublicUrl } from "@/lib/safe-url";

export const dynamic = "force-dynamic";

// Same-origin proxy for a showcase video, so the browser can read its pixels into a canvas (to
// regenerate a poster). Cross-origin blob fetches are CORS-blocked for canvas; streaming the bytes
// back from our own origin sidesteps that. SSRF-guarded to safe public URLs.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url).searchParams.get("url") || "";
  if (!url || !isSafePublicUrl(url)) return NextResponse.json({ error: "Bad url" }, { status: 400 });
  const r = await fetch(url, { cache: "no-store" }).catch(() => null);
  if (!r || !r.ok || !r.body) return NextResponse.json({ error: "Upstream fetch failed" }, { status: 502 });
  return new Response(r.body, {
    headers: {
      "content-type": r.headers.get("content-type") || "video/mp4",
      "cache-control": "no-store",
    },
  });
}
