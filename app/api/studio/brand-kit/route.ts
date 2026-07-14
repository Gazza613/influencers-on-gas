import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getBrandKit, upsertBrandKit } from "@/lib/studio";

// Brand-kit text fields: the client's COMPLIANCE LINE and tone notes.
//
// The compliance line (e.g. "Ts&Cs Apply · Queries? 083135 · MTN JR AUTH FSP 46094") is stored once, at
// client level, and is reproduced VERBATIM wherever a creative needs it. It is never handed to the copy
// engine to rewrite: a financial-services disclosure that gets paraphrased is a compliance breach, so the
// text is a fixed block the wizard cannot edit, exactly as the spec requires for the SMS.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const clientId = String(b.clientId || "").trim();
  if (!clientId) return NextResponse.json({ error: "Pick the client first." }, { status: 400 });

  const patch: { compliance_text?: string; tone_notes?: string } = {};
  if (typeof b.compliance_text === "string") patch.compliance_text = b.compliance_text.slice(0, 2000);
  if (typeof b.tone_notes === "string") patch.tone_notes = b.tone_notes.slice(0, 4000);
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });

  const kit = (await getBrandKit(clientId)) ?? (await upsertBrandKit(clientId, "Brand kit", {}));
  const saved = await upsertBrandKit(clientId, kit.name, patch);
  return NextResponse.json({ ok: true, brandKit: saved });
}
