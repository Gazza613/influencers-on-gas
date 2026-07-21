import { NextResponse } from "next/server";
import { auth } from "@/auth";
import sharp from "sharp";
import { forensicRetheme } from "@/lib/vendors/higgsfield";
import { stampRealLogo, stampDealCard } from "@/lib/studio-slider";
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
    clientId?: string; kind?: string; imageUrl?: string; instruction?: string; referenceUrl?: string; dealCardUrl?: string;
  };
  const clientId = String(b.clientId || "");
  const kind = String(b.kind || "");
  const imageUrl = String(b.imageUrl || "");
  const instruction = String(b.instruction || "").trim();
  const referenceUrl = String(b.referenceUrl || "");
  const dealCardUrl = String(b.dealCardUrl || "").trim();

  if (!clientId || !imageUrl) return NextResponse.json({ error: "Nothing to edit yet." }, { status: 400 });
  if (instruction.length < 3) return NextResponse.json({ error: "Say what you want changed." }, { status: 400 });

  try {
    const buf: Buffer = Buffer.from(new Uint8Array(await (await fetch(imageUrl)).arrayBuffer()));
    const meta = await sharp(buf).metadata().catch(() => null);
    const ratio = meta ? nearestRatio(meta.width || 1080, meta.height || 1080) : "1:1";
    const isDisc = kind === "masthead" || kind === "section1";

    const changes: string[] = [instruction];
    // THE BRAND LOCKS ARE ALREADY BAKED INTO THIS IMAGE from the previous run. We re-stamp them afterwards, so
    // the model must first REMOVE the existing ones and reconstruct clean background - otherwise the old logo
    // and old deal stay in the pixels and the fresh stamp lands ON TOP, doubling the logo and pasting the new
    // deal over the old one instead of replacing it (Gary's exact bug on a re-run).
    if (!isDisc) {
      // Sliders get the real logo re-stamped, so the baked one must go first.
      changes.push(`REMOVE the existing MoMo logo lockup completely (it is composited back on afterwards): erase it and cleanly reconstruct the background/photograph where it sat, leaving that corner clean with NO logo and no faint or partial remnant of one.`);
    }
    if (dealCardUrl) {
      // Adding/changing the deal: strip whatever offer element is already in the top-right so the new card
      // REPLACES it rather than overlapping it.
      changes.push(`REMOVE any deal card, offer badge, price bubble, pill or promotional element ALREADY PRESENT in the top-right (and anywhere else) and cleanly reconstruct the background there, so the top-right comes back completely clean. Draw NO new deal, price or offer of any kind - the real deal card is composited on afterwards.`);
    }

    const ed = await forensicRetheme(imageUrl, { changes, ratio, resolution: "2k", solidBackground: isDisc });
    await recordUsage({ clientId, provider: "higgsfield", model: "nano_banana_pro", unit: "image", action: `edit-${kind || "creative"}`, count: 1 }).catch(() => {});
    if (!ed.url) return NextResponse.json({ error: ed.error || "the edit did not come back" }, { status: 500 });

    // Re-apply the brand locks so iterating can never degrade them.
    let out = isDisc ? ed.url : await stampRealLogo(clientId, referenceUrl || imageUrl, ed.url);
    if (dealCardUrl) out = await stampDealCard(clientId, out, dealCardUrl, referenceUrl || undefined);
    return NextResponse.json({ ok: true, url: out });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 500 });
  }
}
