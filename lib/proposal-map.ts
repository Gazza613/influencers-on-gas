import type { ProposalContent } from "./proposal";
import type { ProposalDoc, Headline } from "./proposal-render";

// THE MAPPER: ProposalContent (what Fable writes) + context -> ProposalDoc (what the 24-page renderer draws).
// Content-driven pages (exec, opportunity, strategy, market, audience, targeting, channels, pods, funnel, KPIs,
// rollout, investment) map from the model output. Fixed-doctrine pages (philosophy, closed loop, PSI mock,
// governance, terms, agreement, sign-off) are hardcoded here with the client's specifics swapped in - Gary's
// "fixed templates, swap specifics" call. Bespoke visual slots (competitive map, split bar) get sensible defaults.
// Deterministic: no model call, so it is fully testable without spend.

export type ProposalDocCtx = {
  clientName: string;
  objectiveLabel: string;
  tierName: string;         // "Dominate" | "Launch"
  price: string;            // "R150k"
  priceUnit: string;        // "per month excl VAT"
  rate: string;             // "R150 000 / month excl VAT" (agreement prose)
  dateLabel: string;        // today, UK format (Gary: always current date)
  validityLabel: string;    // "Valid 14 days"
  clientLogo?: { src: string; w: number; h: number } | null;
  competitors?: string[];   // for the competitive map (from the research set)
  clientContacts?: string[];
  clientTagline?: string;
};

// ── small helpers ─────────────────────────────────────────────────────────────────────────────────────────────
// A footer/reference short name. NOT the first word: "THE BED SHOP" -> "THE" was the bug (footer read "THE · 02"
// and the PSI demo said "THE assistant"). Use the real name when it fits; only shorten a genuinely long one, and
// drop a leading article first so the brand survives.
const shortBrand = (s: string) => {
  const n = s.trim();
  if (n.length <= 22) return n;
  const noArticle = n.replace(/^(the|a|an)\s+/i, "").trim();
  return noArticle.length <= 22 ? noArticle : noArticle.split(/\s+/).slice(0, 2).join(" ");
};
// A headline that carries a comma must close with a full stop (Gary's copy rule).
const stopIfComma = (s: string) => (s.includes(",") && !/[.!?]$/.test(s.trim()) ? s.trim() + "." : s.trim());
function hl(lead: string, gradient: string): Headline { return { lead: lead.trim(), gradient: stopIfComma(gradient) }; }
// Split the main cover headline so the client name (or the tail) is the gradient phrase.
function splitCoverHeadline(headline: string, clientName: string): Headline {
  const h = headline.trim();
  const idx = h.toLowerCase().lastIndexOf(clientName.toLowerCase());
  if (idx > 0) return { lead: h.slice(0, idx).trim(), gradient: h.slice(idx).trim() };
  const words = h.split(/\s+/);
  const cut = Math.max(1, Math.ceil(words.length * 0.6));
  return { lead: words.slice(0, cut).join(" "), gradient: words.slice(cut).join(" ") };
}

// Lucide icon markup reused for mapped cards.
const IC = {
  target: `<circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle>`,
  funnel: `<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>`,
  bars: `<path d="M3 3v18h18"></path><rect x="7" y="12" width="3" height="6"></rect><rect x="12" y="8" width="3" height="10"></rect><rect x="17" y="4" width="3" height="14"></rect>`,
  trend: `<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline><polyline points="16 7 22 7 22 13"></polyline>`,
  user: `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>`,
  wrench: `<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>`,
  rocket: `<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"></path><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"></path><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"></path>`,
  refresh: `<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path>`,
  layers: `<polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline>`,
};
const EXEC_ICONS = [IC.target, IC.funnel, IC.bars, IC.trend];
const PERSONA_ICONS = [IC.user, IC.target, IC.refresh, IC.user];
const WEEK_ICONS = [IC.wrench, IC.layers, IC.rocket, IC.refresh];
const PLATFORM_ICON: Record<string, string> = {
  Facebook: `<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path>`,
  Instagram: `<rect width="20" height="20" x="2" y="2" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"></line>`,
  TikTok: `<path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle>`,
  LinkedIn: `<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect width="4" height="12" x="2" y="9"></rect><circle cx="4" cy="4" r="2"></circle>`,
  "Google Display": `<rect width="20" height="14" x="2" y="3" rx="2"></rect><line x1="8" x2="16" y1="21" y2="21"></line><line x1="12" x2="12" y1="17" y2="21"></line>`,
};
const roleLabel = (p: string) => (p === "lead" ? "Lead channel" : p === "support" ? "Support" : "30-day test");
const roleKind = (p: string): "lead" | "support" | "test" => (p === "lead" ? "lead" : p === "support" ? "support" : "test");

// Lowercase a label for mid-sentence use, but KEEP "PSI" uppercase (Gary: PSI is always uppercase, even in brackets).
// The objective label "Lead Generation (PSI)" was being lowercased to "(psi)".
const lowerKeepPSI = (s: string): string => String(s || "").toLowerCase().replace(/psi/g, "PSI");

export function buildProposalDoc(c: ProposalContent, x: ProposalDocCtx): ProposalDoc {
  const name = x.clientName;
  const pods = (c.pods && c.pods.length ? c.pods : []) as { name: string; for_client: string; benefit: string }[];
  const pod = (i: number) => pods[i] || { name: "", for_client: "", benefit: "" };
  const personas = (c.audience?.personas || []).slice(0, 4);

  return {
    brand_short: shortBrand(name),
    client_name: name,
    client_logo: x.clientLogo || null,
    date_label: x.dateLabel,
    validity_label: x.validityLabel,

    cover: {
      headline: splitCoverHeadline(c.headline || `The Integrated Growth System for ${name}`, name),
      summary: c.subhead || "",
      audience_chip: `Prepared for ${name} · ${x.objectiveLabel}`,
    },

    exec: (() => {
      let cards = (c.exec_summary?.cards || []).slice(0, 4).map((cd, i) => ({ icon: EXEC_ICONS[i % 4], title: cd.title, body: cd.body }));
      // The model occasionally returns an EMPTY exec_summary (the tool is not strict-validated). Page 2 is the
      // first content page and must NEVER be blank, so synthesise it from the strongest content we do have: the
      // strategy's winning reasons, else the pods. This makes the executive summary bullet-proof to model variance.
      if (cards.length < 2) {
        const fromWins = (c.strategy?.why_it_wins || []).slice(0, 4).map((w, i) => { const tb = splitTitleBody(w); return { icon: EXEC_ICONS[i % 4], title: tb.title, body: tb.body }; });
        const fromPods = (c.pods || []).slice(0, 4).map((p, i) => ({ icon: EXEC_ICONS[i % 4], title: p.name, body: p.benefit || p.for_client }));
        cards = fromWins.filter((x) => x.title && x.body).length >= 2 ? fromWins : fromPods;
      }
      const intro = (c.exec_summary?.intro || "").trim()
        || c.subhead
        || (c.opportunity?.intro || "").split(/(?<=\.)\s+/).slice(0, 2).join(" ")
        || "";
      return { headline: hl("The case", "in one page"), intro, cards };
    })(),

    opportunity: {
      // No dangling comma on the headline (Gary): a clean noun phrase reads as one line or two, either way finished.
      headline: hl("The opportunity", "no competitor has claimed"),
      // Only the opportunity intro here (the market overview lives on page 05). Capped so a long intro cannot push
      // the definition-of-success box + footer off the page (Gary saw page 3 cut off). A rebuild writes it tight.
      paras: [clip(c.opportunity?.intro || "", 520)].filter(Boolean),
      // stat headline = the model's punchy label if it gave one, else a clean auto-extract. Body is bounded so the
      // cards stay compact and equal enough to sit their sources on one line.
      stat_cards: (c.market_intel?.stats || []).slice(0, 6).map((s, i) => ({ icon: [IC.trend, IC.bars, IC.target, IC.user, IC.funnel, IC.refresh][i % 6], stat: (s.label && s.label.trim()) || shortStat(s.stat), body: clip(s.stat, 150), source: s.source })),
      success_body: c.opportunity?.definition_of_success || "",
    },

    strategy: {
      headline: hl("The single-minded", "wedge"),
      wedge_body: c.strategy?.proposition || "",
      argument: c.strategy?.angle || "",
      proof_cards: (c.strategy?.why_it_wins || []).slice(0, 6).map((w) => splitTitleBody(w)),
      flow: { believe: "The proof the market already trusts", buy: "The single reason to act now", outcome: `A qualified ${lowerKeepPSI(x.objectiveLabel)} outcome per rand` },
    },

    market: {
      headline: hl("The evidence", "behind every decision"),
      intro: clip(c.market_intel?.overview || "", 560),
      split: { left_label: "The shrinking play", left_pct: "", left_width: "38%", right_label: "The growth", right_pct: "", right_width: "62%", caption: "Budget follows the growing opportunity" },
      quotes: (c.market_intel?.stats || []).slice(0, 4).map((s) => ({ body: s.stat, source: s.source })),
      // Title = the model's proper headline (a complete, punchy line, never a mid-sentence fragment). Body = the
      // insight + why, clipped at a full SENTENCE so a card never ends mid-thought with "..." (Gary). Roomier than
      // before so the cards fill the page.
      actions: (c.market_intel?.opportunities || []).slice(0, 6).map((o) => {
        const hasHeadline = !!(o.headline && o.headline.trim());
        const tb = splitTitleBody(o.insight || "");
        return {
          title: deSlashTitle(hasHeadline ? o.headline! : tb.title),
          // headline path: whole insight + why. fallback path: the rest of the insight after its first sentence + why.
          body: clipSentence([hasHeadline ? o.insight : tb.body, o.why].filter(Boolean).join(" "), 340),
        };
      }),
    },

    ecosystem_intro: `One closed-loop system that carries a prospect from first impression to a booked outcome, and then compounds: each pod passes sharper intelligence to the next.`,
    divider_line: `The pages that follow walk through the system pod by pod: what each does, and what it means for ${name}'s ${lowerKeepPSI(x.objectiveLabel)} specifically.`,

    pods12: {
      headline: hl("Pods I and II ·", "Research and Strategy"),
      researcher_para: pod(0).for_client, researcher_chip: pod(0).benefit,
      strategist_para: pod(1).for_client, strategist_chip: pod(1).benefit,
      map: competitiveMap(name, x.competitors || []),
    },

    audience: {
      headline: hl("Pod III ·", `The audience, ${numWord(personas.length)} personas`),
      intro: c.audience?.overview || "",
      personas: personas.map((p, i) => ({ icon: PERSONA_ICONS[i % 4], name: p.label, geo: p.propensity || p.who || "", quote: `"${p.angle}"` })),
      discipline_note: `We do not target businesses in the abstract. We target the moment a buyer is forced to act, a new opening, a refurb, an intake, an audit, with hyper-targeted paid ads. Every ad's call to action is one WhatsApp conversation with PSI, and only sales-ready leads reach ${name}'s team.`,
      blueprint_note: `A media buyer's blueprint that sharpens weekly, so spend concentrates on the people most likely to become PSI-qualified.`,
      geo_label: "Priority", geo_chips: [{ label: "High-value segments first", accent: true }],
      budget: [
        { label: "Primary money", body: "The highest-propensity segment, where conversion is most likely", flex: 5 },
        { label: "Always-on", body: "Nurture and retargeting audiences between pushes", flex: 3 },
        { label: "Efficiency layer", body: "Lookalikes around proven converters", flex: 2 },
      ],
    },

    targeting: {
      headline: hl("Your perfect target audience", "found"),
      // Cap platforms (3) and each block's text so four persona rows + the matrix always fit one page (Gary: the
      // page was cut off by the last persona). The selections are the value; the approach is trimmed to fit.
      rows: personas.map((p) => ({
        name: p.label,
        platforms: (p.platforms || []).slice(0, 3).map((pl) => pl.platform).join(" · "),
        segments: (p.platforms || []).slice(0, 3).map((pl) => ({ label: pl.platform, text: clip(`${pl.selections.slice(0, 9).join(", ")}. ${pl.approach}`, 165) })),
      })),
      matrix: channelMatrix(personas),
    },

    creative: {
      intro: `Attention is the currency. The Creative Studio produces assets engineered for performance, harnessing AI-driven creative generation at scale, then engineering emotive experiences that guide a person from first engagement to a booked outcome. Volume tested against a clear objective is a machine for lowering acquisition cost.`,
      for_client: pod(3).for_client,
      asset_formats: [
        { ratio: "9:16 Reels", icon: `<polygon points="6 3 20 12 6 21 6 3"></polygon>`, title: "The hook", caption: "Short-form video tuned to the primary audience" },
        { ratio: "1:1 / 4:5", icon: IC.target, title: "The proof", caption: "The single credible claim, made visual and checkable" },
        { ratio: "4:5 Feed", icon: IC.layers, title: "The offer", caption: "The value and the way to act, per platform" },
        { ratio: "1:1 Display", icon: `<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"></path><path d="m9 12 2 2 4-4"></path>`, title: "The reassurance", caption: "Trust formats that de-risk the decision" },
      ],
    },

    channels5: {
      intro: c.channels?.rationale || "",
      rows: (c.channels?.plan || []).slice(0, 5).map((ch) => ({
        icon: PLATFORM_ICON[ch.platform] || IC.target,
        name: ch.platform, role: roleLabel(ch.priority), kind: roleKind(ch.priority),
        what: ch.role, why: ch.why, reach: (ch.reach || "").trim(),
      })),
    },

    psi: {
      intro: `PSI is our Pre-Sales Intelligence system, the AI qualification layer that sits between your marketing and your sales team. Every ad click becomes a WhatsApp conversation, every conversation becomes a live intent score, and only sales-ready leads reach your people. The AI does the qualifying. Your team does the closing.`,
      for_client: pod(5).for_client,
      tiles: [
        { level: "HOT", caption: "Routed to sales now, context attached", kind: "high" },
        { level: "WARM", caption: "Nurtured until the timing is right", kind: "medium" },
        { level: "COLD", caption: "Filtered out cleanly, logged", kind: "low" },
      ],
      chat: c.psi_chat && Array.isArray(c.psi_chat.conversation) && c.psi_chat.conversation.length >= 3
        // Cap to 5 exchanges and keep each bubble short so the chat always fits the page (Gary: the mock-up ran off
        // the bottom). clipSentence trims a long message to whole sentences, never mid-thought.
        ? { assistant: `${shortBrand(name)} assistant`, bubbles: c.psi_chat.conversation.slice(0, 5).map((b) => ({ role: b.role === "out" ? "out" as const : "in" as const, text: clipSentence(b.text, 150) })), closing: clip(c.psi_chat.outcome || "High intent · routed to sales", 52) }
        : {
          // A stronger DEFAULT that actually shows the qualification (intent, timing, scale, sign-off), then scores
          // and routes. A rebuild replaces this with a client-specific conversation from the model.
          assistant: `${shortBrand(name)} assistant`,
          bubbles: [
            { role: "in" as const, text: `Hi, thanks for your interest in ${name}. So I send you to the right person, what are you looking to do, and roughly when?` },
            { role: "out" as const, text: "Weighing up options for a project starting next quarter." },
            { role: "in" as const, text: "Good timing. Roughly what scale are we talking, and do you sign off the decision or does someone else?" },
            { role: "out" as const, text: "A decent volume, and it is my call." },
            { role: "in" as const, text: `That puts you in our priority band. I am handing you to the right ${shortBrand(name)} person now, with everything you have told me, so you skip the back and forth.` },
          ],
          closing: "High intent · routed to sales, context attached",
        },
      side_cards: [
        { title: "Scored live, per message", body: `Timeline, fit, budget-readiness and urgency each move an intent score, in real time, in ${shortBrand(name)}'s own language.` },
        { title: "Routed by tier", body: "Hot goes to sales with the full conversation attached, warm enters nurture, cold is filtered out. Disqualification is not failure, it is performance." },
        { title: "Feeds back to media", body: "Qualified events flow to your ad platforms, so campaigns learn to buy intent, not just clicks." },
      ],
      benefit_client: "Your team works only the hot list, and every lead arrives with the full conversation, so no call ever starts from zero.",
      benefit_forward: "Scored leads flow into the PSI dashboard and qualified intent back to media, so the whole system compounds.",
    },

    pods78: {
      headline: hl("Pods VII and VIII ·", "Dashboard and Media on GAS"),
      dashboard_para: pod(6).for_client, dashboard_chip: pod(6).benefit,
      media_para: pod(7).for_client, media_chip: pod(7).benefit,
      tiles: [
        { label: "Cost per qualified lead", spark: "line-down", caption: "Trending down by design" },
        { label: "Conversations started", spark: "bars", caption: "By audience and channel" },
        { label: "Qualified-lead share", spark: "line-up", caption: "Rising by design" },
        { label: "Conversion follow-through", spark: "gauge", caption: "Sales follow-through" },
      ],
    },

    closedloop: {
      intro: `GAS does not operate in silos. Data, insight and optimisation flow from one pod to the next, creating a continuous cycle of learning, execution and improvement. For ${name} that means growth today and brand equity tomorrow, built at the same time.`,
      compounding: `A conversion in PSI sharpens the audience model. A winning asset lowers acquisition cost in Channel Management. An outcome retrains the score. The advantage widens with time rather than fading: growth today, brand equity tomorrow, built at the same time.`,
    },

    rollout: {
      headline: hl("Your 31-day", "build to go-live"),
      intro: `A focused 31-day build. Each stage is proven before the next begins, and the campaign goes live on day 31.`,
      rail: (c.rollout || []).slice(0, 4).map((r, i) => ({ badge: `W${i + 1}`, label: shortLabel(r.title) })),
      // Clip the milestone so it never runs past two lines, so all four milestone pills stay the same height (Gary).
      weeks: (c.rollout || []).slice(0, 4).map((r, i) => ({ icon: WEEK_ICONS[i % 4], title: r.title, pods: r.pods, bullets: r.points || [], gate: clip(r.gate, 72) })),
    },

    funnel: {
      disclaimer: c.funnel?.disclaimer || "",
      bars: (c.funnel?.stages || []).slice(0, 6).map((s) => `${s.stage}: ${s.note}`),
      kpis: (c.kpis || []).map((k) => ({ metric: k.metric, why: k.why, baseline: k.baseline })),
    },

    governance: {
      intro: `This proposal is grounded exclusively in the verified fact base and the approved strategy. The following commitments govern how we protect ${name}'s credibility in market, with POPIA and international alignment across every funnel and integration.`,
      commitments: governanceCommitments(name),
    },

    deal_divider: `The final pages cover the investment, the commercial terms and a deliberately simple one-page agreement, written so a decision can be made in the room.`,

    investment: {
      intro: `One engagement, engineered for this mandate: the complete eight-pod closed loop, with the full PSI stack. This is the ${x.tierName} system.`,
      tier_name: x.tierName, tagline: x.tierName === "Dominate" ? "Own the category" : "Establish the system",
      poc_chip: "Three-month proof of concept",
      price: x.price, price_unit: x.priceUnit,
      body: c.investment?.engine_includes?.length ? `The complete eight-pod system at this tier, tuned continuously so the compounding advantage widens quarter on quarter.` : "",
      inclusions: (c.investment?.engine_includes || []).slice(0, 8).map((t) => ({ title: t, pod_tag: "" })),
      footnotes: [
        { label: "Fixed monthly retainer", body: "A predictable monthly investment. No time-billing, no surprise line items." },
        { label: "Media and scope", body: `Media budget is decided separately by ${name} and is additional to the retainer. Your data, accounts and audiences remain yours.` },
        { label: "Performance incentive", body: "An optional upside linked to PSI scorecarding, so both parties win from the same result." },
      ],
      honest_para: (c.investment?.notes || []).join(" ") || `We do not quote a guaranteed return; we commit to running the system well, reporting transparently and reallocating budget quickly toward what works.`,
    },

    terms: {
      validity: `This proposal is valid for 14 days from ${x.dateLabel}.`,
      engagement: `On signature, the engagement commences as a three-month proof-of-concept agreement on the ${x.tierName} tier.`,
      media: `Media spend is decided separately by ${name} following this proposal, and is additional to the retainer. GAS makes no profit, markup or commission on media.`,
      ownership: `First-party data, ad accounts and audiences remain the property of ${name} throughout, with full visibility.`,
      poc_proves: `Within three months: a baselined, transparent record of cost per qualified lead; a PSI knowledge base trained on your market that compounds in value; and a scaling plan grounded in evidence, not assertion. Predictable growth. Scalable lead generation. Measurable brand equity. On demand, under one accountable partner.`,
    },

    agreement: {
      intro: `This single page, together with the rate card, is the working agreement between GAS Marketing Automation (Pty) Ltd and ${name}. Signature of this proposal constitutes acceptance of these terms. No further agency contract is required.`,
      clauses: agreementClauses(name, x.tierName, x.rate),
    },

    signoff: {
      intro: `By signing below, the parties accept this proposal and commence a three-month proof-of-concept agreement on the ${x.tierName} tier, on the commercial terms set out on page 20. This proposal is valid for 14 days from ${x.dateLabel}.`,
      client: { name, signatory_label: name, contacts: x.clientContacts || [], tagline: x.clientTagline || "" },
    },
  };
}

// ── derivations ───────────────────────────────────────────────────────────────────────────────────────────────
// A short numeric/label version of a stat for the big card figure (falls back to the first token).
// The big accent token on a stat card. A real number wins. If the "stat" is prose with no number, take the first
// meaningful CONTENT word (never a bare "The" - that was the bug that put "The" as a headline number), else nothing.
const STAT_STOP = new Set(["the", "a", "an", "of", "to", "in", "on", "and", "for", "with", "their", "its", "this", "that", "every", "essentially", "across", "is", "are", "was", "were", "has", "have", "at", "least", "about", "around", "over", "nearly", "roughly", "up", "from"]);
const NUM_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
// The big accent token on a stat card. It must be PUNCHY and CLEAN - a real figure, a counted noun, or a short
// whole-word label - and must NEVER be a mid-word slice ("Comfort-tr") or a stop-word ("Least", "The") as the old
// version produced. Whole words only; figures win.
function shortStat(s: string): string {
  s = String(s || "").trim();
  const cur = s.match(/R\s?\d[\d,]*/);                                           // currency, e.g. R7,999
  if (cur) return cur[0].replace(/\s+/g, "");
  const num = s.match(/\b\d[\d,.]*(?:[\s-](?:%|k|m|bn|x|nights?|years?|yr|months?|days?|hours?|stores?|branches?))?\b/i);
  if (num) return num[0].replace(/\s+/g, " ").trim().slice(0, 14);               // 180 Nights, 10-year, 30%
  const words = s.split(/\s+/);
  for (let i = 0; i < words.length; i++) {                                       // number-word -> digit + counted noun
    const w = words[i].toLowerCase().replace(/[^a-z]/g, "");
    if (NUM_WORDS[w] != null) {
      const noun = (words[i + 1] || "").replace(/[^a-z0-9-]/gi, "");
      return (NUM_WORDS[w] + (noun && !STAT_STOP.has(noun.toLowerCase()) ? " " + noun : "")).slice(0, 14);
    }
  }
  const mean = words.map((w) => w.replace(/[^a-z0-9-]/gi, "")).filter((w) => w.length >= 3 && !STAT_STOP.has(w.toLowerCase()));
  if (!mean.length) return "";
  let out = mean[0];                                                             // first 1-2 whole words, never truncated mid-word
  if (out.length <= 7 && mean[1] && out.length + 1 + mean[1].length <= 16) out += " " + mean[1];
  return out[0].toUpperCase() + out.slice(1);
}
// A slash in a card title reads as a crammed list (Gary), so turn "size/firmness/length" into "size and firmness
// and length" for any title we surface.
const deSlashTitle = (t: string): string => t.replace(/\s*\/\s*/g, " and ");
// Split into a COMPLETE title + body: take the first full sentence (any length) or a leading "Title:" as the
// title, the rest as the body. Never a mid-sentence fragment (Gary: "a headline should never be part of a
// sentence... it ends mid sentence, I do not want that").
// The proof-card TITLE must sit on ONE line so a grid of cards reads neatly (Gary). The card title column is narrow,
// so we cap the title at ~50 chars: take the leading sentence when it is short enough, otherwise break at the first
// natural clause break (comma/colon/semicolon/dash) within the cap, else a word boundary. Whatever is trimmed off is
// folded to the FRONT of the body (capitalised, leading punctuation stripped) so no content is ever lost.
const TITLE_MAX = 50;
const capFirst = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
function splitTitleBody(w: string): { title: string; body: string } {
  w = String(w || "").trim();
  const m = w.match(/^([\s\S]+?[.:!?])\s+([\s\S]+)$/);
  let title = w, body = "";
  if (m && m[1].replace(/[.:!?]$/, "").trim().length >= 6) { title = m[1].replace(/[.:!?]$/, "").trim(); body = m[2].trim(); }
  // Title still too long for one line: clamp it and push the overflow into the body.
  if (title.length > TITLE_MAX) {
    const head = title.slice(0, TITLE_MAX);
    const brk = Math.max(head.lastIndexOf(", "), head.lastIndexOf("; "), head.lastIndexOf(": "), head.lastIndexOf(" - "), head.lastIndexOf(" — "));
    const cut = brk > 14 ? brk : (head.replace(/\s+\S*$/, "").length || TITLE_MAX);
    const overflow = title.slice(cut).replace(/^[\s,;:.\-–—]+/, "").trim();
    title = title.slice(0, cut).trim();
    body = overflow ? capFirst(overflow) + (body ? ". " + body : "") : body;
  }
  return { title: deSlashTitle(title), body };
}
// Bound a string to n chars on a WORD boundary with an ellipsis, so a fixed-height card never clips mid-sentence.
const clip = (s: string, n: number): string => { s = String(s || "").trim(); return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "").trimEnd() + "…" : s; };
// Clip to the last COMPLETE sentence at or under n chars, so a card never ends mid-sentence with an ellipsis
// (Gary). If no sentence break sits reasonably within the limit, fall back to a word-boundary clip.
const clipSentence = (s: string, n: number): string => {
  s = String(s || "").trim();
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return stop > n * 0.45 ? cut.slice(0, stop + 1).trim() : clip(s, n);
};
const numWord = (n: number) => (["zero", "one", "two", "three", "four", "five", "six"][n] || String(n));
// 1 to 2 words for the timeline rail under each badge (Gary: labels were cut off; keep them short).
const shortLabel = (t: string) => {
  const s = String(t || "").replace(/^week\s*\d+\s*[·:.\-]?\s*/i, "").replace(/^(live|go[- ]?live)\s*[:·\-]?\s*/i, "").split(/[,·:]/)[0].trim();
  return s.split(/\s+/).slice(0, 2).join(" ") || s.slice(0, 16);
};

function competitiveMap(name: string, competitors: string[]) {
  const pos = [{ left: "30%", top: "30%" }, { left: "22%", top: "50%" }, { left: "12%", top: "66%" }];
  return {
    title: "The competitive map the Researcher watches continually",
    y_top: "Owned value", y_bottom: "Commodity", x_left: "Slower to respond", x_right: "Speed and qualification",
    competitors: competitors.slice(0, 3).map((cName, i) => ({ name: cName, note: "monitored continually", left: pos[i].left, top: pos[i].top })),
    client: { name, note: "the system's edge", left: "52%", top: "12%" },
    set: competitors.slice(0, 8),
  };
}

function channelMatrix(personas: { label: string; platforms: { platform: string }[] }[]) {
  const channels = ["Facebook", "Instagram", "TikTok", "Retargeting"];
  const rows = personas.map((p) => {
    const used = new Set((p.platforms || []).map((x) => x.platform));
    const cells = channels.map((ch): "lead" | "support" | "test" => (ch === "Retargeting" ? "support" : used.has(ch) ? "lead" : "test"));
    return { persona: p.label.split(/[\s,]/).slice(0, 2).join(" "), cells };
  });
  return { channels, rows };
}

function governanceCommitments(name: string): { title: string; body: string }[] {
  return [
    { title: "No outcome guarantees anywhere", body: `All funnel figures and benchmarks are illustrative; every numeric target is set from ${name}'s baselines measured at kickoff, not before.` },
    { title: "No unverified claim enters paid creative", body: `Claims are used only once verified against the record; nothing enters an advert that ${name} cannot publicly defend.` },
    { title: "No exclusivity language", body: `Where a claim is genuinely unique it is dated and sourced; where it is not, the word "only" does not appear in creative.` },
    { title: "Consent and opt-out enforced", body: `Every funnel operates on lawful basis and consent, with clear opt-out and full auditability under POPIA across capture, qualification and remarketing.` },
    { title: "Transparent stewardship", body: `${name} retains ownership and full visibility of its first-party data, ad accounts and audiences at all times.` },
    { title: "GDPR readiness", body: `International standards honoured for any cross-border data flows, alongside POPIA at home.` },
    { title: "Data protection under POPIA", body: `WhatsApp, enquiry and CRM connections handled through governed, auditable pipelines, within platform policies and with lawful consent.` },
    { title: "Honest scoring", body: `PSI qualification criteria are transparent to ${name}, and lead volume is never inflated to flatter reporting.` },
  ];
}

function agreementClauses(name: string, tierName: string, rate: string): { title: string; body: string }[] {
  return [
    { title: "Engagement", body: `GAS Marketing Automation is appointed as ${name}'s integrated growth partner on a three-month proof of concept, on the ${tierName} tier at ${rate}. The engagement covers all eight pods of the ecosystem and commences on signature, with the rollout plan starting immediately.` },
    { title: "Payment", body: `The monthly retainer is payable upfront, in advance, on presentation of invoice. No credit terms apply; this is the same basis on which every GAS client operates. Invoices and all billing queries are handled by our accountant, Cherice Len (cherice@gasmarketing.co.za).` },
    { title: "Media spend", body: `Media budget is decided and owned by ${name} following this proposal, and is additional to the retainer. Every rand is paid at pure platform cost with full transparency. GAS makes no profit, markup, rebate or commission on media whatsoever, our only income is the retainer.` },
    { title: "Ownership", body: `Your data is yours from day one: your ad accounts, audiences, creative assets, conversation histories and all performance data, handed back in full whenever you ask. The PSI system and its scorecard are GAS's own technology. We build, run and retain them as the engine behind your results, so they stay with us and are not transferable, while the data they produce for you is always yours.` },
    { title: "Confidentiality and data", body: `Both parties keep each other's commercial information strictly confidential. All consumer personal information is collected with consent and processed under POPIA, and consumer-facing scripts and creative are submitted for your compliance approval before launch.` },
    { title: "Continuation", body: `After the three-month proof of concept, our aim is to extend into a long-term partnership: with the system proven and compounding, the natural next step is to continue and scale it together, month to month. There is no lock-in, either party may exit on 30 days' written notice, and on exit we hand back your data, accounts and creative assets in full, with an orderly handover at no extra cost. The PSI system and scorecard, being our own technology, stay with GAS.` },
  ];
}
