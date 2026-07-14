import { NextResponse } from "next/server";
import { imageSize } from "image-size";
import { auth } from "@/auth";
import { putBytes } from "@/lib/blob";
import { addAsset, createTemplateFromReference, getBrandKit, upsertBrandKit } from "@/lib/studio";

// TEMPLATE INTAKE - the front door of GAS Studio.
//
// The team's hand-designed reference set is uploaded here, and the SYSTEM reads what it needs off the
// files: pixel dimensions, format and weight (never typed by hand - the spec makes that a hard rule, so
// a template's size can never disagree with the design it was recreated from). A reference upload also
// creates its studio_templates draft, with the file attached forever as the design contract.
//
// Kinds:
//   reference - a creative to recreate + lock (creates a template draft)
//   logo      - approved brand logo (goes into the brand kit; usable by funnel AND social)
//   font      - the licensed brand font files we render with (risk #1: without these, server-rendered
//               text cannot match the designs, and no CSS fixes that)
//   ci_doc    - the CI document, kept alongside as part of the contract
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const KINDS = new Set(["reference", "logo", "font", "ci_doc", "image"]);
const MAX_BYTES = 25 * 1024 * 1024; // a design export, not a video

function extOf(name: string, mime: string): string {
  const fromName = (name.split(".").pop() || "").toLowerCase();
  if (fromName && fromName.length <= 5) return fromName;
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("svg")) return "svg";
  if (mime.includes("pdf")) return "pdf";
  return "bin";
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Send the files as multipart form data." }, { status: 400 });

  const clientId = String(form.get("clientId") || "").trim();
  const kind = String(form.get("kind") || "reference").trim();
  const block = String(form.get("block") || "funnel").trim();
  const placement = String(form.get("placement") || "").trim();
  if (!clientId) return NextResponse.json({ error: "Pick the client first." }, { status: 400 });
  if (!KINDS.has(kind)) return NextResponse.json({ error: `Unknown upload kind "${kind}".` }, { status: 400 });

  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return NextResponse.json({ error: "No files came through." }, { status: 400 });

  const out: Record<string, unknown>[] = [];
  for (const f of files) {
    if (f.size > MAX_BYTES) { out.push({ name: f.name, error: `Too big (${(f.size / 1048576).toFixed(1)}MB, max 25MB).` }); continue; }
    try {
      const buf = Buffer.from(await f.arrayBuffer());
      const mime = f.type || "application/octet-stream";
      const ext = extOf(f.name, mime);

      // READ the real pixel dimensions off the file itself. Fonts/PDFs have none - that's expected.
      let width = 0, height = 0;
      try { const d = imageSize(buf); width = d.width ?? 0; height = d.height ?? 0; } catch { /* not a raster image */ }

      const url = await putBytes(buf, `studio/${kind}`, ext, mime);
      const meta = { width, height, bytes: f.size, mime, original_name: f.name };
      const asset = await addAsset(clientId, kind, url, f.name, meta);

      // A LOGO or FONT belongs to the brand kit, so it's available to every template (funnel and social).
      if (kind === "logo" || kind === "font") {
        const kit = (await getBrandKit(clientId)) ?? (await upsertBrandKit(clientId, "Brand kit", {}));
        if (kind === "logo") {
          const logos = [...(kit.logos ?? []), { variant: String(form.get("variant") || "primary"), url, name: f.name }];
          await upsertBrandKit(clientId, kit.name, { logos });
        } else {
          const fonts = [...(kit.fonts ?? []), { family: f.name.replace(/\.[^.]+$/, ""), url, file: f.name }];
          await upsertBrandKit(clientId, kit.name, { fonts });
        }
      }

      // A REFERENCE creates its template draft, sized from the file.
      let templateId: string | null = null;
      if (kind === "reference") {
        if (!width || !height) { out.push({ name: f.name, url, error: "Couldn't read pixel dimensions - is it a real PNG/JPG export?" }); continue; }
        const t = await createTemplateFromReference({
          clientId, name: f.name.replace(/\.[^.]+$/, ""), block,
          placement: placement || "unassigned",
          width, height, referenceUrl: url,
        });
        templateId = t.id;
      }

      out.push({ id: asset.id, name: f.name, url, width, height, bytes: f.size, templateId });
    } catch (e) {
      out.push({ name: f.name, error: String((e as Error)?.message || e).slice(0, 160) });
    }
  }

  return NextResponse.json({ ok: true, uploaded: out });
}
