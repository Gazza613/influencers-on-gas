import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { getSecret } from "./connections";
import { PREMIUM } from "./vendors/anthropic";
import { getBrandKit } from "./studio";

// THE DAILY INTELLIGENCE RUN — shared engine for The Journalist and The Strategist.
//
// Both roles do the same first job: go and find what CHANGED, and work out whether it matters to this client.
// They differ in what they do with it. The Journalist looks for material a CEO could build a defensible public
// argument on. The Strategist looks for things that should change what we ADVISE.
//
// TWO HARD RULES, and they are the whole design:
//
// 1. IT PROPOSES, IT NEVER ASSERTS. Findings land in a review queue for a human to accept or bin. Nothing is
//    written into the client brain automatically. If a bad source could quietly become "fact", every future
//    article and strategy would silently inherit it - so the human gate is not friction, it is the product.
//
// 2. RINGFENCED. Gary: "make sure it is ringfenced to their fintech arm MTN MoMo - I want no contamination."
//    MoMo is a STANDALONE fintech brand. MTN Group is only the endorsement brand. MoMo's offers differ from
//    MTN's own, so a MoMo fact may never be inferred from an MTN source.

export type Intel = {
  id: string;
  role: string;
  headline: string;
  why_it_matters: string;
  detail: string | null;
  source_url: string | null;
  source_name: string | null;
  sources: { name: string; url: string }[];
  published_at: string | null;
  period: string | null;
  confidence: string;
  material: boolean;
  status: string;
  found_at: string;
};

const RINGFENCE = `SCOPE LOCK (absolute). You are researching MTN MoMo - the FINTECH arm, a STANDALONE BRAND with its own equity. You are NOT researching MTN Group the telco.
IN SCOPE: mobile money, payments, wallets, financial inclusion, fintech regulation (FAIS/FSCA/ARB/CPA/POPIA), fintech fraud and trust, MoMo's own products and offers, and the FINTECH competitive set (Capitec, TymeBank, VodaPay, Shoprite Money Market, Standard Bank Instant Money, Mukuru).
OUT OF SCOPE: MTN network/telco strategy, spectrum, coverage, MTN corporate brand campaigns, MTN Group subscriber numbers, telco competitor sets. MTN Group appears ONLY as the endorsement brand behind "MoMo from MTN".
CRITICAL: MoMo's fintech offers are OFTEN DIFFERENT from MTN's own offers. NEVER infer a MoMo price, bundle or product from an MTN source. If you cannot source it to MoMo directly, do not assert it.`;

const HONESTY = (windowDays: number) => `HONESTY RULES:
- Every finding must carry a REAL source URL you actually read. If you cannot source it, do not report it.
- Grade confidence honestly: high (primary source - regulator, company results, statute), medium (credible secondary - law firm, trade press, fact-checker), low (single source, thin, or inferred).
- Mark material=true ONLY if this would actually change what we say or do. Most news is not material. A quiet day with nothing material is a CORRECT result - say so rather than padding.
- There is NO published creative-performance data for MoMo South Africa. Anyone quoting SA fintech creative benchmarks is inventing them. Never repeat one.
- RECENCY IS A HARD GATE. This is a DAILY intelligence run: you report WHAT CHANGED. Only report things published or announced in the LAST ${windowDays} DAYS. Older material - however good - is BACKGROUND, not news, and it already lives in our doctrine. Do not report it. A stale finding presented as current is worse than no finding.
- DATE EVERY FINDING. Give published_at as the date the SOURCE was published or the event happened - NOT today. If you cannot establish the date, leave it empty rather than guessing - but know that an undated finding will be REJECTED, because we cannot claim it is current.
- Also give 'period' when the data covers a span that differs from the publication date (e.g. a report published this month describing FY2025). Recency of PUBLICATION is not recency of DATA.`;

const ROLE_BRIEF: Record<string, string> = {
  // THE JOURNALIST speaks as the CEO, in public. Gary: "journalistic best practices, the absolute expert -
  // truthful, factual, NOT controversial, do NOT compare to competitors, focus on the OPPORTUNITIES for MoMo
  // the broader LinkedIn market should be aware of. Strategic, professional, compliant, impactful."
  journalist: `You are THE JOURNALIST, preparing LinkedIn thought-leadership material in the VOICE OF THE MTN MoMo CEO. GAS is the agency drafting on his behalf, so the bar is a respected financial-services executive writing in public: truthful, factual, carefully sourced and PROFESSIONAL.
Adopt journalistic best practice: verify before you assert, attribute every claim, prefer primary sources, separate fact from opinion. If it is not solid, it does not go in.
WHAT TO LOOK FOR: opportunities and shifts in the CATEGORY that the broader LinkedIn market - business leaders, policymakers, the financial-inclusion community - should be aware of. Financial inclusion, the informal economy, digital-payment adoption, data affordability, fraud awareness and consumer trust, what other markets are teaching. Frame them as OPPORTUNITIES the industry can rally around, and where MoMo is credibly placed to lead the conversation.
HARD LINES - these define the job:
- NEVER compare to, name, or take a swing at a competitor. This is category leadership, not combat.
- NEVER controversial, political, speculative or market-sensitive. He is a JSE-listed-group executive: nothing forward-looking, nothing that reads as a share-moving statement, nothing that needs non-public information to stand up.
- INDUSTRY COMMENTARY ONLY, never product promotion. The moment a post sells MoMo's services it becomes an FSP advertisement under FAIS and the whole s14 regime applies. Stay at the level of the category and the customer, never the product.
The best find is a real, verifiable, current development the CEO can build a generous, forward-looking, non-controversial point of view on - one that makes MoMo look like the adult in the room and the industry better for the conversation.`,

  // THE STRATEGIST is internal and blunt. Gary: "a ground truth so it can report back on competitors, assess
  // risks and identify opportunities. Raw truth for our internal strategy team, so no holding back."
  strategist: `You are THE STRATEGIST: raw ground-truth intelligence for GAS's OWN internal strategy team. This is an internal briefing, not a client-facing document - do not soften, hedge or flatter. Tell us what is actually happening, including what is uncomfortable to hear.
Three jobs, every run:
- COMPETITORS: what the fintech set actually did (Capitec Pay, TymeBank, VodaPay, Shoprite Money Market, Standard Bank Instant Money, Mukuru, Discovery Bank) - a launch, a price, a partnership, a distribution move, a numbers release.
- RISKS: what threatens MoMo's position - a regulatory shift, a competitor encroaching on a MoMo advantage, a fraud or trust development, a channel or pricing pressure.
- OPPORTUNITIES: an opening MoMo could take - an underserved segment, a competitor weakness, a regulatory door opening, a partner in play.
Be specific about the SO WHAT and the SO WHAT NOW. "Capitec launched X" is not intelligence. "Capitec launched X, which attacks MoMo's cash-out proximity advantage, so we should stop leaning on Y and test Z" is intelligence.
If something makes a current MoMo assumption WRONG, LEAD with it and say so plainly - that is the most valuable thing you can put in front of an internal team.`,
};

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
          headline: { type: "string", description: "One line. What changed." },
          why_it_matters: { type: "string", description: "The SO WHAT for MTN MoMo specifically. Be concrete." },
          detail: { type: "string", description: "The substance, with the real numbers." },
          sources: {
            type: "array",
            description: "EVERY source you actually read for this finding. A real URL each - never invent one.",
            items: {
              type: "object", additionalProperties: false,
              properties: { name: { type: "string" }, url: { type: "string" } },
              required: ["name", "url"],
            },
          },
          published_at: { type: "string", description: "The date the SOURCE was published, or the event happened, as YYYY-MM-DD. NOT today's date. If you genuinely cannot establish it, return an empty string - never guess." },
          period: { type: "string", description: "What the DATA actually covers, if different from the publication date (e.g. 'FY2025', 'calendar 2024', 'Q1 2026'). A report published this month can describe a year that is already old. Empty if not applicable." },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          material: { type: "boolean", description: "Would this actually change what we say or do? Most things are not." },
        },
        required: ["headline", "why_it_matters", "detail", "sources", "published_at", "period", "confidence", "material"],
      },
    },
    quiet_day: { type: "boolean", description: "True if nothing material was found. That is a correct result, not a failure." },
  },
  required: ["findings", "quiet_day"],
} as unknown as Anthropic.Tool["input_schema"];

// HARD RECENCY WINDOW, PER ROLE. Gary: "I cannot have stale research or articles, makes no sense." He is
// right, and flagging staleness was not enough - a daily intelligence run exists to report WHAT CHANGED, so
// anything outside the window is not news, it is background. Foundational work (the Competition Commission's
// data, the GSMA trust study) is still authoritative and already lives in the doctrine on the brand kit; it
// does not belong in a daily queue pretending to be new.
//
// The Strategist window is 60 days, a hard maximum Gary set - internal intelligence must be genuinely current
// competitor/risk movement. The Journalist runs a touch wider, because a CEO thought-leadership piece can
// legitimately reference a recent report or study that broke a couple of months ago - but it is still gated,
// never open-ended.
// Findings outside the window, or that cannot be dated at all, are REJECTED before storage, and the count of
// what was dropped is reported, never silently swallowed.
const WINDOW_DAYS: Record<string, number> = {
  strategist: Number(process.env.INTEL_WINDOW_STRATEGIST) || 60,
  journalist: Number(process.env.INTEL_WINDOW_JOURNALIST) || 90,
};
const windowFor = (role: string): number => WINDOW_DAYS[role] ?? 60;

// Run one role's daily research. Returns the findings it PROPOSES (already stored, status 'new').
export async function runIntel(clientId: string, role: "journalist" | "strategist", today: string): Promise<Intel[]> {
  const key = await getSecret("anthropic");
  if (!key) throw new Error("Claude isn't connected");
  const client = new Anthropic({ apiKey: key });
  const kit = await getBrandKit(clientId).catch(() => null);
  const windowDays = windowFor(role);

  // TWO STEPS, deliberately.
  //
  // Step 1 researches with web search. Step 2 files the report with the schema FORCED.
  // Doing both in one call means giving the model web_search AND report under tool_choice:auto - and it can
  // then simply finish after searching without ever filing. That is exactly what happened on the first live
  // run: the Strategist filed 6 findings, the Journalist filed NOTHING, silently. Forcing the report tool in
  // its own call makes a missing report impossible rather than merely unlikely.
  const brief = `Today is ${today}. Research what has changed that matters to MTN MoMo.\n\n` +
    `WHAT WE ALREADY KNOW (do NOT report these back as new - only report what ADDS to or CONTRADICTS this):\n` +
    `${(kit?.tone_notes || "(no doctrine loaded)").slice(0, 6000)}\n\n` +
    `Search the web now. Then set out what is genuinely new and worth our attention, with the real source for each.`;

  const research = await client.messages.create({
    model: PREMIUM,
    max_tokens: 6000,
    system: `${RINGFENCE}\n\n${ROLE_BRIEF[role]}\n\n${HONESTY(windowDays)}\n\nUK spelling. No em dashes.`,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 12 } as unknown as Anthropic.Tool],
    messages: [{ role: "user", content: brief }],
  });
  const notes = research.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();
  if (!notes) return [];

  const res = await client.messages.create({
    model: PREMIUM,
    max_tokens: 4000,
    system: `${RINGFENCE}\n\n${HONESTY(windowDays)}\n\nFile the research below as structured findings. Carry the REAL source URLs through - never invent one. If the research found nothing genuinely new, return an empty findings list and quiet_day=true. A quiet day is a correct answer, not a failure.`,
    tools: [{ name: "report", description: "The day's findings, each with a real source.", input_schema: SCHEMA }],
    tool_choice: { type: "tool", name: "report" }, // FORCED - a report always comes back
    messages: [{ role: "user", content: `Research notes from today's run:\n\n${notes.slice(0, 20000)}` }],
  });

  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") return [];
  const out = block.input as { findings?: Record<string, unknown>[]; quiet_day?: boolean };
  const findings = Array.isArray(out.findings) ? out.findings : [];
  if (!findings.length) return [];

  // THE GATE. Reject anything we cannot prove is current, before it is ever stored.
  const cutoff = Date.now() - windowDays * 86_400_000;
  const dropped: string[] = [];
  const fresh = findings.filter((f) => {
    const d = String(f.published_at || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { dropped.push(`${String(f.headline || "?").slice(0, 60)} — undated`); return false; }
    const t = new Date(d).getTime();
    if (!Number.isFinite(t) || t < cutoff) {
      dropped.push(`${String(f.headline || "?").slice(0, 60)} — ${d}, older than ${windowDays} days`);
      return false;
    }
    return true;
  });
  if (dropped.length) console.warn(`[intel:${role}] dropped ${dropped.length} stale/undated finding(s): ${dropped.join(" | ")}`);

  const saved: Intel[] = [];
  for (const f of fresh) {
    const srcs = (Array.isArray(f.sources) ? f.sources : [])
      .filter((s): s is { name: string; url: string } => !!s && typeof (s as { url?: string }).url === "string" && /^https?:\/\//i.test((s as { url: string }).url))
      .slice(0, 8);
    const rows = (await db().query(
      `insert into studio_intel (client_id, role, headline, why_it_matters, detail, sources, source_url, source_name, published_at, period, confidence, material)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       returning id, role, headline, why_it_matters, detail, sources, source_url, source_name, published_at, period, confidence, material, status, found_at`,
      [clientId, role, String(f.headline || "").slice(0, 300), String(f.why_it_matters || "").slice(0, 1200),
       String(f.detail || "").slice(0, 4000), JSON.stringify(srcs),
       srcs[0]?.url ?? null, srcs.map((s) => s.name).join(" · ").slice(0, 200) || null,
       /^\d{4}-\d{2}-\d{2}$/.test(String(f.published_at || "")) ? f.published_at : null,
       String(f.period || "").slice(0, 60) || null,
       ["high", "medium", "low"].includes(String(f.confidence)) ? f.confidence : "medium", f.material === true],
    )) as Intel[];
    saved.push(rows[0]);
  }
  return saved;
}

export async function listIntel(clientId: string, status = "new"): Promise<Intel[]> {
  return (await db().query(
    `select id, role, headline, why_it_matters, detail, sources, source_url, source_name, published_at, period, confidence, material, status, found_at
     from studio_intel where client_id = $1 and status = $2 order by material desc, found_at desc limit 80`,
    [clientId, status],
  )) as Intel[];
}

export async function setIntelStatus(clientId: string, id: string, status: "accepted" | "binned"): Promise<void> {
  await db().query(`update studio_intel set status = $1 where id = $2 and client_id = $3`, [status, id, clientId]);
}
