import { db } from "./db";
import { renderPdf } from "./studio-render";
import { putBytes } from "./blob";
import { extractBrandPalette } from "./brand-colours";
import { TIERS, OBJECTIVES, type TierId } from "./proposal-config";
import type { Proposal } from "./proposal";
import { renderProposalHtml } from "./proposal-render";
import { deriveCiTokens } from "./proposal-ci";
import { buildProposalDoc } from "./proposal-map";

// A short price badge (the big "R75k" on the deal + investment pages) derived from the rate string, so it always
// matches the edited rate. Handles "R75,000 / month", "R75k", "R1,500,000" and "R1.5m".
function shortPrice(rate: string): string | null {
  const s = String(rate || "").toLowerCase().replace(/\s/g, "");
  let m = s.match(/r?(\d+(?:\.\d+)?)(k|m)\b/);
  if (m) return `R${m[1]}${m[2]}`;
  m = s.replace(/,/g, "").match(/r?(\d{3,})/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!n) return null;
  if (n >= 1_000_000) return `R${+(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1000) return `R${Math.round(n / 1000)}k`;
  return `R${n}`;
}

// THE BRANDED PROPOSAL PDF. Renders the Fable-written proposal content into the approved 24-page GAS proposal
// template (lib/proposal-render.ts), recoloured to the client's CI (their website accent + a dark ground), and
// stores it. buildProposalDoc (lib/proposal-map.ts) maps the model output + context into the renderer's
// ProposalDoc: content-driven pages from the strategy, fixed-doctrine pages with the client's specifics swapped in.
// The document date is ALWAYS today (Gary's rule); figures stay illustrative; the word "manifesto" never appears.

export async function buildProposalPdf(proposalId: string, accentOverride?: string | null, darkOverride?: string | null): Promise<string> {
  const prows = (await db().query(`select * from proposals where id = $1`, [proposalId])) as Proposal[];
  const p = prows[0];
  if (!p || !p.content) throw new Error("That proposal was not found, or has no content.");
  if (p.status !== "approved") throw new Error("Approve the proposal at the strategist gate before cutting the final PDF.");

  const eng = (await db().query(`select client_id from engagements where id = $1`, [p.engagement_id])) as { client_id: string }[];
  const clientId = eng[0]?.client_id;
  const crow = (await db().query(`select name, website, brand_palette from clients where id = $1`, [clientId])) as { name: string; website: string | null; brand_palette: { primary?: string; dark?: string } | null }[];
  const clientName = crow[0]?.name || "the client";
  const website = crow[0]?.website || null;
  const cachedPalette = crow[0]?.brand_palette && /^#[0-9a-fA-F]{6}$/.test(String(crow[0].brand_palette.primary || "")) ? crow[0].brand_palette : null;
  // Client contact block for the sign-off comes from the approved research identity.
  const idrow = (await db().query(`select identity from research_runs where client_id = $1 and status = 'gate1_approved' order by version desc limit 1`, [clientId])) as { identity: { address?: string; contact_details?: string } | null }[];
  const identity = idrow[0]?.identity || {};
  // The competitive-map competitors come from the editable research set. If that table is empty (the structured
  // competitor list can come back empty even when the research clearly found rivals), fall back to the
  // competitor_set CLAIMS - their subject IS the rival's name - so the map is never just the client alone.
  let comps = (await db().query(`select name from research_competitors where client_id = $1 order by created_at asc limit 12`, [clientId]).catch(() => [])) as { name: string }[];
  if (!comps.length) {
    comps = (await db().query(`select distinct subject as name from research_claims where client_id = $1 and section = 'competitor_set' and coalesce(subject,'') <> '' order by subject limit 12`, [clientId]).catch(() => [])) as { name: string }[];
  }

  // Client CI: the proposal wears the CLIENT's real brand colours. Priority: a manual accent override (Human
  // Command) -> the cached palette we read from their site before -> read it now (homepage screenshot + vision,
  // the intelligent extractor). Read-once is cached on the client so every render uses the SAME colours and we do
  // not re-spend on each PDF. Always yields a usable palette, so a colour read can never block the render.
  // primary = the accent (auto from their site, or manual). dark = the DARK/coloured-background pages, which default
  // to near-black (Gary: never the grey the extractor sometimes picks) and are separately overridable by hex. A
  // manual choice on either persists on the client so every future proposal reuses it.
  const hex = (v: string | null | undefined) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : null);
  let palette: { primary: string; dark: string };
  if (hex(accentOverride) || hex(darkOverride)) {
    palette = {
      primary: hex(accentOverride) || (cachedPalette?.primary ? String(cachedPalette.primary) : "#3A5BD9"),
      dark: hex(darkOverride) || (cachedPalette?.dark ? String(cachedPalette.dark) : "#0E1016"),
    };
    await db().query(`update clients set brand_palette = $2::jsonb where id = $1`, [clientId, JSON.stringify(palette)]).catch(() => {});
  } else if (cachedPalette) {
    palette = { primary: String(cachedPalette.primary), dark: String(cachedPalette.dark || "#0E1016") };
  } else {
    palette = await extractBrandPalette(website, clientName, { clientId }).catch(() => ({ primary: "#3A5BD9", dark: "#0E1016" }));
    if (palette.primary && palette.primary.toLowerCase() !== "#3a5bd9") {
      await db().query(`update clients set brand_palette = $2::jsonb where id = $1`, [clientId, JSON.stringify(palette)]).catch(() => {});
    }
  }
  const tier = TIERS[(p.tier as TierId)] || TIERS.dominate;
  const objectiveLabel = OBJECTIVES.find((o) => o.id === p.objective)?.label || String(p.objective);
  // Gary's rule: the proposal date is ALWAYS the current date (SA time) at generation, never a stored date.
  const dateLabel = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Johannesburg" });
  // The sign-off may carry the client's address/email, but NEVER their WhatsApp (Gary, twice): on a GAS proposal
  // the only WhatsApp is our PSI system, so strip any WhatsApp label/number/link out of the contact block.
  const stripWhatsApp = (s: string): string =>
    String(s || "")
      .replace(/\bwhats\s*app\b[^\d\n]{0,30}?\+?\d[\d\s()\-]{5,}/gi, "")
      .replace(/\bhttps?:\/\/(?:wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)\/\S+/gi, "")
      .replace(/\bwa\.me\/\S+/gi, "")
      .replace(/\bwhats\s*app\b/gi, "")
      .replace(/\s*[|,;·]\s*(?=[|,;·]|$)/g, "")
      .replace(/^\s*[|,;·]\s*|\s*[|,;·]\s*$/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  // The sign-off contacts: email/phone + physical address only, NEVER the website (Gary). WhatsApp already stripped.
  const contacts = [stripWhatsApp(identity.contact_details || ""), identity.address].filter(Boolean).map(String);
  // The client's logo for the sign-off circle (like GAS's mark), from their brand kit if on file. A public blob URL
  // the PDF's Chromium can load; falls back to a monogram in the renderer when there is no logo.
  const logoRow = (await db().query(`select logos from studio_brand_kits where client_id = $1`, [clientId]).catch(() => [])) as { logos: { url?: string }[] | null }[];
  const logoUrl = Array.isArray(logoRow[0]?.logos) ? (logoRow[0]!.logos!.find((l) => l?.url)?.url || "") : "";
  const clientLogo = /^https?:\/\//i.test(logoUrl) ? { src: logoUrl, w: 32, h: 32 } : null;

  // The price shown across the PDF (deal, investment, agreement, sign-off pages) FOLLOWS the editable investment
  // section, so a hand-edited rate or tier name flows through to every price (Gary: editing to R75k still showed
  // R100k). Falls back to the tier's rate/name when the section has not overridden them.
  const inv = p.content.investment;
  const rate = (inv?.rate && String(inv.rate).trim()) || tier.rate;
  const tierName = (inv?.tier_name && String(inv.tier_name).trim()) || tier.name;
  const price = shortPrice(rate) || (tier.id === "launch" ? "R100k" : "R150k");
  const doc = buildProposalDoc(p.content, {
    clientName, objectiveLabel, tierName,
    price, priceUnit: "per month excl VAT", rate,
    dateLabel, validityLabel: "Valid 14 days",
    clientLogo, competitors: comps.map((c) => c.name), clientContacts: contacts, clientTagline: "",
  });
  const html = renderProposalHtml(doc, deriveCiTokens(palette.primary, palette.dark));
  const pdf = await renderPdf(html, { marginMm: 0 });
  const url = await putBytes(pdf, `studio/${clientId}/proposal-${proposalId}`, "pdf", "application/pdf");
  await db().query(`update proposals set pdf_url = $2 where id = $1`, [proposalId, url]).catch(() => {});
  return url;
}
