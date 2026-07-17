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
// 2. RINGFENCED BY THE BRAIN. Gary: "I do not want to contaminate MoMo." The brain IS the ringfence: select a
//    brain and both the DATA (its doctrine and findings, keyed by client_id) and the INSTRUCTIONS (its scope
//    lock and role briefs, in `intel_briefs`) come from that brain alone. A brain with no brief REFUSES to
//    run - there is no default and no fallback, because a fallback would hand it another brain's scope.

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
  // INTERNAL assessment - never part of the CEO's public voice. See the brief in ASSESSMENT below.
  impact_risk: string | null;
  campaign_response: string | null;
  status: string;
  found_at: string;
};

const STYLE = `HOW TO WRITE THIS (it is read by busy marketers and by the client's own team, not by analysts):
- Plain, direct English. Short sentences. Everyday words. Say the thing itself, not the jargon for it.
- SIMPLER LANGUAGE, SAME SUBSTANCE. Do NOT dilute or generalise to sound readable: keep every number, name,
  date, caveat and honest uncertainty exactly as it is. If a term of art is unavoidable (FAIS, FSP, e-money),
  use it and explain it in a few words the first time.
- No consultant register: avoid "two-sided", "doctrine", "materially", "leverage", "signals", "posture",
  "vectors". Write as if telling a colleague what happened and what we should do about it.
- Lead with the point. The first sentence says what happened or what to do, not the build-up.
- UK British spelling, ALWAYS. NEVER use an em dash or an en dash: use a comma, a full stop, or a plain hyphen.`;

const HONESTY = (windowDays: number) => `HONESTY RULES:
- Every finding must carry a REAL source URL you actually read. If you cannot source it, do not report it.
- Grade confidence honestly: high (primary source - regulator, company results, statute), medium (credible secondary - law firm, trade press, fact-checker), low (single source, thin, or inferred).
- Mark material=true ONLY if this would actually change what we say or do. Most news is not material. A quiet day with nothing material is a CORRECT result - say so rather than padding.
- RECENCY IS A HARD GATE. This is a DAILY intelligence run: you report WHAT CHANGED. Only report things published or announced in the LAST ${windowDays} DAYS. Older material - however good - is BACKGROUND, not news, and it already lives in our doctrine. Do not report it. A stale finding presented as current is worse than no finding.
- HYPER-FOCUS ON THE NEWEST. Inside the window, newer beats older every time: something from the last few days is worth far more to us than something from three weeks ago, even if the older item is more interesting. Search for the most recent developments FIRST and report the freshest material you can stand up. Order your findings newest first.
- DATE EVERY FINDING. Give published_at as the date the SOURCE was published or the event happened - NOT today. If you cannot establish the date, leave it empty rather than guessing - but know that an undated finding will be REJECTED, because we cannot claim it is current.
- Also give 'period' when the data covers a span that differs from the publication date (e.g. a report published this month describing FY2025). Recency of PUBLICATION is not recency of DATA.`;

// THE SCOPE LOCK AND THE ROLE BRIEFS NOW LIVE ON THE BRAIN, not in this file.
//
// They used to be constants hardcoded to MTN MoMo ("You are researching MTN MoMo..."), which meant a second
// brain would have been researched under MoMo's scope lock. Gary's model is the right one: the BRAIN is the
// ringfence - select the GAS brain and the context is GAS's own loaded data, select MoMo and it is MoMo's. The
// brain already scoped the DATA (doctrine and findings are client_id keyed); it did not scope the INSTRUCTIONS.
// Now it does: each brain carries its own scope lock and role briefs in `intel_briefs`, and a brain with no
// brief REFUSES to run rather than borrowing another brain's scope. See db/schema.sql.
export type IntelBrief = {
  clientId: string;
  clientName: string;
  scope: string;
  journalist: string | null;
  strategist: string | null;
  windowDays: number;
  emailIntro: string | null;
};

export async function loadIntelBrief(clientId: string): Promise<IntelBrief | null> {
  const rows = (await db().query(
    `select b.client_id, c.name as client_name, b.scope, b.journalist, b.strategist, b.window_days, b.email_intro
     from intel_briefs b join clients c on c.id = b.client_id
     where b.client_id = $1`,
    [clientId],
  )) as Record<string, unknown>[];
  const r = rows[0];
  if (!r) return null;
  return {
    clientId: String(r.client_id),
    clientName: String(r.client_name),
    scope: String(r.scope),
    journalist: (r.journalist as string) || null,
    strategist: (r.strategist as string) || null,
    windowDays: Number(r.window_days) || 30,
    emailIntro: (r.email_intro as string) || null,
  };
}

// Which brains have research configured at all. The daily run iterates THESE, so adding a brain's brief is what
// switches its research on - there is no hardcoded client list to keep in step.
export async function brainsWithIntel(): Promise<{ clientId: string; clientName: string; journalist: boolean; strategist: boolean }[]> {
  const rows = (await db().query(
    `select b.client_id, c.name as client_name,
            (b.journalist is not null) as journalist, (b.strategist is not null) as strategist
     from intel_briefs b join clients c on c.id = b.client_id
     order by c.name`,
    [],
  )) as Record<string, unknown>[];
  return rows.map((r) => ({
    clientId: String(r.client_id),
    clientName: String(r.client_name),
    journalist: r.journalist === true,
    strategist: r.strategist === true,
  }));
}

// UNIVERSAL assessment shape. WHAT is being assessed, and how to frame it, comes from the brain's own role
// brief - so the Strategist assessing GAS's growth and the Strategist assessing MoMo's market use the same
// structure without one leaking into the other.
const ASSESSMENT = `ASSESS EVERY FINDING, THEN RECOMMEND. Both fields are INTERNAL and are never published.
- impact_risk: what this could ACTUALLY do, framed exactly as your role brief defines it. Give the mechanism
  (how it actually reaches us), who it touches, rough SIZE, how FAST and how LIKELY. Name the downside even when
  the news looks good, and the upside even when it looks bad. If the honest answer is "little to no real
  impact", SAY SO - a manufactured risk is worse than none, because it spends the team's attention. Separate
  what you sourced from what you are inferring, and say which is which.
- campaign_response: what we should DO about it, framed exactly as your role brief defines it. Say whether it is
  DEFENSIVE (protect a position, correct a misread, get ahead of a problem) or PROACTIVE (take an opening), then
  be concrete enough to act on. "No move needed" is a valid and useful answer - a recommendation invented for its
  own sake wastes the team's time and makes our comms less efficient, not more.`;

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
          why_it_matters: { type: "string", description: "The SO WHAT for the client in your scope lock, specifically. Be concrete." },
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
          // Deliberately role-NEUTRAL: the Strategist and the Journalist assess different things (commercial vs
          // narrative), and their own ASSESSMENT brief defines the lane. Restating one role's job here would
          // hand it to the other - which is exactly how the two agents start duplicating each other.
          impact_risk: { type: "string", description: "INTERNAL, never published. Your assessment of what this could actually do, framed exactly as your role brief defines it. Be honest about size, including 'little to none'." },
          campaign_response: { type: "string", description: "INTERNAL, never published. Your recommended move, as your assessment brief defines it for your role. State whether it is DEFENSIVE or PROACTIVE. 'No move needed' is a valid answer." },
        },
        required: ["headline", "why_it_matters", "detail", "sources", "published_at", "period", "confidence", "material", "impact_risk", "campaign_response"],
      },
    },
    quiet_day: { type: "boolean", description: "True if nothing material was found. That is a correct result, not a failure." },
  },
  required: ["findings", "quiet_day"],
} as unknown as Anthropic.Tool["input_schema"];

// THE RECENCY WINDOW LIVES ON THE BRAIN (intel_briefs.window_days, 30 by default - Gary's maximum).
// It used to be a pair of env-tunable constants here, but the window is a property of what a brain is FOR,
// not of the engine, and two sources of truth for the same setting is how they drift apart.

// Run one role's daily research. Returns the findings it PROPOSES (already stored, status 'new').
export async function runIntel(clientId: string, role: "journalist" | "strategist", today: string): Promise<Intel[]> {
  const key = await getSecret("anthropic");
  if (!key) throw new Error("Claude isn't connected");

  // THE BRAIN IS THE RINGFENCE. Everything client-specific - the scope lock and the role brief - comes from THIS
  // brain, alongside its own doctrine. No brief means we REFUSE to run: silently falling back to another brain's
  // scope is precisely the contamination this design exists to prevent.
  const cfg = await loadIntelBrief(clientId);
  if (!cfg) throw new Error("This brain has no intel brief, so its scope lock is unknown. Refusing to research it rather than borrow another brain's scope. Add a row to intel_briefs.");
  const roleBrief = role === "journalist" ? cfg.journalist : cfg.strategist;
  if (!roleBrief) return []; // this brain deliberately does not run this role

  const client = new Anthropic({ apiKey: key });
  const kit = await getBrandKit(clientId).catch(() => null);
  const windowDays = cfg.windowDays;

  // TWO STEPS, deliberately.
  //
  // Step 1 researches with web search. Step 2 files the report with the schema FORCED.
  // Doing both in one call means giving the model web_search AND report under tool_choice:auto - and it can
  // then simply finish after searching without ever filing. That is exactly what happened on the first live
  // run: the Strategist filed 6 findings, the Journalist filed NOTHING, silently. Forcing the report tool in
  // its own call makes a missing report impossible rather than merely unlikely.
  const brief = `Today is ${today}. Research what has changed that matters to ${cfg.clientName}, strictly inside your scope lock.\n\n` +
    `WHAT WE ALREADY KNOW (do NOT report these back as new - only report what ADDS to or CONTRADICTS this):\n` +
    `${(kit?.tone_notes || "(no doctrine loaded)").slice(0, 6000)}\n\n` +
    `Search the web now. Then set out what is genuinely new and worth our attention, with the real source for each.`;

  const research = await client.messages.create({
    model: PREMIUM,
    max_tokens: 6000,
    system: `${cfg.scope}\n\n${roleBrief}\n\n${ASSESSMENT}\n\n${HONESTY(windowDays)}\n\n${STYLE}`,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 12 } as unknown as Anthropic.Tool],
    messages: [{ role: "user", content: brief }],
  });
  const notes = research.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();
  if (!notes) return [];

  const res = await client.messages.create({
    model: PREMIUM,
    // The assessment adds two reasoned fields per finding, so the filing step needs the room to think.
    max_tokens: 6000,
    // STYLE belongs here most of all: this is the step that writes the words the team actually reads, and it
    // never carried the UK-spelling / no-em-dash rule at all, which is how em dashes kept reaching the inbox.
    system: `${cfg.scope}\n\n${HONESTY(windowDays)}\n\n${ASSESSMENT}\n\n${STYLE}\n\nFile the research below as structured findings. Carry the REAL source URLs through - never invent one. If the research found nothing genuinely new, return an empty findings list and quiet_day=true. A quiet day is a correct answer, not a failure.`,
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

  // NO EM DASHES, EVER (Gary). The prompt asks, but a prompt is not a guarantee and this is a house rule, so we
  // enforce it on the way into the database: every em dash and en dash becomes a plain hyphen. Once stored clean,
  // the email, the platform queue and anything downstream inherit it - there is no second place to remember.
  // A numeric range is handled FIRST and tightly ("12-18 months"), because the generic prose rule would turn it
  // into "12 - 18 months", which is not how anyone writes a range.
  const noDash = (s: unknown) => String(s ?? "")
    .replace(/(\d)\s*[—–]\s*(\d)/g, "$1-$2")
    .replace(/\s*[—–]\s*/g, " - ")
    .trim();

  const saved: Intel[] = [];
  for (const f of fresh) {
    const srcs = (Array.isArray(f.sources) ? f.sources : [])
      .filter((s): s is { name: string; url: string } => !!s && typeof (s as { url?: string }).url === "string" && /^https?:\/\//i.test((s as { url: string }).url))
      .slice(0, 8);
    const rows = (await db().query(
      `insert into studio_intel (client_id, role, headline, why_it_matters, detail, sources, source_url, source_name, published_at, period, confidence, material, impact_risk, campaign_response)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       returning id, role, headline, why_it_matters, detail, sources, source_url, source_name, published_at, period, confidence, material, impact_risk, campaign_response, status, found_at`,
      [clientId, role, noDash(f.headline).slice(0, 300), noDash(f.why_it_matters).slice(0, 1200),
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

export async function listIntel(clientId: string, status = "new"): Promise<Intel[]> {
  return (await db().query(
    `select id, role, headline, why_it_matters, detail, sources, source_url, source_name, published_at, period, confidence, material, impact_risk, campaign_response, status, found_at
     from studio_intel where client_id = $1 and status = $2 order by material desc, found_at desc limit 80`,
    [clientId, status],
  )) as Intel[];
}

export async function setIntelStatus(clientId: string, id: string, status: "accepted" | "binned"): Promise<void> {
  await db().query(`update studio_intel set status = $1 where id = $2 and client_id = $3`, [status, id, clientId]);
}
