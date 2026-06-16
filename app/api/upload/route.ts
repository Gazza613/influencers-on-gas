import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "@/auth";

// Upload an image to Vercel Blob → returns a public URL usable as a generation
// reference (face, location, clothing) and for display.
export const maxDuration = 30;
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const kind = (form?.get("kind") as string) || "ref";
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Please upload an image." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image is too large (max 10MB)." }, { status: 400 });

  const safe = (file.name || "image").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-40);
  const blob = await put(`influencers/${kind}/${safe}`, file, { access: "public", addRandomSuffix: true });
  return NextResponse.json({ url: blob.url });
}
