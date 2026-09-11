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
