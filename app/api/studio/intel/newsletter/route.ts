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
    title: { type: "string", description: "The newsletter title. Short, plain, no colon-subtitle cliche." },
    body: { type: "string", description: "The piece itself, 200-320 words. Plain paragraphs separated by blank lines. No markdown, no headings." },
    image_subject: { type: "string", description: "ART DIRECTION for the LinkedIn image: WHO is in it and what is happening. A real, specific, EMOTIVE South African human moment that carries the piece - a person, their situation, their expression. No products, no phones held up like an advert, no logos, no text described. Just the human moment." },
    image_callout: { type: "string", description: "The line that sits on the image, as 'line one / line two'. Max ~22 characters a line. It is the emotional line of the piece, NOT an offer and NOT a price. No competitor, no product pitch." },
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

const RULES = `YOU ARE WRITING AS THE CEO OF MTN MoMo, in his own voice, for his own newsletter and LinkedIn audience.
GAS is drafting on his behalf, so the bar is a respected financial-services executive publishing under his own
name. If a line would embarrass him in a board meeting or a regulator's inbox, it does not go in.

HARD RULES - these define the job, and breaking one makes the piece unusable:
- NEVER name, describe, allude to or compare against a competitor, a bank, a rival wallet, or ANY other
  industry company. Not once, not obliquely, not as "some players". There is no competitor in this piece.
- NOT COMBATIVE. No defending, no rebutting, no scoreboard, no "unlike others". He is not in an argument.
- NOT EMOTIONAL. No outrage, no hype, no exclamation, no rallying cry. Calm, warm, adult, measured.
- FACTUAL. Every claim must be one you can stand behind from the material given. If something is not solid,
  leave it out. Do not invent a number, a date, a statistic or a quote. Never cite MAU or monthly active users.
- LEAN INTO MTN MoMo AND ITS VALUE: what MoMo is for, what it makes possible for people, the role it plays.
- You MAY SUBTLY acknowledge a difficulty customers face - the cost of moving money, the effort of getting
  cash, the worry about whether it arrived - but NEVER name who causes it and never point at anyone. Describe
  the customer's experience, not an opponent.
- FAIS s14: this is a point of view, NOT an advertisement. No prices, no offers, no bundles, no "sign up",
  no product pitch, nothing forward-looking or market-sensitive. He is a JSE-listed-group executive: nothing
  that reads as a share-moving statement.

HOW TO WRITE IT:
- UK British spelling. NEVER an em dash or en dash: use a comma, a full stop or a plain hyphen.
- Plain, direct English. Short sentences. Everyday words. Lead with the point, not a build-up.
- 200 to 320 words. A newsletter, not an essay.
- Open with the human situation, not with "I". Close with what MoMo is trying to do about it, quietly.
- No consultant register, no jargon, no "in today's fast-moving landscape".`;

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
