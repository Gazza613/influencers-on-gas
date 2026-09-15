import { NextResponse } from "next/server";
import sharp from "sharp";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { putBytes } from "@/lib/blob";

// UPLOAD YOUR OWN 16:9 BANNER (Gary). Instead of (or alongside) the generated creative, the team can upload their
// own landscape image. It is optimised to a clean 16:9 here - resized to a standard 1280x720, cover-fit so it fills
// the frame without distortion - and stored on OUR OWN Vercel Blob, which is what lets it ride as the email hero
// AND as an attachment (both are locked to our blob host by the send route's SSRF guard). Returned as a normal
// 16:9 creative the team then ticks like any other.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const isAdmin = (role?: string | null) => role === "super_admin" || role === "admin";
const MAX_BYTES = 15 * 1024 * 1024; // 15MB upload ceiling

export async function POST(req: Request) {
  const session = await auth();
  if (!isAdmin(session?.user?.role)) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const clientId = String(form?.get("clientId") || "").trim();
  const file = form?.get("file");
  if (!clientId) return NextResponse.json({ error: "Pick the brain first." }, { status: 400 });
  if (!(file instanceof Blob)) return NextResponse.json({ error: "Attach an image to upload." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That image is too large (max 15MB)." }, { status: 400 });
  // The brain must be real before we write a blob under its id.
  const ok = (await db().query(`select 1 from clients where id = $1`, [clientId]).catch(() => [])) as unknown[];
  if (!ok.length) return NextResponse.json({ error: "That brain does not exist." }, { status: 404 });

  try {
    const input = Buffer.from(new Uint8Array(await file.arrayBuffer()));
    // Optimise to a standard 16:9 email banner: cover-fit so it fills the frame (no letterboxing, no squash), then
    // a reasonable-quality JPEG so the email stays light. A non-image throws here and is reported cleanly.
    const out = await sharp(input)
      .rotate() // honour EXIF orientation
      .resize(1280, 720, { fit: "cover", position: "attention" })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    const url = await putBytes(out, `studio/${clientId}/ceo-creative`, "jpg", "image/jpeg");
    return NextResponse.json({ ok: true, url, ratio: "16x9" });
  } catch {
    return NextResponse.json({ error: "That file could not be read as an image. Upload a JPG or PNG." }, { status: 400 });
  }
}
