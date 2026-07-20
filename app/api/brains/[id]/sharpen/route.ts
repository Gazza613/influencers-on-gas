import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { getBrain } from "@/lib/brains";
import { getSecret } from "@/lib/connections";
import { recordUsage } from "@/lib/usage";

// SHARPEN A QUESTION BEFORE IT IS ASKED.
//
// This is not polish. Retrieval is a similarity search, so a vague question genuinely finds worse passages:
// "tell me about fees" pulls scattered mentions, while "which services have zero transaction fees" pulls the
// verbatim list. The quality of the question IS the quality of the answer.
//
// It shows WHAT IT CHANGED AND WHY, so the team gets better at asking rather than dependent on a button.
//
// THE ONE HARD RULE: reword, never add. Turning "what do we know about pricing" into "what is MoMo's R5
// pricing" would smuggle a premise into the search and then find passages that appear to confirm it - which
// is precisely how a false claim gets legs. A sharpened question may be more specific about WHAT is being
// asked; it may never be more specific about the ANSWER.
export const maxDuration = 60;

const RULES = `You rewrite a question so it retrieves better from a private knowledge base. You are not
answering it.

WHAT MAKES A QUESTION RETRIEVE WELL:
- It names the thing being asked about, in the words the source material would use.
- It asks for ONE thing. Two questions in a sentence retrieve a blur of both.
- It is specific about scope: which product, which market, which period, where the asker implied one.

ABSOLUTE RULE - REWORD, NEVER ADD. You may not introduce a fact, a figure, a name, a product or an assumption
that was not in the original question. "What do we know about pricing" must NOT become "what is the R5
pricing": that invents the answer inside the question, and the search would then find whatever appears to
confirm it. If the question is vague because the asker does not know yet, it stays open - vague is a valid
state and guessing at what they meant is worse than a broad search.

If the question is already good, return it UNCHANGED and say so.

Reply as JSON only: {"sharpened": "...", "changed": true|false, "why": "one short sentence, plain English"}`;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const brain = await getBrain(id);
  if (!brain) return NextResponse.json({ error: "Brain not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { question?: string };
  const question = String(body.question ?? "").trim();
  if (!question) return NextResponse.json({ error: "Type a question first." }, { status: 400 });

  const key = await getSecret("anthropic");
  if (!key) return NextResponse.json({ sharpened: question, changed: false, why: "" });

  try {
    const client = new Anthropic({ apiKey: key });
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      system: RULES,
      // The brain's NAME is the only context given. Enough to use the right vocabulary, not enough to invent
      // subject matter the asker did not raise.
      messages: [{ role: "user", content: `The knowledge base is about: ${brain.name}\n\nQuestion: ${question}` }],
    });
    await recordUsage({ clientId: id, provider: "anthropic", model: "claude-sonnet-4-6", unit: "request", action: "sharpen-question", count: 1 }).catch(() => {});

    const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
    const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as { sharpened?: string; changed?: boolean; why?: string };
    const sharpened = String(parsed.sharpened ?? question).trim();
    return NextResponse.json({ sharpened, changed: !!parsed.changed && sharpened !== question, why: String(parsed.why ?? "") });
  } catch {
    // Never block the question over a failed rewrite - the original is always usable.
    return NextResponse.json({ sharpened: question, changed: false, why: "" });
  }
}
