import { db } from "./db";

// THE INTELLIGENCE LAYER CYCLE (Agency of NOW · Pillars I + II) - Phase A: the spine + contracts.
//
// The ecosystem is a CLOSED LOOP, so the value is in the hand-offs, not any single pillar. This file is the
// ecosystem's internal API in code: the object shapes the Researcher (I) fills, the Strategist (II) emits, and the
// downstream pillars (III-VIII) will one day execute against and feed back into. Phase A ships the tables and
// these contracts ONLY - no flow is wired yet - so the Delta research, the Strategist engine, Gate 2 and the
// Optimise/Pivot cycles (later phases) all have one agreed spine to build on.
//
// PERSISTENCE HIERARCHY (what carries forward vs resets):
//   engagement/brain  persists forever, compounds, serves all 8 pillars
//     campaign         one product/range/objective push (a PIVOT is a NEW campaign)
//       cycle          one round through the loop (an OPTIMISE is a NEW cycle on the same campaign)

// ── Enumerations ─────────────────────────────────────────────────────────────────────────────────────────────
export type CycleMode = "foundation" | "optimise" | "pivot" | "refresh";
export type RunMode = "foundation" | "delta";
export type StrategyLevel = "engagement" | "campaign";
export type StrategyStatus = "draft" | "awaiting_approval" | "approved" | "superseded";
export type SignalLever = "audience" | "creative" | "channel" | "offer" | "message";
export type SignalSource = "psi" | "media" | "lead_mgmt" | "manual";

// The downstream pillars a research fact can be tagged for, so Audience/Creative/PSI later pull their own slice.
export const PILLAR_TAGS = ["strategist", "audience", "creative", "channels", "psi", "sales"] as const;
export type PillarTag = (typeof PILLAR_TAGS)[number];

// ── THE STRATEGY CONTRACT (the brief every downstream pillar inherits) ────────────────────────────────────────
// This is the single most important shape in the ecosystem: each downstream pillar reads the field that is theirs
// (target -> Audience III, angle/message -> Creative IV, channel_logic -> Channels V, kpis -> Optimisation VIII,
// sales_ready_def -> PSI VI / Lead Mgmt VII). Every strategic point traces to a fact_id, so it is defensible.
// One target persona in the Audience Blueprint. This is the PROOF of GAS's targeting ability that goes into the
// proposal - it defines WHO to reach and HOW, never a promised outcome. `scale` is indicative only (Gary: no
// commitment on actual outcomes). When Pillar III (Audience Intelligence) is built, it inherits this shape.
export type AudiencePersona = {
  label: string;          // e.g. "New-parent protectors"
  trigger: string;        // the life-moment / buying trigger that puts them in-market
  need: string;           // the client product/need this persona maps to
  who: string;            // demographics + geography (SA-specific)
  signals: string[];      // the intent/interest signals we target on (behavioural, contextual, life-event, search)
  propensity: string;     // why they convert (the rationale)
  angle: string;          // the message hook for this persona
  scale: string;          // INDICATIVE reach only - qualitative or clearly illustrative, never a guaranteed number
  fact_id: string | null; // traced to a research fact where grounded
};

export type StrategyContent = {
  proposition: string;                                        // the single-minded core idea
  target: { segment: string; insight: string };              // -> Audience (III)
  audience: { overview: string; personas: AudiencePersona[] };// the Audience Blueprint (proof of targeting) -> proposal + Audience (III)
  positioning: { promise: string; usps: string[] };          // durable, engagement-level
  angle: string;                                             // the strategic wedge -> Creative (IV)
  message_hierarchy: string[];                               // primary / support / proof -> Creative (IV)
  channel_logic: { channel: string; role: string }[];        // -> Channels (V)
  objective: { type: string; target: string };
  kpis: { metric: string; target: string; baseline: string }[];   // the measurement contract -> Optimisation (VIII)
  sales_ready_def: string;                                   // -> PSI (VI) / Lead Mgmt (VII)
  rationale: { point: string; fact_id: string | null }[];    // every claim traced to a fact
  // Market opportunities the client should consider, INCLUDING ones beyond digital (digital:false) - the deep
  // industry-knowledge layer that shows GAS sees the whole board. Flows into the proposal's market intelligence.
  market_opportunities: { insight: string; why_it_matters: string; digital: boolean; fact_id: string | null }[];
  risks: string[];                                           // the pre-mortem
  changes_from_last: { change: string; because: string }[];  // OPTIMISE mode only: what we are changing and why
};

// The JSON Schema for the Strategist's forced tool call (Phase C). Kept beside the TS type so the two never drift.
export const STRATEGY_CONTENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    proposition: { type: "string", description: "The single-minded core idea. One proposition, never a menu." },
    target: { type: "object", additionalProperties: false, properties: { segment: { type: "string" }, insight: { type: "string" } }, required: ["segment", "insight"] },
    audience: {
      type: "object", additionalProperties: false,
      description: "The Audience Blueprint: proof of our targeting ability. Defines WHO and HOW we reach, never a promised outcome.",
      properties: {
        overview: { type: "string", description: "The targeting thesis in one short paragraph: who to reach and why." },
        personas: {
          type: "array", description: "3 to 5 sharp target personas.",
          items: {
            type: "object", additionalProperties: false,
            properties: {
              label: { type: "string" },
              trigger: { type: "string", description: "the life-moment or buying trigger that puts them in-market" },
              need: { type: "string", description: "the client product/need this persona maps to" },
              who: { type: "string", description: "demographics + geography, South Africa-specific" },
              signals: { type: "array", items: { type: "string" }, description: "the intent/interest signals we target on" },
              propensity: { type: "string", description: "why they convert" },
              angle: { type: "string", description: "the message hook for this persona" },
              scale: { type: "string", description: "INDICATIVE reach only, qualitative or clearly illustrative. Never a guaranteed number." },
              fact_id: { type: ["string", "null"], description: "the Fn fact grounding this persona, or null." },
            },
            required: ["label", "trigger", "need", "who", "signals", "propensity", "angle", "scale", "fact_id"],
          },
        },
      },
      required: ["overview", "personas"],
    },
    positioning: { type: "object", additionalProperties: false, properties: { promise: { type: "string" }, usps: { type: "array", items: { type: "string" } } }, required: ["promise", "usps"] },
    angle: { type: "string", description: "The strategic wedge the creative is built from." },
    message_hierarchy: { type: "array", items: { type: "string" }, description: "Primary, support, proof - in order." },
    channel_logic: { type: "array", items: { type: "object", additionalProperties: false, properties: { channel: { type: "string" }, role: { type: "string" } }, required: ["channel", "role"] } },
    objective: { type: "object", additionalProperties: false, properties: { type: { type: "string" }, target: { type: "string" } }, required: ["type", "target"] },
    kpis: { type: "array", items: { type: "object", additionalProperties: false, properties: { metric: { type: "string" }, target: { type: "string" }, baseline: { type: "string" } }, required: ["metric", "target", "baseline"] } },
    sales_ready_def: { type: "string", description: "What 'sales-ready' means for this client." },
    rationale: { type: "array", items: { type: "object", additionalProperties: false, properties: { point: { type: "string" }, fact_id: { type: ["string", "null"] } }, required: ["point", "fact_id"] }, description: "Every strategic point traced to a research fact id." },
    market_opportunities: {
      type: "array",
      description: "Market opportunities and industry insights the client should consider, INCLUDING ones beyond digital (set digital:false). The deep industry-knowledge layer. Grounded in the facts, never invented.",
      items: { type: "object", additionalProperties: false, properties: {
        insight: { type: "string" }, why_it_matters: { type: "string" },
        digital: { type: "boolean", description: "true if this is something GAS's pods deliver; false if it is a broader strategic consideration beyond our digital scope." },
        fact_id: { type: ["string", "null"] },
      }, required: ["insight", "why_it_matters", "digital", "fact_id"] },
    },
    risks: { type: "array", items: { type: "string" }, description: "The pre-mortem: what could make this fail." },
    changes_from_last: { type: "array", items: { type: "object", additionalProperties: false, properties: { change: { type: "string" }, because: { type: "string" } }, required: ["change", "because"] }, description: "OPTIMISE mode only: each change and the signal/fact behind it." },
  },
  required: ["proposition", "target", "audience", "positioning", "angle", "message_hierarchy", "channel_logic", "objective", "kpis", "sales_ready_def", "rationale", "market_opportunities", "risks", "changes_from_last"],
} as const;

// ── Row types ────────────────────────────────────────────────────────────────────────────────────────────────
export type Engagement = {
  id: string; client_id: string; status: string;
  positioning: unknown; kpis: unknown; baseline: unknown; roadmap: unknown;
  sales_ready_def: string | null; current_eng_strategy_id: string | null;
  created_at: string; updated_at: string;
};
export type Campaign = {
  id: string; engagement_id: string; name: string; product: string | null; objective: string | null;
  status: string; current_strategy_id: string | null; created_at: string;
};
export type Cycle = {
  id: string; engagement_id: string; campaign_id: string | null; mode: CycleMode; trigger: string;
  status: string; research_run_id: string | null; strategy_id: string | null;
  opened_by: string | null; opened_at: string; closed_at: string | null;
};
export type Strategy = {
  id: string; engagement_id: string; campaign_id: string | null; cycle_id: string | null;
  level: StrategyLevel; mode: string; version: number; status: StrategyStatus;
  content: StrategyContent | null; approved_by: string | null; approved_at: string | null; created_at: string;
};
export type PerformanceSignal = {
  id: string; engagement_id: string; campaign_id: string | null; source: SignalSource;
  metric: string; direction: string | null; magnitude: string | null; confidence: string | null;
  lever: string | null; note: string | null; observed_at: string | null;
  consumed_by_cycle_id: string | null; created_at: string;
};

// ── Helpers (ready for Phases B-E; nothing is wired into an existing flow yet) ────────────────────────────────

/** The client's engagement, creating it if this is the first cycle. A client always has exactly one engagement. */
export async function ensureEngagement(clientId: string): Promise<Engagement> {
  const found = (await db().query(`select * from engagements where client_id = $1 order by created_at asc limit 1`, [clientId])) as Engagement[];
  if (found[0]) return found[0];
  const rows = (await db().query(`insert into engagements (client_id) values ($1) returning *`, [clientId])) as Engagement[];
  return rows[0];
}

export async function getEngagement(id: string): Promise<Engagement | null> {
  const rows = (await db().query(`select * from engagements where id = $1`, [id])) as Engagement[];
  return rows[0] || null;
}

export async function listCampaigns(engagementId: string): Promise<Campaign[]> {
  return (await db().query(`select * from campaigns where engagement_id = $1 order by created_at desc`, [engagementId])) as Campaign[];
}

export async function createCampaign(engagementId: string, name: string, opts: { product?: string; objective?: string } = {}): Promise<Campaign> {
  const rows = (await db().query(
    `insert into campaigns (engagement_id, name, product, objective) values ($1,$2,$3,$4) returning *`,
    [engagementId, name.slice(0, 200), opts.product ?? null, opts.objective ?? null],
  )) as Campaign[];
  return rows[0];
}

/** Open a cycle - one round through the loop. Mode picks the depth and inputs (foundation/optimise/pivot/refresh). */
export async function openCycle(engagementId: string, mode: CycleMode, opts: { campaignId?: string | null; trigger?: string; openedBy?: string | null } = {}): Promise<Cycle> {
  const rows = (await db().query(
    `insert into cycles (engagement_id, campaign_id, mode, trigger, opened_by) values ($1,$2,$3,$4,$5) returning *`,
    [engagementId, opts.campaignId ?? null, mode, opts.trigger ?? "manual", opts.openedBy ?? null],
  )) as Cycle[];
  return rows[0];
}

export async function setCycleStatus(cycleId: string, status: Cycle["status"], patch: { researchRunId?: string; strategyId?: string; close?: boolean } = {}): Promise<void> {
  await db().query(
    `update cycles set status = $2,
       research_run_id = coalesce($3, research_run_id),
       strategy_id = coalesce($4, strategy_id),
       closed_at = case when $5 then now() else closed_at end
     where id = $1`,
    [cycleId, status, patch.researchRunId ?? null, patch.strategyId ?? null, !!patch.close],
  );
}

/** The next version number for a strategy at a given level within an engagement (campaign-scoped when given). */
async function nextStrategyVersion(engagementId: string, level: StrategyLevel, campaignId: string | null): Promise<number> {
  const rows = (await db().query(
    `select coalesce(max(version),0)+1 as v from strategies where engagement_id = $1 and level = $2 and campaign_id is not distinct from $3`,
    [engagementId, level, campaignId],
  )) as { v: number }[];
  return Number(rows[0]?.v) || 1;
}

export async function createStrategyDraft(input: { engagementId: string; campaignId: string | null; cycleId: string | null; level: StrategyLevel; mode: string; content: StrategyContent }): Promise<Strategy> {
  const version = await nextStrategyVersion(input.engagementId, input.level, input.campaignId);
  const rows = (await db().query(
    `insert into strategies (engagement_id, campaign_id, cycle_id, level, mode, version, status, content)
     values ($1,$2,$3,$4,$5,$6,'awaiting_approval',$7) returning *`,
    [input.engagementId, input.campaignId, input.cycleId, input.level, input.mode, version, JSON.stringify(input.content)],
  )) as Strategy[];
  return rows[0];
}

/** GATE 2 (direction). Approving supersedes the prior current strategy at the same level and points the parent at it. */
export async function approveStrategy(strategyId: string, approvedBy: string): Promise<Strategy | null> {
  const rows = (await db().query(
    `update strategies set status = 'approved', approved_by = $2, approved_at = now() where id = $1 and status = 'awaiting_approval' returning *`,
    [strategyId, approvedBy],
  )) as Strategy[];
  const s = rows[0];
  if (!s) return null;
  // Supersede older approved strategies at the same level/scope, then point the parent (engagement or campaign) here.
  await db().query(
    `update strategies set status = 'superseded'
     where engagement_id = $1 and level = $2 and campaign_id is not distinct from $3 and id <> $4 and status = 'approved'`,
    [s.engagement_id, s.level, s.campaign_id, s.id],
  );
  if (s.level === "engagement") {
    await db().query(`update engagements set current_eng_strategy_id = $2, updated_at = now() where id = $1`, [s.engagement_id, s.id]);
  } else if (s.campaign_id) {
    await db().query(`update campaigns set current_strategy_id = $2 where id = $1`, [s.campaign_id, s.id]);
  }
  return s;
}

/** Log a performance signal. source=manual now (typed by the team); PSI/Media auto-write the same shape later. */
export async function logSignal(input: { engagementId: string; campaignId: string | null; metric: string; source?: SignalSource; direction?: string; magnitude?: string; confidence?: string; lever?: SignalLever; note?: string; observedAt?: string | null }): Promise<PerformanceSignal> {
  const rows = (await db().query(
    `insert into performance_signals (engagement_id, campaign_id, source, metric, direction, magnitude, confidence, lever, note, observed_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
    [input.engagementId, input.campaignId ?? null, input.source ?? "manual", input.metric.slice(0, 200), input.direction ?? null, input.magnitude ?? null, input.confidence ?? null, input.lever ?? null, input.note ?? null, input.observedAt ?? null],
  )) as PerformanceSignal[];
  return rows[0];
}

/** Signals not yet consumed by an optimise cycle - what the Strategist reads to recommend the next round. */
export async function unconsumedSignals(engagementId: string, campaignId?: string | null): Promise<PerformanceSignal[]> {
  if (campaignId) {
    return (await db().query(
      `select * from performance_signals where engagement_id = $1 and campaign_id = $2 and consumed_by_cycle_id is null order by created_at desc`,
      [engagementId, campaignId],
    )) as PerformanceSignal[];
  }
  return (await db().query(
    `select * from performance_signals where engagement_id = $1 and consumed_by_cycle_id is null order by created_at desc`,
    [engagementId],
  )) as PerformanceSignal[];
}

/** Mark the signals a cycle acted on, so the next optimise round only sees genuinely new feedback. */
export async function consumeSignals(cycleId: string, signalIds: string[]): Promise<void> {
  if (!signalIds.length) return;
  await db().query(`update performance_signals set consumed_by_cycle_id = $1 where id = any($2::uuid[])`, [cycleId, signalIds]);
}
