import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { getSecret } from "./connections";
import { PREMIUM } from "./vendors/anthropic";
import { getBrandKit } from "./studio";
import { loadIntelBrief, type Intel } from "./intel";
import { recordUsage } from "./usage";

// THE RESEARCHER - a commissioned deep dive on where a client actually stands.
//
// WHY THIS IS NOT THE STRATEGIST RUNNING HARDER. The Strategist is a WATCHER: it runs daily on a cron and is
// gated hard on recency, because its entire job is "what changed". The Researcher is an ANALYST: it is
// commissioned on demand and answers "where do we stand, and what should we do about it" - which is mostly NOT
// news. An entrenched competitor position, a structural gap in the category, or a campaign from two years ago
// worth stealing can be the most useful thing on the page. So the Researcher deliberately does NOT inherit the
// daily recency gate; applying it would gut the dossier and leave only headlines.
//
// WHAT IT KEEPS FROM THE DAILY ENGINE, because these are the parts that make research trustworthy:
//   - THE BRAIN IS THE RINGFENCE. Scope lock and remit come from THIS brain's row; no brief means we refuse to
//     run rather than borrow another client's scope.
//   - IT PROPOSES, IT NEVER ASSERTS. Findings land in the same review queue at status 'new' for a human to
//     accept or bin, so nothing reaches the brain unread.
//   - EVERY FINDING IS SOURCED. A claim without a URL someone can open is an opinion, and opinion is the one
//     thing a research desk cannot sell.
//
// FIVE SECTIONS, ALWAYS THE SAME. A dossier that changes shape run to run cannot be compared to the last one.

export type ResearchSection = "threat" | "opportunity" | "gap" | "positioning" | "trend";

export const SECTIONS: { id: ResearchSection; label: string; blurb: string }[] = [
  { id: "threat", label: "Threats", blurb: "What could damage this client's position" },
  { id: "opportunity", label: "Opportunities", blurb: "Unclaimed ground they could take" },
  { id: "gap", label: "Gaps", blurb: "Where they are weak or absent against what the market expects" },
  { id: "positioning", label: "Positioning", blurb: "How they are seen now, and the sharper claim available" },
  { id: "trend", label: "Trends & campaigns to steal", blurb: "Global moves that could accelerate their campaign" },
];

const STYLE = `HOW TO WRITE THIS (read by busy marketers and by the client's own team, not by analysts):
- Plain, direct English. Short sentences. Everyday words. Say the thing itself, not the jargon for it.
- SIMPLER LANGUAGE, SAME SUBSTANCE. Never dilute to sound readable: keep every number, name, date and honest
  uncertainty exactly as it is.
- No consultant register: avoid "leverage", "signals", "posture", "vectors", "synergies", "double-click".
- Lead with the point. The first sentence says the thing, not the build-up.
- UK British spelling, ALWAYS. NEVER use an em dash or an en dash: use a comma, a full stop, or a plain hyphen.`;

// The honesty rules DIVERGE from the daily run in exactly one place - recency - and that divergence is the
// whole reason this is a separate engine. Everything else is stricter, not looser.
const HONESTY = `HONESTY RULES:
- EVERY finding carries a REAL source URL you actually read. If you cannot source it, do not report it. A
  research desk that cannot be checked is worthless.
- NO RECENCY GATE. This is not a news run. Structural truth is what matters: a competitor's entrenched position,
  a category norm, a campaign from two years ago that still works. Date what you can, and say plainly when
  something is historical versus current - but never discard a finding merely for being old.
- SAY WHEN SOMETHING IS CURRENT. If a fact could have moved since publication, say so rather than implying it
  still holds.
- DO NOT REPORT THE BRAIN'S OWN DOCTRINE BACK. You are given what we already know. A finding must ADD to it,
  sharpen it, or CONTRADICT it. Restating what we told you is the most common way research wastes a reader.
- DEPTH BEATS BREADTH. Three findings that genuinely change a decision beat twelve that summarise the internet.
- A THIN SECTION IS AN HONEST ANSWER. If there is nothing real under a heading, return nothing for it and say
  so. Padding a section to look complete is the failure mode of every research tool ever built.
- Grade confidence honestly: high (primary - regulator, company results, statute, the brand's own published
  work), medium (credible secondary - trade press, law firm, respected analyst), low (single source or inferred).
- material=true ONLY if this would actually change what we say, make or spend. Most things are interesting and
  not material. Be ruthless.`;

const ASSESSMENT = `FOR EVERY FINDING, ALSO GIVE TWO INTERNAL LINES (never published, for our team only):
- impact_risk: what this could actually do to the client, sized honestly. "Little to none" is a valid answer.
- campaign_response: the move you recommend, and whether it is DEFENSIVE (protect what we have) or PROACTIVE
  (take ground). "No move needed" is a valid answer.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          section: {
            type: "string",
            enum: ["threat", "opportunity", "gap", "positioning", "trend"],
            description: "Which of the five sections this belongs under. threat = could damage them. opportunity = unclaimed ground. gap = where THEY are weak or absent. positioning = how they are seen vs the sharper claim available. trend = a global trend or campaign worth stealing to accelerate their work.",
          },
          headline: { type: "string", description: "One line. The finding itself, not a topic label." },
          why_it_matters: { type: "string", description: "The SO WHAT for THIS client specifically, read through their own doctrine. Concrete, not generic." },
          detail: { type: "string", description: "The substance, with the real numbers, names and dates." },
          sources: {
            type: "array",
            description: "EVERY source you actually read for this finding. A real URL each - never invent one.",
            items: {
              type: "object", additionalProperties: false,
              properties: { name: { type: "string" }, url: { type: "string" } },
              required: ["name", "url"],
            },
          },
          published_at: { type: "string", description: "Date the SOURCE was published as YYYY-MM-DD, if you can establish it. Empty string if not - unlike the daily run, an undated finding is ACCEPTED here, because structural research is not news." },
          period: { type: "string", description: "What the DATA covers if different from publication (e.g. 'FY2025'). Empty if not applicable." },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          material: { type: "boolean", description: "Would this actually change what we say, make or spend? Be ruthless." },
          impact_risk: { type: "string", description: "INTERNAL. What this could actually do, sized honestly." },
          campaign_response: { type: "string", description: "INTERNAL. The recommended move, marked DEFENSIVE or PROACTIVE." },
        },
        required: ["section", "headline", "why_it_matters", "detail", "sources", "published_at", "period", "confidence", "material", "impact_risk", "campaign_response"],
      },
    },
    thin_sections: {
      type: "array",
      items: { type: "string" },
      description: "Sections where you honestly found nothing worth reporting. Naming them is a correct answer, not a failure.",
    },
  },
  required: ["findings", "thin_sections"],
} as unknown as Anthropic.Tool["input_schema"];

/**
 * Commission a research dossier for one brain. On demand only - there is no cron (Gary): deep research on every
 * brain daily is real web-search spend for little gain. Returns the findings it PROPOSES, already stored at
 * status 'new' for a human to accept or bin.
 */
export async function runResearch(clientId: string, today: string, focus?: string): Promise<Intel[]> {
  const key = await getSecret("anthropic");
  if (!key) throw new Error("Claude isn't connected");

  // THE RINGFENCE. Scope and remit come from THIS brain, or we do not run at all.
  const cfg = await loadIntelBrief(clientId);
  if (!cfg) throw new Error("This brain has no intel brief, so its scope lock is unknown. Refusing to research it rather than borrow another brain's scope.");
  const remit = cfg.researcher;
  if (!remit) throw new Error(`${cfg.clientName} has no Researcher remit set yet. Add one on the brain before commissioning a dossier.`);

  const client = new Anthropic({ apiKey: key });
  const kit = await getBrandKit(clientId).catch(() => null);

  const sectionList = SECTIONS.map((s) => `- ${s.label} (${s.id}): ${s.blurb}`).join("\n");
  const askedFor = focus?.trim()
    ? `\n\nTHE COMMISSION - what this particular dossier is for, which should bias what you dig into:\n${focus.trim()}`
    : "";

  // TWO STEPS, for the same reason the daily run does it: given web_search AND the report tool under
  // tool_choice:auto, the model can search and then simply stop without ever filing. Forcing the report in its
  // own call makes a missing dossier impossible rather than merely unlikely.
  const brief = `Today is ${today}. Research ${cfg.clientName} in depth, strictly inside your scope lock.\n\n` +
    `Work the five sections:\n${sectionList}${askedFor}\n\n` +
    `WHAT WE ALREADY KNOW (do NOT report this back - only what ADDS to, sharpens or CONTRADICTS it):\n` +
    `${(kit?.tone_notes || "(no doctrine loaded)").slice(0, 6000)}\n\n` +
    `Search the web now, properly and widely: the client, their competitors, their category, their regulators, ` +
    `and the best global marketing work in adjacent categories. Then set out what you actually found, with the ` +
    `real source for each. Go deep on the few things that would change a decision.`;

  const research = await client.messages.create({
    model: PREMIUM,
    max_tokens: 8000,
    system: `${cfg.scope}\n\n${remit}\n\n${ASSESSMENT}\n\n${HONESTY}\n\n${STYLE}`,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 18 } as unknown as Anthropic.Tool],
    messages: [{ role: "user", content: brief }],
  });
  await recordUsage({ clientId, provider: "anthropic", model: PREMIUM, unit: "request", action: "research-dossier", count: 1 }).catch(() => {});

  const notes = research.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();
  if (!notes) return [];

  const res = await client.messages.create({
    model: PREMIUM,
    max_tokens: 8000,
    system: `${cfg.scope}\n\n${HONESTY}\n\n${ASSESSMENT}\n\n${STYLE}\n\nFile the research below as structured findings under the five sections. Carry the REAL source URLs through - never invent one. Name any section you genuinely found nothing for in thin_sections rather than padding it.`,
    tools: [{ name: "dossier", description: "The research dossier, every finding sourced.", input_schema: SCHEMA }],
    tool_choice: { type: "tool", name: "dossier" },   // FORCED - a dossier always comes back
    messages: [{ role: "user", content: `Research notes:\n\n${notes.slice(0, 24000)}` }],
  });
  await recordUsage({ clientId, provider: "anthropic", model: PREMIUM, unit: "request", action: "research-file", count: 1 }).catch(() => {});

  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") return [];
  const out = block.input as { findings?: Record<string, unknown>[] };
  const findings = Array.isArray(out.findings) ? out.findings : [];
  if (!findings.length) return [];

  // NO EM DASHES, EVER (Gary). Enforced on the way in, so the desk, any email and the article all inherit it
  // clean. A numeric range is handled first, or "12-18 months" becomes "12 - 18 months".
  const noDash = (s: unknown) => String(s ?? "")
    .replace(/(\d)\s*[—–]\s*(\d)/g, "$1-$2")
    .replace(/\s*[—–]\s*/g, " - ")
    .trim();

  const valid = new Set(SECTIONS.map((s) => s.id));
  const saved: Intel[] = [];
  for (const f of findings) {
    const section = valid.has(String(f.section) as ResearchSection) ? String(f.section) : "positioning";
    const srcs = (Array.isArray(f.sources) ? f.sources : [])
      .filter((s): s is { name: string; url: string } => !!s && typeof (s as { url?: string }).url === "string" && /^https?:\/\//i.test((s as { url: string }).url))
      .slice(0, 8);
    // Sourcing is the product here: an unsourced "finding" is an opinion, so it never reaches the queue.
    if (!srcs.length) continue;
    const rows = (await db().query(
      `insert into studio_intel (client_id, role, section, headline, why_it_matters, detail, sources, source_url, source_name, published_at, period, confidence, material, impact_risk, campaign_response)
       values ($1,'researcher',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       returning id, role, section, headline, why_it_matters, detail, sources, source_url, source_name, published_at, period, confidence, material, impact_risk, campaign_response, status, found_at`,
      [clientId, section, noDash(f.headline).slice(0, 300), noDash(f.why_it_matters).slice(0, 1200),
       noDash(f.detail).slice(0, 4000), JSON.stringify(srcs),
       srcs[0]?.url ?? null, srcs.map((s) => s.name).join(" · ").slice(0, 200) || null,
       /^\d{4}-\d{2}-\d{2}$/.test(String(f.published_at || "")) ? f.published_at : null,
       String(f.period || "").slice(0, 60) || null,
       ["high", "medium", "low"].includes(String(f.confidence)) ? f.confidence : "medium", f.material === true,
       noDash(f.impact_risk).slice(0, 3000) || null,
       noDash(f.campaign_response).slice(0, 3000) || null],
    )) as Intel[];
    saved.push(rows[0]);
  }
  return saved;
}

/** The dossier for a brain, newest first, grouped by the caller. */
export async function listResearch(clientId: string, status = "new"): Promise<Intel[]> {
  return (await db().query(
    `select id, role, section, headline, why_it_matters, detail, sources, source_url, source_name, published_at,
            period, confidence, material, impact_risk, campaign_response, newsletter, newsletter_art,
            newsletter_options, status, found_at
     from studio_intel
     where client_id = $1 and role = 'researcher' and status = $2
     order by found_at desc`,
    [clientId, status],
  )) as Intel[];
}
