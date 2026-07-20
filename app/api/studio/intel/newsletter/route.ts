import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getSecret } from "@/lib/connections";
import { getBrandKit } from "@/lib/studio";
import { loadIntelBrief } from "@/lib/intel";
import { PREMIUM } from "@/lib/vendors/anthropic";
import { recordUsage } from "@/lib/usage";

// The writer also art-directs. A creative chosen by a separate step would illustrate a different article than
// the one it sits next to - so the same call that writes the piece decides the image, and is bound by the same
// rules (no competitor, no product pitch, no price).
const PIECE = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string", description: "The newsletter title. Short, plain and substantive - what the piece is actually about. No colon-subtitle cliche, no story hook, no question." },
    body: { type: "string", description: "The piece: 180-280 words, professional executive register, substance-led. Plain paragraphs separated by blank lines. No markdown, no headings. Every paragraph says something the reader did not know - but do NOT force a statistic into every piece; most need none, and any figure used must be highly credible and attributable." },
    image_subject: { type: "string", description: "ART DIRECTION for the LinkedIn image that runs beside a CEO's market note. A real, specific South African person or scene that carries the post's POINT with DIGNITY and CONFIDENCE - a capable adult, a working business, a moment of competence. NOT anxious, worried, struggling, pitiable or a narrated hardship scene: this sits under an executive's name, and a worried face reads as pity, not value. No products, no phones held up like an advert, no logos, no text described." },
    image_callout: { type: "string", description: "ONE short line for the image, max ~24 characters. It must carry the post's central POINT or VALUE in a professional register - not a story line, not a narrated moment, not a question, not an offer or price. Think a confident statement a CEO would stand behind, e.g. 'Money that reaches everyone'. No competitor, no product pitch." },
  },
  required: ["title", "body", "image_subject", "image_callout"],
} as unknown as Anthropic.Tool["input_schema"];

// TURN A JOURNALIST FINDING INTO THE CEO'S NEWSLETTER (Gary).
//
// The Journalist finds the material; this writes the piece. It is the CEO of MTN MoMo speaking to his own
// audience, so the constraints ARE the product - a newsletter that breaks them is worse than no newsletter,
// because it is published under a real executive's name.
//
// Gary's rules, verbatim in intent: factual, professional, NOT combative, NOT emotional, NEVER mentions
// competitors or industry companies, leans into MTN MoMo and its value, and may SUBTLY hint at issues the
// consumer faces without naming names.
//
// The FAIS line still holds and is the one place Gary's brief and the law meet: "leans into MoMo's value" is
// not licence to advertise. The moment it quotes a price, pushes an offer or sells a service it becomes an FSP
// advertisement under FAIS s14 and the whole regime applies. So: what MoMo is FOR and what it makes possible,
// never what it costs or a call to sign up.
// BRAIN-ONLY, ALWAYS. This route builds its own prompt from the brain's scope lock and CEO rules and does NOT
// go through /api/brains/[id]/query, so the three answer modes on Ask the Brain cannot reach it. That is
// deliberate and must stay true: a piece published under a real executive's name may never contain a claim
// from a model's general knowledge, however it was labelled on screen at the time.
//
// If this is ever refactored onto the shared query path, it must pass mode "brain" explicitly and refuse
// anything else.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// THE WRITING RULES NOW LIVE ON THE BRAIN (intel_briefs.ceo_rules), not here.
//
// They used to be a MoMo document baked into this file: "YOU ARE THE CEO OF MTN MoMo - a FINTECH", the FAIS
// s14 advertising boundary, the ban on naming the underwriting bank, the 14-million-customers rule. Correct
// for MoMo and wrong for anyone else. Pointed at a second brain they would have produced that company's
// thought leadership under financial-services law, with a competitor ban that for an agency is backwards.
//
// No MoMo FACT could ever have leaked - findings and doctrine are client_id scoped and always were - but the
// VOICE would have, and a piece published under a real executive's name is exactly where that is unacceptable.
// Each brain now carries its own register, its own hard lines and its own compliance position.


export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as { clientId?: string; id?: string };
  const clientId = String(b.clientId || "");
  const id = String(b.id || "");
  if (!clientId || !id) return NextResponse.json({ error: "clientId and id required" }, { status: 400 });

  try {
    const rows = (await db().query(
      `select headline, why_it_matters, detail, sources, published_at from studio_intel
       where id = $1 and client_id = $2 and role = 'journalist'`,
      [id, clientId],
    )) as Record<string, unknown>[];
    const f = rows[0];
    if (!f) return NextResponse.json({ error: "That finding is not on this brain." }, { status: 404 });

    const key = await getSecret("anthropic");
    if (!key) return NextResponse.json({ error: "Claude isn't connected" }, { status: 503 });

    // The brain is the ringfence here too: the scope lock and the doctrine come from THIS client, so the piece
    // is written inside the same fence the research was found in.
    const cfg = await loadIntelBrief(clientId);
    if (!cfg) return NextResponse.json({ error: "This brain has no brief, so its scope is unknown." }, { status: 400 });

    // REFUSE RATHER THAN BORROW. A brain with no CEO rules does not get another brain's - that is precisely
    // how one company's voice ends up on another company's page. The same stance loadIntelBrief already takes
    // on the scope lock.
    if (!cfg.ceoRules) {
      return NextResponse.json({
        error: `${cfg.clientName} has no CEO writing rules yet, so there is no voice to write in. Add them to this brain before publishing under anyone's name.`,
      }, { status: 400 });
    }
    const kit = await getBrandKit(clientId).catch(() => null);

    const srcs = (Array.isArray(f.sources) ? f.sources : []) as { name: string; url: string }[];
    const material =
      `THE FINDING\n${String(f.headline || "")}\n\n` +
      `WHY IT MATTERS\n${String(f.why_it_matters || "")}\n\n` +
      `THE SUBSTANCE\n${String(f.detail || "")}\n\n` +
      `SOURCES: ${srcs.map((s) => `${s.name} (${s.url})`).join(" · ") || "none recorded"}\n` +
      `PUBLISHED: ${String(f.published_at || "date not established")}\n\n` +
      `WHAT WE KNOW ABOUT MoMo (his own ground truth - use it, do not contradict it):\n` +
      `${(kit?.tone_notes || "(no doctrine loaded)").slice(0, 7000)}`;

    const client = new Anthropic({ apiKey: key });
    const res = await client.messages.create({
      model: PREMIUM,
      max_tokens: 2000,
      system: `${cfg.scope}

${cfg.ceoRules}`,
      tools: [{ name: "piece", description: "The CEO's newsletter piece and the art direction for its image.", input_schema: PIECE }],
      tool_choice: { type: "tool", name: "piece" }, // FORCED - a piece always comes back
      messages: [{
        role: "user",
        content: `Write the CEO's newsletter piece from the material below, and art-direct the LinkedIn image that runs with it.\n\n${material}`,
      }],
    });
    await recordUsage({ clientId, provider: "anthropic", model: PREMIUM, unit: "request", action: "ceo-newsletter", count: 1 }).catch(() => {});

    const block = res.content.find((x) => x.type === "tool_use");
    if (!block || block.type !== "tool_use") return NextResponse.json({ error: "Nothing came back. Try again." }, { status: 500 });
    const out = block.input as { title?: string; body?: string; image_subject?: string; image_callout?: string };

    // The house rule is enforced, not requested: no em dashes, ever.
    const noDash = (t: unknown) => String(t ?? "").replace(/(\d)\s*[—–]\s*(\d)/g, "$1-$2").replace(/\s*[—–]\s*/g, " - ").trim();
    const title = noDash(out.title);
    const body = noDash(out.body);
    if (!body) return NextResponse.json({ error: "Nothing came back. Try again." }, { status: 500 });

    return NextResponse.json({
      ok: true,
      newsletter: title ? `${title}\n\n${body}` : body,
      // Handed back so the creative can be generated as a second, short request - keeping this one fast.
      art: { subject: noDash(out.image_subject), callout: noDash(out.image_callout) },
    });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 500 });
  }
}
