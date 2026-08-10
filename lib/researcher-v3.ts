import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { getSecret } from "./connections";
import { OPUS5, INGEST, withAnthropicRetry } from "./vendors/anthropic";
import { clientWebsites, siteAnchor, deriveResearchBrief, loadIntelBrief } from "./intel";
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
  { id: "gaps", label: "Gaps to verify with the client" },
  { id: "unverified", label: "Unverified, treat as signal only" },
] as const;
export type ResearchSectionId = (typeof RESEARCH_SECTIONS)[number]["id"];
const SECTION_IDS = new Set(RESEARCH_SECTIONS.map((s) => s.id));

export const ACTIVITY_WINDOW_DAYS = 90;

// THE FACTS-ONLY MANDATE (spec 3.1). Every rule here is load-bearing; adapt wording, keep the rules.
const FACTS_ONLY = `You are The Researcher at GAS Marketing, a top 1% marketing researcher. You COLLECT and VERIFY facts about a client, their market, and their competitors. You never analyse, interpret, recommend, or editorialise.

HARD RULES:
- NEVER FABRICATE, this is the one unbreakable rule. Every fact must come from a real source you actually read. You never invent, infer, estimate, round, extrapolate or "reasonably assume" a figure, date, name, quote, statistic or detail. If you did not read it in a real source, it does not exist. A missing fact is recorded as a gap, never filled with a plausible guess. Better a short, certain brief than a full, doubtful one.
- GO DEEP, but only on what is real. Thin, generic summaries are not good enough. For every fact, capture the SPECIFICS you actually found: exact figures, dates, named people and their exact titles, direct quotes (in quotation marks), prices, plan names, product mechanics, channel names, follower/review counts, licence numbers. A detailed brief is one dense with sourced specifics, NOT one padded with generalities or invented detail. Prefer three concrete sourced facts over one vague sentence. Where a section has more real, sourced detail to give, give it.
- You never use the words opportunity, threat, gap, weakness, strength, should, could, suggests, or recommend in relation to the client. No SWOT. No conclusions. Facts only.
- Every factual claim you record carries a SOURCE (the real URL you read) and the DATE the source was published or accessed.
- You distinguish VERIFIED FACT from UNVERIFIED SIGNAL and never blend the two. If you cannot verify a claim, you place it in the Unverified section with the reason, you do not drop it.
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
- WHO COUNTS AS A COMPETITOR (be precise, do NOT leak): a DIRECT competitor sells the SAME core service to the SAME buyer in the SAME market. Match on the client's ACTUAL business, not a loose theme. A performance-marketing agency competes with other performance-marketing / growth / media-buying agencies for the same clients, NOT with every company that mentions "AI", nor with the martech tools or platforms it USES, nor with its own clients or partners. Pick 3-6 genuine like-for-like rivals and, for each, capture in competitor_set one line on WHY it is a true competitor (same service, same buyer). If a candidate only shares a buzzword, leave it out and, where useful, note adjacent players separately as market context rather than filing them as competitors.
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
  | { t: "start"; runId: string; version: number }
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
  progress?: { label?: string; sources?: number; filed?: number } | null; error?: string | null;
};
export type ResearchClaim = {
  id: string; run_id: string; client_id: string; section: string; subject: string | null; claim: string;
  source_name: string | null; source_url: string | null; source_date: string | null; tier: number | null;
  verified: boolean; unverified_reason: string | null; conflict: string | null;
  rejected?: boolean; rejected_by?: string | null; in_brain?: boolean; in_brain_by?: string | null;
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

// Facts Gary has already tagged "in the brain" on a past run. On a fresh run we pre-tag any claim that matches
// one of these (by normalised text), so it lands in the "In the Brain" tray, not the live list - which is the
// whole point of the tag: the next run shows only what is genuinely NEW. (Rejected facts are blocked outright
// above; kept facts are not blocked, just pre-sorted.)
async function loadInBrainFacts(clientId: string): Promise<Set<string>> {
  const rows = (await db().query(
    `select distinct claim from research_claims where client_id = $1 and in_brain = true and claim is not null`, [clientId],
  ).catch(() => [])) as { claim: string }[];
  return new Set(rows.map((r) => normKey(r.claim)).filter(Boolean));
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
async function loadCorePages(websites: string[]): Promise<string> {
  if (!websites.length) return "";
  const paths = ["", "/about", "/about-us", "/who-we-are", "/company", "/our-story", "/products", "/services",
    "/solutions", "/our-solution", "/what-we-do", "/offering", "/pricing", "/plans", "/contact", "/contact-us",
    "/get-in-touch", "/team", "/our-team", "/leadership", "/people", "/faq", "/faqs", "/case-studies", "/work",
    "/clients", "/results", "/foundation"];
  const seen = new Set<string>();
  const urls: string[] = [];
  const add = (u: string) => { const k = u.replace(/\/+$/, ""); if (!seen.has(k)) { seen.add(k); urls.push(u); } };
  await Promise.all(websites.map(async (w) => {
    const base = String(w).replace(/\/+$/, "");
    const origin = base.match(/^https?:\/\/[^/]+/)?.[0] || base;
    const rootDomain = origin.replace(/^https?:\/\//, "").replace(/^www\./, "");
    // 1) the fixed core paths
    for (const p of paths) add(base + p);
    // 2) common product/AI SUBDOMAINS (GAS runs ai.gasmarketing.co.za - a fixed path list never finds these)
    for (const sub of ["ai", "app", "go", "get", "grow", "hello", "start"]) add(`https://${sub}.${rootDomain}/`);
    // 3) DISCOVER from the homepage nav: follow the client's OWN internal links (same registrable domain, incl.
    //    subdomains), so pages the fixed list does not know about (a Foundation, an Our-Solution page) are read too.
    const home = await fetchRawHtml(base).catch(() => "");
    if (home) {
      const domRe = new RegExp(`^https?://([a-z0-9-]+\\.)?${rootDomain.replace(/\./g, "\\.")}(/|$)`, "i");
      for (const m of home.matchAll(/href=["']([^"'#?]+)["']/gi)) {
        let h = m[1];
        if (h.startsWith("/")) h = origin + h;
        if (!/^https?:\/\//i.test(h) || !domRe.test(h)) continue;
        if (/\.(png|jpe?g|svg|gif|webp|avif|pdf|css|js|ico|woff2?|mp4|zip)(\?|$)/i.test(h)) continue;
        add(h.replace(/[#?].*$/, ""));
      }
    }
  }));
  // Score, read the top pages in full (foundational pages first, blog sinks - it has its own reader).
  const top = urls.sort((a, b) => pageScore(b.replace(/^https?:\/\/[^/]+/, "") || "/") - pageScore(a.replace(/^https?:\/\/[^/]+/, "") || "/")).slice(0, 30);
  const fetched = await Promise.all(top.map(async (u) => {
    const r = await fetchSourcePage(u).catch(() => null);
    return r && r.ok && r.text.trim().length > 200 ? { url: u, text: r.text.trim() } : null;
  }));
  let acc = "";
  for (const f of fetched) { if (f) acc += `[${f.url}] (live)\n${f.text.slice(0, 3000)}\n\n`; }
  return acc.trim();
}

// DEEP-READ THE ARTICLES/BLOG (Gary): the client's own recent articles are where product launches, positioning
// and thought leadership live, and a fixed core-page list misses them. We fetch each site's article/blog listing,
// pull the individual article links, and read the most recent ones in full. This surfaces things like a "PSI /
// Pre-Sales Intelligence" launch that a homepage never mentions.
async function fetchRawHtml(url: string): Promise<string> {
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(8000), headers: { "User-Agent": "Mozilla/5.0 (compatible; GAS-Studio-Researcher/1.0; +https://gasmarketing.co.za)", Accept: "text/html" } });
    if (!res.ok) return "";
    if (!/html|text/i.test(res.headers.get("content-type") || "")) return "";
    return (await res.text()).slice(0, 400_000);
  } catch { return ""; }
}
async function loadRecentArticles(websites: string[], maxChars: number): Promise<string> {
  if (!websites.length) return "";
  const listingPaths = ["/articles", "/blog", "/news", "/insights", "/resources", "/thinking", "/perspectives", "/learn"];
  const links = new Set<string>();
  await Promise.all(websites.flatMap((w) => {
    const base = String(w).replace(/\/+$/, "");
    const origin = base.match(/^https?:\/\/[^/]+/)?.[0] || base;
    return listingPaths.map(async (lp) => {
      const raw = await fetchRawHtml(base + lp);
      if (!raw) return;
      for (const m of raw.matchAll(/href=["']([^"'#?]+)["']/gi)) {
        let h = m[1];
        if (h.startsWith("/")) h = origin + h;
        if (!h.startsWith(origin)) continue;                                             // same site only (SSRF-safe)
        if (/\/(article|articles|blog|news|insight|insights|post|posts)\/[a-z0-9]/i.test(h)) links.add(h);
      }
    });
  }));
  const picked = [...links].slice(0, 26);
  const fetched = (await Promise.all(picked.map(async (u) => {
    const r = await fetchSourcePage(u).catch(() => null);
    return r && r.ok && r.text.trim().length > 300 ? { url: u, text: r.text.trim(), date: r.date } : null;
  }))).filter((x): x is { url: string; text: string; date: string | null } => !!x);
  // NEWEST FIRST - recency defines positioning (Gary). Dated articles lead, newest to oldest; undated sink.
  fetched.sort((a, b) => (b.date || "0").localeCompare(a.date || "0"));
  let acc = "MOST RECENT ARTICLES FIRST (the newest define the client's CURRENT positioning):\n\n";
  for (const f of fetched) { if (acc.length > maxChars) break; acc += `[${f.url}]${f.date ? ` (article, dated ${f.date})` : " (article, undated)"}\n${f.text.slice(0, 2600)}\n\n`; }
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
 * THE COLLECT IS A DURABLE, MULTI-PHASE JOB. Vercel caps a single function invocation at ~13 minutes, and a deep
 * run on a big client used to hit that ceiling and die mid-flight. So the work is decomposed into PHASES - prepare,
 * gather, gap-fill, review, verify, store - each its OWN invocation with its own time budget, orchestrated by
 * Inngest with retries (inngest/research.ts). No single 13-minute ceiling, and each phase can go deeper. The phases
 * are exported as standalone functions so there is ONE implementation, driven two ways: the durable Inngest
 * orchestrator, and the inline collectResearch below (single-process, kept as a fallback and for tests).
 *
 * @param notes optional Gate-1 "rerun with notes" corrections, folded into this version's brief.
 * @param focus optional up-front steer for THIS run (e.g. specific suburbs, a product line, a region). It adds
 *   emphasis and dedicated depth, but never overrides facts-only, the no-fabrication lock, or the always-collect items.
 */

// The serializable context every phase needs. It crosses Inngest step boundaries (JSON only - no Anthropic client,
// no closures), so each phase rebuilds the Anthropic client from the secret and opens its own DB handle.
export type ResearchCtx = {
  clientId: string; today: string; userEmail: string | null;
  runId: string; version: number;
  name: string; website: string | null;
  scope: string; brief: string; siteBlock: string;
  ceoName: string | null; ceoTitle: string; hasCeoLock: boolean;
  rejectedFacts: string[]; deadProducts: string[];
  knownCompetitors: { name: string; website: string | null }[];
};

type FileOut = { claims?: Record<string, unknown>[]; competitors?: { name?: string; website?: string }[]; vertical?: string; regulated?: boolean; identity?: Record<string, unknown> };
export type RawClaim = {
  section: string; subject: string; claim: string;
  source_name: string | null; source_url: string | null; source_date: string | null;
  tier: number; unverified_reason: string | null; conflict: string | null;
};
type VerifiedClaim = RawClaim & { verified: boolean };

// A collecting run older than this is treated as dead (the durable job hung, or a deploy died mid-run), so a fresh
// start reclaims it and the UI stops waiting. Runs span many invocations now, so this is generous - far longer than
// any healthy run - and Inngest's own onFailure marks a truly failed run 'failed' long before this backstop bites.
const RUN_STALL_SECONDS = 45 * 60;

// PROGRESS MIRROR. With the collect decoupled from any open request, the UI learns where a run is by polling the
// run's `progress` column. Every phase writes its label (and running counts) through this sink, throttled so a burst
// of search events is not a write storm. onEvent (the inline path) also fans out to a live SSE if one is open.
export function makeResearchProgress(runId: string, onEvent?: (e: CollectEvent) => void): (e: CollectEvent) => void {
  let lastProg = 0, sources = 0, filed = 0, label = "Starting";
  return (e: CollectEvent) => {
    try { onEvent?.(e); } catch { /* progress is best-effort */ }
    if (e.t === "sources") sources = e.n;
    else if (e.t === "claim") filed += 1;
    else if (e.t === "phase") label = e.label;
    const now = Date.now();
    if (now - lastProg < 1500 && e.t !== "phase") return;   // throttle, but a phase change always writes through
    lastProg = now;
    void db().query(`update research_runs set progress = $2 where id = $1`, [runId, JSON.stringify({ label, sources, filed })]).catch(() => {});
  };
}

// Shape the file tool output into claims (used by the broad pass and the gap pass).
function parseClaims(name: string, o: { claims?: Record<string, unknown>[] }): RawClaim[] {
  return (Array.isArray(o.claims) ? o.claims : [])
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
}

// A small concurrency pool. Verify fetches many pages, and firing all of them at once would hammer the network.
async function pooledForEach<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let idx = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (idx < items.length) { const i = idx++; await fn(items[i]); }
  });
  await Promise.all(workers);
}

async function anthropicClient(): Promise<Anthropic> {
  const key = await getSecret("anthropic");
  if (!key) throw new Error("Claude isn't connected");
  return new Anthropic({ apiKey: key });
}

// ONE gather+file cycle. Gathers wide (web_search) with the crawled site in context, then files from the REAL
// results by CONTINUING the conversation - the gather's assistant turn carries every web_search result block, so the
// model files from the actual sources rather than a text summary it does not always write (the 0-claims bug).
// Streamed (the SDK refuses a large non-streaming call), and max_tokens is generous so the forced tool call is never
// truncated into invalid JSON. Callable twice: the broad first pass, then a targeted gap pass.
async function gatherAndFile(client: Anthropic, ctx: ResearchCtx, passBrief: string, maxSearches: number, emit: (e: CollectEvent) => void): Promise<FileOut> {
  let sourcesRead = 0;
  // GATHER on Opus 5 (Gary's cost call): the gather is search ORCHESTRATION - Opus is elite at it and half Fable's
  // price. Retried on a transient overload (529) / rate limit, so a single Anthropic blip does not kill the run.
  const gathered = await withAnthropicRetry(async () => {
    const g = client.messages.stream({
      // max_tokens must be roomy enough to HOLD the search results (each web_search_tool_result is large). At 8k it
      // truncated mid-search - discarding paid searches and leaving a dangling tool_use that 400'd the file step.
      model: OPUS5, max_tokens: 16000,
      system: `${ctx.scope}\n\n${FACTS_ONLY}`,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: maxSearches } as unknown as Anthropic.Tool],
      messages: [{ role: "user", content: passBrief }],
    });
    g.on("contentBlock", (blk) => {
      const b = blk as { type: string; name?: string; input?: { query?: string }; content?: unknown };
      if (b.type === "server_tool_use" && b.name === "web_search" && b.input?.query) { emit({ t: "search", q: String(b.input.query).slice(0, 160) }); }
      else if (b.type === "web_search_tool_result" && Array.isArray(b.content)) { sourcesRead += b.content.length; emit({ t: "sources", n: sourcesRead }); }
    });
    return await g.finalMessage();
  });
  const gu = gathered.usage as { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number; server_tool_use?: { web_search_requests?: number } } | undefined;
  await recordTokens({ clientId: ctx.clientId, userEmail: ctx.userEmail, model: OPUS5, action: "deep-research", inputTokens: gu?.input_tokens || 0, outputTokens: gu?.output_tokens || 0, cacheReadTokens: gu?.cache_read_input_tokens || 0, cacheCreationTokens: gu?.cache_creation_input_tokens || 0, webSearches: gu?.server_tool_use?.web_search_requests ?? 0 }).catch(() => {});

  // SANITISE THE GATHER TURN before replaying it into the file step. If the gather hit max_tokens WHILE a web_search
  // was in flight, its assistant content ends with a `server_tool_use` that has no matching `web_search_tool_result`
  // - and replaying that turn is a hard 400. We drop any search request that never got a result.
  const rawContent = Array.isArray(gathered.content) ? gathered.content : [];
  const resultFor = new Set(rawContent.filter((b) => (b as { type: string }).type === "web_search_tool_result").map((b) => (b as { tool_use_id?: string }).tool_use_id));
  let gatheredContent = rawContent.filter((b) => {
    const bb = b as { type: string; name?: string; id?: string };
    if (bb.type === "server_tool_use" && bb.name === "web_search") return resultFor.has(bb.id);
    return true;
  });
  // An assistant turn must not be empty (the API rejects it). If sanitising removed everything, replay a minimal
  // text turn so the file step still runs (it files from the user brief and site block).
  if (!gatheredContent.length) gatheredContent = [{ type: "text", text: "Search complete." } as unknown as (typeof rawContent)[number]];

  const filed = await withAnthropicRetry(() => client.messages.stream({
    model: OPUS5, max_tokens: 22000,
    system: `${ctx.scope}\n\n${FACTS_ONLY}\n\n${COMPETITOR_BRIEF}\n\n${NO_DASH_NOTE}\n\nFile EVERY material fact you actually found as a structured claim via file_facts, up to about 120 claims. Be thorough and detailed: file the specifics (figures, dates, exact titles, quotes, prices, mechanics), not just headlines, and give each well-covered section the depth it has real sourced material for. Do NOT pad and do NOT invent to reach a number, a genuinely thin area stays thin, but never omit a real sourced fact just to keep it short, and never omit the always-collect items. Carry the REAL source URLs and dates through, never invent one. Tag every claim with its section, subject, tier and whether it is evergreen. Put anything you could not verify into section=unverified with a reason. Where two sources disagree, record both and note the conflict.`,
    tools: [
      { type: "web_search_20250305", name: "web_search", max_uses: 40 } as unknown as Anthropic.Tool,
      { name: "file_facts", description: "The verified fact base, every claim sourced and tiered.", input_schema: SCHEMA },
    ],
    tool_choice: { type: "tool", name: "file_facts" },
    messages: [
      { role: "user", content: passBrief },
      { role: "assistant", content: gatheredContent },
      { role: "user", content: "Now file the material facts you found via file_facts, each with its real source URL, date and tier. Do not search again." },
    ],
  }).finalMessage());
  const fu = filed.usage as { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } | undefined;
  await recordTokens({ clientId: ctx.clientId, userEmail: ctx.userEmail, model: OPUS5, action: "research-file", inputTokens: fu?.input_tokens || 0, outputTokens: fu?.output_tokens || 0, cacheReadTokens: fu?.cache_read_input_tokens || 0, cacheCreationTokens: fu?.cache_creation_input_tokens || 0 }).catch(() => {});
  const block = filed.content.find((b) => b.type === "tool_use");
  return (block && block.type === "tool_use" ? block.input : {}) as FileOut;
}

// ==== THE PHASES (each its own Inngest step / invocation) ======================================================

/**
 * GUARD + CREATE. Called synchronously by the collect route so the user gets an immediate answer: a friendly refusal
 * if a run is already in flight, or a new run row to poll. Returns the runId + version; the heavy work then runs as a
 * durable Inngest job. Kept fast - only the concurrency check, the version, and the row insert.
 */
export async function startResearchRun(clientId: string, opts: { userEmail?: string | null; notes?: string | null } = {}): Promise<{ runId: string; version: number }> {
  const derived = await deriveResearchBrief(clientId);
  if (!derived) throw new Error("This brain has nothing to research yet. Add the client and crawl their site into the brain first.");
  // CONCURRENCY GUARD: refuse a second start if a collect for this client is genuinely in flight. A run spans many
  // invocations now, so "in flight" is a generous window; only a run older than that is treated as dead and reclaimed.
  const active = (await db().query(
    `select id, version, extract(epoch from (now()-created_at))::int as age from research_runs where client_id = $1 and status = 'collecting' order by created_at desc limit 1`,
    [clientId],
  )) as { id: string; version: number; age: number }[];
  if (active[0]) {
    if (active[0].age < RUN_STALL_SECONDS) throw new Error(`A research run (v${active[0].version}) is already in progress for this client and will finish on its own, even if you navigate away. Please wait for it rather than starting another.`);
    await db().query(`update research_runs set status = 'failed', error = 'Run exceeded the time limit and was stopped.', progress = null where id = $1 and status = 'collecting'`, [active[0].id]).catch(() => {});
  }
  const websites = await clientWebsites(clientId).catch(() => [] as string[]);
  const website = websites[0] || null;
  const verRow0 = (await db().query(`select coalesce(max(version),0)+1 as v from research_runs where client_id = $1`, [clientId])) as { v: number }[];
  const version = Number(verRow0[0]?.v) || 1;
  const startRows = (await db().query(
    `insert into research_runs (client_id, version, status, website, notes, user_email)
     values ($1,$2,'collecting',$3,$4,$5) returning id`,
    [clientId, version, website, opts.notes?.trim()?.slice(0, 2000) || null, opts.userEmail || null],
  )) as { id: string }[];
  return { runId: startRows[0].id, version };
}

/** PHASE: prepare. Build the full research context (locks, prompts, the client's own site read for real). */
export async function prepareResearch(clientId: string, runId: string, version: number, today: string, opts: { userEmail?: string | null; notes?: string | null; focus?: string | null } = {}): Promise<ResearchCtx> {
  const { userEmail, notes, focus } = opts;

  // Identity + ground-truth anchor. A name is the minimum; the website is what stops us researching a same-named but
  // different business (Gary, material). deriveResearchBrief gives us the client's own crawled material too.
  const derived = await deriveResearchBrief(clientId);
  if (!derived) throw new Error("This brain has nothing to research yet. Add the client and crawl their site into the brain first.");
  const name = derived.clientName;
  const websites = await clientWebsites(clientId).catch(() => [] as string[]);
  const website = websites[0] || null;    // primary, for the anchor and the run record
  const anchor = siteAnchor(name, website) + (websites.length > 1
    ? `\n\n${name} also operates these official sites, all the SAME organisation - research them as ${name}'s own too: ${websites.slice(1).join(", ")}.`
    : "");

  // KNOWN SOCIAL ACCOUNTS (Gary): the team supplies the client's own social profiles, so the Researcher mines each
  // rather than hoping to find them. These are ground truth for the client's social presence.
  const socialRows = (await db().query(`select socials from clients where id = $1`, [clientId]).catch(() => [])) as { socials: string[] | null }[];
  const socials = (Array.isArray(socialRows[0]?.socials) ? socialRows[0]!.socials! : []).filter((s) => typeof s === "string" && s.trim());
  const socialBlock = socials.length
    ? `\n\nKNOWN SOCIAL ACCOUNTS (the GAS team supplied these - they ARE ${name}'s, mine EACH one): ${socials.join(", ")}.\nFor each, capture the platform + handle (section=contact), and mine it for posting CADENCE, the CONTENT themes and campaigns they run, engagement signals, and who their AUDIENCE appears to be (sections=marketing/audience/activity). The most RECENT posts define their current positioning and marketing, so lead with those.`
    : "";

  // LOCKED GROUND TRUTH the GAS team supplied (Gary): the CEO / senior leadership. This OVERRIDES anything the web
  // says - the team knows their client. Injected into the scope so every pass treats it as fact.
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

  // FOCUS (Gary): an optional up-front steer for THIS run - e.g. specific suburbs for an estate agency, a product
  // line, a region, a competitor to profile. It PRIORITISES and DEEPENS that angle, but it does not narrow the
  // brief: the always-collect items and every section are still gathered, and the no-fabrication lock still holds.
  const focusBlock = focus?.trim()
    ? `\n\nFOCUS FOR THIS RUN (the team's steer - treat as a PRIORITY): ${focus.trim().slice(0, 1000)}\nGive this extra depth and dedicated, sourced facts, and weave it through the relevant sections.\n` +
      `TWO KINDS of focus, handle each correctly:\n` +
      `1) A TOPIC/ANGLE focus (a product line, a theme) is an EMPHASIS, not a restriction: still collect the always-collect items and cover every section, just with extra depth on the focus.\n` +
      `2) A MARKET/GEOGRAPHY/ENTITY focus (e.g. "South Africa only", a specific country, region or legal entity) is a hard SCOPE BOUNDARY: research ONLY that market/entity. Every search query should be scoped to it (e.g. add "South Africa" to your searches), and facts about the brand's operations in OTHER countries/markets are OUT OF SCOPE, appearing only as a brief line of parent-group context, never as the subject. If a source is about a different market, do not file it as this client's fact. When the same global brand operates in many markets, the focus market is THE subject and the others are background.\n` +
      `Either way it never loosens the rules: only real, sourced facts, never anything invented to satisfy the focus.`
    : "";

  // DO NOT REFERENCE (Gary): facts the team REJECTED in any past review are a permanent block-list for this client.
  // We tell the model never to surface them again AND filter them out in code (the review phase), so a rejected
  // fact can never come back on a rerun.
  const rejectedFacts = await loadRejectedFacts(clientId).catch(() => [] as string[]);
  const rejectBlock = rejectedFacts.length
    ? `\n\nDO NOT REFERENCE - the GAS team REJECTED these facts in a previous review. Never surface them again, and drop anything that means the same thing:\n${rejectedFacts.slice(0, 50).map((r) => `- ${r.slice(0, 200)}`).join("\n")}`
    : "";

  // RETIRED PRODUCTS (Gary, ground truth): products the client has DISCONTINUED but not yet scrubbed from its own
  // site. They will still appear on the live site and in old articles - the model must treat them as legacy and
  // NEVER present them as current. We tell it here AND hard-drop any claim naming one (the review phase).
  const deadProducts = briefLock?.deprecatedProducts?.length ? briefLock.deprecatedProducts : [];
  const deprecatedLock = deadProducts.length
    ? `\n\nRETIRED PRODUCTS - GROUND TRUTH from the ${name} team, this OVERRIDES the website. These products are DISCONTINUED and are only still on the site by oversight: ${deadProducts.join(", ")}. NEVER present them as current, NEVER list them as ${name}'s products or services, and do NOT reference them at all - not even as "formerly" or "legacy". If a page or article mentions them, ignore that part. ${name}'s current, primary system is what the RECENT content promotes - lead with that.`
    : "";

  const scope = `SCOPE LOCK. You are collecting facts about ${name}, and ONLY ${name}. ${name} is the SUBJECT; any other company appears only as a competitor or market context.${anchor}${ceoLock}${deprecatedLock}${rejectBlock}`;

  const brief = `Today is ${today}. Collect a verified fact base on ${name} for a marketing research brief.${focusBlock}${socialBlock}${knownList}${notesBlock}\n\n` +
    `Cover every angle a marketing strategist needs: who they are and what they sell (snapshot), history/ownership/structure (foundations), the leadership and management team (leadership), products/pricing and the commercial model - how they make money and how they sell (products), the market and category (market), how THEY position themselves - promise, USPs, tone (positioning), who they serve and their audience (audience), website/SEO/social (digital), their OWN current marketing and advertising (marketing), the competitor intelligence below, a one-line profile of each competitor (competitor_set), dated developments in the last 90 days on/after ${cutoffStr} (activity), press and media (press), and reviews/sentiment incl. SA platforms like HelloPeter and Google (customer_voice).\n\n` +
    `Also set the tool fields 'vertical' (the client's marketing category) and 'regulated' (whether they are in a licensed/regulated sector).\n\n` +
    `ALWAYS COLLECT, EVERY RUN, WITHOUT EXCEPTION (check the site footer, and the contact, about, team and help pages):\n` +
    `- LEADERSHIP (section=leadership): the EXECUTIVE and MANAGEMENT team ONLY - the CEO/MD, founders, directors, principals and practice managers - NOT the full roster of advisers or staff (a list of advisers is NOT the leadership). Names, roles and a short background each. Dig BEYOND the website: LinkedIn company page, news, and for a licensed FSP the regulator's register, which lists the KEY INDIVIDUALS (the legally responsible officers) - treat those as the authoritative leadership. Note any FORMER holders of a senior role if that is on record. If the company genuinely does not publish an executive team anywhere you can find, record that explicitly as a section=unverified note - do NOT pad the leadership section with advisers to make it look complete. You MAY capture the team's SIZE and make-up as a SINGLE snapshot fact (e.g. "the site lists roughly 14 advisers and 5 practice coordinators"), but never file each individual adviser as leadership.\n` +
    `- AUDIENCE (section=audience): who the client serves today, their customer base and segments, and any stated target audience.\n` +
    `- CURRENT MARKETING (section=marketing): the client's OWN observable marketing and advertising - which channels they post on, cadence, campaign themes, promotions, and whether they run paid ads.\n` +
    `- RECENT ARTICLES (sections=marketing/activity/positioning/products): read the client's OWN recent articles/blog (last 3 months, provided above where fetched) and mine them for PRODUCT LAUNCHES (e.g. a new product like PSI / Pre-Sales Intelligence), positioning shifts and thought-leadership themes. These are a primary source for what the business is pushing now.\n` +
    `- FOUNDERS' AND EXECUTIVES' LINKEDIN (sections=activity/leadership/positioning): search the named founders and executives BY NAME on LinkedIn for their recent posts, announcements, product launches and positioning statements in the last 90 days. LinkedIn is where leaders announce what is new before it hits the website.\n` +
    `- CONTACT DETAILS (section=contact): every phone number, email address, physical address, operating hours and WhatsApp number ${name} publishes.\n` +
    `- SOCIAL CHANNELS (section=contact): every official social profile ${name} runs, each as the platform plus its full URL or @handle (Facebook, Instagram, LinkedIn, X/Twitter, TikTok, YouTube).\n` +
    `- MARKET AND CATEGORY STATS (section=market): actively find the MOST RECENT, credible statistics for ${name}'s category and geography - market size, growth rate, number of players/outlets, category and demand trends, consumer behaviour shifts. DATE every figure with its year and source. These feed the client proposal, so they must be CURRENT (strongly prefer the last 12 to 18 months) and directly relevant to this business, not generic. If the newest figure is older, say so and flag its age. A dated, relevant stat is worth far more than a vague or stale one.\n` +
    `- INDUSTRY EVENTS AND OPPORTUNITIES (section=market): capture notable, recent or upcoming industry events, trade shows and category moments relevant to ${name} (e.g. a major expo like HOSTEX), and emerging category opportunities, shifts and gaps a strategist should know - INCLUDING ones beyond digital marketing (a channel, a partnership, a retail or event angle, a product gap). Each dated and sourced. These show deep industry knowledge and inform the client's OVERALL strategy, not only the digital plan. Do not invent one; only real, sourced events and opportunities.\n` +
    `- PRESS AND MEDIA (section=press): media releases, news, interviews, podcasts, awards and notable third-party mentions, at ANY date, each sourced. Search beyond their own site.\n` +
    `- PUBLISHED FAQs (section=faqs): ${name}'s OWN frequently-asked questions, each as the question and its answer, sourced to their FAQ/help page.\n` +
    `- REGULATORY, ONLY IF THE CLIENT IS IN A REGULATED SECTOR (section=regulatory): if and ONLY if ${name} is in financial services or another licensed/regulated field, capture its licence identifier (e.g. an FSP number, usually in the footer), verify it on the regulator's OWN register (for an FSP, the FSCA register) and record licence status and authorised categories, AND the advertising rules that constrain its campaigns (e.g. FAIS: no guarantees, no urgency devices, mandatory disclaimers). If the client is NOT regulated (an agency, retailer, restaurant, and the like), SKIP this entirely - do not hunt for a licence that does not exist.\n` +
    `If the site or the wider record genuinely has none of an APPLICABLE item, record that absence as a single section=unverified note rather than leaving it out silently.\n\n` +
    `THREE RULES:\n` +
    `- RECENCY DRIVES ACCURACY (the most important rule, for EVERY client whether or not they publish a blog): the newest information is the most accurate, so prioritise the MOST RECENT content of ANY kind - articles, LinkedIn and social posts, news, press and announcements, product/service updates - to establish where the business is NOW. When a fact has changed over time (positioning, leadership, products, focus, address), the MOST RECENT source WINS over older ones; date everything and flag when a source is old. In POSITIONING, CURRENT MARKETING and ACTIVITY, LEAD with the newest strategic thrust the recent content centres on, and frame older products as the established base, not the current story. A client with NO blog still has recent signals - news, social, LinkedIn, launches - use those the same way. Where the recent content clearly centres on a new flagship service or push, THAT is the current positioning, make it the headline, never a footnote.\n` +
    `- DATA RECENCY: for market and industry statistics, actively find and use the MOST RECENT figures available and DATE every statistic with its year. If the newest published figure is more than about a year old, say it is the latest available and flag its age. Never present a two-year-old statistic as if it were current.\n` +
    `- AFFILIATES, KEEP THEM SEPARATE: if ${name} is affiliated with, distributes for, or operates under a larger brand (e.g. a BrightRock / Sanlam / Momentum network), keep ${name}'s OWN facts strictly separate from the parent or partner's. Do NOT attribute the PARENT'S executives, CEO, size or numbers to ${name}. Record the affiliation as a fact, but ${name}'s leadership means ${name}'s OWN people, never the partner's CEO.\n\n` +
    `${COMPETITOR_BRIEF}\n\n` +
    `Search the web now, properly and widely, and do NOT lean only on their own website: ${name}'s own site${website ? ` (${website})` : ""} and channels, PLUS Google News and newsrooms, trade and industry publications, LinkedIn (for the team), business directories, partner and award announcements, review platforms, and - for a regulated client only - the relevant regulator's register. Their site establishes who they are; the independent record is where much of the fact base lives. Record every claim with its real source URL, the source date, and a tier. Facts only.`;

  // READ THE CLIENT'S OWN SITE FOR REAL (Tier 1) so the client's facts come from actual page content, not two-line
  // search snippets. We LIVE-FETCH the foundational pages (bullet-proof against a partial crawl) AND mine whatever
  // is in the crawled brain, core pages first. Web search is then freed for what the site cannot give (external,
  // current, competitors, press, the team on LinkedIn). No scrimping here (Gary): this runs periodically and the
  // aim is the best possible research, so we read widely.
  const [corePages, articles, crawled] = await Promise.all([
    loadCorePages(websites).catch(() => ""),
    loadRecentArticles(websites, 20000).catch(() => ""),
    loadSiteContent(clientId, 16000).catch(() => ""),
  ]);
  const siteRaw = [corePages, articles, crawled].filter(Boolean).join("\n\n").slice(0, 34000);
  const siteBlock = siteRaw
    ? `\n\nTHE CLIENT'S OWN WEBSITE, READ FOR YOU (Tier 1, their own channel - "(live)" pages and "(article)" pages were fetched just now, the rest are from our crawl). Take the client's own facts from THIS real content and cite the page URL shown in [brackets] for each. The "(article)" pages are the client's RECENT ARTICLES/BLOG - mine them hard for product launches, positioning and thought leadership (they reveal far more than a homepage). Do not waste searches re-reading their own site, use this. Then web-search for what is NOT here:\n\n${siteRaw}\n`
    : "";

  return {
    clientId, today, userEmail: userEmail ?? null, runId, version,
    name, website, scope, brief, siteBlock,
    ceoName: briefLock?.ceoName ?? null, ceoTitle: ceoTitleLock, hasCeoLock: !!briefLock?.ceoName,
    rejectedFacts, deadProducts, knownCompetitors,
  };
}

/** PHASE: gather (pass 1). The broad sweep - gather wide, then file from the real results. Restored to 26 searches
 *  (was trimmed to 18 to fit the old single-invocation limit; each phase has its own budget now, so it goes deep). */
export async function researchGatherPass1(ctx: ResearchCtx, emit: (e: CollectEvent) => void): Promise<{ rawClaims: RawClaim[]; competitors: { name?: string; website?: string }[]; vertical: string | null; identity: ResearchIdentity }> {
  const client = await anthropicClient();
  emit({ t: "phase", label: `Collecting facts on ${ctx.name}` });
  const out = await gatherAndFile(client, ctx, ctx.brief + ctx.siteBlock, 26, emit);
  const vertical = noDash(out.vertical).slice(0, 80) || null;
  const idIn = (out.identity || {}) as Record<string, unknown>;
  const identity: ResearchIdentity = {
    legal_name: noDash(idIn.legal_name).slice(0, 200) || null,
    licence: noDash(idIn.licence).slice(0, 120) || null,
    address: noDash(idIn.address).slice(0, 300) || null,
    markets: noDash(idIn.markets).slice(0, 200) || null,
    contact_person: noDash(idIn.contact_person).slice(0, 200) || null,
    contact_details: noDash(idIn.contact_details).slice(0, 200) || null,
  };
  const rawClaims = parseClaims(ctx.name, out);
  return { rawClaims, competitors: Array.isArray(out.competitors) ? out.competitors : [], vertical, identity };
}

/** PHASE: gap-fill. Audit the mandatory sections; if any came back thin, ONE targeted top-up, then merge (deduped). */
export async function researchGapFill(ctx: ResearchCtx, rawClaimsIn: RawClaim[], competitorsIn: { name?: string; website?: string }[], emit: (e: CollectEvent) => void): Promise<{ rawClaims: RawClaim[]; competitors: { name?: string; website?: string }[] }> {
  // Never hand the Strategist a half-complete brief (Gary): the mandatory sections must have real depth.
  const MANDATORY: { id: string; need: string; min: number }[] = [
    { id: "leadership", need: "the management and executive team - names, roles and short backgrounds (use LinkedIn)", min: 2 },
    { id: "products", need: "products/services, pricing where public, and the commercial model", min: 2 },
    { id: "positioning", need: "how they position themselves - promise, USPs, tone", min: 1 },
    { id: "audience", need: "who they serve and their audience segments", min: 1 },
    { id: "contact", need: "phone, email, address and every official social profile URL", min: 2 },
    { id: "marketing", need: "their own current marketing and advertising activity", min: 1 },
    { id: "competitor_set", need: "a factual profile of each competitor", min: 2 },
  ];
  const gaps = MANDATORY.filter((m) => rawClaimsIn.filter((c) => c.section === m.id).length < m.min);
  if (!gaps.length) return { rawClaims: rawClaimsIn, competitors: competitorsIn };
  const client = await anthropicClient();
  emit({ t: "phase", label: `Filling gaps: ${gaps.map((g) => g.id).join(", ")}` });
  const gapBrief = `Targeted follow-up for the ${ctx.name} research brief. Scope lock and ground truth unchanged. The first pass came back THIN on the items below - dig DEEPER and file MORE facts, but ONLY for these (facts only, each sourced and tiered):\n${gaps.map((g) => `- ${g.id}: ${g.need}`).join("\n")}\n\nSearch specifically for these: LinkedIn for the team, their pricing and product pages, their social profiles, their current campaigns.${ctx.siteBlock}`;
  const out2 = await gatherAndFile(client, ctx, gapBrief, 12, emit);   // targeted top-up; its own step budget, so a touch deeper than before
  const rawClaims = [...rawClaimsIn];
  const seen = new Set(rawClaims.map((c) => `${c.section}::${normKey(c.claim)}`));
  for (const c of parseClaims(ctx.name, out2)) {
    const k = `${c.section}::${normKey(c.claim)}`;
    if (!seen.has(k)) { seen.add(k); rawClaims.push(c); }
  }
  const competitors = Array.isArray(out2.competitors) ? [...competitorsIn, ...out2.competitors] : competitorsIn;
  return { rawClaims, competitors };
}

/** PHASE: review. Enforce the block-lists (rejected facts + retired products), red-team the base (QA), register gaps. */
export async function researchReview(ctx: ResearchCtx, rawClaimsIn: RawClaim[], emit: (e: CollectEvent) => void): Promise<RawClaim[]> {
  const rawClaims = [...rawClaimsIn];

  // Enforce the do-not-reference block-list in code (the prompt asks, this guarantees): a rerun can never bring back
  // a fact the team rejected.
  if (ctx.rejectedFacts.length) {
    const rejSet = new Set(ctx.rejectedFacts.map(normKey));
    for (let i = rawClaims.length - 1; i >= 0; i--) if (rejSet.has(normKey(rawClaims[i].claim))) rawClaims.splice(i, 1);
  }

  // Enforce the RETIRED-PRODUCTS lock in code (guarantee, not just a prompt ask): drop any claim that names a
  // discontinued product, so a stale site page or old article can never resurface it. Collapsed punctuation so
  // "INGAiGE", "INGAIGE" and "IN-GAiGE" all match. Subject-only mentions go too.
  if (ctx.deadProducts.length) {
    const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const dead = ctx.deadProducts.map(clean).filter(Boolean);
    const hit = (s: string | null) => { const t = clean(s || ""); return dead.some((d) => t.includes(d)); };
    for (let i = rawClaims.length - 1; i >= 0; i--) if (hit(rawClaims[i].claim) || hit(rawClaims[i].subject)) rawClaims.splice(i, 1);
  }

  // ADVERSARIAL QA PASS (Gary). Before Gate 1, a ruthless senior-editor pass red-teams the fact base and catches
  // what a human reviewer would: facts MIS-ATTRIBUTED to the client (a parent/partner's CEO or numbers shown as the
  // client's own), advisers filed as leadership, tangential trivia, and load-bearing claims on a single weak source.
  // It DROPS / MOVES / DEMOTES bad claims so the base is clean BEFORE it reaches you. Best-effort - never blocks.
  if (rawClaims.length) {
    const client = await anthropicClient();
    emit({ t: "phase", label: "Reviewing the fact base for accuracy and attribution" });
    const QA_SCHEMA = { type: "object", additionalProperties: false, properties: { reviews: { type: "array", items: { type: "object", additionalProperties: false, properties: { index: { type: "integer" }, action: { type: "string", enum: ["keep", "drop", "move", "demote"] }, section: { type: "string" }, reason: { type: "string" } }, required: ["index", "action", "section", "reason"] } } }, required: ["reviews"] } as unknown as Anthropic.Tool["input_schema"];
    const list = rawClaims.map((c, i) => `${i}. [section=${c.section} | about: ${c.subject}] ${c.claim}${c.source_url ? ` (src: ${c.source_url})` : " (no source)"}`).join("\n");
    try {
      const qa = await withAnthropicRetry(() => client.messages.stream({
        model: OPUS5, max_tokens: 16000,
        system: `You are a ruthless senior research editor. Review a fact base about ${ctx.name} before it reaches a marketing strategist and rule on EVERY numbered claim:\n- keep: a correct, relevant fact, correctly placed and correctly attributed (${ctx.name}'s OWN fact, or a clearly-labelled competitor fact in a competitor section).\n- drop: WRONG, tangential trivia that will not inform strategy, or MIS-ATTRIBUTED - a fact about a parent, partner or other company presented as ${ctx.name}'s own (for example a partner's CEO, size or numbers shown as ${ctx.name}'s).\n- move: a real fact in the WRONG section - give the correct section id. Advisers/staff filed under leadership belong in snapshot; a competitor fact outside a competitor section moves to competitor.\n- demote: a load-bearing claim on a single weak or uncorroborated source, or stale data shown as current - give section "unverified".\nValid section ids: ${RESEARCH_SECTIONS.map((s) => s.id).join(", ")}.\nRULES: ${ctx.name}'s LEADERSHIP means ${ctx.name}'s OWN executives, never a parent or partner's. Be strict about noise, a strategist wants signal not filler.${ctx.hasCeoLock ? ` GROUND TRUTH: ${ctx.ceoName} IS ${ctx.name}'s ${ctx.ceoTitle} - always keep that, never drop or demote it, and drop or fix anything that reframes them as only a parent company's executive.` : ""}\nReturn a verdict for EVERY claim index, using the exact index shown.`,
        tools: [{ name: "review", description: "A verdict for every claim.", input_schema: QA_SCHEMA }],
        tool_choice: { type: "tool", name: "review" },
        messages: [{ role: "user", content: `Fact base to review (${rawClaims.length} claims):\n\n${list}` }],
      }).finalMessage());
      const qu = qa.usage as { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } | undefined;
      await recordTokens({ clientId: ctx.clientId, userEmail: ctx.userEmail, model: OPUS5, action: "research-qa", inputTokens: qu?.input_tokens || 0, outputTokens: qu?.output_tokens || 0, cacheReadTokens: qu?.cache_read_input_tokens || 0, cacheCreationTokens: qu?.cache_creation_input_tokens || 0 }).catch(() => {});
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

  // GAP REGISTER (Gary's Fable-5 benchmark had one). After the fact base is cleaned, flag - deterministically, in
  // code - the areas a marketing strategist needs but the PUBLIC record came back thin on, so the Strategist knows
  // exactly what to confirm with the client rather than assuming silence means nothing exists. Honest scoping, not
  // padding: it names the hole instead of filling it with a guess.
  const GAP_CHECK: { id: string; label: string; min: number }[] = [
    { id: "leadership", label: "the named executive/management team", min: 1 },
    { id: "products", label: "products, pricing and how they make money", min: 2 },
    { id: "positioning", label: "their stated positioning and USPs", min: 1 },
    { id: "audience", label: "who they serve and their target audience", min: 1 },
    { id: "marketing", label: "their own current marketing and advertising", min: 1 },
    { id: "competitor_set", label: "a set of genuine like-for-like competitors", min: 2 },
    { id: "activity", label: "dated developments in the last 90 days", min: 1 },
    { id: "customer_voice", label: "public reviews and sentiment", min: 1 },
  ];
  for (const g of GAP_CHECK) {
    const n = rawClaims.filter((c) => c.section === g.id).length;
    if (n < g.min) {
      rawClaims.push({
        section: "gaps", subject: ctx.name,
        claim: `Thin in the public record: ${g.label}. The research found ${n === 0 ? "nothing" : "little"} that is verifiable here, so confirm this directly with the client before the strategy relies on it.`,
        source_name: null, source_url: null, source_date: null, tier: 1,
        unverified_reason: null, conflict: null,
      });
    }
  }
  return rawClaims;
}

/** PHASE: verify (spec 3.7). We do not take the model's word that a source exists, says what it claims, or carries
 *  the date it claims. For each sourced claim we FETCH the page, read its real date, and check support. A claim
 *  whose page 404s or does not support it is NOT dropped (a collector keeps signal) - it is MOVED to Unverified with
 *  the reason, and the date we store is the one we read off the page. */
export async function researchVerify(ctx: ResearchCtx, rawClaims: RawClaim[], emit: (e: CollectEvent) => void): Promise<VerifiedClaim[]> {
  const client = await anthropicClient();
  // Each phase has its OWN time budget now, so the cap is generous enough to cover the whole sourced set on a normal
  // run (the file step tops out near 120 claims), not the old 55. Fetches are pooled so we do not hammer the network.
  const VERIFY_CAP = 140;
  const toVerify = rawClaims
    .map((c, i) => ({ c, i }))
    .filter((x) => x.c.source_url)
    .sort((a, b) => (a.c.tier ?? 9) - (b.c.tier ?? 9))
    .slice(0, VERIFY_CAP);
  if (toVerify.length) emit({ t: "phase", label: `Verifying ${toVerify.length} key source${toVerify.length === 1 ? "" : "s"}` });
  let verifyCalls = 0, vin = 0, vout = 0, vcr = 0, vcc = 0;
  const verdicts = new Map<number, Awaited<ReturnType<typeof verifyFinding>>>();
  await pooledForEach(toVerify, 10, async ({ c, i }) => {
    const v = await verifyFinding(
      { headline: c.claim, detail: c.conflict || "", published_at: c.source_date || "" },
      [{ name: c.source_name || c.source_url!, url: c.source_url! }], client, () => { verifyCalls += 1; },
    ).catch(() => null);
    if (v) {
      verdicts.set(i, v);
      if (v.usage) { vin += v.usage.inputTokens; vout += v.usage.outputTokens; vcr += v.usage.cacheReadTokens; vcc += v.usage.cacheCreationTokens; }
    }
  });
  if (verifyCalls) {
    await recordTokens({ clientId: ctx.clientId, userEmail: ctx.userEmail, model: INGEST, action: "research-verify", calls: verifyCalls, inputTokens: vin, outputTokens: vout, cacheReadTokens: vcr, cacheCreationTokens: vcc }).catch(() => {});
  }

  return rawClaims.map((c, i) => {
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
}

/** PHASE: store. Finalise the run row (collecting -> ready), insert the claims, merge any newly detected competitors. */
export async function researchStore(ctx: ResearchCtx, claims: VerifiedClaim[], competitors: { name?: string; website?: string }[], vertical: string | null, identity: ResearchIdentity, emit: (e: CollectEvent) => void): Promise<{ run: ResearchRun; claims: ResearchClaim[] }> {
  const runRows = (await db().query(
    `update research_runs set status = 'ready', vertical = $2, identity = $3, progress = null, error = null
     where id = $1
     returning id, client_id, version, status, website, notes, user_email, vertical, identity, created_at`,
    [ctx.runId, vertical, JSON.stringify(identity)],
  )) as ResearchRun[];
  const run = runRows[0];

  // Pre-tag facts Gary already kept on a past run, so this run's list shows only what is genuinely new.
  const inBrainPrev = await loadInBrainFacts(ctx.clientId).catch(() => new Set<string>());
  const saved: ResearchClaim[] = [];
  for (const c of claims) {
    const kept = inBrainPrev.has(normKey(c.claim));
    const rows = (await db().query(
      `insert into research_claims (run_id, client_id, section, subject, claim, source_name, source_url, source_date, tier, verified, unverified_reason, conflict, in_brain, in_brain_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       returning id, run_id, client_id, section, subject, claim, source_name, source_url, source_date, tier, verified, unverified_reason, conflict, rejected, rejected_by, in_brain, in_brain_by`,
      [run.id, ctx.clientId, c.section, c.subject, c.claim, c.source_name, c.source_url, c.source_date, c.tier, c.verified, c.unverified_reason, c.conflict, kept, kept ? "carried-forward" : null],
    )) as ResearchClaim[];
    saved.push(rows[0]);
    emit({ t: "claim", section: c.section, claim: c.claim.slice(0, 120) });
  }

  // Merge any newly detected competitors into the editable set (auto-added; Gary edits at Gate 1).
  const have = new Set(ctx.knownCompetitors.map((c) => c.name.toLowerCase().trim()));
  for (const comp of Array.isArray(competitors) ? competitors : []) {
    const cname = noDash(comp?.name).slice(0, 200);
    if (!cname || have.has(cname.toLowerCase().trim())) continue;
    have.add(cname.toLowerCase().trim());
    const cweb = typeof comp?.website === "string" && /^https?:\/\//i.test(comp.website) ? comp.website.slice(0, 300) : null;
    await db().query(
      `insert into research_competitors (client_id, name, website, added_by) values ($1,$2,$3,'auto')`,
      [ctx.clientId, cname, cweb],
    ).catch(() => {});
  }

  emit({ t: "done", count: saved.length });
  return { run, claims: saved };
}

/**
 * INLINE single-process driver over the phases - a fallback and the test path. The durable Inngest orchestrator in
 * inngest/research.ts drives the SAME phases across separate invocations, so there is no single 13-minute ceiling.
 */
export async function collectResearch(
  clientId: string,
  today: string,
  opts: { userEmail?: string | null; notes?: string | null; focus?: string | null; onEvent?: (e: CollectEvent) => void } = {},
): Promise<{ run: ResearchRun; claims: ResearchClaim[] }> {
  const { runId, version } = await startResearchRun(clientId, opts);
  const emit = makeResearchProgress(runId, opts.onEvent);
  emit({ t: "start", runId, version });
  try {
    const ctx = await prepareResearch(clientId, runId, version, today, opts);
    const p1 = await researchGatherPass1(ctx, emit);
    const gapd = await researchGapFill(ctx, p1.rawClaims, p1.competitors, emit);
    const reviewed = await researchReview(ctx, gapd.rawClaims, emit);
    const verified = await researchVerify(ctx, reviewed, emit);
    return await researchStore(ctx, verified, gapd.competitors, p1.vertical, p1.identity, emit);
  } catch (e) {
    await markResearchFailed(runId, String((e as Error)?.message || e));
    throw e;
  }
}

/** Mark a durable run failed (only if still 'collecting'), so a returning user is not stuck on a dead spinner. */
export async function markResearchFailed(runId: string, message: string): Promise<void> {
  await db().query(
    `update research_runs set status = 'failed', error = $2, progress = null where id = $1 and status = 'collecting'`,
    [runId, String(message || "").slice(0, 500)],
  ).catch(() => {});
}

/** The claims for a run, ordered for rendering (section order, then verified before unverified, Tier 1 first). */
export async function listResearchClaims(runId: string): Promise<ResearchClaim[]> {
  return (await db().query(
    `select id, run_id, client_id, section, subject, claim, source_name, source_url, source_date, tier, verified, unverified_reason, conflict, rejected, rejected_by, in_brain, in_brain_by
     from research_claims where run_id = $1 order by created_at asc`, [runId],
  )) as ResearchClaim[];
}

/** The latest research run for a client (any status), or null. */
export async function latestResearchRun(clientId: string): Promise<ResearchRun | null> {
  const rows = (await db().query(
    `select id, client_id, version, status, website, notes, user_email, created_at, vertical, identity, pdf_url, drive_url, word_url, notified_at, progress, error
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
