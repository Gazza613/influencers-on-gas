import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { getSecret } from "./connections";
import { PREMIUM, INGEST } from "./vendors/anthropic";
import { clientWebsite, siteAnchor, deriveResearchBrief, loadIntelBrief } from "./intel";
import { recordTokens, recordUsage } from "./usage";
import { verifyFinding, toISODate, fetchSourcePage } from "./verify";
import { ingestChunks } from "./rag";

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

const normKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 120);

// The permanent "do not reference" list for a client: every fact the team has ever REJECTED at Gate 1, across
// all runs. Fed to the collector and enforced in code, so a rejected fact can never resurface on a rerun (Gary).
async function loadRejectedFacts(clientId: string): Promise<string[]> {
  const rows = (await db().query(
    `select distinct claim from research_claims where client_id = $1 and rejected = true and claim is not null`, [clientId],
  ).catch(() => [])) as { claim: string }[];
  return rows.map((r) => r.claim).filter((c) => c && c.trim().length > 0);
}

// MINE THE CRAWLED SITE. The client's own website is already crawled into the brain - the richest, most reliable
// source there is. Reading it directly means facts come from real page CONTENT, not two-line search snippets, and
// web search is freed to cover only what the site cannot (external, current, competitors, press, the team). We
// sample broadly across pages (one chunk per distinct URL) and carry each page's URL so the model can cite it.
// PRIORITISE THE FOUNDATIONAL PAGES. A content-heavy site has hundreds of /blog URLs that, ordered alphabetically,
// crowd out the pages that actually matter (home, about, team, products, contact). Score every page and read the
// core ones first, letting blog/news fill any remaining space.
function pageScore(u: string): number {
  const path = String(u || "").toLowerCase().replace(/^https?:\/\/[^/]+/, "").replace(/[?#].*$/, "");
  let s = 0;
  if (path === "" || path === "/") s += 14;                                                // homepage
  if (/\/(about|about-us|who-we-are|company|our-story)/.test(path)) s += 11;
  if (/\/(team|our-team|leadership|people|management)/.test(path)) s += 11;
  if (/\/(product|products|service|services|solution|solutions|what-we-do|offering)/.test(path)) s += 10;
  if (/\/(pricing|plans|packages)/.test(path)) s += 9;
  if (/\/(contact|contact-us|get-in-touch)/.test(path)) s += 9;
  if (/\/(faq|faqs|help|support)/.test(path)) s += 6;
  if (/\/(case-stud|clients|work|portfolio|results)/.test(path)) s += 4;
  if (/\/(blog|news|article|post|insight|resource)/.test(path)) s -= 6;                    // useful, but not foundational
  s -= Math.min(4, (path.match(/\//g) || []).length);                                      // shallower pages first
  return s;
}

// LIVE-FETCH THE CORE PAGES (Gary). A crawl can be incomplete - GAS's brain was blog-only, missing home/about/
// products/contact. So at run time we fetch the client's foundational pages DIRECTLY from their live site, so the
// brief is never hostage to a partial crawl. fetchSourcePage returns clean text (HTML stripped) and is SSRF-safe.
async function loadCorePages(website: string | null): Promise<string> {
  if (!website) return "";
  const base = website.replace(/\/+$/, "");
  const paths = ["", "/about", "/about-us", "/who-we-are", "/company", "/our-story", "/products", "/services",
    "/solutions", "/what-we-do", "/offering", "/pricing", "/plans", "/contact", "/contact-us", "/get-in-touch",
    "/team", "/our-team", "/leadership", "/people", "/faq", "/faqs"];
  const seen = new Set<string>();
  const urls = paths.map((p) => base + p).filter((u) => (seen.has(u) ? false : (seen.add(u), true)));
  const fetched = await Promise.all(urls.map(async (u) => {
    const r = await fetchSourcePage(u).catch(() => null);
    return r && r.ok && r.text.trim().length > 200 ? { url: u, text: r.text.trim() } : null;
  }));
  let acc = "";
  for (const f of fetched) { if (f) acc += `[${f.url}] (live)\n${f.text.slice(0, 3000)}\n\n`; }
  return acc.trim();
}

async function loadSiteContent(clientId: string, maxChars: number): Promise<string> {
  // 1) Get EVERY crawled URL (cheap - no content), so the pick is over the whole site, not an alphabetical slice.
  const urlRows = (await db().query(
    `select distinct metadata->>'url' as url from knowledge_chunks where client_id = $1 and content is not null and metadata->>'url' is not null`, [clientId],
  ).catch(() => [])) as { url: string }[];
  if (!urlRows.length) {
    const any = (await db().query(`select content from knowledge_chunks where client_id = $1 and content is not null order by created_at asc limit 30`, [clientId]).catch(() => [])) as { content: string }[];
    let acc = "";
    for (const r of any) { if (acc.length > maxChars) break; acc += `${r.content.trim().slice(0, 1200)}\n\n`; }
    return acc.trim();
  }
  // 2) Score, take the top ~45 pages, and fetch just those pages' content.
  const topUrls = urlRows.map((r) => r.url).sort((a, b) => pageScore(b) - pageScore(a)).slice(0, 45);
  const rows = (await db().query(
    `select distinct on (metadata->>'url') content, metadata->>'url' as url
     from knowledge_chunks
     where client_id = $1 and metadata->>'url' = any($2) and content is not null
     order by metadata->>'url', created_at asc`, [clientId, topUrls],
  ).catch(() => [])) as { content: string; url: string }[];
  rows.sort((a, b) => pageScore(b.url) - pageScore(a.url));   // any() loses order; restore priority
  let acc = "";
  for (const r of rows) {
    if (acc.length > maxChars) break;
    acc += `[${r.url}]\n${r.content.trim().slice(0, 1500)}\n\n`;
  }
  return acc.trim();
}

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

  // LOCKED GROUND TRUTH the GAS team supplied (Gary): the CEO / senior leadership. This OVERRIDES anything the
  // web says - the team knows their client. It was being ignored (the collector rediscovered leadership from
  // scratch), which is why a locked CEO did not appear. Injected into the scope so both passes treat it as fact.
  const briefLock = await loadIntelBrief(clientId).catch(() => null);
  const ceoTitleLock = briefLock?.ceoTitle || "Chief Executive Officer";
  const ceoLock = briefLock?.ceoName
    ? `\n\nCONFIRMED LEADERSHIP - GROUND TRUTH from the GAS team, this is FACT and it OVERRIDES the web. You MUST file this exact leadership fact, tier 1, verified: "${briefLock.ceoName} is the ${ceoTitleLock} of ${name}." Write it plainly as ${name}'s ${ceoTitleLock}. If the web associates ${briefLock.ceoName} mainly with a PARENT or PARTNER organisation (for example a BrightRock), that is BACKGROUND about the SAME person - you may record it as their prior/related role or affiliation, but you must NOT present ${briefLock.ceoName} as primarily another company's executive, must NOT contradict that they lead ${name}, and must NEVER omit that they are ${name}'s ${ceoTitleLock}.`
    : "";

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

  // DO NOT REFERENCE (Gary): facts the team REJECTED in any past review are a permanent block-list for this
  // client. We tell the model never to surface them again AND filter them out in code below, so a rejected fact
  // can never come back on a rerun.
  const rejectedFacts = await loadRejectedFacts(clientId).catch(() => [] as string[]);
  const rejectBlock = rejectedFacts.length
    ? `\n\nDO NOT REFERENCE - the GAS team REJECTED these facts in a previous review. Never surface them again, and drop anything that means the same thing:\n${rejectedFacts.slice(0, 50).map((r) => `- ${r.slice(0, 200)}`).join("\n")}`
    : "";

  const scope = `SCOPE LOCK. You are collecting facts about ${name}, and ONLY ${name}. ${name} is the SUBJECT; any other company appears only as a competitor or market context.${anchor}${ceoLock}${rejectBlock}`;

  const brief = `Today is ${today}. Collect a verified fact base on ${name} for a marketing research brief.${knownList}${notesBlock}\n\n` +
    `Cover every angle a marketing strategist needs: who they are and what they sell (snapshot), history/ownership/structure (foundations), the leadership and management team (leadership), products/pricing and the commercial model - how they make money and how they sell (products), the market and category (market), how THEY position themselves - promise, USPs, tone (positioning), who they serve and their audience (audience), website/SEO/social (digital), their OWN current marketing and advertising (marketing), the competitor intelligence below, a one-line profile of each competitor (competitor_set), dated developments in the last 90 days on/after ${cutoffStr} (activity), press and media (press), and reviews/sentiment incl. SA platforms like HelloPeter and Google (customer_voice).\n\n` +
    `Also set the tool fields 'vertical' (the client's marketing category) and 'regulated' (whether they are in a licensed/regulated sector).\n\n` +
    `ALWAYS COLLECT, EVERY RUN, WITHOUT EXCEPTION (check the site footer, and the contact, about, team and help pages):\n` +
    `- LEADERSHIP (section=leadership): the EXECUTIVE and MANAGEMENT team ONLY - the CEO/MD, founders, directors, principals and practice managers - NOT the full roster of advisers or staff (a list of advisers is NOT the leadership). Names, roles and a short background each. Dig BEYOND the website: LinkedIn company page, news, and for a licensed FSP the regulator's register, which lists the KEY INDIVIDUALS (the legally responsible officers) - treat those as the authoritative leadership. Note any FORMER holders of a senior role if that is on record. If the company genuinely does not publish an executive team anywhere you can find, record that explicitly as a section=unverified note - do NOT pad the leadership section with advisers to make it look complete. You MAY capture the team's SIZE and make-up as a SINGLE snapshot fact (e.g. "the site lists roughly 14 advisers and 5 practice coordinators"), but never file each individual adviser as leadership.\n` +
    `- AUDIENCE (section=audience): who the client serves today, their customer base and segments, and any stated target audience.\n` +
    `- CURRENT MARKETING (section=marketing): the client's OWN observable marketing and advertising - which channels they post on, cadence, campaign themes, promotions, and whether they run paid ads.\n` +
    `- CONTACT DETAILS (section=contact): every phone number, email address, physical address, operating hours and WhatsApp number ${name} publishes.\n` +
    `- SOCIAL CHANNELS (section=contact): every official social profile ${name} runs, each as the platform plus its full URL or @handle (Facebook, Instagram, LinkedIn, X/Twitter, TikTok, YouTube).\n` +
    `- PRESS AND MEDIA (section=press): media releases, news, interviews, podcasts, awards and notable third-party mentions, at ANY date, each sourced. Search beyond their own site.\n` +
    `- PUBLISHED FAQs (section=faqs): ${name}'s OWN frequently-asked questions, each as the question and its answer, sourced to their FAQ/help page.\n` +
    `- REGULATORY, ONLY IF THE CLIENT IS IN A REGULATED SECTOR (section=regulatory): if and ONLY if ${name} is in financial services or another licensed/regulated field, capture its licence identifier (e.g. an FSP number, usually in the footer), verify it on the regulator's OWN register (for an FSP, the FSCA register) and record licence status and authorised categories, AND the advertising rules that constrain its campaigns (e.g. FAIS: no guarantees, no urgency devices, mandatory disclaimers). If the client is NOT regulated (an agency, retailer, restaurant, and the like), SKIP this entirely - do not hunt for a licence that does not exist.\n` +
    `If the site or the wider record genuinely has none of an APPLICABLE item, record that absence as a single section=unverified note rather than leaving it out silently.\n\n` +
    `TWO MORE RULES:\n` +
    `- DATA RECENCY: for market and industry statistics, actively find and use the MOST RECENT figures available and DATE every statistic with its year. If the newest published figure is more than about a year old, say it is the latest available and flag its age. Never present a two-year-old statistic as if it were current.\n` +
    `- AFFILIATES, KEEP THEM SEPARATE: if ${name} is affiliated with, distributes for, or operates under a larger brand (e.g. a BrightRock / Sanlam / Momentum network), keep ${name}'s OWN facts strictly separate from the parent or partner's. Do NOT attribute the PARENT'S executives, CEO, size or numbers to ${name}. Record the affiliation as a fact, but ${name}'s leadership means ${name}'s OWN people, never the partner's CEO.\n\n` +
    `${COMPETITOR_BRIEF}\n\n` +
    `Search the web now, properly and widely, and do NOT lean only on their own website: ${name}'s own site${website ? ` (${website})` : ""} and channels, PLUS Google News and newsrooms, trade and industry publications, LinkedIn (for the team), business directories, partner and award announcements, review platforms, and - for a regulated client only - the relevant regulator's register. Their site establishes who they are; the independent record is where much of the fact base lives. Record every claim with its real source URL, the source date, and a tier. Facts only.`;

  // READ THE CLIENT'S OWN SITE FOR REAL (Tier 1) so the client's facts come from actual page content, not two-line
  // search snippets. We LIVE-FETCH the foundational pages (bullet-proof against a partial crawl) AND mine whatever
  // is in the crawled brain, core pages first. Web search is then freed for what the site cannot give (external,
  // current, competitors, press, the team on LinkedIn). No scrimping here (Gary): this runs periodically and the
  // aim is the best possible research, so we read widely.
  const [corePages, crawled] = await Promise.all([
    loadCorePages(website).catch(() => ""),
    loadSiteContent(clientId, 22000).catch(() => ""),
  ]);
  const siteRaw = [corePages, crawled].filter(Boolean).join("\n\n").slice(0, 36000);
  const siteBlock = siteRaw
    ? `\n\nTHE CLIENT'S OWN WEBSITE, READ FOR YOU (Tier 1, their own channel - "(live)" pages were fetched just now, the rest are from our crawl). Take the client's own facts from THIS real content and cite the page URL shown in [brackets] for each. Do not waste searches re-reading their own site, use this. Then web-search for what is NOT here (external, current, competitors, press, reviews, the team on LinkedIn):\n\n${siteRaw}\n`
    : "";

  // Shape the file tool output into claims (used by the first pass and the gap pass).
  const parseClaims = (o: { claims?: Record<string, unknown>[] }) => (Array.isArray(o.claims) ? o.claims : [])
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

  let sourcesRead = 0, searchCount = 0;
  type FileOut = { claims?: Record<string, unknown>[]; competitors?: { name?: string; website?: string }[]; vertical?: string; regulated?: boolean; identity?: Record<string, unknown> };
  // ONE gather+file cycle. Gathers wide (web_search) with the crawled site in context, then files from the REAL
  // results by CONTINUING the conversation - the gather's assistant turn carries every web_search result block, so
  // the model files from the actual sources rather than a text summary it does not always write (the 0-claims bug).
  // Streamed (the SDK refuses a 32k non-streaming call), and max_tokens is generous so the forced tool call is
  // never truncated into invalid JSON. Callable twice: the broad first pass, then a targeted gap pass.
  const runPass = async (passBrief: string): Promise<FileOut> => {
    const g = client.messages.stream({
      model: PREMIUM, max_tokens: 8000,
      system: `${scope}\n\n${FACTS_ONLY}`,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 25 } as unknown as Anthropic.Tool],
      messages: [{ role: "user", content: passBrief }],
    });
    g.on("contentBlock", (blk) => {
      const b = blk as { type: string; name?: string; input?: { query?: string }; content?: unknown };
      if (b.type === "server_tool_use" && b.name === "web_search" && b.input?.query) { searchCount += 1; emit({ t: "search", q: String(b.input.query).slice(0, 160) }); }
      else if (b.type === "web_search_tool_result" && Array.isArray(b.content)) { sourcesRead += b.content.length; emit({ t: "sources", n: sourcesRead }); }
    });
    const gathered = await g.finalMessage();
    const gu = gathered.usage as { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number; server_tool_use?: { web_search_requests?: number } } | undefined;
    await recordTokens({ clientId, userEmail, model: PREMIUM, action: "deep-research", inputTokens: gu?.input_tokens || 0, outputTokens: gu?.output_tokens || 0, cacheReadTokens: gu?.cache_read_input_tokens || 0, cacheCreationTokens: gu?.cache_creation_input_tokens || 0, webSearches: gu?.server_tool_use?.web_search_requests ?? 0 }).catch(() => {});

    const filed = await client.messages.stream({
      model: PREMIUM, max_tokens: 32000,
      system: `${scope}\n\n${FACTS_ONLY}\n\n${COMPETITOR_BRIEF}\n\n${NO_DASH_NOTE}\n\nFile the MATERIAL facts you found as structured claims via file_facts, up to about 70 claims. Prioritise the most useful and load-bearing, do NOT pad, but never omit the always-collect items. Carry the REAL source URLs and dates through, never invent one. Tag every claim with its section, subject, tier and whether it is evergreen. Put anything you could not verify into section=unverified with a reason. Where two sources disagree, record both and note the conflict.`,
      tools: [
        { type: "web_search_20250305", name: "web_search", max_uses: 25 } as unknown as Anthropic.Tool,
        { name: "file_facts", description: "The verified fact base, every claim sourced and tiered.", input_schema: SCHEMA },
      ],
      tool_choice: { type: "tool", name: "file_facts" },
      messages: [
        { role: "user", content: passBrief },
        { role: "assistant", content: gathered.content },
        { role: "user", content: "Now file the material facts you found via file_facts, each with its real source URL, date and tier. Do not search again." },
      ],
    }).finalMessage();
    const fu = filed.usage as { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } | undefined;
    await recordTokens({ clientId, userEmail, model: PREMIUM, action: "research-file", inputTokens: fu?.input_tokens || 0, outputTokens: fu?.output_tokens || 0, cacheReadTokens: fu?.cache_read_input_tokens || 0, cacheCreationTokens: fu?.cache_creation_input_tokens || 0 }).catch(() => {});
    const block = filed.content.find((b) => b.type === "tool_use");
    return (block && block.type === "tool_use" ? block.input : {}) as FileOut;
  };

  emit({ t: "phase", label: `Collecting facts on ${name}` });
  const out = await runPass(brief + siteBlock);
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
  const rawClaims = parseClaims(out);

  // COMPLETENESS PASS (Gary: never hand the Strategist a half-complete brief). Audit the mandatory sections; if
  // any came back thin, do ONE targeted follow-up that digs only on the gaps, then merge (deduped). Capped at one
  // extra pass to keep cost bounded.
  const MANDATORY: { id: string; need: string; min: number }[] = [
    { id: "leadership", need: "the management and executive team - names, roles and short backgrounds (use LinkedIn)", min: 2 },
    { id: "products", need: "products/services, pricing where public, and the commercial model", min: 2 },
    { id: "positioning", need: "how they position themselves - promise, USPs, tone", min: 1 },
    { id: "audience", need: "who they serve and their audience segments", min: 1 },
    { id: "contact", need: "phone, email, address and every official social profile URL", min: 2 },
    { id: "marketing", need: "their own current marketing and advertising activity", min: 1 },
    { id: "competitor_set", need: "a factual profile of each competitor", min: 2 },
  ];
  const gaps = MANDATORY.filter((m) => rawClaims.filter((c) => c.section === m.id).length < m.min);
  if (gaps.length) {
    emit({ t: "phase", label: `Filling gaps: ${gaps.map((g) => g.id).join(", ")}` });
    const gapBrief = `Targeted follow-up for the ${name} research brief. Scope lock and ground truth unchanged. The first pass came back THIN on the items below - dig DEEPER and file MORE facts, but ONLY for these (facts only, each sourced and tiered):\n${gaps.map((g) => `- ${g.id}: ${g.need}`).join("\n")}\n\nSearch specifically for these: LinkedIn for the team, their pricing and product pages, their social profiles, their current campaigns.${siteBlock}`;
    const out2 = await runPass(gapBrief);
    const seen = new Set(rawClaims.map((c) => `${c.section}::${normKey(c.claim)}`));
    for (const c of parseClaims(out2)) {
      const k = `${c.section}::${normKey(c.claim)}`;
      if (!seen.has(k)) { seen.add(k); rawClaims.push(c); }
    }
    if (Array.isArray(out2.competitors)) out.competitors = [...(out.competitors || []), ...out2.competitors];
  }

  // Enforce the do-not-reference block-list in code (the prompt asks, this guarantees): a rerun can never bring
  // back a fact the team rejected.
  if (rejectedFacts.length) {
    const rejSet = new Set(rejectedFacts.map(normKey));
    for (let i = rawClaims.length - 1; i >= 0; i--) if (rejSet.has(normKey(rawClaims[i].claim))) rawClaims.splice(i, 1);
  }

  // ADVERSARIAL QA PASS (Gary). Before Gate 1, a ruthless senior-editor pass red-teams the fact base and catches
  // what a human reviewer would: facts MIS-ATTRIBUTED to the client (a parent/partner's CEO or numbers shown as
  // the client's own), advisers filed as leadership, tangential trivia, and load-bearing claims on a single weak
  // source. It DROPS / MOVES / DEMOTES bad claims so the base is clean BEFORE it reaches you. This is what turns
  // "you catch the misses" into "it catches its own". Best-effort - it never blocks the run.
  if (rawClaims.length) {
    emit({ t: "phase", label: "Reviewing the fact base for accuracy and attribution" });
    const QA_SCHEMA = { type: "object", additionalProperties: false, properties: { reviews: { type: "array", items: { type: "object", additionalProperties: false, properties: { index: { type: "integer" }, action: { type: "string", enum: ["keep", "drop", "move", "demote"] }, section: { type: "string" }, reason: { type: "string" } }, required: ["index", "action", "section", "reason"] } } }, required: ["reviews"] } as unknown as Anthropic.Tool["input_schema"];
    const list = rawClaims.map((c, i) => `${i}. [section=${c.section} | about: ${c.subject}] ${c.claim}${c.source_url ? ` (src: ${c.source_url})` : " (no source)"}`).join("\n");
    try {
      const qa = await client.messages.stream({
        model: PREMIUM, max_tokens: 16000,
        system: `You are a ruthless senior research editor. Review a fact base about ${name} before it reaches a marketing strategist and rule on EVERY numbered claim:\n- keep: a correct, relevant fact, correctly placed and correctly attributed (${name}'s OWN fact, or a clearly-labelled competitor fact in a competitor section).\n- drop: WRONG, tangential trivia that will not inform strategy, or MIS-ATTRIBUTED - a fact about a parent, partner or other company presented as ${name}'s own (for example a partner's CEO, size or numbers shown as ${name}'s).\n- move: a real fact in the WRONG section - give the correct section id. Advisers/staff filed under leadership belong in snapshot; a competitor fact outside a competitor section moves to competitor.\n- demote: a load-bearing claim on a single weak or uncorroborated source, or stale data shown as current - give section "unverified".\nValid section ids: ${RESEARCH_SECTIONS.map((s) => s.id).join(", ")}.\nRULES: ${name}'s LEADERSHIP means ${name}'s OWN executives, never a parent or partner's. Be strict about noise, a strategist wants signal not filler.${ceoLock ? ` GROUND TRUTH: ${briefLock?.ceoName} IS ${name}'s ${ceoTitleLock} - always keep that, never drop or demote it, and drop or fix anything that reframes them as only a parent company's executive.` : ""}\nReturn a verdict for EVERY claim index, using the exact index shown.`,
        tools: [{ name: "review", description: "A verdict for every claim.", input_schema: QA_SCHEMA }],
        tool_choice: { type: "tool", name: "review" },
        messages: [{ role: "user", content: `Fact base to review (${rawClaims.length} claims):\n\n${list}` }],
      }).finalMessage();
      const qu = qa.usage as { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } | undefined;
      await recordTokens({ clientId, userEmail, model: PREMIUM, action: "research-qa", inputTokens: qu?.input_tokens || 0, outputTokens: qu?.output_tokens || 0, cacheReadTokens: qu?.cache_read_input_tokens || 0, cacheCreationTokens: qu?.cache_creation_input_tokens || 0 }).catch(() => {});
      const qblock = qa.content.find((b) => b.type === "tool_use");
      const reviews = (qblock && qblock.type === "tool_use" ? (qblock.input as { reviews?: { index: number; action: string; section: string; reason: string }[] }).reviews : []) || [];
      const drop = new Set<number>();
      for (const r of reviews) {
        const i = Number(r.index);
        if (!Number.isInteger(i) || i < 0 || i >= rawClaims.length) continue;
        if (r.action === "drop") drop.add(i);
        else if (r.action === "move" && SECTION_IDS.has(String(r.section) as ResearchSectionId)) rawClaims[i].section = String(r.section);
        else if (r.action === "demote") { rawClaims[i].section = "unverified"; rawClaims[i].unverified_reason = noDash(r.reason).slice(0, 500) || rawClaims[i].unverified_reason || "Flagged in review: single or uncorroborated source."; }
      }
      for (let i = rawClaims.length - 1; i >= 0; i--) if (drop.has(i)) rawClaims.splice(i, 1);
      emit({ t: "phase", label: `Review complete: cleaned ${drop.size} weak or mis-attributed claim${drop.size === 1 ? "" : "s"}` });
    } catch { /* QA is best-effort, never block the run */ }
  }

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

/**
 * Ingest the APPROVED research into the client's BRAIN (RAG) so the platform can retrieve it later (the Strategist,
 * the Producer, Ask the Brain). The brain IS the client - client_id is the isolation key - so it always exists and
 * there is nothing to create. NO DUPLICATION (Gary): every research chunk is tagged kind='research', and we DELETE
 * the prior research chunks before re-ingesting, so the brain holds exactly the latest approved fact base, never
 * stacked copies. Unverified signals are not ingested (they are not fact). Returns the number of facts ingested.
 */
export async function ingestApprovedResearch(clientId: string, runId: string, userEmail?: string | null): Promise<number> {
  const claims = (await listResearchClaims(runId)).filter((c) => !c.rejected && c.section !== "unverified" && c.claim.trim().length > 0);
  // Replace any previous approved research in this brain first - no duplication across approvals.
  await db().query(`delete from knowledge_chunks where client_id = $1 and metadata->>'kind' = 'research'`, [clientId]).catch(() => {});
  if (!claims.length) return 0;
  const label = Object.fromEntries(RESEARCH_SECTIONS.map((s) => [s.id, s.label]));
  const items = claims.map((c) => ({
    content: `[${label[c.section] || c.section}] ${c.subject ? c.subject + " - " : ""}${c.claim}`
      + (c.source_name || c.source_url ? ` (source: ${c.source_name || c.source_url}${c.source_date ? ", " + c.source_date : ""}${c.tier ? ", Tier " + c.tier : ""})` : ""),
    metadata: { kind: "research", section: c.section, run_id: runId, tier: c.tier, url: c.source_url },
  }));
  const stored = await ingestChunks(clientId, null, items);
  // Meter the Voyage embedding. unit 'embed' matches the rate_card row (voyage-4-lite is a fraction of a cent for
  // a research ingest, so it prices ~R0, but the event is recorded and attributed to The Researcher desk).
  if (stored) await recordUsage({ clientId, userEmail: userEmail ?? null, provider: "voyage", model: "voyage-4-lite", unit: "embed", action: "research-ingest", count: stored }).catch(() => {});
  return stored;
}

/** The editable competitor set for a client. */
export async function listCompetitors(clientId: string): Promise<{ id: string; name: string; website: string | null; added_by: string | null }[]> {
  return (await db().query(
    `select id, name, website, added_by from research_competitors where client_id = $1 order by created_at asc`, [clientId],
  )) as { id: string; name: string; website: string | null; added_by: string | null }[];
}
