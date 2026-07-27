import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { getSecret } from "./connections";
import { PREMIUM, INGEST } from "./vendors/anthropic";
import { getBrandKit } from "./studio";
import { loadIntelBrief, loadDeskContext, MARKETING_LENS, type Intel } from "./intel";
import { recordTokens } from "./usage";
import { verifyFinding, toISODate } from "./verify";

// THE RESEARCHER - a commissioned deep dive on where a client actually stands.
//
// WHY THIS IS NOT THE STRATEGIST RUNNING HARDER. The Strategist is a WATCHER: it runs daily on a cron and is
// gated hard on recency, because its entire job is "what changed". The Researcher is an ANALYST: it is
// commissioned on demand and answers "where do we stand, and what should we do about it". It reads structural
// truth - an entrenched competitor position, a category norm - but it must do so through CURRENT evidence.
//
// RECENCY, 90 DAYS (Gary). A finding has to rest on a development, publication or move from the last
// RECENCY_DAYS. Year-old news dressed up as a finding is exactly what makes research feel stale, so a dated
// finding older than the window is dropped. Older material may still inform the READ - "Mukuru has operated
// since 2004" is background, not a finding. The trends-and-campaigns-to-steal section runs a wider 12-month
// window (TREND_RECENCY_DAYS), because a globally effective campaign stays a valid craft reference far longer
// than a news item does; everywhere else, current or it does not run.
//
// WHAT IT KEEPS FROM THE DAILY ENGINE, because these are the parts that make research trustworthy:
//   - THE BRAIN IS THE RINGFENCE. Scope lock and remit come from THIS brain's row; no brief means we refuse to
//     run rather than borrow another client's scope.
//   - IT PROPOSES, IT NEVER ASSERTS. Findings land in the same review queue at status 'new' for a human to
//     accept or bin, so nothing reaches the brain unread.
//   - EVERY FINDING IS SOURCED. A claim without a URL someone can open is an opinion, and opinion is the one
//     thing a research desk cannot sell.
//
// FIVE SECTIONS, ALWAYS THE SAME. A dossier that changes shape run to run cannot be compared to the last one.

export type ResearchSection = "threat" | "opportunity" | "gap" | "positioning" | "trend";

// The recency window for a finding. Structural context can be older, but the FINDING itself must be current -
// year-old news dressed as research is the thing Gary called out. Tune here; everything downstream reads it.
// The trends-and-campaigns-to-steal section runs a wider window: a globally effective campaign stays a valid
// reference for up to 12 months (Gary), where a news finding does not.
export const RECENCY_DAYS = 90;
export const TREND_RECENCY_DAYS = 365;

export const SECTIONS: { id: ResearchSection; label: string; blurb: string }[] = [
  { id: "threat", label: "Threats", blurb: "What could damage this client's position" },
  { id: "opportunity", label: "Opportunities", blurb: "Unclaimed ground they could take" },
  { id: "gap", label: "Gaps", blurb: "Where they are weak or absent against what the market expects" },
  { id: "positioning", label: "Positioning", blurb: "How they are seen now, and the sharper claim available" },
  { id: "trend", label: "Trends & campaigns to steal", blurb: "Global moves that could accelerate their campaign" },
];

const STYLE = `HOW TO WRITE THIS (read by busy marketers and by the client's own team, not by analysts):
- MATCH THE CLIENT'S OWN PROFESSIONAL REGISTER, which the scope lock tells you. Write as a senior brand would
  for a business of THIS size and category: corporate and credible, but engaging and genuinely understandable,
  never stiff, never flippant, never breezy. For a licensed financial services client (a life insurer, a bank,
  a fintech) the register is measured and trustworthy, and NOTHING you write may read as financial advice, a
  guarantee, or a claim that cannot be substantiated - anything that could reach the public must survive that
  client's regulatory regime (for SA life cover: FSCA, FAIS, PPR).
- Plain, direct English. Short sentences. Everyday words. Say the thing itself, not the jargon for it.
- SIMPLER LANGUAGE, SAME SUBSTANCE. Never dilute to sound readable: keep every number, name, date and honest
  uncertainty exactly as it is.
- No consultant register: avoid "leverage", "signals", "posture", "vectors", "synergies", "double-click".
- Lead with the point. The first sentence says the thing, not the build-up.
- UK British spelling, ALWAYS. NEVER use an em dash or an en dash: use a comma, a full stop, or a plain hyphen.`;

// The honesty rules DIVERGE from the daily run in exactly one place - recency - and that divergence is the
// whole reason this is a separate engine. Everything else is stricter, not looser.
const HONESTY = `HONESTY RULES:
- EVERY finding carries a REAL source URL you actually read. If you cannot source it, do not report it. A
  research desk that cannot be checked is worthless.
- CITE THE ORIGINAL. Each source URL must point to the ORIGINAL article, report, filing, company page or video
  itself - the primary thing - NOT a Google or search-results page, NOT a link aggregator, and NOT a bare
  homepage. If a claim comes from a video, link the video; from a regulator, link the regulator's own document.
  A reader must be able to click the link and land on the exact source of the claim.
- RECENCY, 90 DAYS. A finding must rest on a development, publication or move from the last 90 days (you are
  told the cutoff date below). Older structural context may inform your READ, but it cannot BE the finding:
  "Mukuru has operated since 2004" is background, not a finding, and last year's partnership is not this
  quarter's news. If you cannot date a claim to within the window, do not present it as current. The ONE wider
  window is the trends-and-campaigns-to-steal section: a globally effective campaign stays a valid craft
  reference for up to 12 MONTHS - and even there, lead with why it is worth acting on now.
- SAY WHEN SOMETHING IS CURRENT. If a fact could have moved since publication, say so rather than implying it
  still holds.
- DO NOT REPORT THE BRAIN'S OWN DOCTRINE BACK. You are given what we already know. A finding must ADD to it,
  sharpen it, or CONTRADICT it. Restating what we told you is the most common way research wastes a reader.
- DEPTH BEATS BREADTH. Three findings that genuinely change a decision beat twelve that summarise the internet.
- A THIN SECTION IS AN HONEST ANSWER. If there is nothing real under a heading, return nothing for it and say
  so. Padding a section to look complete is the failure mode of every research tool ever built.
- Grade confidence honestly: high (primary - regulator, company results, statute, the brand's own published
  work), medium (credible secondary - trade press, law firm, respected analyst), low (single source or inferred).
- material=true ONLY if this would actually change what we say, make or spend. Most things are interesting and
  not material. Be ruthless.`;

const ASSESSMENT = `FOR EVERY FINDING, ALSO GIVE TWO INTERNAL LINES (never published, for our team only):
- impact_risk: what this could actually do to the client, sized honestly. "Little to none" is a valid answer.
- campaign_response: the move you recommend, and whether it is DEFENSIVE (protect what we have) or PROACTIVE
  (take ground). "No move needed" is a valid answer.`;

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
          section: {
            type: "string",
            enum: ["threat", "opportunity", "gap", "positioning", "trend"],
            description: "Which of the five sections this belongs under. threat = could damage them. opportunity = unclaimed ground. gap = where THEY are weak or absent. positioning = how they are seen vs the sharper claim available. trend = a global trend or campaign worth stealing to accelerate their work.",
          },
          headline: { type: "string", description: "One line. The finding itself, not a topic label." },
          why_it_matters: { type: "string", description: "The SO WHAT for THIS client specifically, read through their own doctrine. Concrete, not generic." },
          detail: { type: "string", description: "The substance, with the real numbers, names and dates." },
          sources: {
            type: "array",
            description: "EVERY source you actually read for this finding. Each url must be the ORIGINAL article, report, filing, company page or video itself - never a search-results page, an aggregator, or a bare homepage. Never invent a URL.",
            items: {
              type: "object", additionalProperties: false,
              properties: { name: { type: "string" }, url: { type: "string" } },
              required: ["name", "url"],
            },
          },
          published_at: { type: "string", description: "Date the SOURCE was published as YYYY-MM-DD. Findings must be current, so date every one you can. A dated finding older than the 90-day window is DROPPED; the trend / campaigns-to-steal section allows up to 12 months. Empty string only if genuinely undateable - accepted but weaker." },
          period: { type: "string", description: "What the DATA covers if different from publication (e.g. 'FY2025'). Empty if not applicable." },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          material: { type: "boolean", description: "Would this actually change what we say, make or spend? Be ruthless." },
          impact_risk: { type: "string", description: "INTERNAL. What this could actually do, sized honestly." },
          campaign_response: { type: "string", description: "INTERNAL. The recommended move, marked DEFENSIVE or PROACTIVE." },
        },
        required: ["section", "headline", "why_it_matters", "detail", "sources", "published_at", "period", "confidence", "material", "impact_risk", "campaign_response"],
      },
    },
    thin_sections: {
      type: "array",
      items: { type: "string" },
      description: "Sections where you honestly found nothing worth reporting. Naming them is a correct answer, not a failure.",
    },
  },
  required: ["findings", "thin_sections"],
} as unknown as Anthropic.Tool["input_schema"];

// LIVE PROGRESS. A deep run takes minutes; a static "Researching..." makes a world-class engine feel broken.
// runResearch emits these as it works, so the desk can narrate the actual searches and findings as they land.
// Progress is best-effort: a listener that throws never breaks the research.
export type ResearchEvent =
  | { t: "phase"; label: string }
  | { t: "search"; q: string }
  | { t: "sources"; n: number }
  | { t: "finding"; section: string; headline: string }
  | { t: "done"; count: number }
  | { t: "error"; message: string };

// MEMORY - so a re-run does not refile what it already surfaced (Gary). Normalise a headline to a comparable
// key (lowercase, alphanumerics only) and a URL to host+path (no scheme, query or trailing slash), so trivial
// differences do not defeat the match.
const normKey = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const normUrl = (u: unknown) => String(u ?? "").toLowerCase().replace(/^https?:\/\//, "").replace(/[#?].*$/, "").replace(/\/+$/, "");

/** What this brain's Researcher has ALREADY surfaced recently - so a fresh run adds to it rather than repeating. */
async function loadSeenResearch(clientId: string): Promise<{ headlines: string[]; keys: Set<string>; urls: Set<string> }> {
  // Look back further than the recency window (findings stay relevant past their own publish date), and across
  // every status: an accepted finding is in the brain, a queued one is waiting, and even a binned one was
  // rejected on purpose - none should come back around.
  const rows = (await db().query(
    `select headline, source_url, sources from studio_intel
     where client_id = $1 and role = 'researcher' and found_at > now() - interval '180 days'`,
    [clientId],
  )) as { headline: string; source_url: string | null; sources: { url?: string }[] | null }[];
  const headlines: string[] = [];
  const keys = new Set<string>();
  const urls = new Set<string>();
  for (const r of rows) {
    if (r.headline) { headlines.push(r.headline); keys.add(normKey(r.headline)); }
    if (r.source_url) urls.add(normUrl(r.source_url));
    for (const s of Array.isArray(r.sources) ? r.sources : []) if (s?.url) urls.add(normUrl(s.url));
  }
  return { headlines, keys, urls };
}

/**
 * Commission a research dossier for one brain. On demand only - there is no cron (Gary): deep research on every
 * brain daily is real web-search spend for little gain. Returns the findings it PROPOSES, already stored at
 * status 'new' for a human to accept or bin. onEvent streams live progress for the desk to narrate.
 */
export async function runResearch(clientId: string, today: string, focus?: string, onEvent?: (e: ResearchEvent) => void, userEmail?: string | null): Promise<Intel[]> {
  const emit = (e: ResearchEvent) => { try { onEvent?.(e); } catch { /* progress is best-effort, never fatal */ } };
  const key = await getSecret("anthropic");
  if (!key) throw new Error("Claude isn't connected");

  // THE RINGFENCE. Scope and remit come from THIS brain, or we do not run at all.
  const cfg = await loadIntelBrief(clientId);
  if (!cfg) throw new Error("This brain has no intel brief, so its scope lock is unknown. Refusing to research it rather than borrow another brain's scope.");
  const remit = cfg.researcher;
  if (!remit) throw new Error(`${cfg.clientName} has no Researcher remit set yet. Add one on the brain before running the deep research.`);

  const client = new Anthropic({ apiKey: key });
  const kit = await getBrandKit(clientId).catch(() => null);
  const seen = await loadSeenResearch(clientId).catch(() => ({ headlines: [] as string[], keys: new Set<string>(), urls: new Set<string>() }));
  // WORK WITH THE STRATEGIST (Gary): the deep dive folds in what the weekly watch has recently flagged, so the
  // two desks build one picture rather than two.
  const priorWatch = await loadDeskContext(clientId, "strategist").catch(() => []);
  const watchContext = priorWatch.length
    ? `\n\nRECENT MOVEMENTS the weekly Strategist watch has flagged for ${cfg.clientName} - fold these into the deep dive where they matter, and go deeper than the headline:\n${priorWatch.map((r) => `- ${r.headline}${r.why ? `: ${r.why}` : ""}`).join("\n").slice(0, 3000)}\n`
    : "";

  // THE 90-DAY WINDOW (Gary). Research must be current: a finding older than this reads as stale, not
  // structural. Computed from the run date so it always tracks "today", and passed to the model AND enforced in
  // code below - the prompt asks for recency, the filter guarantees it, because a model will drift.
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - RECENCY_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  // The trends-to-steal section gets the wider 12-month window - a globally effective campaign stays a valid
  // craft reference far longer than a news item does.
  const trendCutoff = new Date(`${today}T00:00:00Z`);
  trendCutoff.setUTCDate(trendCutoff.getUTCDate() - TREND_RECENCY_DAYS);
  const trendCutoffStr = trendCutoff.toISOString().slice(0, 10);

  const sectionList = SECTIONS.map((s) => `- ${s.label} (${s.id}): ${s.blurb}`).join("\n");
  const askedFor = focus?.trim()
    ? `\n\nTHE COMMISSION - what this particular dossier is for, which should bias what you dig into:\n${focus.trim()}`
    : "";
  // MEMORY into the prompt: the model should build ON the desk, not repeat it. We show it the headlines already
  // on file and tell it to only report genuinely NEW developments. A hard code-level dedup below is the backstop.
  const alreadyFiled = seen.headlines.length
    ? `\n\nALREADY ON FILE for ${cfg.clientName} - do NOT report any of these again, only genuinely NEW developments or a materially sharper angle:\n${seen.headlines.slice(0, 50).map((h) => `- ${h}`).join("\n")}\n`
    : "";

  // TWO STEPS, for the same reason the daily run does it: given web_search AND the report tool under
  // tool_choice:auto, the model can search and then simply stop without ever filing. Forcing the report in its
  // own call makes a missing dossier impossible rather than merely unlikely.
  const brief = `Today is ${today}. Research ${cfg.clientName} in depth, strictly inside your scope lock.\n\n` +
    `Work the five sections:\n${sectionList}${askedFor}\n\n` +
    `WHAT WE ALREADY KNOW (do NOT report this back - only what ADDS to, sharpens or CONTRADICTS it):\n` +
    `${(kit?.tone_notes || "(no doctrine loaded)").slice(0, 6000)}\n` +
    `${alreadyFiled}${watchContext}\n` +
    `RECENCY: every finding must rest on something from the LAST ${RECENCY_DAYS} DAYS, i.e. on or after ` +
    `${cutoffStr}. Prioritise your searches to that window. Older material may inform your understanding, but do ` +
    `not present it as a finding. The one wider window is the trends-to-steal section: a globally effective ` +
    `campaign may be cited as a craft reference if it ran within the last 12 months (on or after ${trendCutoffStr}).\n\n` +
    `Search the web now, properly and widely: the client, their competitors, their category, their regulators, ` +
    `and the best global marketing work in adjacent categories. Then set out what you actually found, with the ` +
    `real source and its date for each. Go deep on the few current things that would change a decision.`;

  // STREAMED so the desk can show the actual searches as they run, not a dead spinner. We watch completed
  // content blocks: a web_search server-tool call carries its query, and each web_search result block carries
  // the sources it pulled - both are real progress, not a simulated bar.
  emit({ t: "phase", label: `Searching the web on ${cfg.clientName}, last ${RECENCY_DAYS} days` });
  let sourcesRead = 0;
  let searchCount = 0;
  const stream = client.messages.stream({
    model: PREMIUM,
    max_tokens: 8000,
    system: `${cfg.scope}\n\n${remit}\n\n${MARKETING_LENS}\n\n${ASSESSMENT}\n\n${HONESTY}\n\n${STYLE}`,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 18 } as unknown as Anthropic.Tool],
    messages: [{ role: "user", content: brief }],
  });
  stream.on("contentBlock", (blk) => {
    const b = blk as { type: string; name?: string; input?: { query?: string }; content?: unknown };
    if (b.type === "server_tool_use" && b.name === "web_search" && b.input?.query) {
      searchCount += 1;
      emit({ t: "search", q: String(b.input.query).slice(0, 160) });
    } else if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
      sourcesRead += b.content.length;
      emit({ t: "sources", n: sourcesRead });
    }
  });
  const research = await stream.finalMessage();
  // TOKEN-ACCURATE (Gary): meter the real tokens + web searches this run spent, not a flat proxy. The usage
  // field carries the web-search count when the API reports it; fall back to what we counted off the stream.
  const ru = research.usage as { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number; server_tool_use?: { web_search_requests?: number } } | undefined;
  await recordTokens({
    clientId, userEmail, model: PREMIUM, action: "deep-research",
    inputTokens: ru?.input_tokens || 0, outputTokens: ru?.output_tokens || 0,
    cacheReadTokens: ru?.cache_read_input_tokens || 0, cacheCreationTokens: ru?.cache_creation_input_tokens || 0,
    webSearches: ru?.server_tool_use?.web_search_requests ?? searchCount,
  }).catch(() => {});

  const notes = research.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();
  if (!notes) return [];

  emit({ t: "phase", label: "Reading the sources and filing the findings" });
  const res = await client.messages.create({
    model: PREMIUM,
    max_tokens: 8000,
    system: `${cfg.scope}\n\n${MARKETING_LENS}\n\n${HONESTY}\n\n${ASSESSMENT}\n\n${STYLE}\n\nFile the research below as structured findings under the five sections. Carry the REAL source URLs and their dates through - never invent one. Every finding must be dated on or after ${cutoffStr} (last ${RECENCY_DAYS} days); the trends-to-steal section may go back to ${trendCutoffStr} (12 months) for a globally effective campaign. Drop anything older. Name any section you genuinely found nothing for in thin_sections rather than padding it.`,
    tools: [{ name: "dossier", description: "The research dossier, every finding sourced.", input_schema: SCHEMA }],
    tool_choice: { type: "tool", name: "dossier" },   // FORCED - a dossier always comes back
    messages: [{ role: "user", content: `Research notes:\n\n${notes.slice(0, 24000)}` }],
  });
  const fu = res.usage as { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } | undefined;
  await recordTokens({
    clientId, userEmail, model: PREMIUM, action: "research-file",
    inputTokens: fu?.input_tokens || 0, outputTokens: fu?.output_tokens || 0,
    cacheReadTokens: fu?.cache_read_input_tokens || 0, cacheCreationTokens: fu?.cache_creation_input_tokens || 0,
  }).catch(() => {});

  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") return [];
  const out = block.input as { findings?: Record<string, unknown>[] };
  const findings = Array.isArray(out.findings) ? out.findings : [];
  if (!findings.length) return [];

  // NO EM DASHES, EVER (Gary). Enforced on the way in, so the desk, any email and the article all inherit it
  // clean. A numeric range is handled first, or "12-18 months" becomes "12 - 18 months".
  const noDash = (s: unknown) => String(s ?? "")
    .replace(/(\d)\s*[—–]\s*(\d)/g, "$1-$2")
    .replace(/\s*[—–]\s*/g, " - ")
    .trim();

  // The request this dossier answered, stamped on every finding so the desk can tag it and you can refer back
  // to what you asked for. A blank commission is the full standing remit.
  const request = focus?.trim() ? focus.trim().slice(0, 300) : "Standing remit";

  // SHAPE THE CANDIDATES. A finding with no usable source is an opinion and never reaches the queue.
  const valid = new Set(SECTIONS.map((s) => s.id));
  const candidates = findings.map((f) => {
    const section = valid.has(String(f.section) as ResearchSection) ? String(f.section) : "positioning";
    const srcs = (Array.isArray(f.sources) ? f.sources : [])
      .filter((s): s is { name: string; url: string } => !!s && typeof (s as { url?: string }).url === "string" && /^https?:\/\//i.test((s as { url: string }).url))
      .slice(0, 8);
    return { f, section, srcs };
  }).filter((c) => c.srcs.length > 0)
    // NO-REPEAT BACKSTOP (Gary): the prompt already asks the model not to repeat what is on file, but a model
    // drifts, so we also drop a candidate whose headline OR primary source matches something already surfaced
    // for this brain in the last 180 days. Done BEFORE verification, so a repeat costs nothing to check.
    .filter((c) => !seen.keys.has(normKey(c.f.headline)) && !c.srcs.some((s) => seen.urls.has(normUrl(s.url))));
  if (!candidates.length) return [];

  // VERIFIED RETRIEVAL - the trust layer (Gary's #1). We do not take the model's word that a source exists, says
  // what it claims, or carries the date it claims. For each finding we FETCH the cited page, read its REAL
  // publish date off the page, and ask the cheap model whether the page actually supports the claim. The date we
  // gate and display is the one we read, not the one the model guessed; a finding whose own page does not support
  // it is dropped as a fabrication. A page we simply could not reach (bot-blocked) is kept but flagged, never
  // binned - blocking robots is not lying.
  emit({ t: "phase", label: `Verifying the sources on ${candidates.length} finding${candidates.length === 1 ? "" : "s"}` });
  let verifyCalls = 0;
  const verdicts = await Promise.all(candidates.map((c) =>
    verifyFinding(
      { headline: String(c.f.headline || ""), detail: String(c.f.detail || ""), published_at: String(c.f.published_at || "") },
      c.srcs, client, () => { verifyCalls += 1; },
    ).catch(() => ({ status: "unverified" as const, supported: null, date: toISODate(c.f.published_at), checkedUrl: c.srcs[0]?.url || null, note: "", usage: null })),
  ));
  if (verifyCalls) {
    // Sum the real tokens across every verify call and meter them as one Haiku line, tagged to this user.
    let vin = 0, vout = 0, vcr = 0, vcc = 0;
    for (const v of verdicts) {
      if (v.usage) { vin += v.usage.inputTokens; vout += v.usage.outputTokens; vcr += v.usage.cacheReadTokens; vcc += v.usage.cacheCreationTokens; }
    }
    await recordTokens({ clientId, userEmail, model: INGEST, action: "research-verify", calls: verifyCalls, inputTokens: vin, outputTokens: vout, cacheReadTokens: vcr, cacheCreationTokens: vcc }).catch(() => {});
  }

  const saved: Intel[] = [];
  for (let k = 0; k < candidates.length; k++) {
    const { f, section, srcs } = candidates[k];
    const v = verdicts[k];

    // DROP A FABRICATION. Two ways a source fails the trust test: "refuted" (we read the page and the claim
    // is not there) and "dead" (the cited URL 404s - the page does not exist, e.g. the invented
    // facebook.com/business/help/click-to-whatsapp-ads link Gary caught). Neither is citable, so neither is
    // stored. A bot-blocked source ("unverified") is NOT dropped - blocking robots is not lying.
    if (v.status === "refuted" || v.status === "dead") continue;

    // THE RECENCY GATE, now on the VERIFIED date. A finding dated before the cutoff is stale and dropped - except
    // the trends-to-steal section, which runs the 12-month window. Undated findings pass (we cannot prove them
    // stale). Because the date is read off the page, the model can no longer fabricate its way past this.
    const date = v.date && /^\d{4}-\d{2}-\d{2}$/.test(v.date) ? v.date : null;
    const limit = section === "trend" ? trendCutoffStr : cutoffStr;
    if (date && date < limit) continue;

    const rows = (await db().query(
      `insert into studio_intel (client_id, role, section, request, headline, why_it_matters, detail, sources, source_url, source_name, published_at, period, confidence, material, impact_risk, campaign_response, verification)
       values ($1,'researcher',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       returning id, role, section, request, headline, why_it_matters, detail, sources, source_url, source_name, published_at, period, confidence, material, impact_risk, campaign_response, verification, status, found_at`,
      [clientId, section, request, noDash(f.headline).slice(0, 300), noDash(f.why_it_matters).slice(0, 1200),
       noDash(f.detail).slice(0, 4000), JSON.stringify(srcs),
       srcs[0]?.url ?? null, srcs.map((s) => s.name).join(" · ").slice(0, 200) || null,
       date,
       String(f.period || "").slice(0, 60) || null,
       ["high", "medium", "low"].includes(String(f.confidence)) ? f.confidence : "medium", f.material === true,
       noDash(f.impact_risk).slice(0, 3000) || null,
       noDash(f.campaign_response).slice(0, 3000) || null,
       v.status],
    )) as Intel[];
    saved.push(rows[0]);
    emit({ t: "finding", section, headline: noDash(f.headline).slice(0, 120) });
  }
  return saved;
}

/** The dossier for a brain, newest first, grouped by the caller. */
export async function listResearch(clientId: string, status = "new"): Promise<Intel[]> {
  return (await db().query(
    `select id, role, section, request, headline, why_it_matters, detail, sources, source_url, source_name,
            published_at, period, confidence, material, impact_risk, campaign_response, verification, newsletter, newsletter_art,
            newsletter_options, status, found_at
     from studio_intel
     where client_id = $1 and role = 'researcher' and status = $2
     order by found_at desc`,
    [clientId, status],
  )) as Intel[];
}
