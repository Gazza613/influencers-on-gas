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
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const RULES = `YOU ARE THE CEO OF MTN MoMo - a FINTECH - communicating to the MARKET about MoMo's value. GAS
drafts on his behalf. The audience is business leaders, partners, policymakers and the financial-services market
on LinkedIn. He is a serious executive publishing under his own name.

THE REGISTER IS THE THING TO GET RIGHT (this is where it usually goes wrong):
- PROFESSIONAL EXECUTIVE COMMUNICATION. This is NOT a story. Do NOT open with a scene, a character, an anecdote,
  a moment or "she stands at the counter". Never narrate a customer's day. Storytelling reads as unserious from a
  fintech CEO addressing his market.
- LEAD WITH SUBSTANCE. The first sentence carries a concrete fact, a number or a clear position. No build-up, no
  scene-setting, no rhetorical question.
- EVERY PARAGRAPH EARNS ITS PLACE by telling the reader something they did not already know: a real capability,
  a real proof point, a clear position, or a number. If a paragraph says nothing new, cut it.
- STATISTICS ARE A SEASONING, NOT THE MEAL. Do NOT force a number into every piece or every paragraph - a
  newsletter that always opens with a statistic becomes stale and obvious, and the reader stops seeing them.
  Use a figure when it genuinely carries the point, and let other pieces stand on capability, position or plain
  clear thinking instead. Roughly: most pieces need no statistic at all.
- WHEN YOU DO USE A FIGURE it must be HIGHLY CREDIBLE and attributable - a regulator, an official release, a
  company's own published result, a recognised industry body - and you say where it came from and when. If the
  source is thin, second-hand or you cannot name it, leave the number out entirely. A weak statistic under a
  CEO's name is worse than no statistic.
- HYPER-FOCUSED ON MTN MoMo. This is about MoMo's value, scale, capability and role. Market context ONLY where it
  directly frames why MoMo matters, and then briefly - a sentence, not a section. Do not write a market essay.
- Confident, measured, factual. Never hype, never emotional, never a rallying cry.

THE FACTS YOU MAY USE, AND ONLY THESE:
- The material provided and the ground truth below. NEVER invent a number, a date, a statistic or a quote. If you
  do not have it, do not reach for it.
- Prefer RECENT and RELEVANT over merely interesting. Where a figure has a date or a source, give it.
- NEVER cite MAU or monthly active users. MoMo's size is 14 million CUSTOMERS (app downloads), as at July 2026.
- MoMo's real, quotable substance lives in the ground truth: what it costs nothing to do, what it runs on, who it
  reaches, where it works. Use it precisely, never loosely.

HARD LINES - not negotiable, and breaking one makes the piece unusable:
- NEVER name, describe, allude to or compare against a competitor, a bank, a rival wallet or ANY other industry
  company. Not once, not obliquely, not as "some players". There is no competitor in this piece.
- NOT COMBATIVE. No rebuttal, no defending, no scoreboard, no "unlike others". He is not in an argument.
- FAIS s14: this is a point of view, NOT an advertisement. State what MoMo IS and what it DOES. No prices, no
  offers, no bundles, no "sign up", no call to action, nothing forward-looking or market-sensitive. He is a
  JSE-listed-group executive: nothing that reads as a share-moving statement.
- You MAY note a difficulty customers face, factually and in a clause, but NEVER name who causes it.
- NEVER NAME THE UNDERWRITING BANK (Gary). Do not mention African Bank, do not say "juristic representative",
  do not cite an FSP number, and do not explain who is regulated or who provides the banking behind MoMo. It is
  irrelevant to this audience and it drags the focus off MTN MoMo. The doctrine below carries that detail for
  COMPLIANCE COPY on advertisements; this is a point of view, not an advertisement, so it does not belong here.
  Equally, never imply MoMo itself is a bank - simply talk about what MoMo DOES and what it makes possible,
  and leave the corporate structure out of it entirely.

HOW TO WRITE IT:
- UK British spelling. NEVER an em dash or an en dash: use a comma, a full stop or a plain hyphen.
- Plain, direct, professional English. Short sentences. Say the thing, not the jargon for it.
- 180 to 280 words. A CEO's market note, tight. Not an essay.
- No consultant register, no "in today's fast-moving landscape", no rhetorical questions, no sign-off flourish.`;

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
      system: `${cfg.scope}\n\n${RULES}`,
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
