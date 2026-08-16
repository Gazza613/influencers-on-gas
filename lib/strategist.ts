import Anthropic from "@anthropic-ai/sdk";
import { getSecret } from "./connections";
import { db } from "./db";
import { OPUS5, withAnthropicRetry } from "./vendors/anthropic";
import { meterClaude } from "./usage";
import {
  ensureEngagement, createCampaign, openCycle, setCycleStatus, createStrategyDraft,
  STRATEGY_CONTENT_SCHEMA, type StrategyContent, type Strategy,
} from "./cycle";
import { inngest } from "./inngest";
import { WRITING_STYLE } from "./writing-style";

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
  `You are the Strategist at GAS Marketing Automation, the Agency of NOW: a TOP 1% PERFORMANCE-MARKETING STRATEGIST, ` +
  `the calibre who has planned and scaled customer acquisition for serious brands. You think natively in acquisition ` +
  `economics (cost per qualified lead, payback, what compounds), in the REAL buying journey (where purchase intent ` +
  `actually forms and what stalls it), in channel and media strategy (which platforms earn budget and why, how spend ` +
  `behaves), in creative strategy (what makes performance creative convert), in audience signal, and in measurement. ` +
  `You receive a VERIFIED fact base on ${clientName} from the Researcher and turn it into ONE coherent commercial ` +
  `strategy, the brief every downstream pillar (audience, creative, channels, qualification, optimisation) executes ` +
  `against. This is the backbone of the agency; junior work is not acceptable here.\n\n` +
  `WHAT MAKES THIS EXPERT, NOT JUNIOR (hold this bar on every line):\n` +
  `- LEAD WITH A REAL INSIGHT. The strategy must carry a genuine, non-obvious insight drawn from the facts: the "so what" ${clientName}'s own team would not have articulated, the lever no competitor has pulled. Restating facts, or a generic "be more digital / tell your story / build a funnel", is a junior failure.\n` +
  `- REASON FROM MECHANICS, NOT ADJECTIVES. Explain WHY each move works in performance terms: how it lowers acquisition cost, raises purchase intent, lifts average order value, or compounds over time. "World-class creative" and "engaging content" are not reasons; a mechanism is.\n` +
  `- CATEGORY FLUENCY. Reason like someone who knows how THIS category actually buys and sells: its margin structure, the real objections, the seasonality, the substitutes, the decision timeline. Show you understand the business, not just the ad account.\n` +
  `- COMMERCIAL ACUMEN. Name the real commercial lever (pricing power, basket size, margin, repeat rate, payback), not merely a media tactic.\n` +
  `- NO JUNIOR TELLS: no generic frameworks, no "it depends", no hedging where the facts allow a call, no menu of options, no buzzwords standing in for substance, no restating the brief back.\n\n` +
  `HARD RULES:\n` +
  `- SINGLE-MINDED. One proposition, never a menu. A strategy that tries to be everything to everyone is not a strategy.\n` +
  `- DECISION-FORCING. Recommend and commit; do not survey options. Say what to do and what to leave alone.\n` +
  `- PRICE IS A STRATEGY, do not relegate it. If ${clientName} has a genuine cost advantage (a manufacturer, own factory, direct-to-consumer, no middleman), that advantage is a LEAD element of the proposition, NOT a "closer" to reveal only at the point of decision. Buyers in most categories weigh price early; a strategy that hides or delays price while leading only on a softer promise is weaker, not classier. Where the facts support it, lead with the price-and-confidence pairing (better product AND better price, because of the cost structure). Never write that price is "revealed at the point of decision" or moved "from opener to closer".\n` +
  `- THE MANUFACTURER ADVANTAGE IS CONTROL, NOT SAMENESS. Frame owning the build as control over spec, price, lead time, guaranteed supply, custom sizing and exclusivity, plus the freedom to keep improving the product. Do NOT lean on continuity or "we can make the same product again" as a wedge, it reads as stagnation and a business buyer expects products to improve. If consistency matters, frame it as a consistent STANDARD across a phased or repeat order, never a frozen design.\n` +
  `- SELL GAS'S OWN SYSTEM. Qualification runs on OUR PSI WhatsApp system. NEVER build the strategy around the CLIENT's own WhatsApp line, phone, contact forms, store locator or existing channels, and never reference their WhatsApp number. We bring the system; we do not instrument or fix theirs.\n` +
  `- HOW WE TARGET (the real mechanism, do not overclaim): we reach people with HYPER-TARGETED PAID ADS at their buying MOMENT, the trigger that forces a purchase (a new opening, a refurb, an intake, an audit, a review), and the ad's call to action is a WhatsApp conversation with PSI that qualifies the lead. PSI does NOT have private "signals" into businesses and does not detect triggers on its own. Define each persona by the TRIGGER MOMENT that puts them in market and how paid targeting reaches them, never by a signal we cannot actually see.\n` +
  `- CHANNEL REALISM. In channel_logic, be true to how channels actually perform. LinkedIn is a SUPPORT / precision channel, NEVER the lead volume driver, even in B2B: sharpest professional targeting but low lead volume and high CPMs, so it supports and qualifies while Meta and Google drive the volume. Never cast LinkedIn as the lead channel. Match each channel's role to its real strength for THIS objective, not to a generic playbook.\n` +
  `- STATE A DATA GAP ONCE. If the fact base lacks category size, seasonality or demand data, note it a SINGLE time (in 'risks' as an assumption to confirm) and move on. Do NOT repeat "data is thin / not in the verified record" across the strategy: repeated apology reads as no homework. Use the real, dated market facts you DO have assertively.\n` +
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
  `- Every word the team and the client reads must follow the writing style below.\n\n` +
  WRITING_STYLE;

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

// The two Opus passes are split into serializable pieces so a DURABLE background job can run each as its own
// Inngest step (its own function invocation), instead of one long request that can hit the ~13-min ceiling and die.
type StrategyInputs = { clientId: string; runId: string; clientName: string; legend: string; user: string; claims: ClaimLite[] };

async function anthropicClient(): Promise<Anthropic> {
  const key = await getSecret("anthropic");
  if (!key) throw new Error("Claude isn't connected.");
  return new Anthropic({ apiKey: key });
}
const strategyTool = (): Anthropic.Tool => ({ name: "write_strategy", description: "The single, structured commercial strategy.", input_schema: STRATEGY_CONTENT_SCHEMA as unknown as Anthropic.Tool["input_schema"] });

// Load the fact base + build the prompt. `prior` (on a refine) makes the model improve the current strategy.
async function prepareStrategyInputs(clientId: string, objective: string, opts: { notes?: string | null; prior?: StrategyContent | null } = {}): Promise<StrategyInputs> {
  const { runId, claims, clientName } = await latestApprovedFacts(clientId);
  if (!runId || !claims.length) throw new Error("No approved research yet. Run the Researcher and approve it at Gate 1 first.");
  const legend = claims.map((c, i) => `F${i + 1} [${c.section}${c.subject ? `/${c.subject}` : ""}] ${c.claim}${c.source_url ? " (sourced)" : ""}`).join("\n");
  const priorBlock = opts.prior ? `\n\nCURRENT STRATEGY (improve this, do not start from scratch):\n${JSON.stringify(opts.prior)}` : "";
  const notesBlock = opts.notes?.trim() ? `\n\nTEAM DIRECTION (apply precisely, and record each material change in 'changes_from_last'):\n${opts.notes.trim().slice(0, 2000)}` : "";
  const user = `OBJECTIVE FOR THIS STRATEGY: ${objective}\n\nTHE VERIFIED FACT BASE (cite facts as their Fn tag in every rationale point):\n${legend}${priorBlock}${notesBlock}`;
  return { clientId, runId, clientName, legend, user, claims };
}

// Pass 1: the draft (top-1% strategist persona).
async function strategyDraftPass(user: string, clientName: string, meter: { clientId: string; userEmail?: string | null }): Promise<StrategyContent> {
  const client = await anthropicClient();
  const msg = await withAnthropicRetry(() => client.messages.stream({
    model: OPUS5, max_tokens: 12000, system: STRATEGIST_SYSTEM(clientName),
    tools: [strategyTool()], tool_choice: { type: "tool", name: "write_strategy" },
    messages: [{ role: "user", content: user }],
  }).finalMessage());
  await meterClaude(msg, { clientId: meter.clientId, userEmail: meter.userEmail ?? null, model: OPUS5, action: "strategy-build" }).catch(() => {});
  const content = extractContent(msg);
  if (!content) throw new Error("The Strategist returned nothing. Try again.");
  return content;
}

// Pass 2: the adversarial red-team (best-effort; the draft stands if it fails).
async function strategyRedTeamPass(legend: string, clientName: string, draft: StrategyContent, meter: { clientId: string; userEmail?: string | null }): Promise<StrategyContent> {
  try {
    const client = await anthropicClient();
    const msg = await withAnthropicRetry(() => client.messages.stream({
      model: OPUS5, max_tokens: 12000,
      system: `You are a ruthless Strategy Director (top 1% performance marketing) red-teaming a draft strategy for ${clientName} before it reaches the board. Your job is to find every JUNIOR tell and fix it. ` +
        `Test it hard: Is there a REAL, non-obvious insight, or is it restating facts and generic best practice? Does every move have a MECHANISM (how it lowers acquisition cost / raises intent / lifts order value / compounds), or just adjectives? Does it show CATEGORY and COMMERCIAL fluency (margin, pricing power, the real objection, seasonality), or read like an ad-account tactic? Is PRICE used as a lead strategic lever where the cost structure supports it, never hidden as "the closer"? ` +
        `Kill any claim not grounded in a cited Fn fact. Force ONE single-minded proposition. Make it decision-forcing, not a survey. Ensure every KPI has a baseline and the pre-mortem names the real ways it could fail. Do NOT invent facts. Cut hedging and buzzwords. ` +
        `Return the SHARPER, more expert strategy via write_strategy. UK English, no em dashes.`,
      tools: [strategyTool()], tool_choice: { type: "tool", name: "write_strategy" },
      messages: [{ role: "user", content: `Fact base:\n${legend}\n\nDraft strategy to red-team and improve:\n${JSON.stringify(draft)}` }],
    }).finalMessage());
    await meterClaude(msg, { clientId: meter.clientId, userEmail: meter.userEmail ?? null, model: OPUS5, action: "strategy-refine" }).catch(() => {});
    return extractContent(msg) || draft;
  } catch { return draft; }
}

const finalizeStrategyContent = (raw: StrategyContent, claims: ClaimLite[]): StrategyContent => resolveFactIds(normalizeStrategyContent(raw), claims);

// The composing (synchronous) generator, kept for any non-durable caller.
async function generateStrategyContent(
  clientId: string, objective: string, opts: { notes?: string; prior?: StrategyContent | null; userEmail?: string | null } = {},
): Promise<{ content: StrategyContent; runId: string; clientName: string }> {
  const inp = await prepareStrategyInputs(clientId, objective, opts);
  const draft = await strategyDraftPass(inp.user, inp.clientName, { clientId, userEmail: opts.userEmail });
  const improved = await strategyRedTeamPass(inp.legend, inp.clientName, draft, { clientId, userEmail: opts.userEmail });
  return { content: finalizeStrategyContent(improved, inp.claims), runId: inp.runId, clientName: inp.clientName };
}

// ── DURABLE STRATEGY BUILD ──────────────────────────────────────────────────────────────────────────────────
// A "building" strategy row is created up front, then a background Inngest job fills it, writing a progress label
// at each phase (like the Researcher). The UI polls the row's status/progress, so "is it working?" is always
// answerable and survives navigation, and a long Opus pass can never die on the request ceiling.

export type StrategyProgress = { label: string; error?: string };

async function setStrategyProgress(strategyId: string, progress: StrategyProgress, status?: string): Promise<void> {
  if (status) await db().query(`update strategies set progress = $2::jsonb, status = $3 where id = $1`, [strategyId, JSON.stringify(progress), status]);
  else await db().query(`update strategies set progress = $2::jsonb where id = $1`, [strategyId, JSON.stringify(progress)]);
}

// The strategy's client + objective + prior content, for the background job.
async function loadStrategyForBuild(strategyId: string): Promise<{ clientId: string; objective: string; prior: StrategyContent | null; cycleId: string | null }> {
  const rows = (await db().query(
    `select s.content, s.cycle_id, e.client_id, c.objective from strategies s join engagements e on e.id = s.engagement_id left join campaigns c on c.id = s.campaign_id where s.id = $1`,
    [strategyId],
  )) as { content: StrategyContent | null; cycle_id: string | null; client_id: string; objective: string | null }[];
  const s = rows[0];
  if (!s) throw new Error("That strategy was not found.");
  const prior = s.content && typeof s.content === "object" && Object.keys(s.content).length ? s.content : null;
  return { clientId: s.client_id, objective: s.objective || "", prior, cycleId: s.cycle_id };
}

// The durable steps, each called from one Inngest step.run(). `inp` is cached + replayed between steps.
export async function strategyStepPrepare(strategyId: string, mode: "build" | "refine", notes: string | null): Promise<StrategyInputs> {
  await setStrategyProgress(strategyId, { label: "Reading the approved fact base…" });
  const { clientId, objective, prior } = await loadStrategyForBuild(strategyId);
  return prepareStrategyInputs(clientId, objective, { notes, prior: mode === "refine" ? prior : null });
}
export async function strategyStepDraft(strategyId: string, inp: StrategyInputs, userEmail: string | null): Promise<StrategyContent> {
  await setStrategyProgress(strategyId, { label: "Drafting one single-minded strategy…" });
  return strategyDraftPass(inp.user, inp.clientName, { clientId: inp.clientId, userEmail });
}
export async function strategyStepRedTeam(strategyId: string, inp: StrategyInputs, draft: StrategyContent, userEmail: string | null): Promise<StrategyContent> {
  await setStrategyProgress(strategyId, { label: "Red-teaming it like a ruthless strategy director…" });
  return strategyRedTeamPass(inp.legend, inp.clientName, draft, { clientId: inp.clientId, userEmail });
}
export async function strategyStepStore(strategyId: string, improved: StrategyContent, claims: ClaimLite[]): Promise<void> {
  const content = finalizeStrategyContent(improved, claims);
  await db().query(`update strategies set content = $2, status = 'awaiting_approval', progress = null where id = $1`, [strategyId, JSON.stringify(content)]);
  const cyc = (await db().query(`select cycle_id from strategies where id = $1`, [strategyId]) as { cycle_id: string | null }[])[0];
  if (cyc?.cycle_id) await setCycleStatus(cyc.cycle_id, "awaiting_gate", { strategyId }).catch(() => {});
}
export async function markStrategyFailed(strategyId: string, message: string): Promise<void> {
  await setStrategyProgress(strategyId, { label: "The strategy build did not finish.", error: message.slice(0, 300) }, "failed").catch(() => {});
}

// START a durable BUILD: validate research, create the engagement/campaign/cycle + a 'building' strategy row, fire
// the background job, and return the row immediately (the UI polls it to awaiting_approval).
export async function startStrategyBuild(clientId: string, input: { name: string; objective: string; userEmail?: string | null }): Promise<Strategy> {
  const { runId } = await latestApprovedFacts(clientId);
  if (!runId) throw new Error("No approved research yet. Run the Researcher and approve it at Gate 1 first.");
  const eng = await ensureEngagement(clientId);
  const campaign = await createCampaign(eng.id, input.name || input.objective.slice(0, 80), { objective: input.objective });
  const cycle = await openCycle(eng.id, "foundation", { campaignId: campaign.id, openedBy: input.userEmail ?? null });
  await setCycleStatus(cycle.id, "strategising", { researchRunId: runId });
  const strategy = await createStrategyDraft({ engagementId: eng.id, campaignId: campaign.id, cycleId: cycle.id, level: "campaign", mode: "foundation", content: {} as StrategyContent, status: "building", progress: { label: "Queued…" } });
  await inngest.send({ name: "studio/strategy.build", data: { strategyId: strategy.id, mode: "build", notes: null, userEmail: input.userEmail ?? null } });
  return strategy;
}

// START a durable REFINE: flip the strategy to 'building' (keeping its content as the prior to improve), fire the job.
export async function startStrategyRefine(strategyId: string, notes: string, userEmail?: string | null): Promise<Strategy> {
  const rows = (await db().query(`select * from strategies where id = $1`, [strategyId])) as Strategy[];
  const cur = rows[0];
  if (!cur) throw new Error("That strategy was not found.");
  if (cur.status === "approved" || cur.status === "superseded") throw new Error("That strategy is locked. Build a new version instead.");
  if (cur.status === "building") throw new Error("This strategy is already building. Give it a moment.");
  await db().query(`update strategies set status = 'building', progress = $2::jsonb where id = $1`, [strategyId, JSON.stringify({ label: "Queued…" })]);
  await inngest.send({ name: "studio/strategy.build", data: { strategyId, mode: "refine", notes: notes.slice(0, 2000), userEmail: userEmail ?? null } });
  return { ...cur, status: "building", progress: { label: "Queued…" } } as Strategy;
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
