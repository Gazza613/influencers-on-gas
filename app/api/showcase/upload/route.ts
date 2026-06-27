import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { addExternalShowreel, resolveClientId } from "@/lib/showcase";
import { isSafePublicUrl } from "@/lib/safe-url";

export const dynamic = "force-dynamic";

// Add a manually-uploaded external showreel (a brag video not produced on the platform) to the wall.
// The file is uploaded to Blob first (via /api/upload); this records it as a showcased, external cut.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const title = (typeof body.title === "string" ? body.title.trim() : "").slice(0, 120) || "Showreel";
  if (!url || !isSafePublicUrl(url)) return NextResponse.json({ error: "A valid uploaded video URL is required." }, { status: 400 });
  const clientId = await resolveClientId(null);
  const video = await addExternalShowreel({ title, url, clientId });
  return NextResponse.json({ ok: true, video });
}
