import Anthropic from "@anthropic-ai/sdk";
import { getSecret } from "./connections";
import { db } from "./db";
import { FABLE, withAnthropicRetry } from "./vendors/anthropic";
import { meterClaude } from "./usage";
import type { Strategy, StrategyContent } from "./cycle";
import { OBJECTIVES, TIERS, PLATFORMS, type ObjectiveId, type TierId } from "./proposal-config";
import { WRITING_STYLE } from "./writing-style";
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
  market_intel: { overview: string; stats: { stat: string; source: string; label?: string }[]; opportunities: { headline?: string; insight: string; why: string; digital: boolean }[] };
  channels: { rationale: string; plan: { platform: string; priority: string; role: string; why: string; reach?: string }[] };   // intelligent selection
  pods: { name: string; for_client: string; benefit: string }[];                  // the 8 pods mapped to the client
  funnel: { disclaimer: string; stages: { stage: string; note: string }[] };      // ILLUSTRATIVE only
  kpis: { metric: string; why: string; baseline: string }[];
  rollout: { week: string; title: string; pods: string; points: string[]; gate: string }[];
  compliance: { intro: string; points: string[] };
  investment: { tier_name: string; rate: string; engine_includes: string[]; notes: string[] };
  psi_chat?: { conversation: { role: string; text: string }[]; outcome: string };
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
        stats: { type: "array", items: { type: "object", additionalProperties: false, properties: { stat: { type: "string", description: "the figure or finding, one tight sentence" }, source: { type: "string", description: "source and date/year" }, label: { type: "string", description: "a PUNCHY 1 to 3 word headline for this stat's card, engaging and impactful, not a soft label. A real figure where there is one (e.g. 'R1,399', '8 rivals', '180 nights'), else a sharp phrase ('One factory', 'Zero contenders'). This is the big word on the card, so make it land." } }, required: ["stat", "source", "label"] }, description: "3 to 6 recent, dated, relevant market statistics." },
        opportunities: { type: "array", items: { type: "object", additionalProperties: false, properties: { headline: { type: "string", description: "A short, COMPLETE, engaging headline for this move (a finished statement, never a mid-sentence fragment, no forward slashes, 3 to 7 words). This is the card title." }, insight: { type: "string", description: "the move, in one or two plain sentences" }, why: { type: "string", description: "why it matters, in one or two plain sentences" }, digital: { type: "boolean", description: "true if within our pods; false if a broader strategic consideration for the client, beyond our digital scope." } }, required: ["headline", "insight", "why", "digital"] }, description: "Opportunities the client should consider, including non-digital ones flagged digital:false as strategic considerations, not deliverables." },
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
          reach: { type: "string", description: "A short reach/scale HOOK for this platform in the client's market as an approximate figure, e.g. 'about 26 million South Africans' or 'roughly 10 million SA users'. Approximate and clearly rounded, a hook not a guarantee. Keep it to a few words." },
        }, required: ["platform", "priority", "role", "why", "reach"] } },
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
    psi_chat: { type: "object", additionalProperties: false, description: "A realistic PSI WhatsApp qualification chat for THIS client's actual buyer, shown on the PSI page. It must feel like a REAL WhatsApp conversation, warm and human, never an interrogation: PSI opens on-brand, asks ONE qualifying question at a time (the real use case, the volume or spec, the timing, the budget or sign-off), the prospect answers naturally and asks a real buyer question back (like price or availability), and PSI ends with a CONCRETE next step and a warm hand-off (introduces the right person, everything the prospect said travels with them, so they skip the back and forth). The frame is 'AI qualifies, humans close'. Keep EACH message SHORT, the length of a real WhatsApp message (one or two sentences, never a paragraph), so the whole chat fits on one page. Sound like a real enquiry for this client, never generic. Exactly 5 messages, starting and ending with PSI (in).", properties: { conversation: { type: "array", items: { type: "object", additionalProperties: false, properties: { role: { type: "string", enum: ["in", "out"], description: "in = the PSI assistant, out = the prospect" }, text: { type: "string" } }, required: ["role", "text"] }, description: "4 to 6 alternating messages, starting and ending with PSI (in)." }, outcome: { type: "string", description: "the closing tag, e.g. 'High intent, routed to sales'" } }, required: ["conversation", "outcome"] },
  },
  required: ["headline", "subhead", "exec_summary", "opportunity", "audience", "strategy", "market_intel", "channels", "pods", "funnel", "kpis", "rollout", "compliance", "investment", "psi_chat"],
} as unknown as Anthropic.Tool["input_schema"];

function extract(msg: Anthropic.Message): ProposalContent | null {
  const b = msg.content.find((x) => x.type === "tool_use");
  return b && b.type === "tool_use" ? (b.input as ProposalContent) : null;
}

const SYSTEM = (clientName: string, objectiveLabel: string, tier: (typeof TIERS)[TierId]) =>
  `You are the lead growth strategist and media planner at GAS Marketing Automation, the Agency of NOW, writing a WORLD-CLASS, award-winning growth proposal for ${clientName} to sign off. Discipline: Human Command, AI Execution. This is a professional client-facing document; it must be specific, confident and demonstrably expert on every pod.\n\n` +
  `THE SYSTEM (use these exact pod names, mapped to ${clientName}): Researcher, Strategist, Audience, Creative, Channels, PSI, PSI Conversion Dashboard, Media on GAS. It is one closed-loop SYSTEM: each pod feeds sharper intelligence to the next, and Media on GAS feeds every result back upstream so the system compounds and gets more intelligent over time. Always call it a "system", never an "engine".\n\n` +
  `GAS PRODUCT DOCTRINE (non-negotiable, we sell on OUR strengths):\n` +
  `- PSI (Pre-Sales Intelligence) is GAS's OWN WhatsApp lead-qualification system. We bring our own PSI WhatsApp funnel. PSI pre-qualifies every lead by INTENT and routes only the HIGH-INTENT leads to ${clientName}'s sales team, so their people stop wasting time on unqualified enquiries. NEVER reference, instrument or build the strategy around the CLIENT's own WhatsApp line, phone number, contact FORMS, store locator or any of their existing channels. Do NOT print the client's WhatsApp number, phone number or any of their contact handles ANYWHERE in the document. The WhatsApp system in this proposal is always OURS, never theirs.\n` +
  `- Sell OUR capability, not a fix to their current setup. Describe what our system does; do not describe measuring, scoring or fixing the client's existing forms, links, store locator or channels.\n` +
  `- PSI IS GAS'S OWN IP, NOT THE CLIENT'S. The PSI system and its scorecard are our technology: we build, run and retain them, and they are not transferable. The client owns their DATA (ad accounts, audiences, creative, conversation histories, performance data), which we hand back on exit. NEVER say the client owns the PSI system, the PSI knowledge base or the scorecard, and never list those as things they keep or take away. Be gentle but clear: their data is theirs, the system stays ours.\n` +
  `- HOW WE TARGET (the real mechanism, do not overclaim): we reach the audience with HYPER-TARGETED PAID ADS placed in front of the right people at their buying MOMENT, the trigger that forces a purchase (a new opening, a refurb, an intake, an accommodation audit, a review naming the product), and every ad's call to action is one WhatsApp conversation with PSI that qualifies the lead. PSI does NOT have private "signals" into businesses, it does not scrape intent data or detect triggers on its own. Never claim it senses buying signals it cannot see. Frame audiences as the MOMENT a buyer is forced to act, reached by paid targeting, then qualified in WhatsApp by PSI.\n\n` +
  `- REALISTIC BUYER EXAMPLES ONLY. Every illustrative buyer and every volume figure must be plausible for who ACTUALLY buys this product in bulk. Never dress up a private household or consumer as a bulk buyer (a private "residence" does not fit out 120 beds, a student residence, guesthouse, hotel, lodge, hospital, care home or staff-accommodation block does). Name the real institutional buyer type and pair it with a volume that buyer would credibly order. If unsure of the exact buyer, use a conservative, obviously-real example rather than an impressive but implausible one.\n\n` +
  `THE OBJECTIVE for this proposal is ${objectiveLabel}. Make the WHOLE document specific to this objective, the audience, the channels, the KPIs, the rollout and the definition of success all flow from it.\n\n` +
  `THE TIER is ${tier.name} at ${tier.rate}. Investment scope: ${tier.scope} Governance: ${tier.cadence}\n\n` +
  `HARD RULES:\n` +
  `- THE AGENCY TONE (the SINGLE most important style rule for this document, it overrides any instinct to sound clever or expert). Write the way we actually talk to a client across a table: relaxed, plain and human, but still confident and professional. The reader is a smart business owner who is NOT a marketer and has none of our jargon, and they must understand every line on the FIRST read, effortlessly. RULES OF THE TONE: short sentences and short paragraphs; a one-line sentence or a fragment is GOOD when it lands a point ("No agents in the middle."); plain everyday words only, NEVER clever or compressed phrasing (never "price-taking", "agent-fronted", "time-poor", "a forced move date" as a label, "processing tenants" - say the plain thing a person would say out loud); simple signposts are welcome ("The problem:", "Our fix:", "The goal:"); a plain direct question is welcome ("Good fit? ... Wrong budget? ..."); a warm aside is welcome ("Note the word need."); keep the concrete numbers, drop the cleverness. Purposeful short lines and simple questions are ENCOURAGED here; only EMPTY, forced or dramatic versions are wrong.\n` +
  `  WRONG TONE, too high-level, do NOT write like this: "A deadline renter is time-poor and price-taking: they will pay R6,500 for a brand-new one bed if someone confirms the unit, the price and the date today. Nobody in an agent-fronted set can do that in one conversation."\n` +
  `  RIGHT TONE, write like this: "A renter on a deadline does not shop around for weeks. They will happily pay R6,500 for a brand-new one bed if someone confirms three things today: the unit is available, the price is real, the move-in date works. Estate agents cannot confirm any of this without phoning the landlord first. You can, on the spot, because you built the building and you own it."\n` +
  `  RIGHT TONE, another example (note the plain signposts and the short lines): "Pebblestone owns its buildings. No agents in the middle. You confirm the rent, the spec and the move-in date yourself, in one chat. The problem: your website only offers an email alerts form, and a renter with 30 days left needs answers today, not an email next week. Our fix: ads aimed at renters who have to move soon, each opening a WhatsApp chat with PSI, our qualification assistant, which checks income, who is moving in, the move month and willingness to be vetted before your team spends a minute. Good fit? Your team gets a ready-to-view tenant. Wrong budget? PSI offers them another unit in your range instead. Nobody gets lost."\n` +
  `- GROUND IN THE FACTS. Use only the approved strategy and research facts provided. Never invent a fact, a name, a number or a market detail.\n` +
  `- CARRY THE STRATEGY THROUGH, DO NOT FLATTEN IT. The approved strategy is the spine of this document, and its INSIGHT, its specific angle, its evidenced wedge and its exact audience/channel choices must survive into the proposal, sharpened, never replaced with generic template filler ("a full-funnel system", "engaging creative", "data-driven targeting"). If the strategy has a sharp, non-obvious point, the proposal must make that same point, concretely. Every page should read as if written by the strategist who wrote the strategy, not a template being filled in.\n` +
  `- USE RECENT MARKET DATA. Where the research gives current, relevant market or category statistics (size, growth, trends, consumer behaviour), weave them into the opportunity and executive summary to show we understand this market NOW, each with its date. Never use a stale or generic stat, and never fabricate one.\n` +
  `- MARKET INTELLIGENCE SECTION. Include a genuine market deep-dive: recent, dated, relevant stats and the opportunities the client should consider. INCLUDE non-digital opportunities (a category event like a major expo, a partnership, a retail or product angle) flagged as broader strategic considerations for them, not things we are committing to deliver. This proves deep industry knowledge and gives value beyond the digital pods. Draw it from the strategy's market opportunities and the research facts. Only real, sourced insights.\n` +
  `- PRICE IS A STRATEGY, never dismiss it and never hide it. Buyers weigh PRICE FIRST, then value and offer, so treat pricing as a core, up-front strategic lever. Do NOT advise "revealing the price only at the point of decision", holding it back, or burying it behind a value message - that is wrong. If ${clientName} is a manufacturer or has a genuine cost advantage (manufacturer-direct, own factory, no middleman), that cost advantage is a LEAD message in its own right: they can win on price AND value at once, which a reseller competitor structurally cannot match, and the proposal should say so plainly and lead with it. Never over-rotate the whole strategy onto a single non-price "wedge" while waving price away.\n` +
  `- THE MANUFACTURER ADVANTAGE IS CONTROL, NOT SAMENESS. When ${clientName} owns the build, frame that advantage as CONTROL over spec, price, lead time, guaranteed supply and availability, custom sizing and exclusivity, PLUS the freedom to keep improving the product. Do NOT sell it as "we can make the identical product forever" and do NOT lean on continuity or "the same bed twice" as a hook, that reads as stagnation, and a business buyer expects products to get better, not be frozen. If consistency is genuinely relevant, frame it as a consistent STANDARD across a phased or repeat order (so a buyer fitting out in stages can match what they already have), never as an unchanging design.\n` +
  `- LANGUAGE IS PITCH-WINNING, never flat or literal. This is an award-winning pitch document, not a research note. Frame the client's proof points as POSITIONING and PROMISE, never by where they physically sit: never write "on the homepage", "on their website", "on their about page" or similar. Say "their published promise", "their positioning", "their stated guarantee". Every line should read like a confident agency pitch, not a flat statement of fact.\n` +
  `- COMPETITOR HONESTY. Only claim something is unique, "the only", "cannot be replicated" or "defensible" if the competitor evidence in the facts actually supports it. If competitors offer a similar guarantee, finance or promise, say so and find the genuinely defensible advantage instead of overstating one. A claim of uniqueness with no competitor set behind it is a strategist failure.\n` +
  `- THE COVER HEADLINE IS ONE ARRESTING IDEA. 'headline' must be a SINGLE, punchy, memorable line, the most compelling idea in the whole strategy, the one sentence that makes the client lean in. Do NOT bolt two ideas together with a colon or an "A ... system for ..." construction. If the strategy has a signature line (e.g. "We make the bed, so we can carry the risk"), THAT is the headline. Put the supporting detail in 'subhead'.\n` +
  `- KEEP EACH PROSE BLOCK TIGHT. The opportunity intro, the market overview and every paragraph is a few short sentences that make the point and stop, never a wall of text. Say it in half the words you first reach for. A long paragraph gets the point across worse, not better, and overflows the page.\n` +
  `- THE EXECUTIVE SUMMARY IS THE MOST IMPORTANT PAGE and is often the ONLY page a decision-maker reads, so it must WIN on its own. 'exec_summary.intro' is a genuine, self-contained ARGUMENT in plain client language: the situation, the single insight, what we will do about it, and what success looks like, in a few tight sentences. The 4 'cards' are the four strongest reasons to believe. Never leave it thin or empty. It MUST STAND ALONE: no tier names (e.g. "Dominate"), no the word "pods", no system mechanic not yet introduced.\n` +
  `- FRAME THE DISPLACEMENT (in the exec summary or opportunity): why this beats the alternative the client is actually weighing, their current setup or a conventional agency. The closed-loop system that qualifies by INTENT and compounds is the reason, stated as a plain client benefit, never a boast.\n` +
  `- STATE ANY DATA GAP ONCE, never repeatedly. If category data is genuinely thin, say so a SINGLE time, crisply, then proceed with confidence. Repeating "not in the verified record / data is thin" across pages reads as weak homework. Use the real, dated market facts you DO have assertively.\n` +
  `- NEVER COMMIT TO AN OUTCOME. No guaranteed conversion rates, lead volumes or returns anywhere. The funnel economics and any figure are ILLUSTRATIVE benchmarks, clearly labelled, never a promise.\n` +
  `- AUDIENCE IS THE PROOF OF OUR ABILITY, and it is the most important section. For each persona give ACTUAL, credible platform-level targeting selections on the platforms that genuinely fit them (from Facebook, Instagram, TikTok, Google Display, LinkedIn). Facebook/Instagram: interests, behaviours, demographics, custom + lookalike. TikTok: interests, hashtags, creator adjacencies. Google Display: in-market segments, custom-intent keywords, topics. LinkedIn: job titles, seniority, function, industry, company size. Be specific enough that a media buyer could build these audiences.\n` +
  `- THE AUDIENCE IS ABOUT WHO, NOT CREATIVE. Each persona's platform 'approach' is how we TARGET and sequence them (prospecting, retargeting, lookalikes, custom audiences), never a creative concept, ad format or campaign idea. Do not write "before/after creative" or any creative direction on the audience pages, that belongs to the Creative pod.\n` +
  `- CHANNELS: intelligently SELECT the platforms for this objective and audience and justify each, with a lead/support/test priority. Do not reflexively include every platform, choose where the value is.\n` +
  `- CHANNEL REALISM (performance-marketing truth, non-negotiable): LinkedIn is a SUPPORT / precision channel, NEVER the lead volume driver, even in B2B. Its targeting is the sharpest (title, function, seniority, industry, company size) but its lead VOLUME is low and its CPMs are high, so it qualifies and supports; the lead volume comes from Meta and Google. Never mark LinkedIn as the 'lead' channel. For a B2B lead objective the lead channel is typically Meta and/or Google (with lead forms, click-to-message, custom-intent search), and LinkedIn plays a support role for precision targeting and credibility.\n` +
  `- Map all EIGHT pods to ${clientName}, each specific to the objective.\n` +
  `- THE ROLLOUT IS A 31-DAY BUILD TO A SINGLE GO-LIVE ON DAY 31. Weeks 1 to 4 build and integrate (foundations and baselines, then audiences and creative, then integration and PSI, then final prep and QA). The campaign goes LIVE on day 31, never in week 1, 2 or 3. Do not describe going live, launching ads or first leads before day 31. Say "media" or name the platforms, not "Meta-led", since we run several channels (Meta, Google, LinkedIn where it fits). Each week's 'gate' is a readiness checkpoint WE hit internally, not a client sign-off we require, phrase it as our milestone, never as an approval the client must give.\n` +
  `- GIVE THE CREATIVE A SPIKE. The Creative pod (Pod IV) must not merely describe producing assets. Its 'for_client' must name a CREATIVE TERRITORY, one ownable, memorable idea or campaign line for ${clientName} (the kind of thought that makes a room lean in), rooted in the strategy's proposition. The document is intelligent throughout; this is the one place it must also make the client FEEL something.\n` +
  `- INVESTMENT: fill it fully. tier_name = "${tier.name}", rate = "${tier.rate}". In 'engine_includes' list 6 to 8 concrete things the SYSTEM delivers at this tier (the pods and what the tier covers, e.g. "PSI qualification and the conversion dashboard"). In 'notes' put the honest commercial notes: media budget is the client's and additional to the retainer; the client owns all data, accounts and audiences; we do not quote a guaranteed return.\n` +
  `- DO NOT COMMIT TO A FIXED SET OF ALL CHANNELS. We choose channels per objective and may not run them all. Never list a locked line like "media across Facebook, Instagram, Google Display and LinkedIn". Say "a selected media channel strategy", "media across the channels that fit this objective", or "full media management across the selected platforms". Keep it flexible.\n` +
  `- ONLY MEASURE WHAT WE CONTROL. Do not promise, commit to, or put in KPIs any metric that sits with the client and outside our control, such as enquiry-to-quote time, sales-response speed, close rate or their internal turnaround. We are accountable for what WE deliver (qualified enquiries, cost per qualified lead, qualification rate), never the client's internal process speed.\n` +
  `- Never use the word "manifesto". Confident, premium, concrete, no filler.\n\n` +
  WRITING_STYLE;

// Load the shared CONTEXT a proposal (or a single section) is written from: the approved strategy, the client, and
// the verified research facts. Extracted so the whole-proposal build and the per-section refine draw on the exact
// same grounding. We sell OUR PSI WhatsApp system, so the client's own contact channels (WhatsApp number, phone,
// forms, store locator, socials) are NEVER shown to the model: we drop the contact + online_presence facts entirely.
async function loadProposalContext(strategyId: string): Promise<{ clientId: string; clientName: string; strat: StrategyContent | null; factBlock: string; engagementId: string; campaignId: string | null }> {
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
  const PROPOSAL_FACT_EXCLUDE = new Set(["contact", "online_presence"]);
  const factBlock = facts.filter((f) => !PROPOSAL_FACT_EXCLUDE.has(f.section)).slice(0, 160).map((f) => `- [${f.section}${f.subject ? `/${f.subject}` : ""}] ${f.claim}`).join("\n");
  return { clientId, clientName, strat: strategy.content as StrategyContent | null, factBlock, engagementId: strategy.engagement_id, campaignId: strategy.campaign_id };
}

// Build the proposal content for an approved strategy, on the chosen objective + tier. Fable 5, retried on overload.
// notes/prior fold in a strategist's review comments so a rework improves the draft rather than starting cold.
export async function buildProposal(strategyId: string, input: { objective: ObjectiveId; tier: TierId; userEmail?: string | null; notes?: string; prior?: ProposalContent | null }): Promise<{ content: ProposalContent; clientId: string; engagementId: string; campaignId: string | null }> {
  const key = await getSecret("anthropic");
  if (!key) throw new Error("Claude isn't connected.");
  const { clientId, clientName, strat, factBlock, engagementId, campaignId } = await loadProposalContext(strategyId);

  const objective = OBJECTIVES.find((o) => o.id === input.objective) || OBJECTIVES[0];
  const tier = TIERS[input.tier] || TIERS.dominate;
  const client = new Anthropic({ apiKey: key });
  const priorBlock = input.prior ? `\n\nCURRENT DRAFT (improve this, do not start from scratch):\n${JSON.stringify(input.prior)}` : "";
  const notesBlock = input.notes?.trim() ? `\n\nSTRATEGIST REVIEW COMMENTS (a senior human, apply each precisely - this is the human gate):\n${input.notes.trim().slice(0, 3000)}` : "";
  const user =
    `CLIENT: ${clientName}\nOBJECTIVE: ${objective.label} (${objective.note})\nTIER: ${tier.name} at ${tier.rate}\n\n` +
    `THE APPROVED STRATEGY (the spine of this proposal):\n${JSON.stringify(strat)}\n\n` +
    `THE VERIFIED RESEARCH FACTS (ground the opportunity, audience and pods in these):\n${factBlock}${priorBlock}${notesBlock}\n\n` +
    `Write the full proposal via write_proposal. Make the audience and channels world-class and specific.`;

  // Fable 5 occasionally leaks the textual tool-call format into nested fields (whole sections come back as strings
  // containing <parameter name="...">) instead of proper nested JSON. strict:true fixes it but 400s here ("compiled
  // grammar too large") because the full 14-section schema is too big to compile a strict grammar. So instead: DETECT
  // the leak and RETRY once (the failure is intermittent), then best-effort repair any residual leaked section.
  const tool: Anthropic.Tool = { name: "write_proposal", description: "The complete, structured growth proposal.", input_schema: CONTENT_SCHEMA };
  // max_tokens must clear the FULL proposal: 5 personas with platform-level selections, 8 pods, KPIs, rollout,
  // compliance AND investment are the LAST fields, so a tight ceiling truncates exactly those (the "blank
  // investment / rollout / compliance" bug). 32k gives ample headroom for the whole structured object.
  const runOnce = async (action: string): Promise<ProposalContent | null> => {
    const msg = await withAnthropicRetry(() => client.messages.stream({
      model: FABLE, max_tokens: 32000, system: SYSTEM(clientName, objective.label, tier),
      tools: [tool], tool_choice: { type: "tool", name: "write_proposal" },
      messages: [{ role: "user", content: user }],
    }).finalMessage());
    await meterClaude(msg, { clientId, userEmail: input.userEmail ?? null, model: FABLE, action }).catch(() => {});
    return extract(msg);
  };
  let content = await runOnce("proposal-build");
  // If Fable leaked the tool-call format into the sections, run it once more (it is intermittent), then repair.
  if (content && leakedContent(content)) content = (await runOnce("proposal-build-retry")) || content;
  if (!content) throw new Error("The proposal draft came back empty. Try again.");
  content = repairLeakedContent(content);
  return { content, clientId, engagementId, campaignId };
}

// ── Fable tool-call-leak detection + best-effort repair ──────────────────────────────────────────────────────
// The top-level content sections that are OBJECTS (not arrays/strings); these are the ones Fable can return as a
// <parameter>-laced string instead of a nested object.
const PROPOSAL_OBJECT_SECTIONS: (keyof ProposalContent)[] = ["exec_summary", "opportunity", "audience", "strategy", "market_intel", "channels", "funnel", "compliance", "investment", "psi_chat"];
function leakedContent(c: ProposalContent): boolean {
  try { return JSON.stringify(c).includes("<parameter name="); } catch { return false; }
}
// Parse a leaked "<parameter name="X">value<parameter name="Y">value" string back into an object, best-effort.
function parseParamString(s: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const re = /<parameter name="([^"]+)">([\s\S]*?)(?=<parameter name="|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out[m[1].trim()] = m[2].trim();
  return out;
}
// Recover any section Fable returned as a leaked string, and strip stray tags from the top-level strings. Missing
// sub-fields stay absent and are filled by the map's per-section fallbacks (e.g. the exec-summary cards synthesiser).
function repairLeakedContent(c: ProposalContent): ProposalContent {
  const rec = c as unknown as Record<string, unknown>;
  for (const k of PROPOSAL_OBJECT_SECTIONS) {
    const v = rec[k as string];
    if (typeof v === "string" && v.includes("<parameter name=")) rec[k as string] = parseParamString(v);
  }
  for (const k of ["headline", "subhead"]) {
    const v = rec[k];
    if (typeof v === "string" && v.includes("<parameter name=")) rec[k] = v.replace(/<parameter name="[^"]*">/g, " ").replace(/\s{2,}/g, " ").trim();
  }
  return c;
}

// ── Persistence ──────────────────────────────────────────────────────────────────────────────────────────────
export type Proposal = {
  id: string; engagement_id: string; campaign_id: string | null; strategy_id: string | null;
  objective: string; tier: string; status: string; content: ProposalContent | null;
  pdf_url: string | null; section_review: Record<string, string> | null;
  approved_by: string | null; approved_at: string | null; created_at: string;
};

// THE REVIEWABLE SECTIONS (the per-section human gate). Each maps to one or more top-level content fields, so a
// section refine returns ONLY those fields and merges back, leaving the rest of the proposal untouched. `key` is the
// gate key stored in proposals.section_review; `fields` are the content keys the model rewrites for that section.
export const PROPOSAL_SECTIONS: { key: string; label: string; fields: (keyof ProposalContent)[] }[] = [
  { key: "cover", label: "Cover", fields: ["headline", "subhead"] },
  { key: "exec_summary", label: "Executive summary", fields: ["exec_summary"] },
  { key: "opportunity", label: "The opportunity", fields: ["opportunity"] },
  { key: "audience", label: "The audience", fields: ["audience"] },
  { key: "strategy", label: "Strategic recommendation", fields: ["strategy"] },
  { key: "market_intel", label: "Market intelligence", fields: ["market_intel"] },
  { key: "channels", label: "Channel plan", fields: ["channels"] },
  { key: "pods", label: "The eight pods", fields: ["pods"] },
  { key: "funnel", label: "Funnel economics", fields: ["funnel"] },
  { key: "kpis", label: "KPIs", fields: ["kpis"] },
  { key: "rollout", label: "31-day rollout", fields: ["rollout"] },
  { key: "compliance", label: "Compliance", fields: ["compliance"] },
  { key: "investment", label: "The investment", fields: ["investment"] },
  { key: "psi_chat", label: "PSI conversation", fields: ["psi_chat"] },
];

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

// ── Per-section human-in-the-loop review ─────────────────────────────────────────────────────────────────────
const CONTENT_PROPS = (CONTENT_SCHEMA as { properties: Record<string, unknown> }).properties;

// REFINE ONE SECTION (Human Command). A senior human reads a section and steers it with a plain-English instruction;
// Fable rewrites ONLY that section, grounded in the same strategy + facts, and it merges back into the proposal so
// the approved sections around it are untouched. The edited section returns to 'draft' (needs re-approval) and any
// rendered PDF is invalidated.
export async function refineProposalSection(proposalId: string, section: string, instruction: string, userEmail?: string | null): Promise<Proposal> {
  const rows = (await db().query(`select * from proposals where id = $1`, [proposalId])) as Proposal[];
  const cur = rows[0];
  if (!cur) throw new Error("That proposal was not found.");
  if (cur.status === "approved") throw new Error("That proposal is approved. Reopen it to edit a section.");
  if (!cur.strategy_id || !cur.content) throw new Error("This proposal has no strategy or content to refine from.");
  const def = PROPOSAL_SECTIONS.find((s) => s.key === section);
  if (!def) throw new Error("Unknown section.");
  const key = await getSecret("anthropic");
  if (!key) throw new Error("Claude isn't connected.");
  const { clientId, clientName, strat, factBlock } = await loadProposalContext(cur.strategy_id);
  const objective = OBJECTIVES.find((o) => o.id === (cur.objective as ObjectiveId)) || OBJECTIVES[0];
  const tier = TIERS[cur.tier as TierId] || TIERS.dominate;

  // A tool whose schema is JUST this section's fields, so the model can only return those, matching the exact shape.
  const props: Record<string, unknown> = {};
  for (const f of def.fields) props[f] = CONTENT_PROPS[f as string];
  const sectionSchema = { type: "object", additionalProperties: false, properties: props, required: def.fields } as unknown as Anthropic.Tool["input_schema"];
  const tool: Anthropic.Tool = { name: "write_section", description: `The revised "${def.label}" section only.`, input_schema: sectionSchema };
  const curSection: Record<string, unknown> = {};
  for (const f of def.fields) curSection[f] = (cur.content as unknown as Record<string, unknown>)[f as string];

  const user =
    `CLIENT: ${clientName}\nOBJECTIVE: ${objective.label} (${objective.note})\nTIER: ${tier.name} at ${tier.rate}\n\n` +
    `You are refining ONE section of an existing, otherwise-final proposal: "${def.label}". Everything else in the proposal stays exactly as it is. Return ONLY this section, revised, in the same structure.\n\n` +
    `THE APPROVED STRATEGY (context, the spine of the whole proposal):\n${JSON.stringify(strat)}\n\n` +
    `THE VERIFIED RESEARCH FACTS (context, ground everything in these):\n${factBlock}\n\n` +
    `THE CURRENT "${def.label}" SECTION:\n${JSON.stringify(curSection)}\n\n` +
    `THE INSTRUCTION (a senior human, apply it precisely, this is the human gate):\n${instruction.trim().slice(0, 3000)}\n\n` +
    `Rewrite the section via write_section. Keep every doctrine and writing rule, keep it consistent with the rest of the proposal, and change only what the instruction asks for.`;

  const client = new Anthropic({ apiKey: key });
  // Same Fable leak guard as the full build (strict would 400 on a big section's grammar): detect + retry once.
  const runSection = async (action: string): Promise<Record<string, unknown> | null> => {
    const msg = await withAnthropicRetry(() => client.messages.stream({
      model: FABLE, max_tokens: 12000, system: SYSTEM(clientName, objective.label, tier),
      tools: [tool], tool_choice: { type: "tool", name: "write_section" },
      messages: [{ role: "user", content: user }],
    }).finalMessage());
    await meterClaude(msg, { clientId, userEmail: userEmail ?? null, model: FABLE, action }).catch(() => {});
    const b = msg.content.find((x) => x.type === "tool_use");
    return b && b.type === "tool_use" ? (b.input as Record<string, unknown>) : null;
  };
  const sectionLeaked = (o: Record<string, unknown> | null) => { try { return !!o && JSON.stringify(o).includes("<parameter name="); } catch { return false; } };
  let revised = await runSection("proposal-section");
  if (sectionLeaked(revised)) revised = (await runSection("proposal-section-retry")) || revised;
  if (!revised) throw new Error("The section came back empty. Try again.");
  // Repair any field this section returned as a leaked <parameter> string.
  for (const f of def.fields) { const v = revised[f as string]; if (typeof v === "string" && v.includes("<parameter name=")) revised[f as string] = parseParamString(v); }

  // Merge ONLY this section's fields back into the full content, leaving everything else intact.
  const content = { ...(cur.content as unknown as Record<string, unknown>) };
  for (const f of def.fields) if (f in revised) content[f as string] = revised[f as string];
  const review = { ...(cur.section_review || {}) };
  review[section] = "draft";   // a refined section must be re-read and re-approved
  const upd = (await db().query(
    `update proposals set content = $2, section_review = $3::jsonb, pdf_url = null where id = $1 returning *`,
    [proposalId, JSON.stringify(content), JSON.stringify(review)],
  )) as Proposal[];
  return upd[0];
}

// EDIT A SECTION BY HAND (Human Command). The human edits the actual copy of a section's fields and saves; we merge
// those exact fields back into the proposal, leaving everything else intact. The edited section returns to 'draft'
// (a change means it should be re-read and re-approved) and any rendered PDF is invalidated. No model call.
export async function editProposalSection(proposalId: string, section: string, value: Record<string, unknown>): Promise<Proposal> {
  const rows = (await db().query(`select * from proposals where id = $1`, [proposalId])) as Proposal[];
  const cur = rows[0];
  if (!cur) throw new Error("That proposal was not found.");
  if (cur.status === "approved") throw new Error("That proposal is approved. Reopen it to edit a section.");
  if (!cur.content) throw new Error("This proposal has no content to edit.");
  const def = PROPOSAL_SECTIONS.find((s) => s.key === section);
  if (!def) throw new Error("Unknown section.");
  const content = { ...(cur.content as unknown as Record<string, unknown>) };
  for (const f of def.fields) if (f in value) content[f as string] = value[f as string];
  const review = { ...(cur.section_review || {}) };
  review[section] = "draft";
  const upd = (await db().query(
    `update proposals set content = $2, section_review = $3::jsonb, pdf_url = null where id = $1 returning *`,
    [proposalId, JSON.stringify(content), JSON.stringify(review)],
  )) as Proposal[];
  return upd[0];
}

// Set a section's human-gate state (approve, or reopen to draft). Approving all sections unlocks the final PDF.
export async function setProposalSectionReview(proposalId: string, section: string, state: "approved" | "draft"): Promise<Proposal> {
  const rows = (await db().query(`select section_review from proposals where id = $1`, [proposalId])) as { section_review: Record<string, string> | null }[];
  if (!rows[0]) throw new Error("That proposal was not found.");
  const review = { ...(rows[0].section_review || {}) };
  review[section] = state;
  const upd = (await db().query(`update proposals set section_review = $2::jsonb where id = $1 returning *`, [proposalId, JSON.stringify(review)])) as Proposal[];
  return upd[0];
}
