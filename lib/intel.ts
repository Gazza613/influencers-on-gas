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
  confidence: string;
  material: boolean;
  status: string;
  found_at: string;
};

const RINGFENCE = `SCOPE LOCK (absolute). You are researching MTN MoMo - the FINTECH arm, a STANDALONE BRAND with its own equity. You are NOT researching MTN Group the telco.
IN SCOPE: mobile money, payments, wallets, financial inclusion, fintech regulation (FAIS/FSCA/ARB/CPA/POPIA), fintech fraud and trust, MoMo's own products and offers, and the FINTECH competitive set (Capitec, TymeBank, VodaPay, Shoprite Money Market, Standard Bank Instant Money, Mukuru).
OUT OF SCOPE: MTN network/telco strategy, spectrum, coverage, MTN corporate brand campaigns, MTN Group subscriber numbers, telco competitor sets. MTN Group appears ONLY as the endorsement brand behind "MoMo from MTN".
CRITICAL: MoMo's fintech offers are OFTEN DIFFERENT from MTN's own offers. NEVER infer a MoMo price, bundle or product from an MTN source. If you cannot source it to MoMo directly, do not assert it.`;

const HONESTY = `HONESTY RULES:
- Every finding must carry a REAL source URL you actually read. If you cannot source it, do not report it.
- Grade confidence honestly: high (primary source - regulator, company results, statute), medium (credible secondary - law firm, trade press, fact-checker), low (single source, thin, or inferred).
- Mark material=true ONLY if this would actually change what we say or do. Most news is not material. A quiet day with nothing material is a CORRECT result - say so rather than padding.
- There is NO published creative-performance data for MoMo South Africa. Anyone quoting SA fintech creative benchmarks is inventing them. Never repeat one.
- If something contradicts what we already believe, say so loudly. That is the most valuable thing you can find.`;

const ROLE_BRIEF: Record<string, string> = {
  journalist: `You are researching for THE JOURNALIST: material the MTN MoMo CEO could build a DEFENSIBLE PUBLIC ARGUMENT on, for LinkedIn thought leadership.
The brief is INDUSTRY COMMENTARY ONLY - never product promotion. The moment a post promotes MoMo's services it becomes an FSP advertisement under FAIS and the whole s14 regime applies. So look for: category shifts, regulatory change, financial-inclusion data, fraud and trust research, the informal economy, data affordability, what other markets are learning.
He is a regulated financial-services executive at a JSE-listed group. So flag anything that is market-sensitive, forward-looking, or that only works as an argument if he discloses something non-public - those are things we must NOT write about.
The best find is a REAL NUMBER from a PRIMARY SOURCE that contradicts a comfortable industry assumption.`,

  strategist: `You are researching for THE STRATEGIST: what should change what GAS ADVISES MTN MoMo to do.
Look for: competitor moves (product launches, pricing, partnerships, distribution), regulatory change that opens or closes a door, market data that shifts the picture, fraud/trust developments, and anything that makes our current creative or channel strategy wrong.
Be specific about the SO WHAT. "Capitec launched X" is not intelligence. "Capitec launched X, which attacks MoMo's cash-out proximity advantage, so our creative should stop leaning on Y" is intelligence.
The best find is something that makes a current assumption WRONG.`,
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
          source_url: { type: "string" },
          source_name: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          material: { type: "boolean", description: "Would this actually change what we say or do? Most things are not." },
        },
        required: ["headline", "why_it_matters", "detail", "source_url", "source_name", "confidence", "material"],
      },
    },
    quiet_day: { type: "boolean", description: "True if nothing material was found. That is a correct result, not a failure." },
  },
  required: ["findings", "quiet_day"],
} as unknown as Anthropic.Tool["input_schema"];

// Run one role's daily research. Returns the findings it PROPOSES (already stored, status 'new').
export async function runIntel(clientId: string, role: "journalist" | "strategist", today: string): Promise<Intel[]> {
  const key = await getSecret("anthropic");
  if (!key) throw new Error("Claude isn't connected");
  const client = new Anthropic({ apiKey: key });
  const kit = await getBrandKit(clientId).catch(() => null);

  const res = await client.messages.create({
    model: PREMIUM,
    max_tokens: 4000,
    system: `${RINGFENCE}\n\n${ROLE_BRIEF[role]}\n\n${HONESTY}\n\nUK spelling. No em dashes. Return findings via the tool.`,
    tools: [
      { type: "web_search_20250305", name: "web_search", max_uses: 12 } as unknown as Anthropic.Tool,
      { name: "report", description: "The day's findings, each with a real source.", input_schema: SCHEMA },
    ],
    tool_choice: { type: "auto" },
    messages: [{
      role: "user",
      content: `Today is ${today}. Research what has changed that matters to MTN MoMo.\n\n` +
        `WHAT WE ALREADY KNOW (do not report these back as new - only report things that ADD to or CONTRADICT this):\n` +
        `${(kit?.tone_notes || "(no doctrine loaded)").slice(0, 6000)}\n\n` +
        `Search the web. Then report ONLY what is genuinely new and worth our attention. A quiet day is a correct answer.`,
    }],
  });

  const block = res.content.find((b) => b.type === "tool_use" && b.name === "report");
  if (!block || block.type !== "tool_use") return [];
  const out = block.input as { findings?: Record<string, unknown>[]; quiet_day?: boolean };
  const findings = Array.isArray(out.findings) ? out.findings : [];
  if (!findings.length) return [];

  const saved: Intel[] = [];
  for (const f of findings) {
    const rows = (await db().query(
      `insert into studio_intel (client_id, role, headline, why_it_matters, detail, source_url, source_name, confidence, material)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       returning id, role, headline, why_it_matters, detail, source_url, source_name, confidence, material, status, found_at`,
      [clientId, role, String(f.headline || "").slice(0, 300), String(f.why_it_matters || "").slice(0, 1200),
       String(f.detail || "").slice(0, 4000), String(f.source_url || "").slice(0, 600), String(f.source_name || "").slice(0, 200),
       ["high", "medium", "low"].includes(String(f.confidence)) ? f.confidence : "medium", f.material === true],
    )) as Intel[];
    saved.push(rows[0]);
  }
  return saved;
}

export async function listIntel(clientId: string, status = "new"): Promise<Intel[]> {
  return (await db().query(
    `select id, role, headline, why_it_matters, detail, source_url, source_name, confidence, material, status, found_at
     from studio_intel where client_id = $1 and status = $2 order by material desc, found_at desc limit 80`,
    [clientId, status],
  )) as Intel[];
}

export async function setIntelStatus(clientId: string, id: string, status: "accepted" | "binned"): Promise<void> {
  await db().query(`update studio_intel set status = $1 where id = $2 and client_id = $3`, [status, id, clientId]);
}
