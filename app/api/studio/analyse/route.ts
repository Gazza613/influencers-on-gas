import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { getSecret } from "@/lib/connections";
import { PREMIUM } from "@/lib/vendors/anthropic";
import { listTemplates, saveTemplateAnalysis, getBrandKit } from "@/lib/studio";
import { recordUsage } from "@/lib/usage";
import { isSafePublicUrl } from "@/lib/safe-url";

// READ THE REFERENCE SET AND DERIVE THE TEMPLATE.
//
// The team's uploads for a placement are NOT versions of one design - they are CAMPAIGN VARIANTS: nine
// mastheads, each a different offer (1GB free, R8, Welcome to MoMo, R1,000 Winter Savings...), all built in
// the same design language. That is a gift: what is CONSTANT across them is the locked design, and what
// CHANGES between them is precisely the set of editable slots.
//
// So we show Claude the whole set at once and ask it to separate the two. This is the "intelligently work it
// out from the files" step - the basis of the whole factory - rather than asking the team to describe their
// own designs back to us in a form.
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const SYSTEM = `You are a senior art director doing TEMPLATE EXTRACTION for a creative production system.

You are shown EVERY approved creative a client has made for ONE placement. They are not drafts of one design: each is a different CAMPAIGN (a different offer, model and headline) built in the SAME locked design language.

Your job is to separate the design from the content:
- FIXED = everything identical across the set. This is the locked design: canvas, background construction, colour palette, logo position, typography, the geometry of every element. It is hardcoded and can never be edited by the team.
- SLOTS = everything that changes between them. This is the ONLY thing the team will edit per campaign. For each slot give a key, a human label, its type (text | image | deal_card | list), where it sits on the canvas, and for text slots a sensible maxChars read from the longest real example you can see.

Be forensic and concrete. Name actual hex colours, actual positions (as % of the canvas), actual observed text. Never invent an element you cannot see. If something appears in only SOME of the set, say so and mark the slot optional.

Also report: any text baked into the imagery, whether a compliance line is present, and anything that would make this hard to reproduce faithfully in HTML/CSS (a cut-out with a soft shadow, a radial burst, a 3D lozenge, etc).`;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const clientId = String(b.clientId || "").trim();
  const placement = String(b.placement || "").trim();
  if (!clientId || !placement) return NextResponse.json({ error: "Missing client or placement." }, { status: 400 });

  const all = (await listTemplates(clientId)).filter((t) => t.placement === placement && t.reference_url);
  if (!all.length) return NextResponse.json({ error: "Nothing uploaded for that placement yet." }, { status: 400 });

  // Anthropic vision takes up to 100 images; cap at a sane number of exemplars - the whole SET is the point,
  // but 12 worked examples already show what is fixed and what varies.
  const refs = all.filter((t) => isSafePublicUrl(t.reference_url as string)).slice(0, 12);
  if (!refs.length) return NextResponse.json({ error: "Those references aren't reachable." }, { status: 400 });

  const kit = await getBrandKit(clientId).catch(() => null);
  const fontList = [...new Set((kit?.fonts ?? []).map((f) => String(f.family).split("-")[0]))].join(", ");

  const key = await getSecret("anthropic");
  if (!key) return NextResponse.json({ error: "Claude isn't connected." }, { status: 503 });
  const client = new Anthropic({ apiKey: key });

  type Part = { type: "text"; text: string } | { type: "image"; source: { type: "url"; url: string } };
  const content: Part[] = [{
    type: "text",
    text: `Placement: ${placement}. Locked canvas: ${refs[0].width}x${refs[0].height}px (every one of these is that exact size).\n` +
      `Licensed fonts available to render with: ${fontList || "(none uploaded)"}.\n` +
      `${refs.length} approved campaign creatives follow. Separate the LOCKED DESIGN from the EDITABLE SLOTS.`,
  }];
  refs.forEach((t) => content.push({ type: "image", source: { type: "url", url: t.reference_url as string } }));

  try {
    const res = await client.messages.create({
      model: PREMIUM,
      max_tokens: 4000,
      system: SYSTEM,
      tools: [{
        name: "template",
        description: "The locked design and the editable slots, read off the reference set.",
        input_schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            summary: { type: "string", description: "What this placement IS, in one or two plain sentences." },
            fixed: {
              type: "object", additionalProperties: false,
              properties: {
                background: { type: "string" },
                palette: { type: "array", items: { type: "string" }, description: "hex codes actually observed" },
                logo: { type: "string", description: "which logo, where, what size" },
                typography: { type: "string" },
                construction: { type: "string", description: "how the layers are built up" },
              },
              required: ["background", "palette", "logo", "typography", "construction"],
            },
            slots: {
              type: "array",
              items: {
                type: "object", additionalProperties: false,
                properties: {
                  key: { type: "string" },
                  label: { type: "string" },
                  type: { type: "string", enum: ["text", "image", "deal_card", "list"] },
                  position: { type: "string", description: "where on the canvas, as % or a clear anchor" },
                  maxChars: { type: "number" },
                  optional: { type: "boolean" },
                  examples: { type: "array", items: { type: "string" }, description: "real values seen in the set" },
                },
                required: ["key", "label", "type", "position", "optional"],
              },
            },
            baked_text: { type: "string", description: "any text burned into the imagery" },
            compliance_line: { type: "string", description: "the compliance text if present, verbatim; empty if none" },
            reproduction_risks: { type: "array", items: { type: "string" }, description: "what will be hard to match in HTML/CSS" },
          },
          required: ["summary", "fixed", "slots", "baked_text", "compliance_line", "reproduction_risks"],
        } as unknown as Anthropic.Tool["input_schema"],
      }],
      tool_choice: { type: "tool", name: "template" },
      messages: [{ role: "user", content: content as unknown as Anthropic.MessageParam["content"] }],
    });

    const block = res.content.find((x) => x.type === "tool_use");
    if (!block || block.type !== "tool_use") return NextResponse.json({ error: "The analysis came back empty." }, { status: 502 });
    const analysis = block.input as Record<string, unknown>;

    // Store it on EVERY reference for this placement: they all describe the same locked design.
    const slotSchema = { slots: analysis.slots ?? [] } as Record<string, unknown>;
    await Promise.all(refs.map((t) => saveTemplateAnalysis(t.id, clientId, analysis, slotSchema).catch(() => {})));

    await recordUsage({ clientId, userEmail: session.user.email ?? null, provider: "anthropic", model: PREMIUM, unit: "request", action: "studio-analyse", count: 1 }).catch(() => {});
    return NextResponse.json({ ok: true, analysed: refs.length, analysis });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 500 });
  }
}
