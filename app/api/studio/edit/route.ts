import { NextResponse } from "next/server";
import { auth } from "@/auth";
import sharp from "sharp";
import { forensicRetheme } from "@/lib/vendors/higgsfield";
import { stampRealLogo, stampDealCard, stampPhoneScreen } from "@/lib/studio-slider";
import { flattenSection1ToWhite, flattenMastheadToNavy, cleanBlueGlowBehindDisc } from "@/lib/studio-cutout";
import { putBytes } from "@/lib/blob";
import { recordUsage } from "@/lib/usage";

// EDIT THE CREATIVE THAT LANDED. Gary: "need a prompt box when render lands so we can edit the image landed and
// make changes." This is the iterate step - a targeted edit of the FINISHED creative ("lose the second phone",
// "make her cardigan navy", "warmer light"), keeping everything else exactly as it is. It edits the image the
// team is looking at, NOT a fresh roll of the dice from the reference.
//
// THE BRAND LOCKS MUST SURVIVE THE ITERATION. The landed creative already has the real logo (and the chosen
// deal card) composited on. Running it back through the model would REDRAW those and garble them, so the model
// is told to draw neither, and we re-stamp both afterwards - exactly as the build route does. Iterate as many
// times as you like; the logo and the price stay pixel-perfect.
export const maxDuration = 800;
export const dynamic = "force-dynamic";

function nearestRatio(w: number, h: number): string {
  const t = w / h;
  const opts: [string, number][] = [["1:1", 1], ["4:3", 4 / 3], ["3:4", 3 / 4], ["3:2", 3 / 2], ["16:9", 16 / 9], ["9:16", 9 / 16]];
  return opts.reduce((b, o) => (Math.abs(o[1] - t) < Math.abs(b[1] - t) ? o : b))[0];
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as {
    clientId?: string; kind?: string; imageUrl?: string; instruction?: string; referenceUrl?: string; dealCardUrl?: string; phoneScreenUrl?: string;
  };
  const clientId = String(b.clientId || "");
  const kind = String(b.kind || "");
  const imageUrl = String(b.imageUrl || "");
  const instruction = String(b.instruction || "").trim();
  const referenceUrl = String(b.referenceUrl || "");
  const dealCardUrl = String(b.dealCardUrl || "").trim();
  const phoneScreenUrl = String(b.phoneScreenUrl || "").trim();

  if (!clientId || !imageUrl) return NextResponse.json({ error: "Nothing to edit yet." }, { status: 400 });
  if (instruction.length < 3) return NextResponse.json({ error: "Say what you want changed." }, { status: 400 });

  try {
    const buf: Buffer = Buffer.from(new Uint8Array(await (await fetch(imageUrl)).arrayBuffer()));
    const meta = await sharp(buf).metadata().catch(() => null);
    const ratio = meta ? nearestRatio(meta.width || 1080, meta.height || 1080) : "1:1";
    const isDisc = kind === "masthead" || kind === "section1";

    const changes: string[] = [instruction];
    // The image we edit is the CLEAN, pre-stamp render (the UI passes cleanUrl), so there is no baked logo or
    // deal for the model to reproduce - which is what doubled them on a re-run. We only need to keep the model
    // from DRAWING an offer, since we re-composite the real card below.
    if (dealCardUrl) changes.push(`Do NOT draw any deal card, offer badge, price bubble, pill or promotional element anywhere, and no prices - the real deal card is composited on afterwards. Leave the top-right as clean background.`);
    // The clean input carries a green chroma phone screen; keep it flat green (the real screenshot is composited on after).
    if (phoneScreenUrl) changes.push(`KEEP the phone screen a SOLID BRIGHT GREEN rectangle (chroma key), completely flat and filling the screen - do NOT draw an app, icons, text or any content on it. The real screenshot is composited onto that green afterwards.`);

    const ed = await forensicRetheme(imageUrl, { changes, ratio, resolution: "2k", solidBackground: isDisc });
    await recordUsage({ clientId, provider: "higgsfield", model: "nano_banana_pro", unit: "image", action: `edit-${kind || "creative"}`, count: 1 }).catch(() => {});
    if (!ed.url) return NextResponse.json({ error: ed.error || "the edit did not come back" }, { status: 500 });

    // Re-assert the colour hard locks on an edit too, so iterating a masthead or section 1 never reintroduces a
    // cream background or drifts the navy (the same deterministic step the build route runs).
    let base = ed.url;
    try {
      if (kind === "section1") {
        const cleaned = await flattenSection1ToWhite(Buffer.from(new Uint8Array(await (await fetch(ed.url)).arrayBuffer())));
        base = await putBytes(await cleanBlueGlowBehindDisc(cleaned), `studio/${clientId}/section1-white`, "png", "image/png");
      } else if (kind === "masthead") {
        const navy = await flattenMastheadToNavy(Buffer.from(new Uint8Array(await (await fetch(ed.url)).arrayBuffer())));
        base = await putBytes(navy, `studio/${clientId}/masthead-navy`, "png", "image/png");
      }
    } catch (e) { console.error("[edit] colour lock failed, keeping the render:", e); }

    // Re-apply the brand locks so iterating can never degrade them.
    let out = isDisc ? base : await stampRealLogo(clientId, referenceUrl || imageUrl, base);
    if (dealCardUrl) out = await stampDealCard(clientId, out, dealCardUrl, referenceUrl || undefined);
    if (phoneScreenUrl) out = await stampPhoneScreen(clientId, out, phoneScreenUrl);
    // Return the pre-stamp render too, so the NEXT edit again starts from a clean image and never doubles.
    return NextResponse.json({ ok: true, url: out, cleanUrl: base });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 500 });
  }
}
