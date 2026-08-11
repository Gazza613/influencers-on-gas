import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getBrain } from "@/lib/brains";
import { ingestChunks } from "@/lib/rag";
import { recordUsage } from "@/lib/usage";
import { db } from "@/lib/db";

// SAVE AN ASK ANSWER INTO THE BRAIN (Gary: "what if I get a result here that I want to ingest into the brain?
// and what if it is there already?"). The team asks the brain, and a genuinely useful answer - especially one
// blended with Claude or freshly looked up on the web - should be able to compound the brain rather than being
// lost when the tab closes. This is the safe way to do that.
//
// THE PROVENANCE RULE IS THE WHOLE DESIGN. An answer produced with general or web knowledge must NEVER be
// laundered into the brain as if it were the client's own verified material (that is exactly how a wrong
// "fact" gets legs). So:
//   - The stored chunk carries an explicit provenance header naming the mode and, when it is not pure brain,
//     that it contains UNVERIFIED knowledge. If it is ever retrieved again, it reads as a saved note, not doctrine.
//   - The inline [brain]/[general]/[web] labels are kept in the text, so each claim's origin travels with it.
//   - It is tagged metadata.kind = 'ask_note' (not 'research'), so it is distinguishable from verified facts.
//
// DEDUP ("what if it is there already?"): a normalised key of question+answer is stored and checked first, so
// saving the same answer twice adds nothing and reports it as already held.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const norm = (s: string) => s.toLowerCase().replace(/\[(brain|general|web)\]/g, " ").replace(/[^a-z0-9]+/g, " ").trim().slice(0, 300);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const brain = await getBrain(id);
  if (!brain) return NextResponse.json({ error: "Brain not found" }, { status: 404 });

  const b = (await req.json().catch(() => ({}))) as { question?: string; answer?: string; mode?: string };
  const question = String(b.question || "").trim().slice(0, 500);
  const answer = String(b.answer || "").trim().slice(0, 8000);
  const mode = ["brain", "mixed", "claude", "live"].includes(String(b.mode)) ? String(b.mode) : "brain";
  if (!answer) return NextResponse.json({ error: "There is no answer to save yet." }, { status: 400 });

  // Not pure-brain answers carry knowledge the client has not verified. We keep it, but never as ground truth.
  const unverified = mode !== "brain";
  const answerKey = norm(`${question} ${answer}`);

  // "Already there?" - a matching saved answer means nothing to add.
  const dup = (await db().query(
    `select 1 from knowledge_chunks where client_id = $1 and metadata->>'answer_key' = $2 limit 1`,
    [id, answerKey],
  )) as unknown[];
  if (dup.length) return NextResponse.json({ ok: true, added: 0, duplicate: true });

  const modeLabel = mode === "mixed" ? "brain + Claude" : mode === "live" ? "brain + live web" : mode === "claude" ? "Claude only" : "brain only";
  const header =
    `[Saved answer · mode: ${modeLabel}${unverified ? " · CONTAINS UNVERIFIED KNOWLEDGE, not the client's own verified material" : ""}` +
    `${question ? ` · question: ${question}` : ""} · saved by ${session.user?.email || "the team"}]`;
  const content = `${header}\n\n${answer}`;

  const added = await ingestChunks(id, null, [{
    content,
    metadata: {
      kind: "ask_note",
      mode,
      unverified,
      question,
      answer_key: answerKey,
      added_by: session.user?.email || null,
      title: question ? `Saved answer: ${question.slice(0, 80)}` : "Saved answer",
    },
  }]);
  if (added) await recordUsage({ clientId: id, userEmail: session.user?.email ?? null, provider: "voyage", model: "voyage-4-lite", unit: "embed", action: "ask-ingest", count: added }).catch(() => {});

  return NextResponse.json({ ok: true, added, duplicate: false, unverified });
}
