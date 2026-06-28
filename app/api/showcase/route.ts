import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listFinishedVideos, setShowcased, deleteShowcaseVideo, renameShowcaseVideo, reorderShowcase, setShowcasePoster } from "@/lib/showcase";
import { isSafePublicUrl } from "@/lib/safe-url";

export const dynamic = "force-dynamic";

// List every finished video with its showcase flag (for the internal manager).
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ videos: await listFinishedVideos() });
}

// Flag a production into the showcase or remove it again.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  // A drag-and-drop reorder sends an `order` array of ids (no single id needed).
  if (Array.isArray(body.order)) {
    await reorderShowcase(body.order.filter((x: unknown) => typeof x === "string"));
    return NextResponse.json({ ok: true });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  // remove === true hard-deletes the cut; a `poster_url` updates the thumbnail; a string `title` renames
  // it; otherwise flag it in/out of the reel.
  if (body.remove === true) await deleteShowcaseVideo(id);
  else if (typeof body.poster_url === "string" && isSafePublicUrl(body.poster_url)) await setShowcasePoster(id, body.poster_url.trim());
  else if (typeof body.title === "string") await renameShowcaseVideo(id, body.title.trim());
  else await setShowcased(id, body.showcased === true);
  return NextResponse.json({ ok: true });
}
