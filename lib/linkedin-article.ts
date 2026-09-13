import { db } from "./db";
import { runIntel, type Intel } from "./intel";
import { retrieve } from "./rag";
import { writeCeoNewsletter } from "./ceo-newsletter";

// DRAFT A LINKEDIN THOUGHT-LEADERSHIP PIECE from a typed topic (Gary). Shared by the admin button and the
// automation, so a scheduled draft is identical to a hand-run one.
//
// GROUNDING, DONE RIGHT: a thought-leadership piece is usually about the client's OWN point of view, so the
// PRIMARY ground is the client's own brain - their verified doctrine and crawled material, the strongest
// grounding there is. External market research is a BONUS that adds freshness and third-party citations when the
// topic has public coverage; it is never required. We refuse only when there is genuinely nothing to stand on:
// no brain material AND no verifiable external source. We never fabricate a fact to fit the prompt.
export type LinkedinDraft =
  | { ok: true; id: string; post: string; art: { subject: string; callout: string }; sourceHeadline: string; usedBrain: number; usedExternal: number; sources: { name: string; url: string }[] }
  | { ok: false; error: string; status: number };

export async function draftLinkedinArticle(
  clientId: string,
  topic: string,
  opts: { userEmail?: string | null; runExternal?: boolean } = {},
): Promise<LinkedinDraft> {
  const t = String(topic || "").trim().slice(0, 600);
  if (!t) return { ok: false, error: "No topic given.", status: 400 };
  const userEmail = opts.userEmail ?? null;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });

  // 1. The client's own material on the topic - the primary ground.
  const passages = await retrieve(clientId, t, 12, { userEmail }).catch(() => []);

  // 2. External market context, best-effort (skippable, e.g. to keep an automated batch cheap and fast).
  let external: Intel[] = [];
  if (opts.runExternal !== false) {
    try {
      external = (await runIntel(clientId, "strategist", today, userEmail, t, 90))
        .filter((f) => f.verification === "verified" || f.verification === "partial");
    } catch { external = []; }
  }

  if (!passages.length && !external.length) {
    return { ok: false, error: "This brain holds nothing on that topic and no public source could be verified, so there is nothing to ground a piece on. Feed the brain material on it first, or try a topic with some public coverage.", status: 400 };
  }

  const brainBlock = passages.map((p, i) => `[${i + 1}] ${p.content}`).join("\n\n").slice(0, 8000);
  const extBlock = external.map((f) => `- ${f.headline}: ${[f.why_it_matters, f.detail].filter(Boolean).join(" ")}`).join("\n").slice(0, 3000);
  const sourceMap = new Map<string, { name: string; url: string }>();
  for (const p of passages) {
    const url = String((p.metadata as Record<string, unknown>)?.url || "");
    if (url) sourceMap.set(url, { name: String((p.metadata as Record<string, unknown>)?.title || "Brain material"), url });
  }
  for (const f of external) for (const s of (Array.isArray(f.sources) ? f.sources : [])) if (s?.url) sourceMap.set(s.url, { name: s.name || "source", url: s.url });
  const sources = [...sourceMap.values()].slice(0, 12);

  const detail =
    `THE CLIENT'S OWN MATERIAL ON THIS TOPIC (ground truth - use it, never contradict it):\n` +
    `${brainBlock || "(the brain holds little specific material on this - lean on the doctrine below and make the case at the level of principle, never inventing a figure or fact)"}` +
    (extBlock ? `\n\nEXTERNAL MARKET CONTEXT (verified public sources):\n${extBlock}` : "");

  const result = await writeCeoNewsletter(clientId, {
    headline: t,
    why_it_matters: "A LinkedIn thought-leadership piece the executive can post, making the client's case on this topic.",
    detail,
    sources,
    published_at: null,
  }, {
    userEmail,
    notes: `Write a LinkedIn thought-leadership piece on: ${t}. Make the client's case with authority and a clear point of view. Ground every claim in the material and the doctrine; where the material is thin on a point, make it at the level of principle rather than inventing a figure, date or named fact.`,
  });
  if (!result.ok) return { ok: false, error: result.error, status: result.status };

  const grounded = passages.length > 0 || external.length > 0;
  const ins = (await db().query(
    `insert into studio_intel (client_id, role, headline, why_it_matters, detail, sources, confidence, material, status, verification, newsletter, newsletter_art)
     values ($1,'strategist',$2,$3,$4,$5::jsonb,'medium',true,'new',$6,$7,$8) returning id`,
    [clientId, t.slice(0, 300), "LinkedIn thought-leadership piece drafted on a typed topic.", detail.slice(0, 6000), JSON.stringify(sources), grounded ? "verified" : "unverified", result.post, result.art?.subject || null],
  )) as { id: string }[];
  const id = ins[0]?.id;
  if (!id) return { ok: false, error: "Drafted, but could not save it. Try again.", status: 500 };

  return { ok: true, id, post: result.post, art: result.art, sourceHeadline: t, usedBrain: passages.length, usedExternal: external.length, sources };
}
