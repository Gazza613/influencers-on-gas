import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { getSecret } from "./connections";
import { STANDARD, INGEST } from "./vendors/anthropic";
import { clientWebsite, siteAnchor, deriveResearchBrief } from "./intel";
import { recordTokens } from "./usage";
import { verifyFinding, toISODate } from "./verify";

// THE RESEARCHER, V3 - A COLLECTOR, NEVER AN ANALYST (build spec V3, section 3).
//
// This corrects the earlier build, where the Researcher produced threats/opportunities/gaps/positioning/trends.
// Those are ANALYSIS and they now belong to the Strategist. The reason is Gate 1: Gary can only sign off a fact
// base if what he is approving is falsifiable FACT, not opinion. So this engine collects and verifies facts, tags
// every one with a source and a tier, and never interprets. No "opportunity", "threat", "gap", "should" - ever.
//
// WHAT IT PRODUCES: a set of typed CLAIMS (claim + source + tier + date + section), stored in research_claims
// against a versioned research_run. The PDF, the Gate 1 review screen and the hand-off to the Strategist are all
// RENDERS of that claim store - the research is data, not a prose blob. This is what makes the inline
// claim/source/tier gate UI, the delta/refresh mode, and the clean Strategist hand-off possible.
//
// SOURCE TIERING (spec 3.4), on every claim:
//   Tier 1 load-bearing  - the client's own site/channels, regulators, official releases, verified financials.
//   Tier 2 reliable      - established news, industry bodies, credible trade press, verified reviews (HelloPeter).
//   Tier 3 directional   - social, forums, single-source. Tier 3 that matters goes to Unverified unless corroborated.
//
// TIME-BOXING (spec 3.3): evergreen facts (history, ownership, products, pricing) are NOT time-boxed. Activity
// signals (news, social, campaigns, hiring, reviews) default to a 90-day window; anything older is kept only with
// its date shown. Unlike the old analytical Researcher we do NOT hard-drop on recency - a collector collects.

export const RESEARCH_SECTIONS = [
  { id: "snapshot", label: "Who they are" },
  { id: "foundations", label: "Company foundations" },
  { id: "leadership", label: "Leadership and management team" },
  { id: "products", label: "Products, services and commercial model" },
  { id: "market", label: "Market and category" },
  { id: "positioning", label: "How they position themselves" },
  { id: "audience", label: "Audience and customers" },
  { id: "digital", label: "Digital footprint" },
  { id: "contact", label: "Contact and social channels" },
  { id: "marketing", label: "Current marketing and advertising" },
  { id: "competitor", label: "Competitor intelligence" },
  { id: "competitor_set", label: "Competitor set" },
  { id: "activity", label: "90-day activity log" },
  { id: "press", label: "Press and media" },
  { id: "customer_voice", label: "Customer voice" },
  { id: "faqs", label: "Published FAQs" },
  { id: "regulatory", label: "Regulatory, compliance and advertising rules" },
  { id: "unverified", label: "Unverified, treat as signal only" },
] as const;
export type ResearchSectionId = (typeof RESEARCH_SECTIONS)[number]["id"];
const SECTION_IDS = new Set(RESEARCH_SECTIONS.map((s) => s.id));

export const ACTIVITY_WINDOW_DAYS = 90;

// THE FACTS-ONLY MANDATE (spec 3.1). Every rule here is load-bearing; adapt wording, keep the rules.
const FACTS_ONLY = `You are The Researcher at GAS Marketing, a top 1% marketing researcher. You COLLECT and VERIFY facts about a client, their market, and their competitors. You never analyse, interpret, recommend, or editorialise.

HARD RULES:
- You never use the words opportunity, threat, gap, weakness, strength, should, could, suggests, or recommend in relation to the client. No SWOT. No conclusions. Facts only.
- Every factual claim you record carries a SOURCE (the real URL you read) and the DATE the source was published or accessed.
- You distinguish VERIFIED FACT from UNVERIFIED SIGNAL and never blend the two. If you cannot verify a claim, you place it in the Unverified section with the reason, you do not drop it.
- You would rather return less that is certain than more that is doubtful. You never fill gaps with plausible-sounding assumptions.
- When two sources conflict, you record BOTH and flag the conflict rather than choosing.
- You write in UK British English, use commas rather than em dashes (never an em or en dash), and write concisely and plainly.

SOURCE TIERING - tag every claim:
- Tier 1 (load-bearing): the client's own website and official channels, regulatory filings, official press releases, verified financial disclosures.
- Tier 2 (reliable): established news media, industry bodies, credible trade publications, verified review platforms (Google Reviews, HelloPeter for South Africa).
- Tier 3 (directional): social commentary, forums, unverified media, single-source claims. A Tier 3 claim that matters goes to the Unverified section unless a Tier 1 or 2 source corroborates it.

TIME-BOXING:
- Evergreen facts are NOT time-boxed: company history, ownership and leadership, products and services, pricing where public, distribution and footprint, brand assets and tone of voice on owned channels, historical campaigns of significance. Mark these evergreen=true.
- Activity signals default to the last 90 days: news, press, social activity, advertising and campaign activity, promotions, launches, hiring, reviews and sentiment. Mark these evergreen=false. You may go older only where it genuinely adds context, and the date must be recorded.`;

// COMPETITOR INTELLIGENCE from observable public channels only (spec 3.5). No ad libraries - explicitly deferred.
const COMPETITOR_BRIEF = `COMPETITOR INTELLIGENCE (for the client AND every competitor), from PUBLIC, OWNED channels only - record what is factually observable, never whether it is good:
- Websites: propositions, offers, pricing where public, calls to action, landing approaches.
- Social presence: which platforms are in use, posting cadence, content formats, visible campaign themes and promotions within the activity window.
- Search visibility: whether the brand is visibly present for the category's core terms, and with what visible message. Do NOT claim rankings or SEO metrics you cannot observe directly, state presence and visible messaging only.
Record each observation as a claim whose subject is the brand it is about. Do NOT use any ad library (Meta Ad Library, TikTok Creative Centre, ad transparency) - that source is out of scope for this build.`;

const NO_DASH_NOTE = `Write every field in UK British English. Never use an em dash or en dash: use a comma, a full stop, or a plain hyphen.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    claims: {
      type: "array",
      description: "Every fact you collected, one claim per item. No analysis, no recommendations, no SWOT.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          section: {
            type: "string",
            enum: RESEARCH_SECTIONS.map((s) => s.id),
            description: "snapshot=who they are, what they sell, where they play. foundations=history, ownership, structure, milestones. leadership=a named member of the management or executive team with their role and a short factual background (research them, LinkedIn included). products=a product/service, pricing where public, propositions, AND the commercial model: how they make money, price points, deal size, how they sell/distribute (direct, adviser network, retail, online), and partnerships. market=market size where sourced, dynamics, category. positioning=how the CLIENT positions ITSELF: their stated promise, brand story, unique selling points, tone of voice, brand assets (observable, NOT your recommendation). audience=who they serve now, their customer base and segments, any stated target audience. digital=website observations, SEO basics, social posting cadence and content. contact=a contact or channel fact: a phone number, email, physical address, operating hours, WhatsApp number, or an official social profile (platform + full URL/handle). marketing=the CLIENT's OWN current marketing and advertising, observed: channels in use, campaign themes, promotions, and whether they run paid ads. competitor=an observable public-channel fact about the CLIENT or a named competitor (see the competitor brief). competitor_set=a one-line factual profile of a competitor. activity=a dated development in the last 90 days. press=a media release, news article, interview, podcast, award or notable third-party mention of the client, at ANY date, sourced to the original. customer_voice=reviews, ratings, public sentiment and recurring themes (SA platforms included). faqs=one of the brand's OWN published frequently-asked questions, as the question and its answer, sourced to their FAQ/help page. regulatory=ONLY when the client is in a regulated sector (e.g. financial services): the licence identifier, licence status and authorised categories from the regulator's own register, AND the advertising/marketing rules that constrain campaigns (e.g. FAIS: no guarantees, no urgency devices, mandatory disclaimers). unverified=a claim you could not verify but which may carry signal.",
          },
          subject: { type: "string", description: "The brand this fact is about: the client's name, or a named competitor." },
          claim: { type: "string", description: "The fact itself, plainly stated. No interpretation." },
          source_name: { type: "string", description: "The publication or page the fact came from." },
          source_url: { type: "string", description: "The ORIGINAL page you read - never a search-results page, aggregator or bare homepage. Never invent a URL." },
          source_date: { type: "string", description: "Date the source was published or accessed, YYYY-MM-DD. Empty string only if genuinely undateable." },
          tier: { type: "integer", enum: [1, 2, 3], description: "1 load-bearing, 2 reliable, 3 directional. See the tiering rules." },
          evergreen: { type: "boolean", description: "true if this is an evergreen fact (not time-boxed); false if it is an activity signal (90-day window)." },
          unverified_reason: { type: "string", description: "ONLY for section=unverified: why this is signal not fact (e.g. single unverified social source). Empty otherwise." },
          conflict: { type: "string", description: "If two sources disagree, note the conflict here and record both as separate claims. Empty otherwise." },
        },
        required: ["section", "subject", "claim", "source_name", "source_url", "source_date", "tier", "evergreen", "unverified_reason", "conflict"],
      },
    },
    competitors: {
      type: "array",
      description: "The competitor set you detected from the category, market and search evidence. Name and website each.",
      items: {
        type: "object", additionalProperties: false,
        properties: { name: { type: "string" }, website: { type: "string", description: "Their official website URL, or empty string." } },
        required: ["name", "website"],
      },
    },
    vertical: { type: "string", description: "The client's marketing VERTICAL/category, one short label the benchmark library is keyed by, e.g. 'insurance', 'financial advice', 'fintech', 'FMCG', 'education', 'retail', 'marketing agency', 'automotive'. Your best single classification." },
    regulated: { type: "boolean", description: "true ONLY if the client operates in a regulated sector (financial services, healthcare, legal, etc.) with a licence and a regulator. false for an ordinary business (agency, retailer, restaurant)." },
    identity: {
      type: "object", additionalProperties: false,
      description: "The header facts for the brief cover. Each an empty string if genuinely not found - never invent.",
      properties: {
        legal_name: { type: "string", description: "The registered legal name (e.g. 'The Amber Room (Pty) Ltd'), if different from the trading name." },
        licence: { type: "string", description: "The regulatory licence identifier if regulated (e.g. 'FSP 43237'), else empty." },
        address: { type: "string", description: "The head-office physical address." },
        markets: { type: "string", description: "Where they operate (e.g. 'South Africa, nationwide')." },
        contact_person: { type: "string", description: "A named primary contact if published (name + role), else empty." },
        contact_details: { type: "string", description: "The primary phone and/or email for the business." },
      },
      required: ["legal_name", "licence", "address", "markets", "contact_person", "contact_details"],
    },
  },
  required: ["claims", "competitors", "vertical", "regulated", "identity"],
} as unknown as Anthropic.Tool["input_schema"];

export type CollectEvent =
  | { t: "phase"; label: string }
  | { t: "search"; q: string }
  | { t: "sources"; n: number }
  | { t: "claim"; section: string; claim: string }
  | { t: "done"; count: number }
  | { t: "error"; message: string };

export type ResearchIdentity = { legal_name: string | null; licence: string | null; address: string | null; markets: string | null; contact_person: string | null; contact_details: string | null };
export type ResearchRun = {
  id: string; client_id: string; version: number; status: string; website: string | null;
  notes: string | null; user_email: string | null; created_at: string; vertical?: string | null;
  identity?: ResearchIdentity | null;
  pdf_url?: string | null; drive_url?: string | null; word_url?: string | null; notified_at?: string | null;
};
export type ResearchClaim = {
  id: string; run_id: string; client_id: string; section: string; subject: string | null; claim: string;
  source_name: string | null; source_url: string | null; source_date: string | null; tier: number | null;
  verified: boolean; unverified_reason: string | null; conflict: string | null;
  rejected?: boolean; rejected_by?: string | null;
};

const noDash = (s: unknown) => String(s ?? "")
  .replace(/(\d)\s*[—–]\s*(\d)/g, "$1-$2")
  .replace(/\s*[—–]\s*/g, " - ")
  .trim();

/**
 * Collect a verified, source-tiered fact base for one client, as a new versioned research_run. Facts only - no
 * analysis ever. Returns the run and its stored claims. onEvent streams live progress for the desk to narrate.
 *
 * @param notes optional Gate-1 "rerun with notes" corrections, folded into this version's brief.
 */
export async function collectResearch(
  clientId: string,
  today: string,
  opts: { userEmail?: string | null; notes?: string | null; onEvent?: (e: CollectEvent) => void } = {},
): Promise<{ run: ResearchRun; claims: ResearchClaim[] }> {
  const { userEmail, notes } = opts;
  const emit = (e: CollectEvent) => { try { opts.onEvent?.(e); } catch { /* progress is best-effort */ } };
  const key = await getSecret("anthropic");
  if (!key) throw new Error("Claude isn't connected");
  const client = new Anthropic({ apiKey: key });

  // Identity + ground-truth anchor. A name is the minimum; the website is what stops us researching a same-named
  // but different business (Gary, material). deriveResearchBrief gives us the client's own crawled material too.
  const derived = await deriveResearchBrief(clientId);
  if (!derived) throw new Error("This brain has nothing to research yet. Add the client and crawl their site into the brain first.");
  const name = derived.clientName;
  const website = await clientWebsite(clientId).catch(() => null);
  const anchor = siteAnchor(name, website);

  // Existing competitor set - so a targeted re-pass can be scoped, and so we build on the set, not replace it.
  const knownCompetitors = (await db().query(
    `select name, website from research_competitors where client_id = $1 order by created_at asc`, [clientId],
  )) as { name: string; website: string | null }[];

  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - ACTIVITY_WINDOW_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const knownList = knownCompetitors.length
    ? `\n\nKNOWN COMPETITOR SET (research these too, and add any genuine competitor you find):\n${knownCompetitors.map((c) => `- ${c.name}${c.website ? ` (${c.website})` : ""}`).join("\n")}`
    : "";
  const notesBlock = notes?.trim()
    ? `\n\nCORRECTION NOTES from the last review (address these precisely in this version):\n${notes.trim().slice(0, 2000)}`
    : "";

  const scope = `SCOPE LOCK. You are collecting facts about ${name}, and ONLY ${name}. ${name} is the SUBJECT; any other company appears only as a competitor or market context.${anchor}`;

  const brief = `Today is ${today}. Collect a verified fact base on ${name} for a marketing research brief.${knownList}${notesBlock}\n\n` +
    `Cover every angle a marketing strategist needs: who they are and what they sell (snapshot), history/ownership/structure (foundations), the leadership and management team (leadership), products/pricing and the commercial model - how they make money and how they sell (products), the market and category (market), how THEY position themselves - promise, USPs, tone (positioning), who they serve and their audience (audience), website/SEO/social (digital), their OWN current marketing and advertising (marketing), the competitor intelligence below, a one-line profile of each competitor (competitor_set), dated developments in the last 90 days on/after ${cutoffStr} (activity), press and media (press), and reviews/sentiment incl. SA platforms like HelloPeter and Google (customer_voice).\n\n` +
    `Also set the tool fields 'vertical' (the client's marketing category) and 'regulated' (whether they are in a licensed/regulated sector).\n\n` +
    `ALWAYS COLLECT, EVERY RUN, WITHOUT EXCEPTION (check the site footer, and the contact, about, team and help pages):\n` +
    `- LEADERSHIP (section=leadership): research the management and executive team PROPERLY - names, roles and a short factual background for each, using the About/Team page AND LinkedIn. Do this on every client.\n` +
    `- AUDIENCE (section=audience): who the client serves today, their customer base and segments, and any stated target audience.\n` +
    `- CURRENT MARKETING (section=marketing): the client's OWN observable marketing and advertising - which channels they post on, cadence, campaign themes, promotions, and whether they run paid ads.\n` +
    `- CONTACT DETAILS (section=contact): every phone number, email address, physical address, operating hours and WhatsApp number ${name} publishes.\n` +
    `- SOCIAL CHANNELS (section=contact): every official social profile ${name} runs, each as the platform plus its full URL or @handle (Facebook, Instagram, LinkedIn, X/Twitter, TikTok, YouTube).\n` +
    `- PRESS AND MEDIA (section=press): media releases, news, interviews, podcasts, awards and notable third-party mentions, at ANY date, each sourced. Search beyond their own site.\n` +
    `- PUBLISHED FAQs (section=faqs): ${name}'s OWN frequently-asked questions, each as the question and its answer, sourced to their FAQ/help page.\n` +
    `- REGULATORY, ONLY IF THE CLIENT IS IN A REGULATED SECTOR (section=regulatory): if and ONLY if ${name} is in financial services or another licensed/regulated field, capture its licence identifier (e.g. an FSP number, usually in the footer), verify it on the regulator's OWN register (for an FSP, the FSCA register) and record licence status and authorised categories, AND the advertising rules that constrain its campaigns (e.g. FAIS: no guarantees, no urgency devices, mandatory disclaimers). If the client is NOT regulated (an agency, retailer, restaurant, and the like), SKIP this entirely - do not hunt for a licence that does not exist.\n` +
    `If the site or the wider record genuinely has none of an APPLICABLE item, record that absence as a single section=unverified note rather than leaving it out silently.\n\n` +
    `${COMPETITOR_BRIEF}\n\n` +
    `Search the web now, properly and widely, and do NOT lean only on their own website: ${name}'s own site${website ? ` (${website})` : ""} and channels, PLUS Google News and newsrooms, trade and industry publications, LinkedIn (for the team), business directories, partner and award announcements, review platforms, and - for a regulated client only - the relevant regulator's register. Their site establishes who they are; the independent record is where much of the fact base lives. Record every claim with its real source URL, the source date, and a tier. Facts only.`;

  emit({ t: "phase", label: `Collecting facts on ${name}` });
  let sourcesRead = 0, searchCount = 0;
  const stream = client.messages.stream({
    model: STANDARD,
    max_tokens: 8000,
    system: `${scope}\n\n${FACTS_ONLY}`,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 12 } as unknown as Anthropic.Tool],
    messages: [{ role: "user", content: brief }],
  });
  stream.on("contentBlock", (blk) => {
    const b = blk as { type: string; name?: string; input?: { query?: string }; content?: unknown };
    if (b.type === "server_tool_use" && b.name === "web_search" && b.input?.query) {
      searchCount += 1; emit({ t: "search", q: String(b.input.query).slice(0, 160) });
    } else if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
      sourcesRead += b.content.length; emit({ t: "sources", n: sourcesRead });
    }
  });
  const gathered = await stream.finalMessage();
  const gu = gathered.usage as { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number; server_tool_use?: { web_search_requests?: number } } | undefined;
  await recordTokens({
    clientId, userEmail, model: STANDARD, action: "deep-research",
    inputTokens: gu?.input_tokens || 0, outputTokens: gu?.output_tokens || 0,
    cacheReadTokens: gu?.cache_read_input_tokens || 0, cacheCreationTokens: gu?.cache_creation_input_tokens || 0,
    webSearches: gu?.server_tool_use?.web_search_requests ?? searchCount,
  }).catch(() => {});

  // FILE THE FACTS as structured claims (forced tool, so a fact base always comes back).
  //
  // FILE FROM THE REAL RESULTS, NOT A SUMMARY (Gary hit 0 claims on Amber Room). The gather step does NOT always
  // end by writing a text summary - sometimes the model stops on the search results themselves. Feeding the file
  // step only that (often empty) summary left it with nothing, and because we correctly forbid inventing facts,
  // it filed zero. So we CONTINUE the same conversation: the gather's assistant turn carries every web_search
  // result block, so the model files from the actual sources it read. web_search stays declared (to keep those
  // result blocks valid) but tool_choice forces file_facts, so it files rather than searching again. max_tokens
  // is generous because a full fact base is many claims and a truncated tool call is invalid JSON.
  // OUTPUT MUST NOT TRUNCATE. A forced tool call that runs past max_tokens is invalid JSON, which parses to ZERO
  // claims (Gary hit exactly this on a content-rich client: a wide search found so many facts the file call blew
  // the 16k ceiling and filed nothing). So max_tokens is large AND the model is asked to bound the fact base to
  // the material facts - a fact base is not "everything on the internet", it is the ~70 facts that matter.
  // STREAMED, not create(). At max_tokens this large the SDK REFUSES a non-streaming request ("Streaming is
  // required for operations that may take longer than 10 minutes") and throws before it ever calls the API - so
  // a non-streaming create here would fail outright. Streaming lifts that cap and is how the gather already runs.
  emit({ t: "phase", label: "Filing the facts, with sources and tiers" });
  const filed = await client.messages.stream({
    model: STANDARD,
    max_tokens: 32000,
    system: `${scope}\n\n${FACTS_ONLY}\n\n${COMPETITOR_BRIEF}\n\n${NO_DASH_NOTE}\n\nFile the MATERIAL facts you found in your search as structured claims via file_facts, up to about 70 claims. Prioritise the most useful and load-bearing facts and do NOT pad, but never omit the always-collect items (regulatory identity, contact details, social channels, press and FAQs). Carry the REAL source URLs and dates through, never invent one. Tag every claim with its section, subject, tier and whether it is evergreen. Put anything you could not verify into section=unverified with a reason. Where two sources disagree, record both and note the conflict.`,
    tools: [
      { type: "web_search_20250305", name: "web_search", max_uses: 12 } as unknown as Anthropic.Tool,
      { name: "file_facts", description: "The verified fact base, every claim sourced and tiered.", input_schema: SCHEMA },
    ],
    tool_choice: { type: "tool", name: "file_facts" },
    messages: [
      { role: "user", content: brief },
      { role: "assistant", content: gathered.content },
      { role: "user", content: "Now file the material facts you found via file_facts (up to ~70), each with its real source URL, date and tier. Do not search again." },
    ],
  }).finalMessage();
  // If the tool call still hit the ceiling, the JSON is truncated and unparseable - surface it rather than
  // silently filing zero (the failure mode we are fixing).
  if (filed.stop_reason === "max_tokens") emit({ t: "phase", label: "The fact base was very large; filing what was captured" });
  const fu = filed.usage as { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } | undefined;
  await recordTokens({
    clientId, userEmail, model: STANDARD, action: "research-file",
    inputTokens: fu?.input_tokens || 0, outputTokens: fu?.output_tokens || 0,
    cacheReadTokens: fu?.cache_read_input_tokens || 0, cacheCreationTokens: fu?.cache_creation_input_tokens || 0,
  }).catch(() => {});

  const block = filed.content.find((b) => b.type === "tool_use");
  const out = (block && block.type === "tool_use" ? block.input : {}) as { claims?: Record<string, unknown>[]; competitors?: { name?: string; website?: string }[]; vertical?: string; regulated?: boolean; identity?: Record<string, unknown> };
  const vertical = noDash(out.vertical).slice(0, 80) || null;
  const idIn = (out.identity || {}) as Record<string, unknown>;
  const identity = {
    legal_name: noDash(idIn.legal_name).slice(0, 200) || null,
    licence: noDash(idIn.licence).slice(0, 120) || null,
    address: noDash(idIn.address).slice(0, 300) || null,
    markets: noDash(idIn.markets).slice(0, 200) || null,
    contact_person: noDash(idIn.contact_person).slice(0, 200) || null,
    contact_details: noDash(idIn.contact_details).slice(0, 200) || null,
  };
  const rawClaims = (Array.isArray(out.claims) ? out.claims : [])
    .map((c) => ({
      section: SECTION_IDS.has(String(c.section) as ResearchSectionId) ? String(c.section) : "snapshot",
      subject: noDash(c.subject).slice(0, 200) || name,
      claim: noDash(c.claim).slice(0, 2000),
      source_name: noDash(c.source_name).slice(0, 200) || null,
      source_url: typeof c.source_url === "string" && /^https?:\/\//i.test(c.source_url) ? c.source_url : null,
      source_date: toISODate(c.source_date),
      tier: [1, 2, 3].includes(Number(c.tier)) ? Number(c.tier) : 3,
      unverified_reason: noDash(c.unverified_reason).slice(0, 500) || null,
      conflict: noDash(c.conflict).slice(0, 500) || null,
    }))
    .filter((c) => c.claim.length > 0);

  // VERIFIED RETRIEVAL (spec 3.7). We do not take the model's word that a source exists, says what it claims, or
  // carries the date it claims. For each sourced claim we FETCH the page, read its real date, and check support.
  // A claim whose page 404s or does not support it is NOT dropped (a collector keeps signal) - it is MOVED to the
  // Unverified section with the reason, and the date we store is the one we read off the page.
  const sourced = rawClaims.filter((c) => c.source_url);
  if (sourced.length) emit({ t: "phase", label: `Verifying ${sourced.length} source${sourced.length === 1 ? "" : "s"}` });
  let verifyCalls = 0, vin = 0, vout = 0, vcr = 0, vcc = 0;
  const verdicts = new Map<number, Awaited<ReturnType<typeof verifyFinding>>>();
  await Promise.all(rawClaims.map(async (c, i) => {
    if (!c.source_url) return;
    const v = await verifyFinding(
      { headline: c.claim, detail: c.conflict || "", published_at: c.source_date || "" },
      [{ name: c.source_name || c.source_url!, url: c.source_url! }], client, () => { verifyCalls += 1; },
    ).catch(() => null);
    if (v) {
      verdicts.set(i, v);
      if (v.usage) { vin += v.usage.inputTokens; vout += v.usage.outputTokens; vcr += v.usage.cacheReadTokens; vcc += v.usage.cacheCreationTokens; }
    }
  }));
  if (verifyCalls) {
    await recordTokens({ clientId, userEmail, model: INGEST, action: "research-verify", calls: verifyCalls, inputTokens: vin, outputTokens: vout, cacheReadTokens: vcr, cacheCreationTokens: vcc }).catch(() => {});
  }

  const claims = rawClaims.map((c, i) => {
    const v = verdicts.get(i);
    if (!v) return { ...c, verified: false };
    // Trust outcome: verified page -> keep in section, mark verified, use the real date. Dead/refuted -> move to
    // Unverified with the reason (never silently dropped). Bot-blocked (unverified) -> keep, not verified.
    const realDate = v.date && /^\d{4}-\d{2}-\d{2}$/.test(v.date) ? v.date : c.source_date;
    if (v.status === "verified" || v.status === "partial") return { ...c, source_date: realDate, verified: true };
    if (v.status === "dead") return { ...c, section: "unverified", verified: false, unverified_reason: c.unverified_reason || "Source link could not be confirmed (dead or moved)." };
    if (v.status === "refuted") return { ...c, section: "unverified", verified: false, unverified_reason: c.unverified_reason || "The cited page did not support this claim." };
    return { ...c, source_date: realDate, verified: false, unverified_reason: c.unverified_reason || (c.section === "unverified" ? "Single or unverifiable source." : "Source could not be reached to verify.") };
  });

  // STORE as a new versioned run. Version = last + 1 (Gate 1 approves a specific version; reruns never overwrite).
  const verRow = (await db().query(`select coalesce(max(version),0)+1 as v from research_runs where client_id = $1`, [clientId])) as { v: number }[];
  const version = Number(verRow[0]?.v) || 1;
  const runRows = (await db().query(
    `insert into research_runs (client_id, version, status, website, notes, user_email, vertical, identity)
     values ($1,$2,'ready',$3,$4,$5,$6,$7)
     returning id, client_id, version, status, website, notes, user_email, vertical, identity, created_at`,
    [clientId, version, website, notes?.trim()?.slice(0, 2000) || null, userEmail || null, vertical, JSON.stringify(identity)],
  )) as ResearchRun[];
  const run = runRows[0];

  const saved: ResearchClaim[] = [];
  for (const c of claims) {
    const rows = (await db().query(
      `insert into research_claims (run_id, client_id, section, subject, claim, source_name, source_url, source_date, tier, verified, unverified_reason, conflict)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       returning id, run_id, client_id, section, subject, claim, source_name, source_url, source_date, tier, verified, unverified_reason, conflict`,
      [run.id, clientId, c.section, c.subject, c.claim, c.source_name, c.source_url, c.source_date, c.tier, c.verified, c.unverified_reason, c.conflict],
    )) as ResearchClaim[];
    saved.push(rows[0]);
    emit({ t: "claim", section: c.section, claim: c.claim.slice(0, 120) });
  }

  // Merge any newly detected competitors into the editable set (auto-added; Gary edits at Gate 1).
  const have = new Set(knownCompetitors.map((c) => c.name.toLowerCase().trim()));
  for (const comp of Array.isArray(out.competitors) ? out.competitors : []) {
    const cname = noDash(comp?.name).slice(0, 200);
    if (!cname || have.has(cname.toLowerCase().trim())) continue;
    have.add(cname.toLowerCase().trim());
    const cweb = typeof comp?.website === "string" && /^https?:\/\//i.test(comp.website) ? comp.website.slice(0, 300) : null;
    await db().query(
      `insert into research_competitors (client_id, name, website, added_by) values ($1,$2,$3,'auto')`,
      [clientId, cname, cweb],
    ).catch(() => {});
  }

  emit({ t: "done", count: saved.length });
  return { run, claims: saved };
}

/** The claims for a run, ordered for rendering (section order, then verified before unverified, Tier 1 first). */
export async function listResearchClaims(runId: string): Promise<ResearchClaim[]> {
  return (await db().query(
    `select id, run_id, client_id, section, subject, claim, source_name, source_url, source_date, tier, verified, unverified_reason, conflict, rejected, rejected_by
     from research_claims where run_id = $1 order by created_at asc`, [runId],
  )) as ResearchClaim[];
}

/** The latest research run for a client (any status), or null. */
export async function latestResearchRun(clientId: string): Promise<ResearchRun | null> {
  const rows = (await db().query(
    `select id, client_id, version, status, website, notes, user_email, created_at, vertical, identity, pdf_url, drive_url, word_url, notified_at
     from research_runs where client_id = $1 order by version desc limit 1`, [clientId],
  )) as ResearchRun[];
  return rows[0] || null;
}

/** The editable competitor set for a client. */
export async function listCompetitors(clientId: string): Promise<{ id: string; name: string; website: string | null; added_by: string | null }[]> {
  return (await db().query(
    `select id, name, website, added_by from research_competitors where client_id = $1 order by created_at asc`, [clientId],
  )) as { id: string; name: string; website: string | null; added_by: string | null }[];
}
