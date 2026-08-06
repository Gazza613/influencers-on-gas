import Anthropic from "@anthropic-ai/sdk";
import { getSecret } from "./connections";
import { db } from "./db";
import { FABLE, withAnthropicRetry } from "./vendors/anthropic";
import { meterClaude } from "./usage";
import type { Strategy, StrategyContent } from "./cycle";
import { OBJECTIVES, TIERS, PLATFORMS, type ObjectiveId, type TierId } from "./proposal-config";
export { OBJECTIVES, TIERS, PLATFORMS };
export type { ObjectiveId, TierId };

// THE PROPOSAL (lives in the Strategist POD). A world-class, client-facing growth proposal for sign-off, built on
// the GAS Agency of NOW system: the approved research + strategy applied to every pod, specific to the client's
// objective. This is the highest-stakes, lowest-volume output in the whole system, so it runs on FABLE 5 (the most
// capable model) - no space for average. Human Command, AI Execution: Fable drafts, a senior human edits and
// approves, then it renders to a client-branded PDF (next increment). NEVER commits to an outcome; figures are
// illustrative only. The word "manifesto" is internal and never appears.

// ── THE PROPOSAL CONTENT (the structured document Fable produces) ─────────────────────────────────────────────
export type ProposalContent = {
  headline: string;                                          // "The Integrated Growth Engine for {Client}"
  subhead: string;                                           // one-sentence promise, tied to the objective
  exec_summary: { intro: string; cards: { title: string; body: string }[] };
  opportunity: { intro: string; definition_of_success: string };
  audience: {
    overview: string;
    personas: {
      label: string; trigger: string; need: string; who: string; propensity: string; angle: string;
      platforms: { platform: string; selections: string[]; approach: string }[];  // ACTUAL targeting per platform
    }[];
  };
  strategy: { proposition: string; angle: string; why_it_wins: string[] };
  // A market deep-dive that proves industry expertise: recent dated stats + opportunities the client should
  // consider, INCLUDING non-digital ones (flagged as strategic considerations beyond our pods, not deliverables).
  market_intel: { overview: string; stats: { stat: string; source: string }[]; opportunities: { insight: string; why: string; digital: boolean }[] };
  channels: { rationale: string; plan: { platform: string; priority: string; role: string; why: string }[] };   // intelligent selection
  pods: { name: string; for_client: string; benefit: string }[];                  // the 8 pods mapped to the client
  funnel: { disclaimer: string; stages: { stage: string; note: string }[] };      // ILLUSTRATIVE only
  kpis: { metric: string; why: string; baseline: string }[];
  rollout: { week: string; title: string; pods: string; points: string[]; gate: string }[];
  compliance: { intro: string; points: string[] };
  investment: { tier_name: string; rate: string; engine_includes: string[]; notes: string[] };
};

const P = (arr: readonly string[]) => arr.join(", ");

const CONTENT_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    headline: { type: "string" },
    subhead: { type: "string", description: "One sentence, tied to the objective. Confident, specific, no hype." },
    exec_summary: { type: "object", additionalProperties: false, properties: { intro: { type: "string" }, cards: { type: "array", items: { type: "object", additionalProperties: false, properties: { title: { type: "string" }, body: { type: "string" } }, required: ["title", "body"] }, description: "4 value cards." } }, required: ["intro", "cards"] },
    opportunity: { type: "object", additionalProperties: false, properties: { intro: { type: "string" }, definition_of_success: { type: "string", description: "A single, sharp definition of what success looks like for THIS objective." } }, required: ["intro", "definition_of_success"] },
    audience: {
      type: "object", additionalProperties: false,
      description: "THE PROOF OF OUR TARGETING. Personas with ACTUAL platform-level selections.",
      properties: {
        overview: { type: "string" },
        personas: {
          type: "array", description: "3 to 5 personas.",
          items: {
            type: "object", additionalProperties: false,
            properties: {
              label: { type: "string" }, trigger: { type: "string" }, need: { type: "string" }, who: { type: "string" }, propensity: { type: "string" }, angle: { type: "string" },
              platforms: {
                type: "array",
                description: `The real targeting per platform (only the platforms that fit this persona, from: ${P(PLATFORMS)}).`,
                items: { type: "object", additionalProperties: false, properties: {
                  platform: { type: "string", enum: PLATFORMS as unknown as string[] },
                  selections: { type: "array", items: { type: "string" }, description: "Concrete, credible targeting selections. Facebook/Instagram: interests, behaviours, demographics, custom/lookalike. TikTok: interests, hashtags, creator adjacencies. Google Display: in-market segments, custom-intent keywords, topics. LinkedIn: job titles, seniority, function, industry, company size." },
                  approach: { type: "string", description: "How we use it, e.g. prospecting via lookalikes then retargeting." },
                }, required: ["platform", "selections", "approach"] },
              },
            },
            required: ["label", "trigger", "need", "who", "propensity", "angle", "platforms"],
          },
        },
      },
      required: ["overview", "personas"],
    },
    strategy: { type: "object", additionalProperties: false, properties: { proposition: { type: "string" }, angle: { type: "string" }, why_it_wins: { type: "array", items: { type: "string" } } }, required: ["proposition", "angle", "why_it_wins"] },
    market_intel: {
      type: "object", additionalProperties: false,
      description: "A market deep-dive that proves our industry expertise. Recent DATED stats + opportunities, including non-digital ones. Grounded in the research; never fabricate a figure.",
      properties: {
        overview: { type: "string", description: "The current state of the client's market, in a short paragraph, using recent facts." },
        stats: { type: "array", items: { type: "object", additionalProperties: false, properties: { stat: { type: "string", description: "the figure or finding" }, source: { type: "string", description: "source and date/year" } }, required: ["stat", "source"] }, description: "3 to 6 recent, dated, relevant market statistics." },
        opportunities: { type: "array", items: { type: "object", additionalProperties: false, properties: { insight: { type: "string" }, why: { type: "string" }, digital: { type: "boolean", description: "true if within our pods; false if a broader strategic consideration for the client, beyond our digital scope." } }, required: ["insight", "why", "digital"] }, description: "Opportunities the client should consider, including non-digital ones flagged digital:false as strategic considerations, not deliverables." },
      },
      required: ["overview", "stats", "opportunities"],
    },
    channels: {
      type: "object", additionalProperties: false,
      description: "INTELLIGENT channel selection for THIS objective + audience. Do not list every platform; select and justify.",
      properties: {
        rationale: { type: "string" },
        plan: { type: "array", items: { type: "object", additionalProperties: false, properties: {
          platform: { type: "string", enum: PLATFORMS as unknown as string[] },
          priority: { type: "string", enum: ["lead", "support", "test"], description: "lead = primary budget; support = secondary; test = probe." },
          role: { type: "string" }, why: { type: "string", description: "why this platform fits the objective and audience" },
        }, required: ["platform", "priority", "role", "why"] } },
      },
      required: ["rationale", "plan"],
    },
    pods: { type: "array", description: "The 8 pods mapped to the client, in order.", items: { type: "object", additionalProperties: false, properties: { name: { type: "string" }, for_client: { type: "string", description: "what this pod does FOR this client, specific to the objective" }, benefit: { type: "string" } }, required: ["name", "for_client", "benefit"] } },
    funnel: {
      type: "object", additionalProperties: false,
      description: "ILLUSTRATIVE funnel economics only. Clearly labelled as illustrative, benchmark ranges, NEVER a guaranteed number.",
      properties: { disclaimer: { type: "string", description: "State plainly that these are illustrative benchmarks, not a guarantee." }, stages: { type: "array", items: { type: "object", additionalProperties: false, properties: { stage: { type: "string" }, note: { type: "string" } }, required: ["stage", "note"] } } },
      required: ["disclaimer", "stages"],
    },
    kpis: { type: "array", items: { type: "object", additionalProperties: false, properties: { metric: { type: "string" }, why: { type: "string" }, baseline: { type: "string" } }, required: ["metric", "why", "baseline"] } },
    rollout: { type: "array", description: "The 31-day rollout, 4 weeks.", items: { type: "object", additionalProperties: false, properties: { week: { type: "string" }, title: { type: "string" }, pods: { type: "string" }, points: { type: "array", items: { type: "string" } }, gate: { type: "string" } }, required: ["week", "title", "pods", "points", "gate"] } },
    compliance: { type: "object", additionalProperties: false, properties: { intro: { type: "string" }, points: { type: "array", items: { type: "string" } } }, required: ["intro", "points"] },
    investment: { type: "object", additionalProperties: false, properties: { tier_name: { type: "string" }, rate: { type: "string" }, engine_includes: { type: "array", items: { type: "string" } }, notes: { type: "array", items: { type: "string" } } }, required: ["tier_name", "rate", "engine_includes", "notes"] },
  },
  required: ["headline", "subhead", "exec_summary", "opportunity", "audience", "strategy", "market_intel", "channels", "pods", "funnel", "kpis", "rollout", "compliance", "investment"],
} as unknown as Anthropic.Tool["input_schema"];

function extract(msg: Anthropic.Message): ProposalContent | null {
  const b = msg.content.find((x) => x.type === "tool_use");
  return b && b.type === "tool_use" ? (b.input as ProposalContent) : null;
}

const SYSTEM = (clientName: string, objectiveLabel: string, tier: (typeof TIERS)[TierId]) =>
  `You are the lead growth strategist and media planner at GAS Marketing Automation, the Agency of NOW, writing a WORLD-CLASS, award-winning growth proposal for ${clientName} to sign off. Discipline: Human Command, AI Execution. This is a professional client-facing document; it must be specific, confident and demonstrably expert on every pod.\n\n` +
  `THE ENGINE (use these exact pod names, mapped to ${clientName}): Researcher, Strategist, Audience, Creative, Channels, PSI, PSI Conversion Dashboard, Media on GAS. It is one closed-loop engine: each pod feeds sharper intelligence to the next, and Media on GAS feeds every result back upstream so the system compounds and gets more intelligent over time.\n\n` +
  `THE OBJECTIVE for this proposal is ${objectiveLabel}. Make the WHOLE document specific to this objective, the audience, the channels, the KPIs, the rollout and the definition of success all flow from it.\n\n` +
  `THE TIER is ${tier.name} at ${tier.rate}. Investment scope: ${tier.scope} Governance: ${tier.cadence}\n\n` +
  `HARD RULES:\n` +
  `- GROUND IN THE FACTS. Use only the approved strategy and research facts provided. Never invent a fact, a name, a number or a market detail.\n` +
  `- USE RECENT MARKET DATA. Where the research gives current, relevant market or category statistics (size, growth, trends, consumer behaviour), weave them into the opportunity and executive summary to show we understand this market NOW, each with its date. Never use a stale or generic stat, and never fabricate one.\n` +
  `- MARKET INTELLIGENCE SECTION. Include a genuine market deep-dive: recent, dated, relevant stats and the opportunities the client should consider. INCLUDE non-digital opportunities (a category event like a major expo, a partnership, a retail or product angle) flagged as broader strategic considerations for them, not things we are committing to deliver. This proves deep industry knowledge and gives value beyond the digital pods. Draw it from the strategy's market opportunities and the research facts. Only real, sourced insights.\n` +
  `- NEVER COMMIT TO AN OUTCOME. No guaranteed conversion rates, lead volumes or returns anywhere. The funnel economics and any figure are ILLUSTRATIVE benchmarks, clearly labelled, never a promise.\n` +
  `- AUDIENCE IS THE PROOF OF OUR ABILITY, and it is the most important section. For each persona give ACTUAL, credible platform-level targeting selections on the platforms that genuinely fit them (from Facebook, Instagram, TikTok, Google Display, LinkedIn). Facebook/Instagram: interests, behaviours, demographics, custom + lookalike. TikTok: interests, hashtags, creator adjacencies. Google Display: in-market segments, custom-intent keywords, topics. LinkedIn: job titles, seniority, function, industry, company size. Be specific enough that a media buyer could build these audiences.\n` +
  `- CHANNELS: intelligently SELECT the platforms for this objective and audience and justify each, with a lead/support/test priority. Do not reflexively include every platform, choose where the value is.\n` +
  `- Map all EIGHT pods to ${clientName}, each specific to the objective.\n` +
  `- INVESTMENT: fill it fully. tier_name = "${tier.name}", rate = "${tier.rate}". In 'engine_includes' list 6 to 8 concrete things the engine delivers at this tier (the pods and what the tier covers, e.g. "Full omnichannel media across the selected platforms", "PSI qualification and the conversion dashboard"). In 'notes' put the honest commercial notes: media budget is the client's and additional to the retainer; the client owns all data, accounts and audiences; we do not quote a guaranteed return.\n` +
  `- Write in UK British English. Never use an em dash or en dash. Never use the word "manifesto". Confident, premium, concrete, no filler.`;

// Build the proposal content for an approved strategy, on the chosen objective + tier. Fable 5, retried on overload.
// notes/prior fold in a strategist's review comments so a rework improves the draft rather than starting cold.
export async function buildProposal(strategyId: string, input: { objective: ObjectiveId; tier: TierId; userEmail?: string | null; notes?: string; prior?: ProposalContent | null }): Promise<{ content: ProposalContent; clientId: string; engagementId: string; campaignId: string | null }> {
  const key = await getSecret("anthropic");
  if (!key) throw new Error("Claude isn't connected.");
  const srows = (await db().query(`select * from strategies where id = $1`, [strategyId])) as Strategy[];
  const strategy = srows[0];
  if (!strategy) throw new Error("That strategy was not found.");
  if (strategy.status !== "approved") throw new Error("Approve the strategy at Gate 2 before building the proposal.");
  const eng = (await db().query(`select client_id from engagements where id = $1`, [strategy.engagement_id])) as { client_id: string }[];
  const clientId = eng[0]?.client_id;
  const clientName = ((await db().query(`select name from clients where id = $1`, [clientId])) as { name: string }[])[0]?.name || "the client";
  const run = (await db().query(`select id from research_runs where client_id = $1 and status = 'gate1_approved' order by version desc limit 1`, [clientId])) as { id: string }[];
  const facts = run[0]
    ? (await db().query(`select section, subject, claim from research_claims where run_id = $1 and rejected = false and section <> 'unverified' and claim <> '' order by (tier is null), tier asc`, [run[0].id])) as { section: string; subject: string | null; claim: string }[]
    : [];

  const objective = OBJECTIVES.find((o) => o.id === input.objective) || OBJECTIVES[0];
  const tier = TIERS[input.tier] || TIERS.dominate;
  const client = new Anthropic({ apiKey: key });

  const factBlock = facts.slice(0, 160).map((f) => `- [${f.section}${f.subject ? `/${f.subject}` : ""}] ${f.claim}`).join("\n");
  const strat = strategy.content as StrategyContent | null;
  const priorBlock = input.prior ? `\n\nCURRENT DRAFT (improve this, do not start from scratch):\n${JSON.stringify(input.prior)}` : "";
  const notesBlock = input.notes?.trim() ? `\n\nSTRATEGIST REVIEW COMMENTS (a senior human, apply each precisely - this is the human gate):\n${input.notes.trim().slice(0, 3000)}` : "";
  const user =
    `CLIENT: ${clientName}\nOBJECTIVE: ${objective.label} (${objective.note})\nTIER: ${tier.name} at ${tier.rate}\n\n` +
    `THE APPROVED STRATEGY (the spine of this proposal):\n${JSON.stringify(strat)}\n\n` +
    `THE VERIFIED RESEARCH FACTS (ground the opportunity, audience and pods in these):\n${factBlock}${priorBlock}${notesBlock}\n\n` +
    `Write the full proposal via write_proposal. Make the audience and channels world-class and specific.`;

  const tool: Anthropic.Tool = { name: "write_proposal", description: "The complete, structured growth proposal.", input_schema: CONTENT_SCHEMA };
  const msg = await withAnthropicRetry(() => client.messages.stream({
    model: FABLE, max_tokens: 16000, system: SYSTEM(clientName, objective.label, tier),
    tools: [tool], tool_choice: { type: "tool", name: "write_proposal" },
    messages: [{ role: "user", content: user }],
  }).finalMessage());
  await meterClaude(msg, { clientId, userEmail: input.userEmail ?? null, model: FABLE, action: "proposal-build" }).catch(() => {});
  const content = extract(msg);
  if (!content) throw new Error("The proposal draft came back empty. Try again.");
  return { content, clientId, engagementId: strategy.engagement_id, campaignId: strategy.campaign_id };
}

// ── Persistence ──────────────────────────────────────────────────────────────────────────────────────────────
export type Proposal = {
  id: string; engagement_id: string; campaign_id: string | null; strategy_id: string | null;
  objective: string; tier: string; status: string; content: ProposalContent | null;
  pdf_url: string | null; approved_by: string | null; approved_at: string | null; created_at: string;
};

// Build + save a fresh proposal draft for an approved strategy.
export async function buildAndSaveProposal(strategyId: string, input: { objective: ObjectiveId; tier: TierId; userEmail?: string | null }): Promise<Proposal> {
  const { content, engagementId, campaignId } = await buildProposal(strategyId, input);
  const rows = (await db().query(
    `insert into proposals (engagement_id, campaign_id, strategy_id, objective, tier, status, content)
     values ($1,$2,$3,$4,$5,'awaiting_approval',$6) returning *`,
    [engagementId, campaignId, strategyId, input.objective, input.tier, JSON.stringify(content)],
  )) as Proposal[];
  return rows[0];
}

// The latest proposal for a strategy (any status), for the builder surface.
export async function latestProposalForStrategy(strategyId: string): Promise<Proposal | null> {
  const rows = (await db().query(`select * from proposals where strategy_id = $1 order by created_at desc limit 1`, [strategyId])) as Proposal[];
  return rows[0] || null;
}

// THE COMMENT GATE (Human Command). The senior strategist reviews the draft and sends it back with comments; the
// proposal is regenerated in place, folding the comments in, still awaiting approval. A new PDF must be re-cut after.
export async function refineProposal(proposalId: string, comments: string, userEmail?: string | null): Promise<Proposal> {
  const rows = (await db().query(`select * from proposals where id = $1`, [proposalId])) as Proposal[];
  const cur = rows[0];
  if (!cur) throw new Error("That proposal was not found.");
  if (cur.status === "approved") throw new Error("That proposal is approved. Reopen it to make changes.");
  if (!cur.strategy_id) throw new Error("This proposal has no strategy to rebuild from.");
  const { content } = await buildProposal(cur.strategy_id, {
    objective: cur.objective as ObjectiveId, tier: cur.tier as TierId,
    userEmail, notes: comments, prior: cur.content,
  });
  const upd = (await db().query(
    `update proposals set content = $2, status = 'awaiting_approval', pdf_url = null where id = $1 returning *`,
    [proposalId, JSON.stringify(content)],
  )) as Proposal[];
  return upd[0];
}

// APPROVE the proposal (the gate before the final cut). Only an approved proposal can render the final PDF.
export async function approveProposal(proposalId: string, approvedBy: string): Promise<Proposal | null> {
  const rows = (await db().query(
    `update proposals set status = 'approved', approved_by = $2, approved_at = now() where id = $1 and status = 'awaiting_approval' returning *`,
    [proposalId, approvedBy],
  )) as Proposal[];
  return rows[0] || null;
}

// Reopen an approved proposal for further edits.
export async function reopenProposal(proposalId: string): Promise<void> {
  await db().query(`update proposals set status = 'awaiting_approval', approved_by = null, approved_at = null where id = $1`, [proposalId]);
}
