import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { retrieve } from "@/lib/rag";
import { getSecret } from "@/lib/connections";
import { recordUsage } from "@/lib/usage";

// ASK THE BRAIN A QUESTION AND GET AN ANSWER (Gary: "i do not think your brain is working?").
//
// It WAS working - it retrieved the right passages - but it only ever SEARCHED. Ask "who is the CEO?" and you
// got six passages to read yourself, the top one starting mid-sentence. That is a search box wearing the word
// "test", and it made a functioning brain look broken.
//
// Retrieval happens exactly as before, then the brain answers FROM those passages. Two rules make the answer
// trustworthy rather than merely fluent:
//
//   1. IT MAY ONLY USE THE PASSAGES. No outside knowledge, no filling a gap from what the model happens to
//      know about MTN. A brain that answers from the model's own memory is not a brain, and it is exactly how
//      a wrong "fact" gets laundered into looking like the client's own material.
//   2. IT MUST SAY WHEN IT DOES NOT KNOW. The MoMo doctrine already carries this instruction about the exec
//      team ("say the brain does not hold it rather than reaching for a plausible name or date"), and the
//      same standard applies here. Not knowing is a valid, useful answer.
//
// The passages still come back, so the answer can always be checked against its own sources.

export const maxDuration = 120;

const RULES = `You answer questions about a client using ONLY the passages provided from that client's private
knowledge base. You are their brain, not a general assistant.

HARD RULES:
- Use ONLY the passages. Never add anything you happen to know about this company, its people or its market
  from outside them. If the passages do not contain it, you do not know it.
- If the passages do not answer the question, say so plainly: what the brain DOES hold on the topic, and what
  it is missing. Never guess a name, a number or a date to fill a gap. A confident wrong answer is the worst
  possible output here.
- Where the passages carry an explicit instruction about how to state something (a required form of words, a
  figure that must never be used, a claim that is suppressed), FOLLOW IT, and say so where it matters.
- Quote the exact wording when the exact wording is the point: a title, an official list, a compliance line.

HOW TO ANSWER:
- Lead with the answer in the first sentence. No preamble, never "based on the passages provided".
- Then add only what genuinely helps: surrounding detail, a caveat, an instruction the passages attach to it.
- Short and direct. UK British spelling. Never an em dash or an en dash: use a comma, a full stop or a hyphen.`;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) return NextResponse.json({ error: "Ask the brain a question." }, { status: 400 });

  try {
    // Wider than the old 6. The answer is written from these, so a fact split across a chunk boundary needs
    // its neighbour inside the window too - which is exactly what went wrong with the CEO's name.
    const hits = await retrieve(id, query, 10);
    if (!hits.length) {
      return NextResponse.json({
        hits: [],
        answer: "This brain holds nothing on that yet. Feed it the material, and if the answer lives in the brand doctrine, press Sync the doctrine so the brain can retrieve it.",
      });
    }

    const key = await getSecret("anthropic");
    // Claude not connected is not a failure: fall back to passages, which is what this box did before.
    if (!key) return NextResponse.json({ hits });

    const passages = hits.map((h, i) => `[${i + 1}] ${h.content}`).join("\n\n");
    const client = new Anthropic({ apiKey: key });
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 900,
      system: RULES,
      messages: [{ role: "user", content: `PASSAGES FROM THIS BRAIN:\n\n${passages}\n\nQUESTION: ${query}` }],
    });
    await recordUsage({ clientId: id, provider: "anthropic", model: "claude-sonnet-4-6", unit: "request", action: "brain-answer", count: 1 }).catch(() => {});

    const answer = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text).join("\n")
      .replace(/(\d)\s*[—–]\s*(\d)/g, "$1-$2")
      .replace(/\s*[—–]\s*/g, " - ")
      .trim();

    return NextResponse.json({ hits, answer });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 500 });
  }
}
