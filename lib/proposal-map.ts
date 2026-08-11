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
const firstWord = (s: string) => (s.trim().split(/\s+/)[0] || s).trim();
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

export function buildProposalDoc(c: ProposalContent, x: ProposalDocCtx): ProposalDoc {
  const name = x.clientName;
  const pods = (c.pods && c.pods.length ? c.pods : []) as { name: string; for_client: string; benefit: string }[];
  const pod = (i: number) => pods[i] || { name: "", for_client: "", benefit: "" };
  const personas = (c.audience?.personas || []).slice(0, 4);

  return {
    brand_short: firstWord(name),
    client_name: name,
    client_logo: x.clientLogo || null,
    date_label: x.dateLabel,
    validity_label: x.validityLabel,

    cover: {
      headline: splitCoverHeadline(c.headline || `The Integrated Growth Engine for ${name}`, name),
      summary: c.subhead || "",
      audience_chip: `Prepared for ${name} · ${x.objectiveLabel}`,
    },

    exec: {
      headline: hl("The case", "in one page"),
      intro: c.exec_summary?.intro || "",
      cards: (c.exec_summary?.cards || []).slice(0, 4).map((cd, i) => ({ icon: EXEC_ICONS[i % 4], title: cd.title, body: cd.body })),
    },

    opportunity: {
      headline: hl("The opportunity,", "no competitor has claimed"),
      paras: [c.opportunity?.intro || "", c.market_intel?.overview || ""].filter(Boolean),
      stat_cards: (c.market_intel?.stats || []).slice(0, 6).map((s, i) => ({ icon: [IC.trend, IC.bars, IC.target, IC.user, IC.funnel, IC.refresh][i % 6], stat: shortStat(s.stat), body: s.stat, source: s.source })),
      success_body: c.opportunity?.definition_of_success || "",
    },

    strategy: {
      headline: hl("The single-minded", "wedge"),
      wedge_body: c.strategy?.proposition || "",
      argument: c.strategy?.angle || "",
      proof_cards: (c.strategy?.why_it_wins || []).slice(0, 6).map((w) => splitTitleBody(w)),
      flow: { believe: "The proof the market already trusts", buy: "The single reason to act now", outcome: `A qualified ${x.objectiveLabel.toLowerCase()} outcome per rand` },
    },

    market: {
      headline: hl("The evidence", "behind every decision"),
      intro: c.market_intel?.overview || "",
      split: { left_label: "The shrinking play", left_pct: "", left_width: "38%", right_label: "The growth", right_pct: "", right_width: "62%", caption: "Budget follows the growing opportunity" },
      quotes: (c.market_intel?.stats || []).slice(0, 4).map((s) => ({ body: s.stat, source: s.source })),
      actions: (c.market_intel?.opportunities || []).slice(0, 6).map((o) => ({ title: o.insight, body: o.why })),
    },

    ecosystem_intro: `One closed-loop engine that carries a prospect from first impression to a booked outcome, and then compounds: each pod passes sharper intelligence to the next.`,
    divider_line: `The pages that follow walk through the engine pod by pod: what each does, and what it means for ${name}'s ${x.objectiveLabel.toLowerCase()} specifically.`,

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
      discipline_note: `Every rand of this engagement works the ${x.objectiveLabel} objective. Enquiries outside scope are routed away and never counted, so reporting is never flattered.`,
      blueprint_note: `A media buyer's blueprint that sharpens weekly, so spend concentrates on the people most likely to become PSI-qualified.`,
      geo_label: "Priority", geo_chips: [{ label: "High-value segments first", accent: true }],
      budget: [
        { label: "Primary money", body: "The highest-propensity segment, where conversion is most likely", flex: 5 },
        { label: "Always-on", body: "Nurture and retargeting audiences between pushes", flex: 3 },
        { label: "Efficiency layer", body: "Lookalikes around proven converters", flex: 2 },
      ],
    },

    targeting: {
      headline: hl("Platform-level", "targeting, buildable today"),
      rows: personas.map((p) => ({
        name: p.label,
        platforms: (p.platforms || []).map((pl) => pl.platform).join(" · "),
        segments: (p.platforms || []).map((pl) => ({ label: pl.platform, text: `${pl.selections.join(", ")}. ${pl.approach}` })),
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
        what: ch.role, why: ch.why,
      })),
    },

    psi: {
      intro: `PSI is our proprietary lead-qualification engine and the ecosystem's most defensible asset. AI data-driven scorecarding across social lead forms and interactive WhatsApp funnels qualifies every prospect in real time, before a human ever picks up the phone.`,
      for_client: pod(5).for_client,
      tiles: [
        { level: "HIGH", caption: "Routed to your team", kind: "high" },
        { level: "MEDIUM", caption: "Nurtured until ready", kind: "medium" },
        { level: "LOW", caption: "Filtered out by design", kind: "low" },
      ],
      chat: {
        assistant: `${firstWord(name)} assistant`,
        bubbles: [
          { role: "in", text: `Hi, welcome to ${name}. Tell me what you're looking for and I can check the details for you right now.` },
          { role: "out", text: "I'm interested but not sure it's the right fit for me." },
          { role: "in", text: "Great question. Based on what you've told me you're a strong fit, and I can book you in with the right person this week. Shall I set that up?" },
        ],
        closing: "High intent · Booked",
      },
      side_cards: [
        { title: "Conversational qualification", body: `WhatsApp funnels ask intelligent, ${firstWord(name)}-specific questions.` },
        { title: "Warm hand-off", body: "Each qualified lead arrives with context, so the conversation starts warm." },
        { title: "Real-time alerts", body: "The moment intent scores high, the right person knows." },
      ],
      benefit_client: "Your team focuses only on high-propensity leads, lifting conversion without adding headcount.",
      benefit_forward: "Hands scored leads into the PSI Conversion Dashboard.",
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
      headline: hl("Your rollout,", "gated week by week"),
      intro: `The rollout mirrors the engine. Each stage ends at a sign-off gate: nothing proceeds until the previous stage is proven.`,
      rail: (c.rollout || []).slice(0, 4).map((r, i) => ({ badge: `W${i + 1}`, label: shortLabel(r.title) })),
      weeks: (c.rollout || []).slice(0, 4).map((r, i) => ({ icon: WEEK_ICONS[i % 4], title: r.title, pods: r.pods, bullets: r.points || [], gate: r.gate })),
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
      intro: `One engagement, engineered for this mandate: the complete eight-pod closed loop, with the full PSI stack. This is the ${x.tierName} engine.`,
      tier_name: x.tierName, tagline: x.tierName === "Dominate" ? "Own the category" : "Establish the engine",
      poc_chip: "Three-month proof of concept",
      price: x.price, price_unit: x.priceUnit,
      body: c.investment?.engine_includes?.length ? `The complete eight-pod engine at this tier, tuned continuously so the compounding advantage widens quarter on quarter.` : "",
      inclusions: (c.investment?.engine_includes || []).slice(0, 8).map((t) => ({ title: t, pod_tag: "" })),
      footnotes: [
        { label: "Fixed monthly retainer", body: "A predictable monthly investment. No time-billing, no surprise line items." },
        { label: "Media and scope", body: `Media budget is decided separately by ${name} and is additional to the retainer. Your data, accounts and audiences remain yours.` },
        { label: "Performance incentive", body: "An optional upside linked to PSI scorecarding, so both parties win from the same result." },
      ],
      honest_para: (c.investment?.notes || []).join(" ") || `We do not quote a guaranteed return; we commit to running the engine well, reporting transparently and reallocating budget quickly toward what works.`,
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
function shortStat(s: string): string {
  const m = s.match(/([+-]?\d[\d,.]*\s?(?:%|k|m|bn|x|★|\+)?)/i);
  return (m ? m[1] : s.split(/[\s,]/)[0]).trim().slice(0, 10);
}
function splitTitleBody(w: string): { title: string; body: string } {
  const m = w.match(/^(.{8,60}?[.:])\s+(.+)$/);
  if (m) return { title: m[1].replace(/[.:]$/, ""), body: m[2] };
  const words = w.split(/\s+/);
  return { title: words.slice(0, 6).join(" "), body: words.slice(6).join(" ") || w };
}
const numWord = (n: number) => (["zero", "one", "two", "three", "four", "five", "six"][n] || String(n));
const shortLabel = (t: string) => t.replace(/^week\s*\d+\s*[·:.-]?\s*/i, "").split(/[,·]/)[0].trim().slice(0, 22) || t.slice(0, 22);

function competitiveMap(name: string, competitors: string[]) {
  const pos = [{ left: "30%", top: "30%" }, { left: "22%", top: "50%" }, { left: "12%", top: "66%" }];
  return {
    title: "The competitive map the Researcher watches continually",
    y_top: "Owned value", y_bottom: "Commodity", x_left: "Slower to respond", x_right: "Speed and qualification",
    competitors: competitors.slice(0, 3).map((cName, i) => ({ name: cName, note: "monitored continually", left: pos[i].left, top: pos[i].top })),
    client: { name, note: "the engine's edge", left: "52%", top: "12%" },
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
    { title: "Ownership", body: `Everything built under this engagement belongs to ${name} from day one: ad accounts, audiences, creative assets, the PSI knowledge base, conversation histories and all performance data. Nothing is held hostage, during or after the term.` },
    { title: "Confidentiality and data", body: `Both parties keep each other's commercial information strictly confidential. All consumer personal information is collected with consent and processed under POPIA, and consumer-facing scripts and creative are submitted for your compliance approval before launch.` },
    { title: "Exit", body: `After the three-month proof of concept, the engagement continues month to month, no lock-in. Either party may exit on 30 days' written notice. On exit, GAS provides a full, orderly handover of accounts, assets, data and documentation at no additional cost.` },
  ];
}
