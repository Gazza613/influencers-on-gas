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

// AN INTERNAL TOOL. Only Ask the Brain and the brain's own test box call this. Nothing that gets PUBLISHED
// does: the CEO newsletter and the Journalist build their own prompts from the brain's rules, so the mixed and
// Claude modes below cannot reach anything that goes out under someone's name. Keep it that way.
export const maxDuration = 180;   // live search needs the room

// THREE MODES (Gary). The switch itself is trivial; the safeguards are the design.
//
// BRAIN is the default and you have to choose to leave it. CLAUDE answers with no client material at all.
// MIXED is the useful one and the dangerous one: blend general knowledge into an answer and it can carry a
// claim that LOOKS like it came from the client's doctrine but did not. That is not hypothetical - it is
// exactly how the R5 claim got legs, a plausible assertion wearing the authority of client material.
//
// So mixed mode LABELS EVERY CLAIM inline. Not a footnote, not a disclaimer at the end: if a sentence cannot
// be traced to a passage it says so where it is read. For MoMo this matters most of all - a model's general
// knowledge will happily produce MAU figures, competitor comparisons and pricing, which are precisely the
// things the doctrine exists to override.
export type AskMode = "brain" | "mixed" | "claude" | "live";

// LIVE adds a fourth source and a fourth label. The distinction that matters: a FETCHED claim can be cited and
// a REMEMBERED one cannot. Claude's training data has a cutoff, so its recollection of a client can be simply
// out of date - it may describe eGifts24 under its previous ownership, because the Stellr acquisition is
// recent. Collapsing "I looked it up just now, here is the link" into the same label as "I think I remember
// this" would throw away the only difference that lets someone check it.

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

// Mixed: the brain leads, general knowledge fills gaps, and the reader can always tell which is which.
const MIXED_RULES = `You answer questions about a client using their private knowledge base FIRST, and your own
general knowledge only to fill what the passages do not cover.

LABEL EVERY CLAIM, INLINE. This is the whole point of this mode:
- Start a sentence or clause drawn from the passages with [brain].
- Start one drawn from your own general knowledge with [general].
- Never leave a factual claim unlabelled. If you are unsure which it is, it is [general].

THE PASSAGES ALWAYS WIN. Where your own knowledge contradicts them, the passages are right and you say so
explicitly - a client's own doctrine exists precisely to override what is generally believed about them. Never
"correct" the brain from memory.

DO NOT INVENT SPECIFICS as [general]: no figures, dates, prices or named people about THIS client unless the
passages carry them. General knowledge is for context, mechanism and explanation, never for facts about the
client that only they can confirm.

HOW TO ANSWER: lead with the answer. Short and direct. UK British spelling. Never an em dash or an en dash:
use a comma, a full stop or a plain hyphen.`;

// Live: the brain, plus the web searched right now. Three provenances, three labels.
const LIVE_RULES = `You answer using the client's private knowledge base FIRST, and the web SEARCHED NOW for
anything current the passages do not cover.

SEARCH THE WEB before answering if the question touches anything that could have changed, or anything outside
the passages. Do not answer current-state questions from memory when you can look them up.

LABEL EVERY CLAIM, INLINE, with one of three tags:
- [brain]   drawn from the client's own passages.
- [web]     found by searching just now. ALWAYS follow it with the source, as (source: publication, date).
- [general] your own background knowledge, neither in the passages nor freshly looked up.

The difference between [web] and [general] is the point of this mode: a fetched claim can be checked and a
remembered one cannot. Never label a recollection as [web], and never present a [general] claim about the
client's current state without saying it may be out of date.

THE PASSAGES WIN over both, on anything the client would know best about themselves - their positioning,
their products, their own figures. The web wins over your memory on anything current.

HOW TO ANSWER: lead with the answer. Short and direct. UK British spelling. Never an em dash or an en dash:
use a comma, a full stop or a plain hyphen.`;

// Claude only: no client material is read at all, and the answer must not pretend otherwise.
const CLAUDE_RULES = `Answer from your own general knowledge. You have NOT been given this client's private
material and must not imply that you have.

If the question turns on something only the client's own records could settle - their pricing, their figures,
their internal position - say plainly that this needs the brain rather than guessing at it.

Lead with the answer. Short and direct. UK British spelling. Never an em dash or an en dash: use a comma, a
full stop or a plain hyphen.`;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const query = typeof body.query === "string" ? body.query.trim() : "";
  // Default is BRAIN. Leaving the fence is always an explicit choice, never something that happens by
  // omission or by a malformed request.
  const mode: AskMode = body.mode === "mixed" ? "mixed" : body.mode === "claude" ? "claude" : body.mode === "live" ? "live" : "brain";
  if (!query) return NextResponse.json({ error: "Ask the brain a question." }, { status: 400 });

  try {
    const key = await getSecret("anthropic");

    // CLAUDE ONLY: no retrieval at all. Not "retrieve and ignore" - the client's material is genuinely never
    // read, which is the only honest meaning of the mode.
    if (mode === "claude") {
      if (!key) return NextResponse.json({ error: "Claude isn't connected" }, { status: 503 });
      const client = new Anthropic({ apiKey: key });
      const res = await client.messages.create({
        model: "claude-sonnet-4-6", max_tokens: 900, system: CLAUDE_RULES,
        messages: [{ role: "user", content: query }],
      });
      await recordUsage({ clientId: id, provider: "anthropic", model: "claude-sonnet-4-6", unit: "request", action: "brain-answer", count: 1 }).catch(() => {});
      const answer = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n")
        .replace(/(\d)\s*[—–]\s*(\d)/g, "$1-$2").replace(/\s*[—–]\s*/g, " - ").trim();
      return NextResponse.json({ hits: [], answer, mode });
    }

    // Wider than the old 6. The answer is written from these, so a fact split across a chunk boundary needs
    // its neighbour inside the window too - which is exactly what went wrong with the CEO's name.
    const hits = await retrieve(id, query, 10);
    if (!hits.length && mode === "brain") {
      return NextResponse.json({
        hits: [],
        answer: "This brain holds nothing on that yet. Feed it the material, and if the answer lives in the brand doctrine, press Sync the doctrine so the brain can retrieve it.",
      });
    }

    // Claude not connected is not a failure: fall back to passages, which is what this box did before.
    if (!key) return NextResponse.json({ hits, mode });

    const passages = hits.map((h, i) => `[${i + 1}] ${h.content}`).join("\n\n");
    const client = new Anthropic({ apiKey: key });
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: mode === "live" ? 1600 : 900,
      system: mode === "live" ? LIVE_RULES : mode === "mixed" ? MIXED_RULES : RULES,
      // The same web_search tool the Strategist uses for its daily run, capped lower: this is one question,
      // not a research sweep, and each search costs.
      ...(mode === "live"
        ? { tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 } as unknown as Anthropic.Tool] }
        : {}),
      messages: [{ role: "user", content: `PASSAGES FROM THIS BRAIN:\n\n${passages}\n\nQUESTION: ${query}` }],
    });
    await recordUsage({ clientId: id, provider: "anthropic", model: "claude-sonnet-4-6", unit: "request", action: mode === "live" ? "brain-answer-live" : "brain-answer", count: 1 }).catch(() => {});

    const answer = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text).join("\n")
      .replace(/(\d)\s*[—–]\s*(\d)/g, "$1-$2")
      .replace(/\s*[—–]\s*/g, " - ")
      .trim();

    return NextResponse.json({ hits, answer, mode });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e).slice(0, 200) }, { status: 500 });
  }
}
