import Anthropic from "@anthropic-ai/sdk";
import { getSecret } from "./connections";
import { db } from "./db";
import { OPUS5, withAnthropicRetry } from "./vendors/anthropic";
import { meterClaude } from "./usage";
import {
  ensureEngagement, createCampaign, openCycle, setCycleStatus, createStrategyDraft,
  STRATEGY_CONTENT_SCHEMA, type StrategyContent, type Strategy,
} from "./cycle";

// THE STRATEGIST ENGINE (Pillar II) - Phase C (thin). It receives the Researcher's VERIFIED fact base and turns it
// into a single-minded, defensible commercial strategy: the structured brief every downstream pillar inherits.
// Human Command, AI Execution - the AI drafts and red-teams, a senior human approves at Gate 2 (and may refine
// with notes first). It NEVER invents facts: every strategic point cites a fact from the base or is dropped; a
// missing input is named as a risk, not guessed. The Proposal (next step) will run from an approved strategy in
// this same POD.

type ClaimLite = { id: string; section: string; subject: string | null; claim: string; source_url: string | null; tier: number | null };

// The latest APPROVED research (Gate 1) for the client, and its facts - the only base the Strategist may reason from.
async function latestApprovedFacts(clientId: string): Promise<{ runId: string | null; claims: ClaimLite[]; clientName: string }> {
  const cr = (await db().query(`select name from clients where id = $1`, [clientId])) as { name: string }[];
  const clientName = cr[0]?.name || "the client";
  const runs = (await db().query(
    `select id from research_runs where client_id = $1 and status = 'gate1_approved' order by version desc limit 1`, [clientId],
  )) as { id: string }[];
  const runId = runs[0]?.id ?? null;
  if (!runId) return { runId: null, claims: [], clientName };
  const claims = (await db().query(
    `select id, section, subject, claim, source_url, tier from research_claims
     where run_id = $1 and rejected = false and section <> 'unverified' and section <> 'gaps' and claim <> ''
     order by (tier is null), tier asc, section`, [runId],
  )) as ClaimLite[];
  return { runId, claims, clientName };
}

const STRATEGIST_SYSTEM = (clientName: string) =>
  `You are the Strategist at GAS Marketing Automation, the Agency of NOW. Discipline: Human Command, AI Execution. ` +
  `You receive a VERIFIED fact base on ${clientName} from the Researcher and turn it into ONE coherent commercial strategy, ` +
  `the brief every downstream pillar (audience, creative, channels, qualification, optimisation) will execute against.\n\n` +
  `HARD RULES:\n` +
  `- SINGLE-MINDED. One proposition, never a menu. A strategy that tries to be everything to everyone is not a strategy.\n` +
  `- DECISION-FORCING. Recommend and commit; do not survey options. Say what to do and what to leave alone.\n` +
  `- GROUNDED. Every point in 'rationale' MUST cite a fact by its Fn tag from the base below. If you cannot ground a ` +
  `point in a cited fact, drop it. Never invent a fact, a number, a name or a market detail.\n` +
  `- HONEST ABOUT GAPS. Where the fact base lacks something the strategy needs, put it in 'risks' as an assumption to ` +
  `confirm, never a confident guess.\n` +
  `- MEASURABLE. Give KPIs with a baseline each (use the fact base where it gives one; else say 'to baseline'), and a ` +
  `real pre-mortem in 'risks' (what would make this fail).\n` +
  `- AUDIENCE BLUEPRINT (this is the proof of our targeting ability, and it goes into the client proposal). Define 3 ` +
  `to 5 sharp target personas. For each: the life-moment or buying TRIGGER that puts them in-market, the client ` +
  `product/NEED it maps to, WHO they are (South African demographics + geography), the intent/interest SIGNALS we ` +
  `target on (behavioural, contextual, life-event, search), WHY they convert (propensity), the message ANGLE for ` +
  `them, and an INDICATIVE scale. Ground each persona in the customer/audience/market facts and cite the Fn in ` +
  `its fact_id. Make these specific and evidenced, not generic, this is what shows the client our data ability.\n` +
  `- MARKET OPPORTUNITIES (the deep industry-knowledge layer). Surface 3 to 6 real market opportunities and insights ${clientName} should consider, grounded in the market/activity facts (cite the Fn). INCLUDE opportunities BEYOND digital marketing (set digital:false), a category event, a partnership, a retail or product angle, a gap a competitor has left. This shows we see the whole board and understand the industry, not just the ad account. Never invent one; only real, sourced opportunities.\n` +
  `- NEVER COMMIT TO AN OUTCOME. Do not promise conversion rates, lead volumes, a return, or a guaranteed result, ` +
  `anywhere. 'scale' and any figure are INDICATIVE only and must read as illustrative. We define who and how we ` +
  `reach and how we measure, never what we guarantee.\n` +
  `- Fill 'changes_from_last' ONLY when refining an existing strategy; otherwise return an empty array.\n` +
  `- UK British English. Never use an em dash or en dash: use a comma, a full stop or a plain hyphen.`;

function extractContent(msg: Anthropic.Message): StrategyContent | null {
  const b = msg.content.find((x) => x.type === "tool_use");
  return b && b.type === "tool_use" ? (b.input as StrategyContent) : null;
}

// SANITISE THE MODEL OUTPUT TO THE SCHEMA before it is ever stored. The write_strategy tool has a strict schema,
// but the model occasionally returns a string where an array is expected (MoMo came back with kpis, risks and
// channel_logic as strings), which then white-screened the render. Coerce EVERY field to its declared shape here
// so a malformed strategy can never be persisted - the store, the render and the proposal all get clean data.
const sStr = (v: unknown): string => (typeof v === "string" ? v : "");
const sRec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const sStrArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : (typeof v === "string" && v.trim() ? [v] : []);
const sObjArr = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x)) : [];
const sFactId = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

function normalizeStrategyContent(raw: unknown): StrategyContent {
  const c = sRec(raw);
  const target = sRec(c.target), positioning = sRec(c.positioning), audience = sRec(c.audience), objective = sRec(c.objective);
  return {
    proposition: sStr(c.proposition),
    target: { segment: sStr(target.segment), insight: sStr(target.insight) },
    audience: {
      overview: sStr(audience.overview),
      personas: sObjArr(audience.personas).map((p) => ({
        label: sStr(p.label), trigger: sStr(p.trigger), need: sStr(p.need), who: sStr(p.who),
        signals: sStrArr(p.signals), propensity: sStr(p.propensity), angle: sStr(p.angle), scale: sStr(p.scale),
        fact_id: sFactId(p.fact_id),
      })),
    },
    positioning: { promise: sStr(positioning.promise), usps: sStrArr(positioning.usps) },
    angle: sStr(c.angle),
    message_hierarchy: sStrArr(c.message_hierarchy),
    channel_logic: sObjArr(c.channel_logic).map((x) => ({ channel: sStr(x.channel), role: sStr(x.role) })),
    objective: { type: sStr(objective.type), target: sStr(objective.target) },
    kpis: sObjArr(c.kpis).map((x) => ({ metric: sStr(x.metric), target: sStr(x.target), baseline: sStr(x.baseline) })),
    sales_ready_def: sStr(c.sales_ready_def),
    rationale: sObjArr(c.rationale).map((x) => ({ point: sStr(x.point), fact_id: sFactId(x.fact_id) })),
    market_opportunities: sObjArr(c.market_opportunities).map((x) => ({ insight: sStr(x.insight), why_it_matters: sStr(x.why_it_matters), digital: !!x.digital, fact_id: sFactId(x.fact_id) })),
    risks: sStrArr(c.risks),
    changes_from_last: sObjArr(c.changes_from_last).map((x) => ({ change: sStr(x.change), because: sStr(x.because) })),
  };
}

// Map the model's "Fn" citations back to real research_claim ids, so rationale and personas are traceable to the
// fact store.
function resolveFactIds(content: StrategyContent, claims: ClaimLite[]): StrategyContent {
  const toId = (fid: string | null | undefined): string | null => {
    const m = String(fid ?? "").match(/F?(\d+)/i);
    const idx = m ? Number(m[1]) - 1 : -1;
    return idx >= 0 && idx < claims.length ? claims[idx].id : null;
  };
  const rationale = (Array.isArray(content.rationale) ? content.rationale : []).map((r) => ({ point: String(r.point || ""), fact_id: toId(r.fact_id) }));
  const market_opportunities = (Array.isArray(content.market_opportunities) ? content.market_opportunities : []).map((m) => ({ ...m, fact_id: toId(m.fact_id) }));
  const audience = content.audience
    ? { overview: String(content.audience.overview || ""), personas: (Array.isArray(content.audience.personas) ? content.audience.personas : []).map((p) => ({ ...p, fact_id: toId(p.fact_id) })) }
    : content.audience;
  return { ...content, rationale, market_opportunities, audience };
}

// Generate (or refine) strategy content from the approved fact base. `notes` folds in the team's edit direction;
// `prior` is the current strategy being refined (so the model improves it rather than starting cold).
async function generateStrategyContent(
  clientId: string, objective: string, opts: { notes?: string; prior?: StrategyContent | null; userEmail?: string | null } = {},
): Promise<{ content: StrategyContent; runId: string; clientName: string }> {
  const key = await getSecret("anthropic");
  if (!key) throw new Error("Claude isn't connected.");
  const { runId, claims, clientName } = await latestApprovedFacts(clientId);
  if (!runId || !claims.length) throw new Error("No approved research yet. Run the Researcher and approve it at Gate 1 first.");
  const client = new Anthropic({ apiKey: key });

  const legend = claims.map((c, i) => `F${i + 1} [${c.section}${c.subject ? `/${c.subject}` : ""}] ${c.claim}${c.source_url ? " (sourced)" : ""}`).join("\n");
  const priorBlock = opts.prior ? `\n\nCURRENT STRATEGY (improve this, do not start from scratch):\n${JSON.stringify(opts.prior)}` : "";
  const notesBlock = opts.notes?.trim() ? `\n\nTEAM DIRECTION (apply precisely, and record each material change in 'changes_from_last'):\n${opts.notes.trim().slice(0, 2000)}` : "";
  const user =
    `OBJECTIVE FOR THIS STRATEGY: ${objective}\n\n` +
    `THE VERIFIED FACT BASE (cite facts as their Fn tag in every rationale point):\n${legend}${priorBlock}${notesBlock}`;

  const SCHEMA = STRATEGY_CONTENT_SCHEMA as unknown as Anthropic.Tool["input_schema"];
  const tool: Anthropic.Tool = { name: "write_strategy", description: "The single, structured commercial strategy.", input_schema: SCHEMA };

  // 1) DRAFT. Retried on a transient Anthropic overload (529) / rate limit.
  const draftMsg = await withAnthropicRetry(() => client.messages.stream({
    model: OPUS5, max_tokens: 12000, system: STRATEGIST_SYSTEM(clientName),
    tools: [tool], tool_choice: { type: "tool", name: "write_strategy" },
    messages: [{ role: "user", content: user }],
  }).finalMessage());
  await meterClaude(draftMsg, { clientId, userEmail: opts.userEmail ?? null, model: OPUS5, action: "strategy-build" }).catch(() => {});
  let content = extractContent(draftMsg);
  if (!content) throw new Error("The Strategist returned nothing. Try again.");

  // 2) ADVERSARIAL RED-TEAM. A ruthless strategy director kills any point not grounded in a cited fact, forces a
  //    single proposition, and hardens the KPIs and pre-mortem. This is what turns "plausible" into "defensible".
  try {
    const advMsg = await withAnthropicRetry(() => client.messages.stream({
      model: OPUS5, max_tokens: 12000,
      system: `You are a ruthless strategy director red-teaming a draft strategy for ${clientName} before it reaches the board. ` +
        `Kill any claim not grounded in a cited Fn fact. Force it to ONE single-minded proposition. Make it decision-forcing, ` +
        `not a survey. Ensure every KPI has a baseline and the pre-mortem names the real ways it could fail. Do NOT invent facts. ` +
        `Return the IMPROVED strategy via write_strategy. UK English, no em dashes.`,
      tools: [tool], tool_choice: { type: "tool", name: "write_strategy" },
      messages: [{ role: "user", content: `Fact base:\n${legend}\n\nDraft strategy to red-team and improve:\n${JSON.stringify(content)}` }],
    }).finalMessage());
    await meterClaude(advMsg, { clientId, userEmail: opts.userEmail ?? null, model: OPUS5, action: "strategy-refine" }).catch(() => {});
    content = extractContent(advMsg) || content;
  } catch { /* red-team is best-effort; the draft still stands */ }

  // Normalise to the schema BEFORE storing (kills the malformed-field crash at the source), then resolve fact ids.
  return { content: resolveFactIds(normalizeStrategyContent(content), claims), runId, clientName };
}

// BUILD a fresh strategy: spins up the engagement (if first time), a campaign for this objective, a foundation
// cycle, and the strategy draft (awaiting Gate 2). Demonstrates Research -> Strategy end to end.
export async function buildStrategy(clientId: string, input: { name: string; objective: string; userEmail?: string | null }): Promise<{ strategy: Strategy; campaignId: string; engagementId: string; runId: string }> {
  const { content, runId } = await generateStrategyContent(clientId, input.objective, { userEmail: input.userEmail });
  const eng = await ensureEngagement(clientId);
  const campaign = await createCampaign(eng.id, input.name || input.objective.slice(0, 80), { objective: input.objective });
  const cycle = await openCycle(eng.id, "foundation", { campaignId: campaign.id, openedBy: input.userEmail ?? null });
  await setCycleStatus(cycle.id, "strategising", { researchRunId: runId });
  const strategy = await createStrategyDraft({ engagementId: eng.id, campaignId: campaign.id, cycleId: cycle.id, level: "campaign", mode: "foundation", content });
  await setCycleStatus(cycle.id, "awaiting_gate", { strategyId: strategy.id });
  return { strategy, campaignId: campaign.id, engagementId: eng.id, runId };
}

// REFINE an existing draft with the team's notes (Human Command: "edit if needed"), in place, still awaiting Gate 2.
export async function refineStrategy(strategyId: string, notes: string, userEmail?: string | null): Promise<Strategy> {
  const rows = (await db().query(`select * from strategies where id = $1`, [strategyId])) as Strategy[];
  const cur = rows[0];
  if (!cur) throw new Error("That strategy was not found.");
  if (cur.status === "approved" || cur.status === "superseded") throw new Error("That strategy is locked. Build a new version instead.");
  const objective = (await db().query(`select objective from campaigns where id = $1`, [cur.campaign_id]) as { objective: string | null }[])[0]?.objective || "";
  const { content } = await generateStrategyContent(cur.engagement_id, objective, { notes, prior: cur.content, userEmail });
  const upd = (await db().query(
    `update strategies set content = $2, status = 'awaiting_approval' where id = $1 returning *`,
    [strategyId, JSON.stringify(content)],
  )) as Strategy[];
  return upd[0];
}

// Reopen an APPROVED strategy for another round of edits (Gary: "reopen to refine"). It flips the status back to
// awaiting_approval so the Gate 2 surface's per-section refine + approve controls apply again; the content is
// untouched until the team actually refines, and re-approving re-locks it. A superseded strategy stays locked -
// build a fresh one. NOTE: the proposal was built from this strategy, so after changing it the team should rebuild
// the proposal from the re-approved version.
export async function reopenStrategy(strategyId: string): Promise<Strategy> {
  const rows = (await db().query(`select * from strategies where id = $1`, [strategyId])) as Strategy[];
  const cur = rows[0];
  if (!cur) throw new Error("That strategy was not found.");
  if (cur.status === "awaiting_approval") return cur;   // already open for edits
  if (cur.status !== "approved") throw new Error("Only an approved strategy can be reopened. Build a new version instead.");
  const upd = (await db().query(`update strategies set status = 'awaiting_approval' where id = $1 returning *`, [strategyId])) as Strategy[];
  return upd[0];
}

// The latest strategy for a client (any status), with its campaign objective, for the Gate 2 surface.
export async function latestStrategyForClient(clientId: string): Promise<{ strategy: Strategy | null; objective: string | null; hasApprovedResearch: boolean }> {
  const eng = (await db().query(`select id from engagements where client_id = $1 order by created_at asc limit 1`, [clientId])) as { id: string }[];
  const approved = (await db().query(`select 1 from research_runs where client_id = $1 and status = 'gate1_approved' limit 1`, [clientId])) as unknown[];
  const hasApprovedResearch = approved.length > 0;
  if (!eng[0]) return { strategy: null, objective: null, hasApprovedResearch };
  const rows = (await db().query(
    `select * from strategies where engagement_id = $1 order by created_at desc limit 1`, [eng[0].id],
  )) as Strategy[];
  const strategy = rows[0] || null;
  let objective: string | null = null;
  if (strategy?.campaign_id) objective = (await db().query(`select objective from campaigns where id = $1`, [strategy.campaign_id]) as { objective: string | null }[])[0]?.objective ?? null;
  return { strategy, objective, hasApprovedResearch };
}
