import { db } from "./db";
import { renderPdf } from "./studio-render";
import { putBytes } from "./blob";
import { extractBrandPalette } from "./brand-colours";
import { TIERS, OBJECTIVES, type TierId } from "./proposal-config";
import type { Proposal } from "./proposal";
import { renderProposalHtml } from "./proposal-render";
import { deriveCiTokens } from "./proposal-ci";
import { buildProposalDoc } from "./proposal-map";

// THE BRANDED PROPOSAL PDF. Renders the Fable-written proposal content into the approved 24-page GAS proposal
// template (lib/proposal-render.ts), recoloured to the client's CI (their website accent + a dark ground), and
// stores it. buildProposalDoc (lib/proposal-map.ts) maps the model output + context into the renderer's
// ProposalDoc: content-driven pages from the strategy, fixed-doctrine pages with the client's specifics swapped in.
// The document date is ALWAYS today (Gary's rule); figures stay illustrative; the word "manifesto" never appears.

export async function buildProposalPdf(proposalId: string, accentOverride?: string | null): Promise<string> {
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
  // The competitive-map competitors come from the editable research set.
  const comps = (await db().query(`select name from research_competitors where client_id = $1 order by created_at asc limit 3`, [clientId]).catch(() => [])) as { name: string }[];

  // Client CI: the proposal wears the CLIENT's real brand colours. Priority: a manual accent override (Human
  // Command) -> the cached palette we read from their site before -> read it now (homepage screenshot + vision,
  // the intelligent extractor). Read-once is cached on the client so every render uses the SAME colours and we do
  // not re-spend on each PDF. Always yields a usable palette, so a colour read can never block the render.
  let palette: { primary: string; dark: string };
  if (accentOverride && /^#[0-9a-fA-F]{6}$/.test(accentOverride)) {
    palette = { primary: accentOverride, dark: cachedPalette?.dark || "#0E1016" };
  } else if (cachedPalette) {
    palette = { primary: String(cachedPalette.primary), dark: String(cachedPalette.dark || "#0E1016") };
  } else {
    palette = await extractBrandPalette(website, clientName, { clientId }).catch(() => ({ primary: "#3A5BD9", dark: "#0E1016" }));
    // Cache it on the client so the next render is instant and identical (only if we got a real read, not the default).
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
  const contacts = [stripWhatsApp(identity.contact_details || ""), identity.address, website].filter(Boolean).map(String);

  const doc = buildProposalDoc(p.content, {
    clientName, objectiveLabel, tierName: tier.name,
    price: tier.id === "launch" ? "R100k" : "R150k", priceUnit: "per month excl VAT", rate: tier.rate,
    dateLabel, validityLabel: "Valid 14 days",
    clientLogo: null, competitors: comps.map((c) => c.name), clientContacts: contacts, clientTagline: "",
  });
  const html = renderProposalHtml(doc, deriveCiTokens(palette.primary, palette.dark));
  const pdf = await renderPdf(html, { marginMm: 0 });
  const url = await putBytes(pdf, `studio/${clientId}/proposal-${proposalId}`, "pdf", "application/pdf");
  await db().query(`update proposals set pdf_url = $2 where id = $1`, [proposalId, url]).catch(() => {});
  return url;
}
