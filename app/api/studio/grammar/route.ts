import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { getSecret } from "@/lib/connections";
import { PREMIUM } from "@/lib/vendors/anthropic";
import { listTemplates, listAssets, getBrandKit, upsertBrandKit } from "@/lib/studio";
import { recordUsage } from "@/lib/usage";
import { isSafePublicUrl } from "@/lib/safe-url";

// LEARN THE BRAND. Reverse-engineer the client's DESIGN SYSTEM from their best-performing creatives.
//
// Gary: "the intake images are the campaigns that performed - best performing", and "we cannot go to ground,
// the client is happy with our creative direction - in saying this we can certainly improve".
// So the references are not a mood board, they are PERFORMANCE DATA, and the direction is LOCKED. The job is
// to codify the rules the designers already follow (often without writing them down) so a new creative can be
// composed INSIDE the family and sharpened, never redesigned out of it.
//
// The output is stored on the brand kit and becomes the locked grammar the Creative Director composes within.
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const SYSTEM = `You are a design systems director reverse-engineering a WORKING, PROVEN brand system from its best-performing creatives.

The direction is LOCKED and the client is happy with it. Your job is to CODIFY it so it can be reproduced faithfully and sharpened from within. You are NOT critiquing it and NOT proposing a redesign. A rule you write down here will be obeyed literally by a machine, so it must be true of the work in front of you, not what you would have done.

Extract, forensically and concretely:
1. COMPOSITION per placement: the grid, where the subject sits, where offers sit, safe margins, what is cropped.
2. COLOUR: real hex values, and WHAT EACH ONE IS FOR (not just a palette list).
3. TYPE: which weight for which role, the RELATIVE size ratios between elements, the treatment (bevel, outline, shadow).
4. SUBJECT TREATMENT: cut-out edge quality, lighting, colour grade, how the subject is integrated with the background.
5. THE SIGNATURE CONSTRUCTION: the layer stack that creates this brand's look, bottom to top.
6. THE OFFER PANEL: exact anatomy and the fixed slot order.
7. WHAT CREATES DEPTH.
8. RULES NEVER BROKEN across the whole set.
9. DEGREES OF FREEDOM: what the designers DO vary, so we know where the room is.
10. THE FIVE WAYS TO INSTANTLY NOT BELONG: the mistakes that would make a creative read as a different brand.

Write it as instructions a designer (or a renderer) can follow. Be specific: real numbers, real ratios, real hex. Never invent an element you cannot see. UK spelling, no em dashes, no filler.`;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const clientId = String(b.clientId || "").trim();
  if (!clientId) return NextResponse.json({ error: "Pick the client first." }, { status: 400 });

  const templates = await listTemplates(clientId);
  const byPlacement = (p: string, n: number) =>
    templates.filter((t) => t.placement === p && t.reference_url && isSafePublicUrl(t.reference_url)).slice(0, n);

  // A spread ACROSS placements: the grammar is what holds true everywhere, so a sample from each is what
  // reveals it. Deal cards come along because the offer panel is the atom that runs through all of them.
  const refs = [
    ...byPlacement("funnel_banner", 5),
    ...byPlacement("funnel_section1", 5),
    ...byPlacement("funnel_section2", 5),
  ];
  if (refs.length < 3) return NextResponse.json({ error: "Upload the reference set first - I need several winning creatives to read the system from." }, { status: 400 });

  const cards = (await listAssets(clientId, "deal_card").catch(() => []))
    .filter((a) => isSafePublicUrl(a.url)).slice(0, 4);

  const key = await getSecret("anthropic");
  if (!key) return NextResponse.json({ error: "Claude isn't connected." }, { status: 503 });
  const client = new Anthropic({ apiKey: key });

  const kit = await getBrandKit(clientId);
  const fonts = [...new Set((kit?.fonts ?? []).map((f) => String(f.family).split("-")[0]))].join(", ");

  type Part = { type: "text"; text: string } | { type: "image"; source: { type: "url"; url: string } };
  const content: Part[] = [{
    type: "text",
    text: `These are the client's BEST-PERFORMING creatives - the proven set, not a mood board.\n` +
      `${refs.map((r) => `${r.placement} ${r.width}x${r.height}`).filter((v, i, a) => a.indexOf(v) === i).join(" · ")}\n` +
      `Licensed fonts we render with: ${fonts || "(none uploaded)"}.\n` +
      `${cards.length ? "Offer-panel designs follow the creatives.\n" : ""}\n` +
      `The direction is LOCKED. Derive the design system that produced this work.`,
  }];
  refs.forEach((r) => content.push({ type: "image", source: { type: "url", url: r.reference_url as string } }));
  cards.forEach((c) => content.push({ type: "image", source: { type: "url", url: c.url } }));

  try {
    const res = await client.messages.create({
      model: PREMIUM,
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: "user", content: content as unknown as Anthropic.MessageParam["content"] }],
    });
    const block = res.content.find((x) => x.type === "text");
    const grammar = block && block.type === "text" ? block.text.trim() : "";
    if (!grammar) return NextResponse.json({ error: "The read came back empty." }, { status: 502 });

    await upsertBrandKit(clientId, kit?.name || "Brand kit", { design_system: grammar });
    await recordUsage({ clientId, userEmail: session.user.email ?? null, provider: "anthropic", model: PREMIUM, unit: "request", action: "studio-grammar", count: 1 }).catch(() => {});

    return NextResponse.json({ ok: true, read: refs.length + cards.length, design_system: grammar });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 500 });
  }
}
