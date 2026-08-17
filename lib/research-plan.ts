import Anthropic from "@anthropic-ai/sdk";
import { getSecret } from "./connections";
import { db } from "./db";
import { OPUS5, withAnthropicRetry } from "./vendors/anthropic";
import { meterClaude } from "./usage";
import { WRITING_STYLE } from "./writing-style";

// THE RESEARCH PLAN (the pre-run alignment gate, Gary). Before the expensive deep run, the Researcher proposes a
// tight, tailored, FACTS-ONLY plan for the brief: the passes (what facts to gather, where, and how to verify), plus
// the gaps the research cannot answer that the client must confirm before the Strategist runs. A human reviews and
// aligns on this cheap plan, THEN the deep run executes steered by it. Scoping only: NO analysis, persona, model or
// strategy here (that is the Strategist's job downstream, built from the facts this plan scopes).

export type ResearchPlan = {
  summary: string;
  passes: { title: string; gather: string; sources: string; verify: string }[];
  confirm: string[];
};

const PLAN_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    summary: { type: "string", description: "One or two plain sentences restating exactly what this research run sets out to establish for the client, tied to the brief." },
    passes: {
      type: "array", description: "4 to 6 research passes. Each is a FACTS-gathering step: no analysis, no conclusions, no persona, no strategy.",
      items: {
        type: "object", additionalProperties: false,
        properties: {
          title: { type: "string", description: "short pass name, e.g. 'Extract the unit's own signals', 'Competitive set and pricing'" },
          gather: { type: "string", description: "the specific, observable, sourceable FACTS this pass collects, one or two sentences" },
          sources: { type: "string", description: "where it will look, specific to this client's category (the sites, listing portals, registers, review platforms, social accounts)" },
          verify: { type: "string", description: "what is cross-checked before a fact is kept (a date, a second source, geocoding, a register, current figures over memory)" },
        },
        required: ["title", "gather", "sources", "verify"],
      },
    },
    confirm: { type: "array", items: { type: "string" }, description: "2 to 5 plain questions the research CANNOT answer on its own and the client should confirm before the Strategist runs (volumes, deadlines, budgets, internal targets, anything not publicly researchable)." },
  },
  required: ["summary", "passes", "confirm"],
} as unknown as Anthropic.Tool["input_schema"];

const SYSTEM =
  `You are the head of research at GAS Marketing Automation, the Agency of NOW, planning a research run BEFORE it executes so a senior human can align on it. Propose a tight, tailored, FACTS-ONLY research plan for the brief.\n\n` +
  `RULES:\n` +
  `- FACTS ONLY. The Researcher gathers and VERIFIES observable, sourceable facts. It does NOT analyse. So the plan scopes what FACTS to gather and how to verify them. NEVER put analysis, a conclusion, a customer persona, an affordability or pricing model, a strategy, a creative idea or a qualification tree in the plan. That is the Strategist's job downstream, built from these facts.\n` +
  `- TAILOR IT to this client's real category and brief. A property-rental launch, a fintech and a manufacturer each need different passes, sources and verification. Name the REAL sources for this category (for SA rentals: Property24, Private Property, Facebook Marketplace; for reviews: HelloPeter, Google; the relevant regulator's register where one applies).\n` +
  `- Each pass states what facts to GATHER, WHERE to look, and what to VERIFY before keeping a fact.\n` +
  `- ALWAYS include a COMPETITIVE-SET pass, framed by the CUSTOMER'S ALTERNATIVES (who this customer would consider INSTEAD), never by the client's exact business model. Name the kinds of real rivals to map, including adjacent ones (e.g. for a developer-landlord letting new-build stock: other developer-landlords and buy-to-let / rental-investment companies like IGrow and Balwin, other new-build rental developments, and letting agents' comparable stock). Never a plan that assumes there are no rivals.\n` +
  `- Surface the GAPS the research cannot answer that the client must confirm before the Strategist runs (unit volumes, launch deadlines, budgets, internal targets, anything not publicly researchable).\n` +
  `- Be concrete and specific to THIS brief, never generic. If the brief names a URL or a place, work it into the relevant pass.\n\n` +
  WRITING_STYLE;

// Generate the facts-only research plan for a client + brief. Cheap: one Opus call, no web search. Metered.
export async function planResearch(clientId: string, focus: string, userEmail?: string | null): Promise<ResearchPlan> {
  const key = await getSecret("anthropic");
  if (!key) throw new Error("Claude isn't connected.");
  const crow = (await db().query(`select name, website, socials, owner_context from clients where id = $1`, [clientId])) as { name: string; website: string | null; socials: string[] | null; owner_context: string | null }[];
  const c = crow[0];
  if (!c) throw new Error("That brain was not found.");
  const socials = (Array.isArray(c.socials) ? c.socials : []).filter((s) => typeof s === "string" && s.trim());
  const brief = focus.trim();
  const user =
    `CLIENT: ${c.name}\n` +
    (c.website ? `SITE: ${c.website}\n` : "") +
    (socials.length ? `SOCIAL ACCOUNTS: ${socials.join(", ")}\n` : "") +
    (c.owner_context?.trim() ? `OWNER / PARENT CONTEXT: ${c.owner_context.trim()}\n` : "") +
    `\nTHE BRIEF (what the team wants researched, and why):\n${brief || "(no specific brief given) A full, foundational fact base on this client for a marketing strategy: who they are, their market, competitors, audience, positioning, current marketing and recent activity."}\n\n` +
    `Propose the facts-only research plan via write_plan.`;
  const client = new Anthropic({ apiKey: key });
  const tool: Anthropic.Tool = { name: "write_plan", description: "The facts-only research plan for this brief.", input_schema: PLAN_SCHEMA };
  const msg = await withAnthropicRetry(() => client.messages.stream({
    model: OPUS5, max_tokens: 4000, system: SYSTEM,
    tools: [tool], tool_choice: { type: "tool", name: "write_plan" },
    messages: [{ role: "user", content: user }],
  }).finalMessage());
  await meterClaude(msg, { clientId, userEmail: userEmail ?? null, model: OPUS5, action: "research-plan" }).catch(() => {});
  const b = msg.content.find((x) => x.type === "tool_use");
  const plan = b && b.type === "tool_use" ? (b.input as ResearchPlan) : null;
  if (!plan) throw new Error("The research plan came back empty. Try again.");
  return plan;
}
