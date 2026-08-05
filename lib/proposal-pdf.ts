import { db } from "./db";
import { renderPdf } from "./studio-render";
import { putBytes } from "./blob";
import { extractBrandColour } from "./brand-colours";
import { TIERS, type TierId } from "./proposal-config";
import type { ProposalContent, Proposal } from "./proposal";

// THE BRANDED PROPOSAL PDF. Renders the Fable-written proposal content into a professional, client-branded
// document for sign-off: the client's own accent colour (pulled from their website), GAS as the Agency of NOW,
// clean iconography and a real page structure. Reuses the Chromium renderer (studio-render). Never the word
// "manifesto"; figures stay illustrative. GAS's own standard six-clause terms are reproduced, parameterised by
// tier - not invented.

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const GAS = { name: "GAS Marketing Automation", signer: "Gary Berman", role: "Managing Director", email: "gary@gasmarketing.co.za", cell: "082 566 3708", accountant: "Cherice Len", accountantEmail: "cherice@gasmarketing.co.za", web: "www.gasmarketing.co.za" };

function ukDate(d: Date): string {
  const day = d.getUTCDate(); const th = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  return `${day}${th} ${d.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" })} ${d.getUTCFullYear()}`;
}

const PRIORITY: Record<string, string> = { lead: "Lead channel", support: "Support", test: "Test" };

type Ctx = { clientName: string; legalName: string; licence: string | null; ceo: string | null; ceoTitle: string | null; accent: string; dark: string; tier: (typeof TIERS)[TierId]; today: Date; validUntil: Date };

function head(n: string, title: string, accent: string): string {
  return `<div class="eyebrow" style="color:${accent}">${esc(n)}</div><h2>${esc(title)}</h2>`;
}
function pods8(accent: string): string {
  const pods = [["I", "Researcher", "The business brain: market, competitors, customer"], ["II", "Strategist", "Intelligence converted into a commercial plan and KPIs"], ["III", "Audience", "The right people, not the most people"], ["IV", "Creative", "Emotive StorySelling, tested at volume"], ["V", "Channels", "Intelligently selected, tuned daily"], ["VI", "PSI", "Every enquiry scored for intent, in real time"], ["VII", "PSI Conversion Dashboard", "The bridge from marketing to your team"], ["VIII", "Media on GAS", "Learns, reallocates and scales winners"]];
  return `<div class="grid2">${pods.map(([r, n, d]) => `<div class="card"><div class="podnum" style="color:${accent}">Pod ${r}</div><div class="podname">${esc(n)}</div><div class="poddesc">${esc(d)}</div></div>`).join("")}</div>`;
}

function proposalHtml(c: ProposalContent, x: Ctx): string {
  const A = x.accent, D = x.dark;
  const sec = (inner: string) => `<section class="pg">${inner}</section>`;

  const cover = `<section class="cover" style="background:linear-gradient(160deg, ${D} 0%, #05060a 100%)">
    <div class="cov-top"><div><div class="gasmark">GAS <span style="color:#FF7A2F">MARKETING AUTOMATION</span></div><div class="gassub">THE AGENCY OF NOW</div></div><div class="cov-client">${esc(x.clientName)}</div></div>
    <div class="cov-mid">
      <div class="cov-kicker" style="color:#FF7A2F">GROWTH PROPOSAL &middot; STRICTLY CONFIDENTIAL</div>
      <h1>${esc(c.headline)}</h1>
      <p class="cov-sub">${esc(c.subhead)}</p>
    </div>
    <div class="cov-foot">
      <span class="pill">PREPARED FOR ${esc(x.legalName)}${x.licence ? " &middot; " + esc(x.licence) : ""}</span>
      <span class="pill pill-accent" style="background:${A}">${ukDate(x.today).toUpperCase()} &middot; VALID 14 DAYS</span>
    </div>
    <div class="cov-rule"><span>${esc(GAS.web).toUpperCase()}</span><span>HUMAN COMMAND. AI EXECUTION.</span></div>
  </section>`;

  const exec = sec(`${head("01", "The case, in one page", A)}
    <p class="lede">${esc(c.exec_summary?.intro)}</p>
    <div class="grid2">${(c.exec_summary?.cards || []).map((k) => `<div class="card"><div class="ctitle">${esc(k.title)}</div><div class="cbody">${esc(k.body)}</div></div>`).join("")}</div>`);

  const opp = sec(`${head("02", "The opportunity", A)}
    <p class="lede">${esc(c.opportunity?.intro)}</p>
    <div class="panel" style="border-color:${A}"><div class="plabel" style="color:${A}">The definition of success</div><p class="pbig">${esc(c.opportunity?.definition_of_success)}</p></div>`);

  const philosophy = sec(`${head("03", "Human Command. AI Execution.", A)}
    <p class="lede">Technology is the engine; human connection remains the steering wheel. AI is deployed to remove repetitive work, respond instantly and qualify at scale, so your people spend their time where only humans add value. This is the specific combination that outperforms either alone.</p>
    <div class="grid2"><div class="card"><div class="ctitle" style="color:${A}">AI does</div><div class="cbody">Data processing, research at scale, creative volume, real-time intent scoring, qualification, retargeting and continuous budget optimisation.</div></div><div class="card"><div class="ctitle" style="color:${A}">Humans do</div><div class="cbody">Strategy, empathy, judgement, compliance sensitivity, the final decision and the client relationship.</div></div></div>`);

  const eco = sec(`${head("04", "Eight integrated pods, one engine", A)}
    <p class="lede">One closed-loop engine that carries a stranger from first impression to a booked, qualified outcome, and then compounds. Each pod feeds sharper intelligence to the next, and Media on GAS feeds every result back upstream so the system gets more intelligent over time.</p>
    ${pods8(A)}`);

  const audience = sec(`${head("05", "The target audience", A)}
    <p class="lede">${esc(c.audience?.overview)}</p>
    ${(c.audience?.personas || []).map((p) => `<div class="persona">
      <div class="pname">${esc(p.label)}</div>
      <div class="pmeta"><b>Trigger</b> ${esc(p.trigger)} &nbsp;&middot;&nbsp; <b>Need</b> ${esc(p.need)}</div>
      <div class="pmeta">${esc(p.who)}</div>
      <div class="pangle" style="color:${A}">${esc(p.angle)}</div>
      ${(p.platforms || []).map((pl) => `<div class="plat"><span class="platname" style="background:${A}">${esc(pl.platform)}</span> <span class="platapp">${esc(pl.approach)}</span><div class="chips">${(pl.selections || []).map((s) => `<span class="chip">${esc(s)}</span>`).join("")}</div></div>`).join("")}
    </div>`).join("")}`);

  const strat = sec(`${head("06", "Our strategic recommendation", A)}
    <div class="panel" style="border-color:${A}"><p class="pbig">${esc(c.strategy?.proposition)}</p><p class="lede" style="margin-top:8px">${esc(c.strategy?.angle)}</p></div>
    <ul class="ticks">${(c.strategy?.why_it_wins || []).map((w) => `<li>${esc(w)}</li>`).join("")}</ul>`);

  const mi = c.market_intel;
  const market = mi ? sec(`${head("07", "Market intelligence & opportunities", A)}
    <p class="lede">${esc(mi.overview)}</p>
    <div class="grid2">${(mi.stats || []).map((s) => `<div class="card"><div class="stat" style="color:${A}">${esc(s.stat)}</div><div class="statsrc">${esc(s.source)}</div></div>`).join("")}</div>
    <div class="opps">${(mi.opportunities || []).map((o) => `<div class="opp"><span class="otag" style="background:${o.digital ? A : "#64748b"}">${o.digital ? "Our pods" : "Beyond digital"}</span><b>${esc(o.insight)}</b> <span class="owhy">${esc(o.why)}</span></div>`).join("")}</div>` ) : "";

  const channels = sec(`${head("08", "Channel plan, intelligently selected", A)}
    <p class="lede">${esc(c.channels?.rationale)}</p>
    ${(c.channels?.plan || []).map((ch) => `<div class="chan"><span class="chname" style="background:${A}">${esc(ch.platform)}</span><span class="chpri">${esc(PRIORITY[ch.priority] || "Support")}</span><b>${esc(ch.role)}</b><div class="chwhy">${esc(ch.why)}</div></div>`).join("")}`);

  const pods = sec(`${head("09", "The eight pods, mapped to you", A)}
    <div class="grid2">${(c.pods || []).map((p) => `<div class="card"><div class="podname">${esc(p.name)}</div><div class="cbody">${esc(p.for_client)}</div><div class="poddesc">${esc(p.benefit)}</div></div>`).join("")}</div>`);

  const rollout = sec(`${head("10", "Your 31-day rollout", A)}
    <p class="lede">The rollout mirrors the engine. Each week ends at a sign-off gate: nothing proceeds until the previous stage is proven.</p>
    ${(c.rollout || []).map((w) => `<div class="week"><div class="wtop"><span class="wname" style="color:${A}">${esc(w.week)} &middot; ${esc(w.title)}</span><span class="wpods">${esc(w.pods)}</span></div><ul class="dots">${(w.points || []).map((pt) => `<li>${esc(pt)}</li>`).join("")}</ul><div class="wgate" style="border-color:${A}"><b style="color:${A}">Gate</b> ${esc(w.gate)}</div></div>`).join("")}`);

  const funnel = sec(`${head("11", "Illustrative funnel economics", A)}
    <p class="disc">${esc(c.funnel?.disclaimer)}</p>
    <div class="funnel">${(c.funnel?.stages || []).map((s, i) => `<div class="fstage"><span class="fnum" style="background:${A}">${i + 1}</span><b>${esc(s.stage)}</b> <span>${esc(s.note)}</span></div>`).join("")}</div>`);

  const kpis = sec(`${head("12", "KPIs, agreed up front", A)}
    <table class="kt"><thead><tr><th>Metric</th><th>Why it matters</th><th>Baseline</th></tr></thead><tbody>${(c.kpis || []).map((k) => `<tr><td><b>${esc(k.metric)}</b></td><td>${esc(k.why)}</td><td>${esc(k.baseline)}</td></tr>`).join("")}</tbody></table>`);

  const compliance = sec(`${head("13", "Trusted with data, by design", A)}
    <p class="lede">${esc(c.compliance?.intro)}</p>
    <ul class="ticks">${(c.compliance?.points || []).map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
    <div class="panel" style="border-color:${A}"><div class="plabel" style="color:${A}">POPIA + GDPR</div><p>Aligned across every funnel and integration, so your brand's trust is protected at every touchpoint.</p></div>`);

  const inv = c.investment;
  const investment = sec(`${head("14", "The investment", A)}
    <div class="invhead" style="border-color:${A}"><div class="invtier">${esc(inv?.tier_name)} <span class="invtag" style="color:${A}">${esc(x.tier.tagline)}</span></div><div class="invrate">${esc(inv?.rate)}</div></div>
    <div class="grid2">${(inv?.engine_includes || []).map((e) => `<div class="inc">&#10003; ${esc(e)}</div>`).join("")}</div>
    ${(inv?.notes || []).map((n) => `<p class="note">${esc(n)}</p>`).join("")}`);

  // GAS's own standard six-clause terms, parameterised by tier. Reproduced, not invented.
  const T = [
    ["1 · Engagement", `${GAS.name} is appointed as ${esc(x.clientName)}'s integrated growth partner on a six-month proof of concept, on the ${esc(x.tier.name)} tier at ${esc(x.tier.rate)}. The engagement covers all eight pods and commences on the first day of the month following signature, with the 31-day rollout starting immediately.`],
    ["2 · Payment", `The monthly retainer is payable upfront, in advance, on presentation of invoice. No credit terms apply. Invoices and all billing queries are handled by our accountant, ${GAS.accountant} (${GAS.accountantEmail}).`],
    ["3 · Media spend", `Media budget is decided and owned by ${esc(x.clientName)} following this proposal, and is additional to the retainer. Every rand is paid at pure platform cost with full invoice-level transparency into Meta, TikTok and Google. GAS makes no profit, markup, rebate or commission on media; our only income is the retainer, so our only incentive is your result.`],
    ["4 · Ownership", `Everything built under this engagement belongs to ${esc(x.clientName)} from day one: ad accounts, audiences, creative assets, the PSI knowledge base, conversation histories and all performance data. Nothing is held hostage, during or after the term.`],
    ["5 · Confidentiality and data", `Both parties keep each other's commercial information strictly confidential. All consumer personal information is collected with consent and processed under POPIA in line with the compliance section of this proposal, and consumer-facing scripts and creative are submitted for your compliance approval before launch.`],
    ["6 · Exit", `After the six-month proof of concept, the engagement continues month to month, with no lock-in. Either party may exit on 30 days' written notice. On exit, GAS provides a full, orderly handover of accounts, assets, data and documentation at no additional cost.`],
  ];
  const terms = sec(`${head("15", "Simple terms, in plain language", A)}
    <p class="lede">This page, together with the rate above, is the working agreement between ${GAS.name} (Pty) Ltd and ${esc(x.legalName)}. Signature of this proposal constitutes acceptance of these terms.</p>
    <div class="grid2">${T.map(([h, b]) => `<div class="card"><div class="ctitle" style="color:${A}">${esc(h)}</div><div class="cbody">${b}</div></div>`).join("")}</div>`);

  const sign = sec(`${head("16", "Agreement and sign-off", A)}
    <p class="lede">By signing below, the parties accept this proposal and commence a six-month proof-of-concept agreement on the ${esc(x.tier.name)} tier. This proposal is valid for 14 days from ${ukDate(x.today)}.</p>
    <div class="grid2">
      <div class="card"><div class="slabel">For the client</div><div class="sname">${esc(x.legalName)}</div>${x.ceo ? `<div class="sperson">${esc(x.ceo)}${x.ceoTitle ? " &middot; " + esc(x.ceoTitle) : ""}</div>` : ""}<div class="sline">Signature</div><div class="sdate">Date</div></div>
      <div class="card"><div class="slabel">For the agency</div><div class="sname">${GAS.name}</div><div class="sperson">${GAS.signer} &middot; ${GAS.role}</div><div class="sperson2">${GAS.cell} &middot; ${GAS.email}</div><div class="sline">Signature</div><div class="sdate">Date</div></div>
    </div>`);

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&display=swap');
    @page { size: A4 portrait; margin: 15mm 14mm; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: Poppins, "Segoe UI", Helvetica, Arial, sans-serif; color:#15131c; font-size:10.5px; line-height:1.6; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    h1 { font-size:34px; line-height:1.05; font-weight:900; letter-spacing:-0.5px; margin:0; text-transform:uppercase; }
    h2 { font-size:20px; font-weight:800; letter-spacing:-0.3px; margin:2px 0 12px; text-transform:uppercase; color:#15131c; }
    .eyebrow { font-size:9px; letter-spacing:3px; font-weight:800; text-transform:uppercase; }
    .lede { font-size:11px; color:#403b4d; margin:0 0 12px; }
    .pg { padding:2mm 0 6mm; page-break-inside:avoid; }
    section + section { page-break-before:always; }
    /* cover */
    .cover { color:#fff; min-height:262mm; padding:14mm 12mm; display:flex; flex-direction:column; page-break-after:always; border-radius:0; }
    .cov-top { display:flex; justify-content:space-between; align-items:flex-start; }
    .gasmark { font-size:15px; font-weight:800; letter-spacing:1px; } .gassub { font-size:8px; letter-spacing:4px; color:#FF7A2F; font-weight:700; margin-top:2px; }
    .cov-client { font-size:11px; font-weight:700; color:rgba(255,255,255,0.7); text-align:right; max-width:45%; }
    .cov-mid { margin-top:auto; margin-bottom:auto; }
    .cov-kicker { font-size:10px; letter-spacing:4px; font-weight:800; margin-bottom:12px; }
    .cov-sub { font-size:13px; color:rgba(255,255,255,0.72); max-width:78%; margin-top:14px; line-height:1.55; }
    .cov-foot { display:flex; flex-wrap:wrap; gap:10px; margin-bottom:16px; }
    .pill { border:1px solid rgba(255,255,255,0.25); border-radius:999px; padding:9px 16px; font-size:9px; font-weight:700; letter-spacing:1px; }
    .pill-accent { border:none; color:#0a0a0a; }
    .cov-rule { border-top:1px solid rgba(255,255,255,0.15); padding-top:12px; display:flex; justify-content:space-between; font-size:8px; letter-spacing:2px; color:rgba(255,255,255,0.5); }
    /* blocks */
    .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:9px; }
    .card { border:1px solid #e6e2ee; border-radius:11px; padding:12px 14px; background:#faf9fc; }
    .ctitle { font-size:11px; font-weight:800; } .cbody { font-size:10px; color:#403b4d; margin-top:3px; }
    .panel { border:1.5px solid; border-radius:12px; padding:14px 16px; margin:12px 0; background:#faf9fc; }
    .plabel { font-size:9px; letter-spacing:2px; font-weight:800; text-transform:uppercase; } .pbig { font-size:14px; font-weight:700; margin:6px 0 0; }
    .ticks { list-style:none; padding:0; margin:12px 0 0; } .ticks li { font-size:10.5px; color:#403b4d; padding:4px 0 4px 18px; position:relative; } .ticks li:before { content:"\\2713"; position:absolute; left:0; font-weight:800; }
    .podnum,.podname,.poddesc { }
    .podnum { font-size:8px; letter-spacing:2px; font-weight:800; text-transform:uppercase; } .podname { font-size:12px; font-weight:800; margin-top:1px; } .poddesc { font-size:9.5px; color:#5a5568; margin-top:2px; }
    /* persona + platforms */
    .persona { border:1px solid #e6e2ee; border-radius:11px; padding:12px 14px; margin:9px 0; background:#faf9fc; page-break-inside:avoid; }
    .pname { font-size:13px; font-weight:800; } .pmeta { font-size:9.5px; color:#5a5568; margin-top:2px; } .pangle { font-size:10px; font-weight:700; margin-top:5px; }
    .plat { margin-top:7px; } .platname { color:#0a0a0a; border-radius:5px; padding:2px 7px; font-size:8.5px; font-weight:800; } .platapp { font-size:9px; color:#5a5568; margin-left:6px; }
    .chips { margin-top:4px; } .chip { display:inline-block; border:1px solid #ddd8e6; border-radius:999px; padding:1px 8px; font-size:8px; color:#403b4d; margin:2px 3px 0 0; }
    /* market */
    .stat { font-size:14px; font-weight:800; } .statsrc { font-size:8px; color:#8a8496; margin-top:1px; }
    .opps { margin-top:10px; } .opp { border:1px solid #e6e2ee; border-radius:9px; padding:9px 11px; margin:6px 0; font-size:10px; color:#403b4d; }
    .otag { color:#fff; border-radius:5px; padding:1px 7px; font-size:8px; font-weight:800; margin-right:7px; } .owhy { color:#5a5568; }
    /* channels */
    .chan { border:1px solid #e6e2ee; border-radius:9px; padding:9px 11px; margin:6px 0; font-size:10.5px; }
    .chname { color:#0a0a0a; border-radius:5px; padding:2px 7px; font-size:8.5px; font-weight:800; margin-right:7px; } .chpri { font-size:8px; font-weight:800; color:#8a8496; text-transform:uppercase; letter-spacing:1px; margin-right:7px; } .chwhy { font-size:9.5px; color:#5a5568; margin-top:3px; }
    /* rollout */
    .week { border:1px solid #e6e2ee; border-radius:11px; padding:11px 13px; margin:8px 0; page-break-inside:avoid; }
    .wtop { display:flex; justify-content:space-between; } .wname { font-size:11px; font-weight:800; } .wpods { font-size:8.5px; color:#8a8496; }
    .dots { margin:6px 0; padding-left:16px; } .dots li { font-size:9.5px; color:#403b4d; }
    .wgate { border-left:2px solid; padding:3px 0 3px 9px; font-size:9.5px; color:#403b4d; }
    /* funnel + kpis */
    .disc { font-size:9px; font-style:italic; color:#8a8496; margin-bottom:8px; }
    .fstage { display:flex; align-items:center; gap:8px; padding:7px 0; border-bottom:1px solid #eee; font-size:10.5px; } .fnum { color:#0a0a0a; width:18px; height:18px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:9px; font-weight:800; }
    .kt { width:100%; border-collapse:collapse; margin-top:6px; } .kt th { text-align:left; font-size:8px; letter-spacing:1px; text-transform:uppercase; color:#8a8496; border-bottom:1px solid #ddd; padding:6px 8px; } .kt td { font-size:10px; color:#403b4d; border-bottom:1px solid #eee; padding:6px 8px; vertical-align:top; }
    /* investment */
    .invhead { border:1.5px solid; border-radius:12px; padding:14px 16px; display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
    .invtier { font-size:16px; font-weight:900; } .invtag { font-size:10px; font-weight:700; margin-left:6px; } .invrate { font-size:18px; font-weight:900; }
    .inc { font-size:10px; color:#403b4d; padding:3px 0; } .note { font-size:9px; color:#8a8496; margin-top:8px; }
    /* sign-off */
    .slabel { font-size:8px; letter-spacing:2px; font-weight:800; color:#8a8496; text-transform:uppercase; } .sname { font-size:14px; font-weight:800; margin-top:3px; } .sperson { font-size:10px; color:#403b4d; margin-top:2px; } .sperson2 { font-size:9px; color:#8a8496; }
    .sline { border-top:1px solid #bbb; margin-top:34px; padding-top:3px; font-size:8px; letter-spacing:1px; color:#8a8496; text-transform:uppercase; } .sdate { font-size:8px; color:#8a8496; }
  </style></head><body>
    ${cover}${exec}${opp}${philosophy}${eco}${audience}${strat}${market}${channels}${pods}${rollout}${funnel}${kpis}${compliance}${investment}${terms}${sign}
  </body></html>`;
}

// Build (and store) the branded PDF for a proposal. accentOverride lets the team set the client's colour by hand.
export async function buildProposalPdf(proposalId: string, accentOverride?: string | null): Promise<string> {
  const prows = (await db().query(`select * from proposals where id = $1`, [proposalId])) as Proposal[];
  const p = prows[0];
  if (!p || !p.content) throw new Error("That proposal was not found, or has no content.");
  const eng = (await db().query(`select client_id from engagements where id = $1`, [p.engagement_id])) as { client_id: string }[];
  const clientId = eng[0]?.client_id;
  const crow = (await db().query(`select name, website from clients where id = $1`, [clientId])) as { name: string; website: string | null }[];
  const clientName = crow[0]?.name || "the client";
  const website = crow[0]?.website || null;
  // Identity (legal name + licence) and the client signatory (CEO lock) come from the research.
  const idrow = (await db().query(`select identity from research_runs where client_id = $1 and status = 'gate1_approved' order by version desc limit 1`, [clientId])) as { identity: { legal_name?: string; licence?: string } | null }[];
  const identity = idrow[0]?.identity || {};
  const brief = (await db().query(`select ceo_name, ceo_title from intel_briefs where client_id = $1`, [clientId])) as { ceo_name: string | null; ceo_title: string | null }[];

  const palette = accentOverride && /^#[0-9a-fA-F]{6}$/.test(accentOverride) ? { primary: accentOverride, dark: "#0E1016" } : await extractBrandColour(website).catch(() => ({ primary: "#3A5BD9", dark: "#0E1016" }));
  const today = new Date();
  const validUntil = new Date(today.getTime() + 14 * 864e5);
  const tier = TIERS[(p.tier as TierId)] || TIERS.dominate;

  const html = proposalHtml(p.content, {
    clientName, legalName: identity.legal_name || clientName, licence: identity.licence || null,
    ceo: brief[0]?.ceo_name || null, ceoTitle: brief[0]?.ceo_title || null,
    accent: palette.primary, dark: palette.dark, tier, today, validUntil,
  });
  const pdf = await renderPdf(html, { marginMm: 0 });
  const url = await putBytes(pdf, `studio/${clientId}/proposal-${proposalId}`, "pdf", "application/pdf");
  await db().query(`update proposals set pdf_url = $2 where id = $1`, [proposalId, url]).catch(() => {});
  return url;
}
