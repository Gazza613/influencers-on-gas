import { NextResponse } from "next/server";
import { imageSize } from "image-size";
import { auth } from "@/auth";
import { isSafePublicUrl } from "@/lib/safe-url";
import { addAsset, createTemplateFromReference, getBrandKit, upsertBrandKit } from "@/lib/studio";

// REGISTER a blob the browser just uploaded directly (see blob-upload/route.ts).
//
// The file never passes through this function - we fetch it back from storage and read its REAL pixel
// dimensions off the bytes. That keeps the spec's hard rule intact ("every template's dimensions are
// derived from an ingested reference file, never manually entered") while dodging the 4.5MB body cap that
// was killing full-resolution design uploads.
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const KINDS = new Set(["reference", "logo", "font", "ci_doc", "image", "deal_card"]);

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const clientId = String(b.clientId || "").trim();
  const kind = String(b.kind || "reference").trim();
  const url = String(b.url || "").trim();
  const name = String(b.name || "").trim();
  const block = String(b.block || "funnel").trim();
  const placement = String(b.placement || "").trim();
  const bytes = Number(b.bytes) || 0;

  if (!clientId) return NextResponse.json({ error: "Pick the client first." }, { status: 400 });
  if (!KINDS.has(kind)) return NextResponse.json({ error: `Unknown kind "${kind}".` }, { status: 400 });
  // Only ever ingest a blob from OUR OWN store - never an arbitrary URL a caller hands us (SSRF).
  if (!url || !/\.blob\.vercel-storage\.com\//i.test(url) || !isSafePublicUrl(url)) {
    return NextResponse.json({ error: "That file isn't in our storage." }, { status: 400 });
  }

  // Read the true dimensions off the uploaded bytes. Fonts and PDFs have none - that's expected.
  let width = 0, height = 0;
  if (kind === "reference" || kind === "logo" || kind === "image" || kind === "deal_card") {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        const d = imageSize(buf);
        width = d.width ?? 0;
        height = d.height ?? 0;
      }
    } catch { /* leave at 0; handled below for references */ }
  }

  if (kind === "reference" && (!width || !height)) {
    return NextResponse.json({ error: `Couldn't read the pixel size of ${name || "that file"} - is it a real PNG/JPG export?` }, { status: 400 });
  }

  const meta = { width, height, bytes, original_name: name };
  const asset = await addAsset(clientId, kind, url, name || null, meta);

  // Logos and fonts belong to the BRAND KIT, so they serve the funnel AND the social sets from one place.
  if (kind === "logo" || kind === "font") {
    const kit = (await getBrandKit(clientId)) ?? (await upsertBrandKit(clientId, "Brand kit", {}));
    if (kind === "logo") {
      await upsertBrandKit(clientId, kit.name, { logos: [...(kit.logos ?? []), { variant: String(b.variant || "primary"), url, name }] });
    } else {
      await upsertBrandKit(clientId, kit.name, { fonts: [...(kit.fonts ?? []), { family: name.replace(/\.[^.]+$/, ""), url, file: name }] });
    }
  }

  // A REFERENCE creates its template draft, sized from the file, original attached as the design contract.
  let templateId: string | null = null;
  if (kind === "reference") {
    const t = await createTemplateFromReference({
      clientId, name: name.replace(/\.[^.]+$/, "") || "reference", block,
      placement: placement || "unassigned", width, height, referenceUrl: url,
    });
    templateId = t.id;
  }

  return NextResponse.json({ ok: true, id: asset.id, url, width, height, templateId });
}
