// THE AGENT ROSTER PER POD (Gary: "click on the flex of 12 Agents ... their roles and descriptions could pop up
// as a further flex"). Every agent here is a REAL working part of that pod's pipeline, not a made-up headcount -
// the number the tile flexes is simply this list's length, so the flex can never drift from the truth.
//
// One data source for both the server-rendered dashboard tile and the client-side roster popup (PodAgents.tsx).

export type PodAgent = { name: string; role: string; group: string };
export type Pod = { label: string; agents: PodAgent[] };

export const POD_AGENTS: Record<string, Pod> = {
  brain: {
    label: "The Brain",
    agents: [
      { group: "Ingestion & indexing", name: "Sitemap Scout", role: "Maps the whole site before reading a word, so no page is missed." },
      { group: "Ingestion & indexing", name: "Site Crawler", role: "Reads every reachable page, even JavaScript and Cloudflare-walled sites." },
      { group: "Ingestion & indexing", name: "Page Reader", role: "Pulls a single page, or parses an uploaded PDF or document." },
      { group: "Ingestion & indexing", name: "Cleaner", role: "Strips navigation, boilerplate and junk so only real content is kept." },
      { group: "Ingestion & indexing", name: "Chunker", role: "Splits everything into clean, self-contained retrievable passages." },
      { group: "Ingestion & indexing", name: "De-duplicator", role: "A content-hash check so the same passage is never stored twice." },
      { group: "Ingestion & indexing", name: "Embedder", role: "Turns each passage into a 1024-dimension vector for meaning-based search." },
      { group: "Knowledge & retrieval", name: "Retriever", role: "Finds the most relevant passages, locked to this client's brain alone." },
      { group: "Knowledge & retrieval", name: "Answerer", role: "Answers any question from the brain, grounded in the client's own material." },
      { group: "Knowledge & retrieval", name: "Coverage Mapper", role: "Maps what the brain knows and scores its true strength." },
      { group: "Doctrine & governance", name: "Doctrine Keeper", role: "Holds the positioning and compliance rules and keeps them retrievable." },
      { group: "Doctrine & governance", name: "Quota Guardian", role: "Watches the crawl budget and warns before it runs out." },
      { group: "Market intelligence", name: "Market Scout", role: "Sweeps the client's local market, competitors and category on the open web." },
      { group: "Market intelligence", name: "Source Grader", role: "Opens each finding's source, checks its date and grades it verified or unverified." },
      { group: "Market intelligence", name: "Intelligence Curator", role: "Routes each fact to the brain or to standing intelligence, keeping the brain client-only." },
    ],
  },
  researcher: {
    label: "The Researcher",
    agents: [
      { group: "Reading the client", name: "Plan Architect", role: "Drafts the research plan and scope for you to approve before it starts." },
      { group: "Reading the client", name: "Site Miner", role: "Reads the client's own crawled brain as ground truth." },
      { group: "Reading the client", name: "Core-Page Reader", role: "Live-fetches the key pages (home, about, pricing) in case the crawl missed them." },
      { group: "Reading the client", name: "Article Deep-Reader", role: "Reads the newest articles for launches and positioning shifts." },
      { group: "Reading the client", name: "Wall Breaker", role: "Clears Cloudflare and JavaScript walls with a stealth fetch." },
      { group: "Investigating the market", name: "Web Investigator", role: "Searches the live web for market, competitor and press facts." },
      { group: "Investigating the market", name: "Source Verifier", role: "Opens every source, checks its date and confirms it backs the claim." },
      { group: "Investigating the market", name: "Fact Tierer", role: "Grades each fact by how trustworthy its source is." },
      { group: "Keeping it clean", name: "Noise Filter", role: "Drops previously rejected facts and flags what is already in the brain." },
      { group: "Keeping it clean", name: "Brief Composer", role: "Turns the verified facts into the inline research brief." },
    ],
  },
  strategist: {
    label: "The Strategist",
    agents: [
      { group: "Reasoning", name: "Fact Synthesiser", role: "Reads the whole approved fact base as the single source of truth." },
      { group: "Reasoning", name: "Strategy Author", role: "Writes one single-minded, defensible strategy." },
      { group: "Reasoning", name: "Evidence Linker", role: "Traces every strategic point back to a specific fact." },
      { group: "Reasoning", name: "PSI Architect", role: "Designs the WhatsApp Pre-Sales Intelligence angle for the plan." },
    ],
  },
  media: {
    label: "Media on GAS",
    agents: [
      { group: "The Strategists", name: "Sami", role: "The strategist you talk to. Sonnet-5 reasoning grounded in your live Meta, TikTok, Google and LinkedIn data. Never invents a number." },
      { group: "The Strategists", name: "Guided Build", role: "Walks 11 material questions (client, objective, budget, dates, audience, placements, creative) before you approve anything." },
      { group: "The Strategists", name: "Weekly Audit Composer", role: "7-dimension weekly review: pace vs plan, headline KPIs, winners to scale, leaks to cut, creative fatigue, audience health and structural hygiene." },
      { group: "The Strategists", name: "Deep Client Reviewer", role: "30-day strategic narrative for the marketing director." },
      { group: "The Strategists", name: "Growth Plan Composer", role: "Every dashboard client sees: TL;DR, 5X Move, Structural Play and Crystal Ball." },
      { group: "The Strategists", name: "Onboarding Coach", role: "Full new-client checklist, end-to-end." },
      { group: "The Strategists", name: "Client Memory Curator", role: "Remembers every client's rules: standard budget, WhatsApp number, forbidden phrasing and audience overlays." },
      { group: "The Strategists", name: "Naming Convention Enforcer", role: "3-level naming applied to every campaign, ad set and ad." },
      { group: "The Analysts", name: "Creative Judge", role: "Grades every ad against Meta, TikTok and Google benchmarks (EXCELLENT / GOOD / ON TRACK / OPTIMISE)." },
      { group: "The Analysts", name: "Targeting Analyst", role: "Reads audience shape, geo, age, gender and exclusions. Flags mismatches." },
      { group: "The Analysts", name: "Placement Optimiser", role: "Assesses which placements deliver per objective." },
      { group: "The Analysts", name: "Creative Fatigue Detector", role: "Frequency above 4 with a rising-frequency trend." },
      { group: "The Analysts", name: "Winner Ranker", role: "Objective-aware top creative (awareness on CPM, leads on CPL, sales on ROAS)." },
      { group: "The Analysts", name: "DCO Variant Analyst", role: "Best variant per placement in multi-creative Meta ads." },
      { group: "The Analysts", name: "Cross-Platform Efficiency", role: "Meta vs TikTok vs Google, side by side." },
      { group: "The Analysts", name: "Community Growth Tracker", role: "Whole-account earned total followers and likes, with daily snapshot deltas." },
      { group: "The Analysts", name: "Ecommerce Funnel Analyst", role: "GA4 item-view through purchase, per-client shape." },
      { group: "The Analysts", name: "WhatsApp Attribution Assessor", role: "messaging_conversation_started_7d blended with CAPI-QualifiedLead." },
      { group: "The Optimisers", name: "Objective Classifier", role: "Reads the name-tag and the API objective, handling Meta / TikTok drift." },
      { group: "The Optimisers", name: "Command Centre Flags", role: "Buckets every issue CRITICAL / WARNING / INFO / POSITIVE, with a specific recommendation." },
      { group: "The Optimisers", name: "Budget Pacing Guardian", role: "Daily, lifetime and ABO pace math." },
      { group: "The Optimisers", name: "Spend Leak Detector", role: "Above-target ad sets with meaningful spend: pause or refresh." },
      { group: "The Optimisers", name: "Scale Winner Detector", role: "Under-target ad sets with headroom: 10-20% lifts (never on a signal under R500)." },
      { group: "The Optimisers", name: "Structural Auditor", role: "Objective / optimisation-goal mismatch, naming drift and missing tracking." },
      { group: "The Optimisers", name: "Retargeting Advisor", role: "When to layer a warm audience, which creatives to reserve and which exclusions to add." },
      { group: "The Watchdogs", name: "Always-Paused Rail", role: "Every new campaign, ad set and ad is created PAUSED." },
      { group: "The Watchdogs", name: "Spend Cap Enforcer", role: "R5,000/day and R50,000 lifetime hard cap, server-side." },
      { group: "The Watchdogs", name: "Approval Nonce Guard", role: "Per-user cryptographic binding of card to approval to write." },
      { group: "The Watchdogs", name: "Idempotency Guard", role: "Retry-safe: a network drop mid-launch never doubles the campaign." },
      { group: "The Watchdogs", name: "Unverified-Numbers Sentinel", role: "A red chip on any figure not grounded in a live data pull." },
      { group: "The Watchdogs", name: "Client-Scope Enforcer", role: "Every client-facing surface filters to only that client's ad accounts." },
      { group: "The Watchdogs", name: "PIN Gate", role: "Per-member 4-digit PIN, bcrypt-hashed, revocable instantly." },
      { group: "The Data Feeders", name: "Meta Ads Reader", role: "Campaigns, ad sets, ads, insights, DCO variants, WhatsApp CAPI and page followers." },
      { group: "The Data Feeders", name: "TikTok Ads Reader", role: "Campaigns, ad groups, ads, image and video metadata." },
      { group: "The Data Feeders", name: "Google Ads Reader", role: "GAQL, RDA asset resolution and PMax asset-group reads." },
      { group: "The Data Feeders", name: "LinkedIn Paid Reader", role: "The Advertising API." },
      { group: "The Data Feeders", name: "LinkedIn Organic Reader", role: "The Community Management API." },
      { group: "The Data Feeders", name: "GA4 Reader", role: "Ecommerce funnel and custom-outcome events." },
      { group: "The Data Feeders", name: "Drive / Dropbox Reader", role: "Creative folder walking, with 1:1 / 9:16 pair detection." },
      { group: "The Data Feeders", name: "Perf Snapshot Recorder", role: "Daily 04:10 UTC ground-truth ledger." },
      { group: "The Composers", name: "Custom Outcomes Compiler", role: "Learnalot two-path leads, MTN MoMo Community Growth and ecommerce funnels." },
      { group: "The Composers", name: "PDF Composer", role: "Full dashboard PDF, with Custom Outcomes preserved." },
      { group: "The Composers", name: "Thumbnail Resolver", role: "Admin-override, then native-cascade, for every ad." },
      { group: "The Composers", name: "Follower Reconciler", role: "Whole-account earned total across every Followers surface." },
      { group: "The Composers", name: "Chip Renamer", role: "Client-facing tone: AVERAGE to ON TRACK, REVIEW to OPTIMISE." },
      { group: "The Composers", name: "Growth Trendline Composer", role: "30-day trend from the perf-snapshot ledger." },
      { group: "The Composers", name: "Weekly Client Pulse", role: "Mon 06:00 UTC auto-composed pulse." },
      { group: "The Composers", name: "Ground-Truth Reconciler", role: "Daily 06:00 UTC cross-platform reconcile." },
      { group: "The Composers", name: "Best-Practice Refresher", role: "Monthly benchmark refresh (CTR / CPC / CPM industry ranges)." },
      { group: "The Composers", name: "Email Dispatcher", role: "A single Gmail SMTP transport for every transactional email." },
    ],
  },
  proposal: {
    label: "The Proposal",
    agents: [
      { group: "Building the deck", name: "Deck Composer", role: "Builds the full client-ready proposal, page by page." },
      { group: "Building the deck", name: "Brand Recolouriser", role: "Recolours the whole deck to the client's own brand." },
      { group: "Building the deck", name: "Pricing Architect", role: "Sets the three investment options from the rate card." },
      { group: "Building the deck", name: "PDF Renderer", role: "Renders the signed-ready PDF, dated on download." },
    ],
  },
};

export function podCount(pod: string): number {
  return POD_AGENTS[pod]?.agents.length ?? 0;
}
