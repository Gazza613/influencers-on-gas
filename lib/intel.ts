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
  // INTERNAL assessment - never part of the CEO's public voice. See the brief in ASSESSMENT below.
  impact_risk: string | null;
  campaign_response: string | null;
  status: string;
  found_at: string;
};

const RINGFENCE = `SCOPE LOCK (absolute). You are researching MTN MoMo - the FINTECH arm, a STANDALONE BRAND with its own equity. You are NOT researching MTN Group the telco.
IN SCOPE: mobile money, payments, wallets, financial inclusion, fintech regulation (FAIS/FSCA/ARB/CPA/POPIA), fintech fraud and trust, MoMo's own products and offers, and the FINTECH competitive set (Capitec, TymeBank, VodaPay, Shoprite Money Market, Standard Bank Instant Money, Mukuru).
OUT OF SCOPE: MTN network/telco strategy, spectrum, coverage, MTN corporate brand campaigns, MTN Group subscriber numbers, telco competitor sets. MTN Group appears ONLY as the endorsement brand behind "MoMo from MTN".
CRITICAL: MoMo's fintech offers are OFTEN DIFFERENT from MTN's own offers. NEVER infer a MoMo price, bundle or product from an MTN source. If you cannot source it to MoMo directly, do not assert it.`;

// HOW IT READS DECIDES WHETHER IT GETS USED. Gary: "I find the language very complicated for our team - make it
// simpler and more understandable, but do not steer away from the actual real content, do not dilute the message
// by making it more understandable."
//
// That is the whole tension, and the rule below states it explicitly: simplify the LANGUAGE, never the SUBSTANCE.
// The failing examples were consultant-speak ("Two-sided and genuinely material to our doctrine"), not detail -
// so we ban the register, not the content. Every number, name, date and caveat stays.
const STYLE = `HOW TO WRITE THIS (it is read by busy marketers and by MoMo's own team, not by analysts):
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
- There is NO published creative-performance data for MoMo South Africa. Anyone quoting SA fintech creative benchmarks is inventing them. Never repeat one.
- RECENCY IS A HARD GATE. This is a DAILY intelligence run: you report WHAT CHANGED. Only report things published or announced in the LAST ${windowDays} DAYS. Older material - however good - is BACKGROUND, not news, and it already lives in our doctrine. Do not report it. A stale finding presented as current is worse than no finding.
- HYPER-FOCUS ON THE NEWEST. Inside the window, newer beats older every time: something from the last few days is worth far more to us than something from three weeks ago, even if the older item is more interesting. Search for the most recent developments FIRST and report the freshest material you can stand up. Order your findings newest first.
- DATE EVERY FINDING. Give published_at as the date the SOURCE was published or the event happened - NOT today. If you cannot establish the date, leave it empty rather than guessing - but know that an undated finding will be REJECTED, because we cannot claim it is current.
- Also give 'period' when the data covers a span that differs from the publication date (e.g. a report published this month describing FY2025). Recency of PUBLICATION is not recency of DATA.`;

// EVERY FINDING CARRIES A DECISION (Gary). Research that stops at "this happened" makes the reader do the work
// twice. So each finding is assessed for what it could actually do to MoMo SA, and carries a recommended
// campaign response - defensive, proactive, or explicitly neither.
//
// THE FIREWALL MATTERS MORE THAN THE FEATURE. The Journalist's PUBLISHED material is the CEO speaking in public:
// FAIS-bound, no competitor comparison, no product promotion, nothing market-sensitive. An impact assessment and
// a campaign recommendation are none of those things - they are GAS's internal commercial thinking. They must
// never bleed into the public post, and the public voice's constraints must not water down the internal read.
// Two audiences, one finding, kept apart on purpose.
// The two roles are DIFFERENT INSTRUMENTS, so they get different assessments. One generic block applied to both
// quietly handed the Journalist a Strategist's job - assess competitive risk, recommend an activation - which
// drags its category-level, FAIS-bound research into territory it is briefed not to enter, and makes the two
// agents report the same thing twice. Each assessment below stays in its own lane.
const COMMON_HONESTY = `Be honest about size: if the real answer is "little to no impact", SAY SO - a
manufactured risk is worse than none, because it spends the team's attention. Say when you are reasoning rather
than sourcing. If the right answer is "no campaign move needed", say that plainly rather than inventing work -
the point is to make our comms to the market MORE efficient, not to generate activity.`;

const ASSESSMENT: Record<string, string> = {
  // THE STRATEGIST'S ASSESSMENT IS THE PRODUCT. Gary: "the strategist is a tool we use at GAS as the MTN MoMo
  // performance marketing agency - it guides our campaign activations and positioning for the MoMo internal
  // teams." So the recommendation is not an add-on here, it is what the tool is FOR, and it has two real
  // audiences: GAS's own activation decisions, and what GAS then puts in front of MoMo's internal teams.
  strategist: `ASSESS, THEN RECOMMEND. This is what the tool is FOR: GAS is MTN MoMo's performance marketing
agency, and this briefing guides our CAMPAIGN ACTIVATIONS and the POSITIONING we take to MoMo's internal teams.
- impact_risk: what this could ACTUALLY do to MTN MoMo South Africa commercially. The mechanism (how it reaches
  MoMo), who it touches (which customers, which product, which channel), rough SIZE, how FAST, how LIKELY. Name
  the downside even when the news looks good. Be blunt, name competitors, talk about product - this is internal.
- campaign_response: the ACTIVATION and POSITIONING call. Say whether it is DEFENSIVE (protect a position under
  attack, correct a misread, get ahead of a trust or fraud problem before it attaches to MoMo) or PROACTIVE
  (take an opening a rival has left). Then be concrete enough to act on: the audience, the shift in message, the
  surface it belongs on, and what we should STOP doing if it is now wrong. Write it so it can be put in front of
  MoMo's internal team as a recommendation, not a musing.
${COMMON_HONESTY}`,

  // THE JOURNALIST'S ASSESSMENT IS ABOUT NARRATIVE, NOT COMMERCE - and is strictly INTERNAL. Its published
  // material is the CEO in public: FAIS-bound, no competitor comparison, no product promotion. So the assessment
  // must not pull the research toward competitive analysis (that is the Strategist's job), and must never leak
  // into the post.
  journalist: `ASSESS, THEN RECOMMEND - INTERNAL ONLY, and read the firewall at the end.
- impact_risk: what this category development means for MoMo's PUBLIC NARRATIVE and positioning - the reputational
  and trust dimension, not the commercial one. Could the category conversation turn in a way that attaches to
  MoMo (a fraud narrative, a fee backlash, a regulatory mood)? Is there a conversation MoMo is credibly placed to
  lead, or one it would look absent from? Leave competitive and revenue impact to the Strategist - do not
  duplicate that work here.
- campaign_response: the NARRATIVE move. DEFENSIVE (get ahead of a category narrative before it lands on MoMo, so
  the CEO is already on record) or PROACTIVE (own a conversation the category is having and MoMo has standing in).
  Say the audience and the point of view worth taking.
${COMMON_HONESTY}

THE FIREWALL - do not blur these:
- impact_risk and campaign_response are INTERNAL GAS thinking. They are never published and never in the CEO's
  voice, so they are NOT bound by the public-voice rules - you may be blunt here.
- The PUBLISHED material stays exactly as briefed above: no competitor named or compared, no product promotion,
  nothing market-sensitive. Nothing from your internal assessment may leak into it.`,
};

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
WHAT THIS IS FOR (Gary): GAS is MTN MoMo's PERFORMANCE MARKETING AGENCY. This briefing guides two real decisions - the CAMPAIGN ACTIVATIONS we run, and the POSITIONING we take to MoMo's INTERNAL TEAMS. So every finding must survive the question "what would we do differently, and what do we tell the client's team?". Intelligence that changes neither is not worth filing.
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
          // Deliberately role-NEUTRAL: the Strategist and the Journalist assess different things (commercial vs
          // narrative), and their own ASSESSMENT brief defines the lane. Restating one role's job here would
          // hand it to the other - which is exactly how the two agents start duplicating each other.
          impact_risk: { type: "string", description: "INTERNAL, never published. Your assessment of what this could actually do to MTN MoMo South Africa, exactly as your assessment brief defines it for your role. Be honest about size, including 'little to none'." },
          campaign_response: { type: "string", description: "INTERNAL, never published. Your recommended move, as your assessment brief defines it for your role. State whether it is DEFENSIVE or PROACTIVE. 'No move needed' is a valid answer." },
        },
        required: ["headline", "why_it_matters", "detail", "sources", "published_at", "period", "confidence", "material", "impact_risk", "campaign_response"],
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
// 30 DAYS MAXIMUM (Gary: "no research presented to be older than 30 days maximum - the agent must hyper focus on
// the newer research"). Both roles are gated to the same month now: a briefing that guides this week's
// activations cannot lean on last quarter's news, and the CEO cannot post about something the market has moved
// on from. Recency of PUBLICATION, not of discovery.
const WINDOW_DAYS: Record<string, number> = {
  strategist: Number(process.env.INTEL_WINDOW_STRATEGIST) || 30,
  journalist: Number(process.env.INTEL_WINDOW_JOURNALIST) || 30,
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
    system: `${RINGFENCE}\n\n${ROLE_BRIEF[role]}\n\n${ASSESSMENT[role]}\n\n${HONESTY(windowDays)}\n\n${STYLE}`,
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
    system: `${RINGFENCE}\n\n${HONESTY(windowDays)}\n\n${ASSESSMENT[role]}\n\n${STYLE}\n\nFile the research below as structured findings. Carry the REAL source URLs through - never invent one. If the research found nothing genuinely new, return an empty findings list and quiet_day=true. A quiet day is a correct answer, not a failure.`,
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
